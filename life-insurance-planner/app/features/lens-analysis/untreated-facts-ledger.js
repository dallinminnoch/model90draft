(function (global) {
  const root = global.LensApp || (global.LensApp = {});
  const lensAnalysis = root.lensAnalysis || (root.lensAnalysis = {});

  // Owner: Lens analysis ledger contracts.
  // Purpose: define diagnostic-only raw/untreated fact rows for the future
  // layered ledger architecture. Non-goals: no treatment resolution,
  // projection math, graph output, DOM, storage, or runtime wiring.
  const UNTREATED_FACTS_LEDGER_VERSION = "untreated-facts-ledger-v1";
  const UNTREATED_FACTS_LEDGER_TYPE = "untreatedFacts";

  const MODEL90_LEDGER_DIAGNOSTIC_STATUSES = Object.freeze({
    VALID: "valid",
    INVALID: "invalid",
    PARTIAL: "partial"
  });

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

  const UNTREATED_FACT_FIELDS = Object.freeze([
    "factId",
    "sourceSurface",
    "sourceType",
    "sourcePath",
    "sourceRecordId",
    "itemType",
    "categoryKey",
    "label",
    "amount",
    "frequency",
    "balance",
    "paymentAmount",
    "interestRatePercent",
    "termMonths",
    "startDate",
    "endDate",
    "continuesAfterDeath",
    "ownerCandidates",
    "supportingFacts",
    "trace",
    "warnings",
    "dataGaps"
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
        code: normalizeString(issue.code) || "untreated-facts-ledger-row-issue",
        message: normalizeString(issue.message) || "Untreated Facts Ledger row issue.",
        details: isPlainObject(issue.details) ? clonePlainValue(issue.details) : {}
      };
    });
  }

  function normalizeStringArray(value) {
    const seen = new Set();
    return (Array.isArray(value) ? value : []).reduce(function (items, entry) {
      const normalized = normalizeString(entry);
      if (!normalized || seen.has(normalized)) {
        return items;
      }
      seen.add(normalized);
      items.push(normalized);
      return items;
    }, []);
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
      "untreated-facts-ledger-input-rows-invalid",
      "Untreated Facts Ledger input did not provide a rows array; no rows were built.",
      { inputType: Array.isArray(input) ? "array" : typeof input }
    ));
    return [];
  }

  function normalizeNumberField(row, fieldName, rowIssues) {
    const value = row[fieldName];
    const parsed = toOptionalNumber(value);
    if (value != null && value !== "" && parsed == null) {
      rowIssues.push(createIssue(
        `untreated-facts-ledger-${fieldName}-invalid`,
        `Untreated Facts Ledger ${fieldName} was not numeric and was set to null.`,
        { fieldName, value: clonePlainValue(value) }
      ));
    }
    return parsed;
  }

  function normalizeUntreatedFactRow(row, index, ledgerWarnings, ledgerDataGaps) {
    if (!isPlainObject(row)) {
      ledgerWarnings.push(createIssue(
        "untreated-facts-ledger-row-invalid",
        "Untreated Facts Ledger row was not an object and was omitted.",
        { index }
      ));
      return null;
    }

    const rowWarnings = normalizeIssueList(row.warnings);
    const rowDataGaps = normalizeIssueList(row.dataGaps);
    const factId = normalizeString(row.factId) || `untreated-fact-${index + 1}`;
    if (!normalizeString(row.factId)) {
      const issue = createIssue(
        "untreated-facts-ledger-fact-id-missing",
        "Untreated Facts Ledger row was missing factId; a deterministic diagnostic id was assigned.",
        { index, assignedFactId: factId }
      );
      rowDataGaps.push(issue);
      ledgerDataGaps.push(issue);
    }

    const sourcePath = normalizeString(row.sourcePath);
    if (!sourcePath) {
      const issue = createIssue(
        "untreated-facts-ledger-source-path-missing",
        "Untreated Facts Ledger row was missing a sourcePath for raw fact traceability.",
        { index, factId }
      );
      rowDataGaps.push(issue);
      ledgerDataGaps.push(issue);
    }

    ["amount", "balance", "paymentAmount", "interestRatePercent", "termMonths"].forEach(function (fieldName) {
      const beforeCount = rowWarnings.length;
      normalizeNumberField(row, fieldName, rowWarnings);
      if (rowWarnings.length > beforeCount) {
        ledgerWarnings.push(rowWarnings[rowWarnings.length - 1]);
      }
    });

    return {
      factId,
      sourceSurface: normalizeString(row.sourceSurface),
      sourceType: normalizeString(row.sourceType),
      sourcePath,
      sourceRecordId: normalizeString(row.sourceRecordId),
      itemType: normalizeString(row.itemType) || "unknown",
      categoryKey: normalizeString(row.categoryKey),
      label: normalizeString(row.label),
      amount: normalizeNumberField(row, "amount", []),
      frequency: normalizeString(row.frequency),
      balance: normalizeNumberField(row, "balance", []),
      paymentAmount: normalizeNumberField(row, "paymentAmount", []),
      interestRatePercent: normalizeNumberField(row, "interestRatePercent", []),
      termMonths: normalizeNumberField(row, "termMonths", []),
      startDate: normalizeString(row.startDate),
      endDate: normalizeString(row.endDate),
      continuesAfterDeath: toOptionalBoolean(row.continuesAfterDeath),
      ownerCandidates: normalizeStringArray(row.ownerCandidates).filter(function (owner) {
        return MODEL90_ALLOWED_OWNER_COMPONENTS.includes(owner) || owner;
      }),
      supportingFacts: Array.isArray(row.supportingFacts) ? clonePlainValue(row.supportingFacts) : [],
      trace: isPlainObject(row.trace) ? clonePlainValue(row.trace) : {
        source: "untreated-facts-ledger",
        sourceRowIndex: index,
        sourcePath
      },
      warnings: rowWarnings,
      dataGaps: rowDataGaps,
      diagnosticStatus: rowDataGaps.length
        ? MODEL90_LEDGER_DIAGNOSTIC_STATUSES.PARTIAL
        : MODEL90_LEDGER_DIAGNOSTIC_STATUSES.VALID
    };
  }

  function buildUntreatedFactsLedger(input) {
    const warnings = [];
    const dataGaps = [];
    const inputRows = getInputRows(input, warnings);
    const rows = inputRows.reduce(function (normalizedRows, row, index) {
      const normalizedRow = normalizeUntreatedFactRow(row, index, warnings, dataGaps);
      if (normalizedRow) {
        normalizedRows.push(normalizedRow);
      }
      return normalizedRows;
    }, []);

    return {
      ledgerType: UNTREATED_FACTS_LEDGER_TYPE,
      version: UNTREATED_FACTS_LEDGER_VERSION,
      diagnosticOnly: true,
      ledgerDrivesGraph: false,
      graphMathChanged: false,
      rows,
      rowCount: rows.length,
      warnings,
      dataGaps,
      trace: {
        source: "untreated-facts-ledger",
        sourceRowStatus: inputRows.length ? "source rows supplied" : "no source rows supplied",
        sourceRowCount: inputRows.length,
        rowsOmitted: inputRows.length - rows.length,
        treatmentApplied: false,
        inflationApplied: false,
        growthApplied: false,
        graphOutputProduced: false,
        inputMutated: false,
        contractFields: UNTREATED_FACT_FIELDS.slice()
      }
    };
  }

  lensAnalysis.UNTREATED_FACTS_LEDGER_VERSION = UNTREATED_FACTS_LEDGER_VERSION;
  lensAnalysis.UNTREATED_FACTS_LEDGER_TYPE = UNTREATED_FACTS_LEDGER_TYPE;
  lensAnalysis.MODEL90_ALLOWED_OWNER_COMPONENTS = MODEL90_ALLOWED_OWNER_COMPONENTS;
  lensAnalysis.MODEL90_LEDGER_DIAGNOSTIC_STATUSES = MODEL90_LEDGER_DIAGNOSTIC_STATUSES;
  lensAnalysis.buildUntreatedFactsLedger = buildUntreatedFactsLedger;

  if (typeof module !== "undefined" && module.exports) {
    module.exports = {
      UNTREATED_FACTS_LEDGER_VERSION,
      UNTREATED_FACTS_LEDGER_TYPE,
      MODEL90_ALLOWED_OWNER_COMPONENTS,
      MODEL90_LEDGER_DIAGNOSTIC_STATUSES,
      buildUntreatedFactsLedger
    };
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
