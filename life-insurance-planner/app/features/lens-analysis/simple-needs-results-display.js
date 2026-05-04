(function () {
  function isPlainObject(value) {
    return Boolean(value && typeof value === "object" && !Array.isArray(value));
  }

  function cloneSettings(settings) {
    return isPlainObject(settings) ? { ...settings } : {};
  }

  function escapeHtml(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function toDisplayNumber(value) {
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  }

  function formatCurrency(value) {
    const number = toDisplayNumber(value);
    if (number == null) {
      return "$0";
    }

    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 0
    }).format(number);
  }

  function formatDisplayValue(value) {
    if (typeof value === "boolean") {
      return value ? "Yes" : "No";
    }

    if (value == null || value === "") {
      return "Not set";
    }

    return String(value);
  }

  function getUrlValue(params, fieldNames) {
    const names = Array.isArray(fieldNames) ? fieldNames : [];
    for (let index = 0; index < names.length; index += 1) {
      const value = String(params.get(names[index]) || "").trim();
      if (value) {
        return value;
      }
    }

    return "";
  }

  function resolveLinkedProfileRecord() {
    const clientRecords = window.LensApp?.clientRecords || {};
    const getCurrentLinkedRecord = clientRecords.getCurrentLinkedRecord;
    const getClientRecordByReference = clientRecords.getClientRecordByReference;
    if (typeof getCurrentLinkedRecord !== "function") {
      return null;
    }

    const params = new URLSearchParams(window.location.search);
    const urlCaseRef = getUrlValue(params, ["caseRef", "profileCaseRef", "linkedCaseRef"]);
    const urlRecordId = getUrlValue(params, ["profileId", "recordId", "id", "linkedRecordId"]);
    if ((urlCaseRef || urlRecordId) && typeof getClientRecordByReference === "function") {
      return getClientRecordByReference(urlRecordId, urlCaseRef);
    }

    return getCurrentLinkedRecord(urlCaseRef, urlRecordId);
  }

  function getProtectionModelingPayload(profileRecord) {
    if (profileRecord?.protectionModeling && typeof profileRecord.protectionModeling === "object") {
      return profileRecord.protectionModeling;
    }

    const entries = Array.isArray(profileRecord?.protectionModelingEntries)
      ? profileRecord.protectionModelingEntries
      : [];
    return entries.length ? entries[entries.length - 1] : null;
  }

  function hasProtectionModelingSource(payload) {
    return Boolean(
      payload
      && typeof payload === "object"
      && payload.data
      && typeof payload.data === "object"
      && Object.keys(payload.data).length
    );
  }

  function createSavedDataTaxConfig() {
    const incomeTaxCalculations = window.LensApp?.lensAnalysis?.incomeTaxCalculations || {};
    if (typeof incomeTaxCalculations.createPmiTaxConfigFromStorage !== "function") {
      return null;
    }

    return incomeTaxCalculations.createPmiTaxConfigFromStorage({
      storage: window.localStorage,
      taxUtils: window.LensPmiTaxUtils || null
    });
  }

  function renderMessage(host, title, message) {
    if (!host) {
      return;
    }

    host.innerHTML = `
      <div class="analysis-result-eyebrow">${escapeHtml(title)}</div>
      <p class="analysis-result-copy">${escapeHtml(message)}</p>
    `;
  }

  function renderMoneyList(items) {
    return `
      <ul class="analysis-result-list">
        ${items.map(function (item) {
          return `<li><span>${escapeHtml(item.label)}</span><strong>${formatCurrency(item.value)}</strong></li>`;
        }).join("")}
      </ul>
    `;
  }

  function renderAssumptionList(items) {
    return `
      <ul class="analysis-result-list">
        ${items.map(function (item) {
          return `<li><span>${escapeHtml(item.label)}</span><strong>${escapeHtml(formatDisplayValue(item.value))}</strong></li>`;
        }).join("")}
      </ul>
    `;
  }

  function findTrace(result, key) {
    const trace = Array.isArray(result?.trace) ? result.trace : [];
    return trace.find(function (entry) {
      return entry && entry.key === key;
    }) || null;
  }

  function getTraceInput(trace, inputKey) {
    return isPlainObject(trace?.inputs) ? trace.inputs[inputKey] : undefined;
  }

  function getAssetOffsetStatus(result) {
    const assetOffsetTrace = findTrace(result, "assetOffset");
    if (!assetOffsetTrace) {
      return "Asset offsets not available";
    }

    const includeAssetOffsets = getTraceInput(assetOffsetTrace, "includeOffsetAssets") === true;
    const effectiveSource = String(getTraceInput(assetOffsetTrace, "effectiveAssetOffsetSource") || "").trim();
    const assetOffsetStatus = String(getTraceInput(assetOffsetTrace, "assetOffsetStatus") || "").trim();
    if (!includeAssetOffsets || effectiveSource === "disabled" || assetOffsetStatus === "excluded") {
      return "Asset offsets excluded by default";
    }

    if (assetOffsetStatus === "treated-used" || effectiveSource === "treated") {
      return "Current-dollar treated asset offset used";
    }

    if (assetOffsetStatus === "treated-zero") {
      return "Current-dollar treated asset total available but $0";
    }

    return "Current-dollar treated asset total unavailable; using $0";
  }

  function normalizeWarningMessage(warning) {
    if (!warning || typeof warning !== "object") {
      return "";
    }

    return String(warning.message || warning.code || "").trim();
  }

  function splitWarnings(warnings) {
    return (Array.isArray(warnings) ? warnings : []).reduce(function (result, warning) {
      const message = normalizeWarningMessage(warning);
      if (!message) {
        return result;
      }

      if (warning?.severity === "info") {
        result.notes.push(message);
      } else {
        result.warnings.push(message);
      }

      return result;
    }, { warnings: [], notes: [] });
  }

  function renderWarningsAndNotes(title, warnings) {
    const split = splitWarnings(warnings);
    const warningMarkup = split.warnings.length
      ? `
        <div class="analysis-result-eyebrow">${escapeHtml(title)} Warnings</div>
        <ul class="analysis-result-list">
          ${split.warnings.map(function (message) {
            return `<li><span>${escapeHtml(message)}</span></li>`;
          }).join("")}
        </ul>
      `
      : "";
    const notesMarkup = split.notes.length
      ? `
        <details>
          <summary>${escapeHtml(title)} Notes</summary>
          <ul class="analysis-result-list">
            ${split.notes.map(function (message) {
              return `<li><span>${escapeHtml(message)}</span></li>`;
            }).join("")}
          </ul>
        </details>
      `
      : "";

    return warningMarkup + notesMarkup;
  }

  function renderSimpleNeedsResult(host, simpleNeedsResult, sharedWarnings) {
    const components = simpleNeedsResult.components || {};
    const offsets = simpleNeedsResult.commonOffsets || {};
    const assumptions = simpleNeedsResult.assumptions || {};
    const warnings = [
      ...(Array.isArray(sharedWarnings) ? sharedWarnings : []),
      ...(Array.isArray(simpleNeedsResult.warnings) ? simpleNeedsResult.warnings : [])
    ];

    host.innerHTML = `
      <div class="analysis-result-eyebrow">Simple Needs Analysis</div>
      <div class="analysis-result-value">${formatCurrency(simpleNeedsResult.netCoverageGap)}</div>
      <p class="analysis-result-copy">Straightforward current-dollar needs estimate using core planning inputs.</p>
      ${renderMoneyList([
        { label: "Gross Simple Needs", value: simpleNeedsResult.grossNeed },
        { label: "Existing Coverage Offset", value: offsets.existingCoverageOffset },
        { label: "Asset Offset", value: offsets.assetOffset },
        { label: "Net Coverage Gap", value: simpleNeedsResult.netCoverageGap }
      ])}
      <div class="analysis-result-eyebrow">Simple Needs Components</div>
      ${renderMoneyList([
        { label: "Debt Payoff", value: components.debtPayoff },
        { label: "Essential Support", value: components.essentialSupport },
        { label: "Education", value: components.education },
        { label: "Final Expenses", value: components.finalExpenses }
      ])}
      <div class="analysis-result-eyebrow">Offset Details</div>
      ${renderAssumptionList([
        { label: "Existing coverage offset", value: assumptions.includeExistingCoverageOffset },
        { label: "Asset offset status", value: getAssetOffsetStatus(simpleNeedsResult) },
        { label: "Asset offsets included", value: assumptions.includeAssetOffsets }
      ])}
      <div class="analysis-result-eyebrow">Assumptions</div>
      ${renderAssumptionList([
        { label: "Support years", value: assumptions.supportYears },
        { label: "Support years source", value: assumptions.supportYearsSource },
        { label: "Current-dollar only", value: assumptions.currentDollarOnly },
        { label: "Advanced LENS assumptions consumed", value: assumptions.advancedLensAssumptionsConsumed }
      ])}
      ${renderWarningsAndNotes("Simple Needs", warnings)}
    `;
  }

  function initializeSimpleNeedsResultsDisplay() {
    const host = document.querySelector("[data-simple-needs-results-analysis]");
    if (!host) {
      return;
    }

    const lensAnalysis = window.LensApp?.lensAnalysis || {};
    const buildLensModelFromSavedProtectionModeling = lensAnalysis.buildLensModelFromSavedProtectionModeling;
    const runSimpleNeedsAnalysis = lensAnalysis.analysisMethods?.runSimpleNeedsAnalysis;
    const defaultSettings = lensAnalysis.analysisMethods?.DEFAULT_SIMPLE_NEEDS_SETTINGS;

    if (typeof buildLensModelFromSavedProtectionModeling !== "function") {
      renderMessage(host, "Simple Needs Analysis", "Lens saved-data builder is unavailable.");
      return;
    }

    if (typeof runSimpleNeedsAnalysis !== "function") {
      renderMessage(host, "Simple Needs Analysis", "Simple Needs method is unavailable.");
      return;
    }

    const profileRecord = resolveLinkedProfileRecord();
    if (!profileRecord) {
      renderMessage(host, "Simple Needs Analysis", "Link a client profile before running the Simple Needs result.");
      return;
    }

    const protectionModelingPayload = getProtectionModelingPayload(profileRecord);
    if (!hasProtectionModelingSource(protectionModelingPayload)) {
      renderMessage(host, "Simple Needs Analysis", "No saved protection modeling data was found for this linked profile.");
      return;
    }

    try {
      const builderResult = buildLensModelFromSavedProtectionModeling({
        profileRecord,
        protectionModelingPayload,
        taxConfig: createSavedDataTaxConfig()
      });

      if (!builderResult?.lensModel) {
        renderMessage(host, "Simple Needs Analysis", "The saved Lens model could not be built for this profile.");
        return;
      }

      renderSimpleNeedsResult(
        host,
        runSimpleNeedsAnalysis(builderResult.lensModel, cloneSettings(defaultSettings)),
        Array.isArray(builderResult.warnings) ? builderResult.warnings : []
      );
    } catch (error) {
      renderMessage(host, "Simple Needs Analysis", "Simple Needs result could not be prepared from the saved Lens model.");
      console.error("Simple Needs result display failed", error);
    }
  }

  document.addEventListener("DOMContentLoaded", initializeSimpleNeedsResultsDisplay);
})();
