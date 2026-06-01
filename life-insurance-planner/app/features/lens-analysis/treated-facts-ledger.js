(function (global) {
  const root = global.LensApp || (global.LensApp = {});
  const lensAnalysis = root.lensAnalysis || (root.lensAnalysis = {});

  // Owner: Lens analysis ledger contracts.
  // Purpose: define diagnostic-only treated fact rows after future treatment
  // resolution. Non-goals: no lifetime projection rows, graph math, DOM,
  // storage, or runtime wiring.
  const TREATED_FACTS_LEDGER_VERSION = "treated-facts-ledger-v1";
  const TREATED_FACTS_LEDGER_TYPE = "treatedFacts";

  const MODEL90_ALLOWED_OWNER_COMPONENTS = Object.freeze([
    "mortgage",
    "nonMortgageDebt",
    "education",
    "healthcare",
    "finalExpense",
    "transitionNeeds",
    "essentialSupport",
    "discretionarySupport",
    "income",
    "asset",
    "cashReserve",
    "existingCoverage",
    "unknown"
  ]);

  const MODEL90_ALLOWED_TREATMENT_MODES = Object.freeze([
    "accountDefault",
    "analysisSetup",
    "itemOverride",
    "followAssumptions",
    "manual",
    "exclude",
    "unknown"
  ]);

  const MODEL90_ALLOWED_INCLUSION_STATUSES = Object.freeze([
    "included",
    "excluded",
    "diagnosticOnly",
    "pending",
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

  function toOptionalNumber(value) {
    if (value == null || value === "") {
      return null;
    }
    if (typeof value === "number") {
      return Number.isFinite(value) ? value : null;
    }
    const parsed = Number(String(value).replace(/[$,%\s,]/g, "").trim());
    return Number.isFinite(parsed) ? parsed : null;
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
        code: normalizeString(issue.code) || "treated-facts-ledger-row-issue",
        message: normalizeString(issue.message) || "Treated Facts Ledger row issue.",
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
      "treated-facts-ledger-input-rows-invalid",
      "Treated Facts Ledger input did not provide a rows array; no rows were built.",
      { inputType: Array.isArray(input) ? "array" : typeof input }
    ));
    return [];
  }

  function normalizeEnum(value, allowedValues, fallback, issuePrefix, fieldName, rowWarnings, ledgerWarnings, details) {
    const normalized = normalizeString(value) || fallback;
    if (!allowedValues.includes(normalized)) {
      const issue = createIssue(
        `${issuePrefix}-${fieldName}-unknown`,
        `Treated Facts Ledger ${fieldName} is outside the current contract allow-list and was preserved as metadata.`,
        Object.assign({ fieldName, value: normalized }, details || {})
      );
      rowWarnings.push(issue);
      ledgerWarnings.push(issue);
    }
    return normalized;
  }

  function normalizeRate(row, fieldName, rowWarnings, ledgerWarnings, treatedFactId, index) {
    const value = row[fieldName];
    const parsed = toOptionalNumber(value);
    if (value != null && value !== "" && parsed == null) {
      const issue = createIssue(
        `treated-facts-ledger-${fieldName}-invalid`,
        `Treated Facts Ledger ${fieldName} was not numeric and was set to null.`,
        { index, treatedFactId, value: clonePlainValue(value) }
      );
      rowWarnings.push(issue);
      ledgerWarnings.push(issue);
    }
    return parsed;
  }

  function normalizeTreatedFactRow(row, index, ledgerWarnings, ledgerDataGaps) {
    if (!isPlainObject(row)) {
      ledgerWarnings.push(createIssue(
        "treated-facts-ledger-row-invalid",
        "Treated Facts Ledger row was not an object and was omitted.",
        { index }
      ));
      return null;
    }

    const rowWarnings = normalizeIssueList(row.warnings);
    const rowDataGaps = normalizeIssueList(row.dataGaps);
    const treatedFactId = normalizeString(row.treatedFactId) || `treated-fact-${index + 1}`;
    if (!normalizeString(row.treatedFactId)) {
      const issue = createIssue(
        "treated-facts-ledger-treated-fact-id-missing",
        "Treated Facts Ledger row was missing treatedFactId; a deterministic diagnostic id was assigned.",
        { index, assignedTreatedFactId: treatedFactId }
      );
      rowDataGaps.push(issue);
      ledgerDataGaps.push(issue);
    }
    if (!normalizeString(row.sourceFactId)) {
      const issue = createIssue(
        "treated-facts-ledger-source-fact-id-missing",
        "Treated Facts Ledger row was missing sourceFactId and cannot be traced back to an untreated fact yet.",
        { index, treatedFactId }
      );
      rowDataGaps.push(issue);
      ledgerDataGaps.push(issue);
    }

    return {
      treatedFactId,
      sourceFactId: normalizeString(row.sourceFactId),
      itemType: normalizeString(row.itemType) || "unknown",
      effectiveOwnerComponent: normalizeEnum(
        row.effectiveOwnerComponent,
        MODEL90_ALLOWED_OWNER_COMPONENTS,
        "unknown",
        "treated-facts-ledger",
        "effectiveOwnerComponent",
        rowWarnings,
        ledgerWarnings,
        { index, treatedFactId }
      ),
      effectiveTreatmentMode: normalizeEnum(
        row.effectiveTreatmentMode,
        MODEL90_ALLOWED_TREATMENT_MODES,
        "unknown",
        "treated-facts-ledger",
        "effectiveTreatmentMode",
        rowWarnings,
        ledgerWarnings,
        { index, treatedFactId }
      ),
      effectiveInflationTreatment: normalizeString(row.effectiveInflationTreatment),
      effectiveInflationRatePercent: normalizeRate(row, "effectiveInflationRatePercent", rowWarnings, ledgerWarnings, treatedFactId, index),
      effectiveGrowthTreatment: normalizeString(row.effectiveGrowthTreatment),
      effectiveGrowthRatePercent: normalizeRate(row, "effectiveGrowthRatePercent", rowWarnings, ledgerWarnings, treatedFactId, index),
      effectiveDebtTreatment: normalizeString(row.effectiveDebtTreatment),
      effectiveSupportTreatment: normalizeString(row.effectiveSupportTreatment),
      inclusionStatus: normalizeEnum(
        row.inclusionStatus,
        MODEL90_ALLOWED_INCLUSION_STATUSES,
        "diagnosticOnly",
        "treated-facts-ledger",
        "inclusionStatus",
        rowWarnings,
        ledgerWarnings,
        { index, treatedFactId }
      ),
      exclusionReason: normalizeString(row.exclusionReason),
      treatmentSourceTrace: isPlainObject(row.treatmentSourceTrace) ? clonePlainValue(row.treatmentSourceTrace) : {},
      warnings: rowWarnings,
      dataGaps: rowDataGaps,
      diagnosticStatus: rowDataGaps.length ? "partial" : "valid"
    };
  }

  function buildTreatedFactsLedger(input) {
    const warnings = [];
    const dataGaps = [];
    const inputRows = getInputRows(input, warnings);
    const rows = inputRows.reduce(function (normalizedRows, row, index) {
      const normalizedRow = normalizeTreatedFactRow(row, index, warnings, dataGaps);
      if (normalizedRow) {
        normalizedRows.push(normalizedRow);
      }
      return normalizedRows;
    }, []);

    return {
      ledgerType: TREATED_FACTS_LEDGER_TYPE,
      version: TREATED_FACTS_LEDGER_VERSION,
      diagnosticOnly: true,
      ledgerDrivesGraph: false,
      graphMathChanged: false,
      rows,
      rowCount: rows.length,
      warnings,
      dataGaps,
      trace: {
        source: "treated-facts-ledger",
        sourceRowStatus: inputRows.length ? "source rows supplied" : "no source rows supplied",
        sourceRowCount: inputRows.length,
        rowsOmitted: inputRows.length - rows.length,
        treatmentMetadataOnly: true,
        lifetimeProjectionRowsProduced: false,
        graphMathProduced: false,
        inputMutated: false
      }
    };
  }

  lensAnalysis.TREATED_FACTS_LEDGER_VERSION = TREATED_FACTS_LEDGER_VERSION;
  lensAnalysis.TREATED_FACTS_LEDGER_TYPE = TREATED_FACTS_LEDGER_TYPE;
  lensAnalysis.MODEL90_ALLOWED_TREATMENT_MODES = MODEL90_ALLOWED_TREATMENT_MODES;
  lensAnalysis.MODEL90_ALLOWED_INCLUSION_STATUSES = MODEL90_ALLOWED_INCLUSION_STATUSES;
  lensAnalysis.buildTreatedFactsLedger = buildTreatedFactsLedger;

  if (typeof module !== "undefined" && module.exports) {
    module.exports = {
      TREATED_FACTS_LEDGER_VERSION,
      TREATED_FACTS_LEDGER_TYPE,
      MODEL90_ALLOWED_OWNER_COMPONENTS,
      MODEL90_ALLOWED_TREATMENT_MODES,
      MODEL90_ALLOWED_INCLUSION_STATUSES,
      buildTreatedFactsLedger
    };
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
