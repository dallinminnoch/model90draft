(function (global) {
  const root = global.LensApp || (global.LensApp = {});
  const lensAnalysis = root.lensAnalysis || (root.lensAnalysis = {});

  // Owner: Lens analysis ledger contracts.
  // Purpose: define diagnostic-only analysis output ledger rows that future
  // analysis-specific composers can consume. Non-goals: no Need Line,
  // Resource Line, gap/surplus, chart, or current analysis replacement.
  const ANALYSIS_OUTPUT_LEDGER_VERSION = "analysis-output-ledger-v1";
  const ANALYSIS_OUTPUT_LEDGER_TYPE = "analysisOutput";

  const MODEL90_ALLOWED_ANALYSIS_TYPES = Object.freeze([
    "coverageStrategy",
    "incomeImpact",
    "dime",
    "simpleNeeds",
    "hlv",
    "annuity",
    "unknown"
  ]);

  const MODEL90_ALLOWED_ROW_ROLES = Object.freeze([
    "need",
    "resource",
    "offset",
    "gap",
    "surplus",
    "displayOnly",
    "diagnosticOnly",
    "unknown"
  ]);

  function isPlainObject(value) {
    return Boolean(value && typeof value === "object" && !Array.isArray(value));
  }

  function clonePlainValue(value) {
    if (value === undefined) {
      return null;
    }
    if (value == null) {
      return value;
    }
    try {
      return JSON.parse(JSON.stringify(value));
    } catch (error) {
      return null;
    }
  }

  function normalizeString(value) {
    const normalized = String(value == null ? "" : value).trim();
    return normalized || null;
  }

  function toOptionalBoolean(value) {
    if (typeof value === "boolean") {
      return value;
    }
    if (value == null || value === "") {
      return null;
    }
    const normalized = String(value).trim().toLowerCase();
    if (["true", "yes", "1"].includes(normalized)) {
      return true;
    }
    if (["false", "no", "0"].includes(normalized)) {
      return false;
    }
    return null;
  }

  function createIssue(code, message, details) {
    return {
      code,
      message,
      details: isPlainObject(details) ? clonePlainValue(details) : {}
    };
  }

  function normalizeIssueList(value) {
    return (Array.isArray(value) ? value : []).filter(isPlainObject).map(function (issue) {
      return {
        code: normalizeString(issue.code) || "analysis-output-ledger-row-issue",
        message: normalizeString(issue.message) || "Analysis Output Ledger row issue.",
        details: isPlainObject(issue.details) ? clonePlainValue(issue.details) : {}
      };
    });
  }

  function getInputRows(input, warnings) {
    if (input == null) {
      return [];
    }
    if (Array.isArray(input)) {
      return input;
    }
    if (isPlainObject(input) && Array.isArray(input.rows)) {
      return input.rows;
    }
    warnings.push(createIssue(
      "analysis-output-ledger-input-rows-invalid",
      "Analysis Output Ledger input did not provide a rows array; no rows were built.",
      { inputType: Array.isArray(input) ? "array" : typeof input }
    ));
    return [];
  }

  function normalizeEnum(value, allowedValues, fallback, fieldName, rowWarnings, ledgerWarnings, details) {
    const normalized = normalizeString(value) || fallback;
    if (!allowedValues.includes(normalized)) {
      const issue = createIssue(
        `analysis-output-ledger-${fieldName}-unknown`,
        `Analysis Output Ledger ${fieldName} is outside the current contract allow-list and was normalized to ${fallback}.`,
        Object.assign({ fieldName, value: normalized, normalizedTo: fallback }, details || {})
      );
      rowWarnings.push(issue);
      ledgerWarnings.push(issue);
      return fallback;
    }
    return normalized;
  }

  function normalizeAnalysisOutputRow(row, index, ledgerWarnings, ledgerDataGaps) {
    if (!isPlainObject(row)) {
      ledgerWarnings.push(createIssue(
        "analysis-output-ledger-row-invalid",
        "Analysis Output Ledger row was not an object and was omitted.",
        { index }
      ));
      return null;
    }

    const rowWarnings = normalizeIssueList(row.warnings);
    const rowDataGaps = normalizeIssueList(row.dataGaps);
    const analysisRowId = normalizeString(row.analysisRowId) || `analysis-output-row-${index + 1}`;
    if (!normalizeString(row.analysisRowId)) {
      const issue = createIssue(
        "analysis-output-ledger-analysis-row-id-missing",
        "Analysis Output Ledger row was missing analysisRowId; a deterministic diagnostic id was assigned.",
        { index, assignedAnalysisRowId: analysisRowId }
      );
      rowDataGaps.push(issue);
      ledgerDataGaps.push(issue);
    }
    if (!normalizeString(row.projectionRowId)) {
      const issue = createIssue(
        "analysis-output-ledger-projection-row-id-missing",
        "Analysis Output Ledger row was missing projectionRowId and cannot trace to a Projection Ledger row yet.",
        { index, analysisRowId }
      );
      rowDataGaps.push(issue);
      ledgerDataGaps.push(issue);
    }

    return {
      analysisRowId,
      analysisType: normalizeEnum(
        row.analysisType,
        MODEL90_ALLOWED_ANALYSIS_TYPES,
        "unknown",
        "analysisType",
        rowWarnings,
        ledgerWarnings,
        { index, analysisRowId }
      ),
      projectionRowId: normalizeString(row.projectionRowId),
      treatedFactId: normalizeString(row.treatedFactId),
      sourceFactId: normalizeString(row.sourceFactId),
      included: toOptionalBoolean(row.included) === true,
      displayGroup: normalizeString(row.displayGroup),
      outputComponent: normalizeString(row.outputComponent),
      rowRole: normalizeEnum(
        row.rowRole,
        MODEL90_ALLOWED_ROW_ROLES,
        "diagnosticOnly",
        "rowRole",
        rowWarnings,
        ledgerWarnings,
        { index, analysisRowId }
      ),
      annualAmountsByYear: clonePlainValue(row.annualAmountsByYear || {}),
      resourceApplications: Array.isArray(row.resourceApplications) ? clonePlainValue(row.resourceApplications) : [],
      offsets: Array.isArray(row.offsets) ? clonePlainValue(row.offsets) : [],
      trace: isPlainObject(row.trace) ? clonePlainValue(row.trace) : {},
      warnings: rowWarnings,
      dataGaps: rowDataGaps,
      diagnosticStatus: rowDataGaps.length ? "partial" : "valid"
    };
  }

  function buildAnalysisOutputLedger(input) {
    const warnings = [];
    const dataGaps = [];
    const inputRows = getInputRows(input, warnings);
    const rows = inputRows.reduce(function (normalizedRows, row, index) {
      const normalizedRow = normalizeAnalysisOutputRow(row, index, warnings, dataGaps);
      if (normalizedRow) {
        normalizedRows.push(normalizedRow);
      }
      return normalizedRows;
    }, []);

    return {
      ledgerType: ANALYSIS_OUTPUT_LEDGER_TYPE,
      version: ANALYSIS_OUTPUT_LEDGER_VERSION,
      diagnosticOnly: true,
      ledgerDrivesGraph: false,
      graphMathChanged: false,
      rows,
      rowCount: rows.length,
      warnings,
      dataGaps,
      trace: {
        source: "analysis-output-ledger",
        sourceRowStatus: inputRows.length ? "source rows supplied" : "no source rows supplied",
        sourceRowCount: inputRows.length,
        rowsOmitted: inputRows.length - rows.length,
        diagnosticOnlyStatus: true,
        needLineReplacement: false,
        resourceLineReplacement: false,
        gapSurplusReplacement: false,
        chartReplacement: false,
        inputMutated: false
      }
    };
  }

  lensAnalysis.ANALYSIS_OUTPUT_LEDGER_VERSION = ANALYSIS_OUTPUT_LEDGER_VERSION;
  lensAnalysis.ANALYSIS_OUTPUT_LEDGER_TYPE = ANALYSIS_OUTPUT_LEDGER_TYPE;
  lensAnalysis.MODEL90_ALLOWED_ANALYSIS_TYPES = MODEL90_ALLOWED_ANALYSIS_TYPES;
  lensAnalysis.MODEL90_ALLOWED_ROW_ROLES = MODEL90_ALLOWED_ROW_ROLES;
  lensAnalysis.buildAnalysisOutputLedger = buildAnalysisOutputLedger;

  if (typeof module !== "undefined" && module.exports) {
    module.exports = {
      ANALYSIS_OUTPUT_LEDGER_VERSION,
      ANALYSIS_OUTPUT_LEDGER_TYPE,
      MODEL90_ALLOWED_ANALYSIS_TYPES,
      MODEL90_ALLOWED_ROW_ROLES,
      buildAnalysisOutputLedger
    };
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
