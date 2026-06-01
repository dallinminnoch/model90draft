(function (global) {
  const root = global.LensApp || (global.LensApp = {});
  const lensAnalysis = root.lensAnalysis || (root.lensAnalysis = {});

  // Owner: Lens analysis ledger contracts.
  // Purpose: define diagnostic-only projection ledger rows that future shared
  // projection engines can produce. Non-goals: no current graph-driving
  // behavior, page wiring, DOM, storage, or analysis consumption.
  const PROJECTION_LEDGER_VERSION = "projection-ledger-v1";
  const PROJECTION_LEDGER_TYPE = "projection";

  const MODEL90_ALLOWED_PROJECTION_GRANULARITIES = Object.freeze([
    "annual",
    "monthly",
    "annualAndMonthly",
    "diagnosticOnly",
    "unknown"
  ]);

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
        code: normalizeString(issue.code) || "projection-ledger-row-issue",
        message: normalizeString(issue.message) || "Projection Ledger row issue.",
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
      "projection-ledger-input-rows-invalid",
      "Projection Ledger input did not provide a rows array; no rows were built.",
      { inputType: Array.isArray(input) ? "array" : typeof input }
    ));
    return [];
  }

  function normalizeEnum(value, allowedValues, fallback, fieldName, rowWarnings, ledgerWarnings, details) {
    const normalized = normalizeString(value) || fallback;
    if (!allowedValues.includes(normalized)) {
      const issue = createIssue(
        `projection-ledger-${fieldName}-unknown`,
        `Projection Ledger ${fieldName} is outside the current contract allow-list and was preserved as metadata.`,
        Object.assign({ fieldName, value: normalized }, details || {})
      );
      rowWarnings.push(issue);
      ledgerWarnings.push(issue);
    }
    return normalized;
  }

  function normalizeProjectedPoint(point, index, pointType, rowWarnings, ledgerWarnings, rowId) {
    if (!isPlainObject(point)) {
      const issue = createIssue(
        `projection-ledger-${pointType}-row-invalid`,
        `Projection Ledger ${pointType} row was not an object and was omitted.`,
        { projectionRowId: rowId, index }
      );
      rowWarnings.push(issue);
      ledgerWarnings.push(issue);
      return null;
    }
    return {
      yearIndex: toOptionalNumber(point.yearIndex),
      calendarYear: toOptionalNumber(point.calendarYear),
      monthIndex: pointType === "monthlyRows" ? toOptionalNumber(point.monthIndex) : null,
      amount: toOptionalNumber(point.amount),
      balance: toOptionalNumber(point.balance),
      paymentAmount: toOptionalNumber(point.paymentAmount),
      inflatedAmount: toOptionalNumber(point.inflatedAmount),
      growthAmount: toOptionalNumber(point.growthAmount),
      offsetAmount: toOptionalNumber(point.offsetAmount),
      netAmount: toOptionalNumber(point.netAmount),
      trace: isPlainObject(point.trace) ? clonePlainValue(point.trace) : {}
    };
  }

  function normalizeProjectedRows(value, pointType, rowWarnings, ledgerWarnings, rowId) {
    return (Array.isArray(value) ? value : []).reduce(function (rows, point, index) {
      const normalized = normalizeProjectedPoint(point, index, pointType, rowWarnings, ledgerWarnings, rowId);
      if (normalized) {
        rows.push(normalized);
      }
      return rows;
    }, []);
  }

  function normalizeProjectionRow(row, index, ledgerWarnings, ledgerDataGaps) {
    if (!isPlainObject(row)) {
      ledgerWarnings.push(createIssue(
        "projection-ledger-row-invalid",
        "Projection Ledger row was not an object and was omitted.",
        { index }
      ));
      return null;
    }

    const rowWarnings = normalizeIssueList(row.warnings);
    const rowDataGaps = normalizeIssueList(row.dataGaps);
    const projectionRowId = normalizeString(row.projectionRowId) || `projection-row-${index + 1}`;
    if (!normalizeString(row.projectionRowId)) {
      const issue = createIssue(
        "projection-ledger-projection-row-id-missing",
        "Projection Ledger row was missing projectionRowId; a deterministic diagnostic id was assigned.",
        { index, assignedProjectionRowId: projectionRowId }
      );
      rowDataGaps.push(issue);
      ledgerDataGaps.push(issue);
    }
    if (!normalizeString(row.treatedFactId)) {
      const issue = createIssue(
        "projection-ledger-treated-fact-id-missing",
        "Projection Ledger row was missing treatedFactId and cannot be traced to a treated fact yet.",
        { index, projectionRowId }
      );
      rowDataGaps.push(issue);
      ledgerDataGaps.push(issue);
    }

    return {
      projectionRowId,
      treatedFactId: normalizeString(row.treatedFactId),
      sourceFactId: normalizeString(row.sourceFactId),
      itemType: normalizeString(row.itemType) || "unknown",
      ownerComponent: normalizeEnum(
        row.ownerComponent,
        MODEL90_ALLOWED_OWNER_COMPONENTS,
        "unknown",
        "ownerComponent",
        rowWarnings,
        ledgerWarnings,
        { index, projectionRowId }
      ),
      projectionMode: normalizeString(row.projectionMode) || "diagnosticOnly",
      projectionGranularity: normalizeEnum(
        row.projectionGranularity,
        MODEL90_ALLOWED_PROJECTION_GRANULARITIES,
        "diagnosticOnly",
        "projectionGranularity",
        rowWarnings,
        ledgerWarnings,
        { index, projectionRowId }
      ),
      annualRows: normalizeProjectedRows(row.annualRows, "annualRows", rowWarnings, ledgerWarnings, projectionRowId),
      monthlyRows: normalizeProjectedRows(row.monthlyRows, "monthlyRows", rowWarnings, ledgerWarnings, projectionRowId),
      payoffDate: normalizeString(row.payoffDate),
      depletionDate: normalizeString(row.depletionDate),
      terminalValue: toOptionalNumber(row.terminalValue),
      trace: isPlainObject(row.trace) ? clonePlainValue(row.trace) : {},
      warnings: rowWarnings,
      dataGaps: rowDataGaps,
      diagnosticStatus: rowDataGaps.length ? "partial" : "valid"
    };
  }

  function buildProjectionLedger(input) {
    const warnings = [];
    const dataGaps = [];
    const inputRows = getInputRows(input, warnings);
    const rows = inputRows.reduce(function (normalizedRows, row, index) {
      const normalizedRow = normalizeProjectionRow(row, index, warnings, dataGaps);
      if (normalizedRow) {
        normalizedRows.push(normalizedRow);
      }
      return normalizedRows;
    }, []);

    return {
      ledgerType: PROJECTION_LEDGER_TYPE,
      version: PROJECTION_LEDGER_VERSION,
      diagnosticOnly: true,
      ledgerDrivesGraph: false,
      graphMathChanged: false,
      rows,
      rowCount: rows.length,
      warnings,
      dataGaps,
      trace: {
        source: "projection-ledger",
        sourceRowStatus: inputRows.length ? "source rows supplied" : "no source rows supplied",
        sourceRowCount: inputRows.length,
        rowsOmitted: inputRows.length - rows.length,
        annualRowsSupported: true,
        monthlyRowsSupported: true,
        graphDrivingBehaviorEnabled: false,
        analysisConsumptionEnabled: false,
        inputMutated: false
      }
    };
  }

  lensAnalysis.PROJECTION_LEDGER_VERSION = PROJECTION_LEDGER_VERSION;
  lensAnalysis.PROJECTION_LEDGER_TYPE = PROJECTION_LEDGER_TYPE;
  lensAnalysis.MODEL90_ALLOWED_PROJECTION_GRANULARITIES = MODEL90_ALLOWED_PROJECTION_GRANULARITIES;
  lensAnalysis.buildProjectionLedger = buildProjectionLedger;

  if (typeof module !== "undefined" && module.exports) {
    module.exports = {
      PROJECTION_LEDGER_VERSION,
      PROJECTION_LEDGER_TYPE,
      MODEL90_ALLOWED_PROJECTION_GRANULARITIES,
      MODEL90_ALLOWED_OWNER_COMPONENTS,
      buildProjectionLedger
    };
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
