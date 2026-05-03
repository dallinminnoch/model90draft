(function () {
  function isPlainObject(value) {
    return Boolean(value && typeof value === "object" && !Array.isArray(value));
  }

  function cloneSettings(settings) {
    return isPlainObject(settings) ? { ...settings } : {};
  }

  function createFallbackAnalysisMethodSettings(analysisSettingsAdapter) {
    const adapter = isPlainObject(analysisSettingsAdapter) ? analysisSettingsAdapter : {};
    return {
      dimeSettings: cloneSettings(adapter.DEFAULT_DIME_SETTINGS),
      needsAnalysisSettings: cloneSettings(adapter.DEFAULT_NEEDS_ANALYSIS_SETTINGS),
      humanLifeValueSettings: cloneSettings(adapter.DEFAULT_HUMAN_LIFE_VALUE_SETTINGS),
      warnings: [
        {
          code: "analysis-settings-adapter-unavailable",
          message: "Analysis settings adapter was unavailable; Step 3 used current default method settings.",
          severity: "info",
          sourcePaths: ["LensApp.lensAnalysis.analysisSettingsAdapter"]
        }
      ],
      trace: []
    };
  }

  function escapeHtml(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function formatCurrency(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) {
      return "$0";
    }

    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 0
    }).format(number);
  }

  function formatOptionalCurrency(value) {
    return toDisplayNumber(value) == null ? "Not set" : formatCurrency(value);
  }

  function toDisplayNumber(value) {
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  }

  function formatPercent(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) {
      return "Not set";
    }

    return `${number.toFixed(2)}%`;
  }

  function formatYears(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) {
      return "Not set";
    }

    return number === 1 ? "1 year" : `${number} years`;
  }

  function formatCount(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) {
      return "Not set";
    }

    return new Intl.NumberFormat("en-US", {
      maximumFractionDigits: 0
    }).format(number);
  }

  function formatDisplayValue(value) {
    if (typeof value === "boolean") {
      return value ? "Included" : "Excluded";
    }

    if (value == null || value === "") {
      return "Not set";
    }

    return String(value);
  }

  function formatBooleanDetail(value) {
    if (value === true) {
      return "Yes";
    }

    if (value === false) {
      return "No";
    }

    return "Not set";
  }

  function formatMonths(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) {
      return "Not set";
    }

    return number === 1 ? "1 month" : `${number} months`;
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

  function getEducationValuationDateDetailValue(inflationTrace) {
    const valuationDate = getTraceInput(inflationTrace, "valuationDate")
      || getTraceInput(inflationTrace, "asOfDate");
    if (!valuationDate) {
      return "Not set";
    }

    if (getTraceInput(inflationTrace, "valuationDateDefaulted") === true) {
      return `${valuationDate} (defaulted to current date)`;
    }

    return String(valuationDate);
  }

  function hasTraceInput(trace, inputKey) {
    return isPlainObject(trace?.inputs)
      && Object.prototype.hasOwnProperty.call(trace.inputs, inputKey);
  }

  function normalizeWarningMessage(warning) {
    if (!warning || typeof warning !== "object") {
      return "";
    }

    return String(warning.message || warning.code || "").trim();
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

  function renderMessageToHosts(hosts, title, message) {
    hosts.forEach(function (host) {
      renderMessage(host, title, message);
    });
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

  function renderProjectionDetailSection(title, rows) {
    if (!Array.isArray(rows) || !rows.length) {
      return "";
    }

    return `
      <p class="analysis-result-copy"><strong>${escapeHtml(title)}</strong></p>
      ${renderAssumptionList(rows)}
    `;
  }

  function getAssetOffsetStatus(trace) {
    const includeOffsetAssets = getTraceInput(trace, "includeOffsetAssets") === true;
    const effectiveSource = String(getTraceInput(trace, "effectiveAssetOffsetSource") || "").trim().toLowerCase();
    const assetOffsetStatus = String(getTraceInput(trace, "assetOffsetStatus") || "").trim().toLowerCase();
    const selectedInputValue = toDisplayNumber(getTraceInput(trace, "selectedAssetOffsetValue"));
    const traceValue = toDisplayNumber(trace?.value);
    const selectedValue = selectedInputValue == null ? traceValue : selectedInputValue;
    const treatedAvailable = getTraceInput(trace, "treatedAssetOffsetsAvailable") === true;

    if (!includeOffsetAssets || effectiveSource === "disabled" || assetOffsetStatus === "excluded") {
      return "Asset offsets excluded";
    }

    if (assetOffsetStatus === "treated-unavailable" || effectiveSource === "zero" || !treatedAvailable) {
      return "Treated asset total unavailable; using $0";
    }

    if (assetOffsetStatus === "treated-zero" || selectedValue === 0) {
      return "Treated asset total available but $0";
    }

    if (assetOffsetStatus === "treated-used" || effectiveSource === "treated") {
      return "Treated asset offset used";
    }

    return "Treated asset total unavailable; using $0";
  }

  function renderAssetOffsetDetails(result) {
    const assetOffsetTrace = findTrace(result, "assetOffset");
    if (!assetOffsetTrace) {
      return "";
    }

    const rows = [
      { label: "Asset offset status", value: getAssetOffsetStatus(assetOffsetTrace) }
    ];

    return renderProjectionDetailSection("Asset Offset Details", rows);
  }

  function getExistingCoverageStatus(trace) {
    if (getTraceInput(trace, "includeExistingCoverageOffset") !== true) {
      return "Excluded by Include Existing Coverage Offset";
    }

    const offsetStatus = String(getTraceInput(trace, "existingCoverageOffsetStatus") || "").trim();
    if (offsetStatus === "treated-used" || offsetStatus === "treated-zero") {
      return "Using treated existing coverage";
    }

    if (offsetStatus === "raw-fallback") {
      return "Using raw linked coverage fallback";
    }

    const sourcePath = String(getTraceInput(trace, "methodOffsetSourcePath") || "").trim();
    if (sourcePath === "treatedExistingCoverageOffset.totalTreatedCoverageOffset") {
      return "Using treated existing coverage";
    }

    if (sourcePath === "existingCoverage.totalExistingCoverage") {
      return "Using raw linked profile coverage";
    }

    return "Using current method trace";
  }

  function getExistingCoverageTreatmentStatus(trace) {
    if (getTraceInput(trace, "existingCoverageOffsetFallbackUsed") === true) {
      return "Treated coverage unavailable; raw fallback used";
    }

    if (getTraceInput(trace, "treatedExistingCoverageOffsetAvailable") !== true) {
      return "";
    }

    return getTraceInput(trace, "treatedExistingCoverageConsumedByMethods") === true
      ? "Treated coverage used"
      : "Prepared for preview; not method-used";
  }

  function formatTraceReason(value) {
    const normalized = String(value || "").trim();
    if (!normalized) {
      return "";
    }

    return normalized
      .replace(/[-_]+/g, " ")
      .replace(/\s+/g, " ")
      .replace(/^./, function (match) {
        return match.toUpperCase();
      });
  }

  function formatExistingCoveragePolicyCount(trace) {
    const policyCount = toDisplayNumber(getTraceInput(trace, "treatedExistingCoveragePolicyCount"));
    if (policyCount == null) {
      return "";
    }

    const includedPolicyCount = toDisplayNumber(getTraceInput(trace, "treatedExistingCoverageIncludedPolicyCount"));
    const excludedPolicyCount = toDisplayNumber(getTraceInput(trace, "treatedExistingCoverageExcludedPolicyCount"));
    if (includedPolicyCount != null && excludedPolicyCount != null) {
      return `${formatCount(includedPolicyCount)} included / ${formatCount(excludedPolicyCount)} excluded (${formatCount(policyCount)} total)`;
    }

    return `${formatCount(policyCount)} total`;
  }

  function renderExistingCoverageDetails(result) {
    const existingCoverageTrace = findTrace(result, "existingCoverageOffset");
    if (!existingCoverageTrace) {
      return "";
    }

    const hasDetailTrace = [
      "rawExistingCoverageTotal",
      "rawExistingCoverageOffsetUsed",
      "methodOffsetSourcePath",
      "treatedExistingCoverageOffsetAvailable"
    ].some(function (fieldName) {
      return hasTraceInput(existingCoverageTrace, fieldName);
    });
    if (!hasDetailTrace) {
      return "";
    }

    const methodUsedExistingCoverageOffset = toDisplayNumber(
      getTraceInput(existingCoverageTrace, "methodUsedExistingCoverageOffset")
    );
    const linkedCoverageTotal = toDisplayNumber(getTraceInput(existingCoverageTrace, "rawExistingCoverageTotal"));
    const treatedCoverageAvailable = getTraceInput(existingCoverageTrace, "treatedExistingCoverageOffsetAvailable") === true;
    const treatedCoverageConsumed = getTraceInput(existingCoverageTrace, "treatedExistingCoverageConsumedByMethods") === true;
    const treatedCoverageTotal = treatedCoverageAvailable
      ? toDisplayNumber(getTraceInput(existingCoverageTrace, "treatedExistingCoverageTotal"))
      : null;
    const treatmentStatus = getExistingCoverageTreatmentStatus(existingCoverageTrace);
    const policyCount = formatExistingCoveragePolicyCount(existingCoverageTrace);
    const fallbackReason = formatTraceReason(
      getTraceInput(existingCoverageTrace, "existingCoverageOffsetFallbackReason")
    );

    const rows = [
      { label: "Existing coverage status", value: getExistingCoverageStatus(existingCoverageTrace) },
      {
        label: "Method-used coverage",
        value: formatCurrency(methodUsedExistingCoverageOffset == null ? existingCoverageTrace.value : methodUsedExistingCoverageOffset)
      }
    ];

    if (linkedCoverageTotal != null) {
      rows.push({ label: "Linked coverage total", value: formatCurrency(linkedCoverageTotal) });
    }

    if (treatedCoverageAvailable && treatedCoverageTotal != null) {
      rows.push({
        label: treatedCoverageConsumed ? "Treated coverage used" : "Treated coverage preview",
        value: formatCurrency(treatedCoverageTotal)
      });
    }

    if (treatmentStatus) {
      rows.push({ label: "Treatment status", value: treatmentStatus });
    }

    if (fallbackReason) {
      rows.push({ label: "Fallback reason", value: fallbackReason });
    }

    if (policyCount) {
      rows.push({ label: "Policy count", value: policyCount });
    }

    return renderProjectionDetailSection("Existing Coverage Details", rows);
  }

  function hasDebtTreatmentTrace(trace) {
    return Boolean(
      trace
      && (
        hasTraceInput(trace, "treatedDebtPayoffAvailable")
        || hasTraceInput(trace, "preparedDebtSourcePath")
      )
    );
  }

  function getDebtTreatmentStatus(trace) {
    if (!hasDebtTreatmentTrace(trace)) {
      return "";
    }

    if (getTraceInput(trace, "treatedDebtPayoffAvailable") !== true) {
      const fallbackReason = formatTraceReason(getTraceInput(trace, "fallbackReason"));
      return fallbackReason
        ? `Prepared treated debt unavailable: ${fallbackReason}`
        : "Prepared treated debt unavailable";
    }

    return getTraceInput(trace, "treatedDebtConsumedByMethods") === true
      ? "Prepared treated debt method-used"
      : "Prepared only; not method-used";
  }

  function getDebtTreatmentCurrentSource(trace) {
    const sourcePath = String(getTraceInput(trace, "currentMethodDebtSourcePath") || "").trim();
    if (!sourcePath) {
      return "Current method trace";
    }

    if (sourcePath.indexOf("treatedDebtPayoff") >= 0) {
      return "Prepared treated debt used";
    }

    if (
      sourcePath.indexOf("debtPayoff") >= 0
      || sourcePath === "explicit-non-mortgage-debt-fields"
      || sourcePath === "sum-available-debt-payoff-fields"
    ) {
      return "Raw debtPayoff used";
    }

    return formatTraceReason(sourcePath);
  }

  function pushOptionalMoneyRow(rows, label, value) {
    const numericValue = toDisplayNumber(value);
    if (numericValue == null) {
      return;
    }

    rows.push({
      label,
      value: formatCurrency(numericValue)
    });
  }

  function hasDebtTraceField(trace, fieldName) {
    return Boolean(
      isPlainObject(trace)
      && (
        Object.prototype.hasOwnProperty.call(trace, fieldName)
        || hasTraceInput(trace, fieldName)
      )
    );
  }

  function getDebtTraceField(trace, fieldName) {
    if (hasTraceInput(trace, fieldName)) {
      return getTraceInput(trace, fieldName);
    }

    return isPlainObject(trace) ? trace[fieldName] : undefined;
  }

  function isMortgageSupportTrace(trace) {
    return String(getDebtTraceField(trace, "mortgageTreatmentMode") || "").trim().toLowerCase() === "support";
  }

  function getPreparedMortgageSupportTrace(lensModel) {
    const treatedDebtPayoff = isPlainObject(lensModel?.treatedDebtPayoff)
      ? lensModel.treatedDebtPayoff
      : {};
    const candidates = [
      ...(Array.isArray(treatedDebtPayoff.trace) ? treatedDebtPayoff.trace : []),
      ...(Array.isArray(treatedDebtPayoff.debts) ? treatedDebtPayoff.debts : [])
    ];

    return candidates.find(function (trace) {
      return isPlainObject(trace)
        && trace.isMortgage === true
        && isMortgageSupportTrace(trace);
    }) || null;
  }

  function getMortgageSupportDisplayTrace(methodTrace, lensModel) {
    return isMortgageSupportTrace(methodTrace)
      ? methodTrace
      : getPreparedMortgageSupportTrace(lensModel);
  }

  function formatSupportPeriod(years, months) {
    const parts = [];
    if (toDisplayNumber(years) != null) {
      parts.push(formatYears(years));
    }
    if (toDisplayNumber(months) != null) {
      parts.push(formatMonths(months));
    }

    return parts.length ? parts.join(" / ") : "Not set";
  }

  function pushMortgageSupportTraceRows(rows, supportTrace) {
    if (!isMortgageSupportTrace(supportTrace)) {
      return;
    }

    rows.push({ label: "Mortgage treatment mode", value: "Support" });
    pushOptionalMoneyRow(rows, "Monthly mortgage payment used", getDebtTraceField(supportTrace, "monthlyMortgagePaymentUsed"));

    if (
      hasDebtTraceField(supportTrace, "supportYearsRequested")
      || hasDebtTraceField(supportTrace, "supportMonthsRequested")
    ) {
      rows.push({
        label: "Requested support period / months",
        value: formatSupportPeriod(
          getDebtTraceField(supportTrace, "supportYearsRequested"),
          getDebtTraceField(supportTrace, "supportMonthsRequested")
        )
      });
    }

    const supportMonthsUsed = getDebtTraceField(supportTrace, "supportMonthsUsed");
    if (toDisplayNumber(supportMonthsUsed) != null) {
      rows.push({ label: "Support months used", value: formatMonths(supportMonthsUsed) });
    }

    if (hasDebtTraceField(supportTrace, "remainingTermCapApplied")) {
      rows.push({
        label: "Remaining-term cap applied",
        value: formatBooleanDetail(getDebtTraceField(supportTrace, "remainingTermCapApplied"))
      });
    }

    const remainingTermMonths = getDebtTraceField(supportTrace, "remainingTermMonths");
    if (toDisplayNumber(remainingTermMonths) != null) {
      rows.push({ label: "Remaining term months", value: formatMonths(remainingTermMonths) });
    }

    const noCapReason = getDebtTraceField(supportTrace, "noCapReason");
    if (
      getDebtTraceField(supportTrace, "remainingTermCapApplied") === false
      && noCapReason
    ) {
      rows.push({ label: "No-cap reason", value: formatTraceReason(noCapReason) });
    }

    if (hasDebtTraceField(supportTrace, "noInflationApplied")) {
      rows.push({
        label: "No inflation applied",
        value: formatBooleanDetail(getDebtTraceField(supportTrace, "noInflationApplied"))
      });
    }

    if (hasDebtTraceField(supportTrace, "noDiscountingApplied")) {
      rows.push({
        label: "No discounting applied",
        value: formatBooleanDetail(getDebtTraceField(supportTrace, "noDiscountingApplied"))
      });
    }

    pushOptionalMoneyRow(rows, "Mortgage support amount", getDebtTraceField(supportTrace, "mortgageSupportAmount"));
  }

  function getDebtTreatmentWarningsSummary(traces) {
    const labels = [];
    const seen = new Set();
    (Array.isArray(traces) ? traces : []).forEach(function (trace) {
      const warningCodes = Array.isArray(getTraceInput(trace, "warningCodes"))
        ? getTraceInput(trace, "warningCodes")
        : [];
      warningCodes.forEach(function (code) {
        const normalizedCode = String(code || "").trim();
        if (!normalizedCode || seen.has(normalizedCode)) {
          return;
        }

        seen.add(normalizedCode);
        labels.push(normalizedCode === "debt-treatment-mode-deferred"
          ? "Deferred treatment warning"
          : formatTraceReason(normalizedCode));
      });
    });

    return labels.join("; ");
  }

  function renderDimeDebtTreatmentDetails(dimeResult, lensModel) {
    const debtTrace = findTrace(dimeResult, "debt");
    const mortgageTrace = findTrace(dimeResult, "mortgage");
    if (!hasDebtTreatmentTrace(debtTrace) && !hasDebtTreatmentTrace(mortgageTrace)) {
      return "";
    }

    const mortgageSupportTrace = getMortgageSupportDisplayTrace(mortgageTrace || debtTrace, lensModel);
    const statusTrace = [debtTrace, mortgageTrace].find(function (trace) {
      return hasDebtTreatmentTrace(trace) && getTraceInput(trace, "treatedDebtConsumedByMethods") === true;
    }) || (hasDebtTreatmentTrace(debtTrace) ? debtTrace : mortgageTrace);
    const rows = [
      { label: "Debt treatment status", value: getDebtTreatmentStatus(statusTrace) },
      { label: "Current method-used debt source", value: getDebtTreatmentCurrentSource(debtTrace || mortgageTrace) }
    ];

    pushOptionalMoneyRow(
      rows,
      getTraceInput(debtTrace, "treatedDebtConsumedByMethods") === true
        ? "Raw non-mortgage debt reference"
        : "Raw non-mortgage debt used",
      getTraceInput(debtTrace, "rawNonMortgageDebtAmount")
    );
    pushOptionalMoneyRow(rows, "Prepared treated non-mortgage debt", getTraceInput(debtTrace, "preparedNonMortgageDebtAmount"));
    pushOptionalMoneyRow(
      rows,
      getTraceInput(mortgageTrace || debtTrace, "treatedDebtConsumedByMethods") === true
        ? "Raw mortgage reference"
        : "Raw mortgage used",
      getTraceInput(mortgageTrace || debtTrace, "rawMortgageAmount")
    );
    pushOptionalMoneyRow(
      rows,
      mortgageSupportTrace ? "Prepared treated mortgage support" : "Prepared treated mortgage",
      getTraceInput(mortgageTrace || debtTrace, "preparedMortgageAmount")
    );
    pushMortgageSupportTraceRows(rows, mortgageSupportTrace);
    pushOptionalMoneyRow(rows, "Excluded debt", getTraceInput(statusTrace, "excludedDebtAmount"));
    pushOptionalMoneyRow(rows, "Deferred debt", getTraceInput(statusTrace, "deferredDebtAmount"));

    const warningSummary = getDebtTreatmentWarningsSummary([debtTrace, mortgageTrace]);
    if (warningSummary) {
      rows.push({ label: "Warning summary", value: warningSummary });
    }

    return renderProjectionDetailSection("Debt Treatment Details", rows);
  }

  function renderNeedsDebtTreatmentDetails(needsResult, lensModel) {
    const debtTrace = findTrace(needsResult, "debtPayoff");
    if (!hasDebtTreatmentTrace(debtTrace)) {
      return "";
    }

    const mortgageSupportTrace = getMortgageSupportDisplayTrace(debtTrace, lensModel);
    const rows = [
      { label: "Debt treatment status", value: getDebtTreatmentStatus(debtTrace) },
      { label: "Current method-used debt source", value: getDebtTreatmentCurrentSource(debtTrace) }
    ];

    pushOptionalMoneyRow(
      rows,
      getTraceInput(debtTrace, "treatedDebtConsumedByMethods") === true
        ? "Raw debt payoff reference"
        : "Raw debt payoff used",
      getTraceInput(debtTrace, "rawDebtPayoffAmount")
    );
    pushOptionalMoneyRow(rows, "Prepared treated debt", getTraceInput(debtTrace, "preparedDebtPayoffAmount"));
    pushOptionalMoneyRow(
      rows,
      mortgageSupportTrace ? "Prepared treated mortgage support" : "Prepared treated mortgage",
      getTraceInput(debtTrace, "preparedMortgagePayoffAmount")
    );
    pushOptionalMoneyRow(rows, "Prepared treated non-mortgage debt", getTraceInput(debtTrace, "preparedNonMortgageDebtAmount"));
    pushMortgageSupportTraceRows(rows, mortgageSupportTrace);

    if (getTraceInput(debtTrace, "manualTotalDebtPayoffOverride") === true) {
      rows.push({
        label: "Manual override: metadata only",
        value: formatOptionalCurrency(getTraceInput(debtTrace, "manualTotalDebtPayoffAmount"))
      });
    }

    pushOptionalMoneyRow(rows, "Excluded debt", getTraceInput(debtTrace, "excludedDebtAmount"));
    pushOptionalMoneyRow(rows, "Deferred debt", getTraceInput(debtTrace, "deferredDebtAmount"));

    const warningSummary = getDebtTreatmentWarningsSummary([debtTrace]);
    if (warningSummary) {
      rows.push({ label: "Warning summary", value: warningSummary });
    }

    return renderProjectionDetailSection("Debt Treatment Details", rows);
  }

  function formatInflationRateLabel(ratePercent, rateSource) {
    const sourceLabel = String(rateSource || "").includes("householdExpenseInflationRatePercent")
      ? "household expense inflation"
      : "general inflation";

    return `${formatPercent(ratePercent)} ${sourceLabel}`;
  }

  function formatEducationInflationRateLabel(ratePercent, rateSource) {
    const normalizedSource = String(rateSource || "");
    const sourceLabel = normalizedSource.includes("educationInflationRatePercent")
      ? "education inflation"
      : (normalizedSource.includes("generalInflationRatePercent") ? "general inflation" : "inflation");

    return `${formatPercent(ratePercent)} ${sourceLabel}`;
  }

  function renderInflationProjectionDetail(options) {
    const normalizedOptions = isPlainObject(options) ? options : {};
    const inflationTrace = normalizedOptions.trace;
    if (!inflationTrace) {
      return "";
    }

    const inflationApplied = getTraceInput(inflationTrace, "inflationApplied") === true;
    const currentDollarTotal = getTraceInput(inflationTrace, "currentDollarTotal");
    const projectedTotal = getTraceInput(inflationTrace, "projectedTotal");
    const durationYears = getTraceInput(inflationTrace, "durationYears");
    const currentDollarLabel = normalizedOptions.currentDollarLabel || "Current-dollar support";
    const projectedLabel = normalizedOptions.projectedLabel || "Projected support";
    const disabledCurrentDollarLabel = normalizedOptions.disabledCurrentDollarLabel || "Current-dollar support used";
    const afterProjectedRows = Array.isArray(normalizedOptions.afterProjectedRows)
      ? normalizedOptions.afterProjectedRows
      : [];

    const rows = inflationApplied
      ? [
          { label: "Inflation status", value: "Applied" },
          { label: projectedLabel, value: formatCurrency(projectedTotal) },
          ...afterProjectedRows,
          { label: currentDollarLabel, value: formatCurrency(currentDollarTotal) },
          {
            label: "Inflation rate",
            value: formatInflationRateLabel(
              getTraceInput(inflationTrace, "ratePercent"),
              getTraceInput(inflationTrace, "rateSource")
            )
          },
          { label: "Projection duration", value: formatYears(durationYears) }
        ]
      : [
          { label: "Inflation status", value: "Disabled" },
          { label: disabledCurrentDollarLabel, value: formatCurrency(currentDollarTotal) },
          ...afterProjectedRows,
          { label: "Projection duration", value: formatYears(durationYears) }
        ];

    return renderProjectionDetailSection(normalizedOptions.title, rows);
  }

  function renderNeedsInflationDetail(needsResult) {
    const inflationTrace = findTrace(needsResult, "essentialSupportInflation");
    const components = isPlainObject(needsResult.components) ? needsResult.components : {};
    const offsets = isPlainObject(needsResult.commonOffsets) ? needsResult.commonOffsets : {};
    const survivorIncomeOffset = toDisplayNumber(offsets.survivorIncomeOffset);
    const essentialSupport = toDisplayNumber(components.essentialSupport);
    const essentialSupportExcluded = getTraceInput(inflationTrace, "includeEssentialSupport") === false
      || getTraceInput(inflationTrace, "included") === false;
    const bridgeRows = [];

    if (essentialSupportExcluded) {
      let preExclusionAmount = getTraceInput(inflationTrace, "essentialSupportPreExclusionAmount");
      if (preExclusionAmount == null) {
        preExclusionAmount = getTraceInput(inflationTrace, "projectedTotal");
      }
      const excludedReason = formatTraceReason(getTraceInput(inflationTrace, "exclusionReason"));
      const rows = [
        { label: "Essential support status", value: "Excluded by setting" },
        { label: "Pre-exclusion support", value: formatCurrency(preExclusionAmount) },
        { label: "Net essential support used", value: formatCurrency(essentialSupport) },
        { label: "Survivor income offset", value: "Not applied" }
      ];

      if (excludedReason) {
        rows.push({ label: "Reason", value: excludedReason });
      }

      return renderProjectionDetailSection("Essential Support Projection", rows);
    }

    if (survivorIncomeOffset != null && survivorIncomeOffset > 0) {
      bridgeRows.push({
        label: "Survivor income offset",
        value: formatCurrency(-survivorIncomeOffset)
      });
    }

    if (essentialSupport != null) {
      bridgeRows.push({
        label: "Net essential support used",
        value: formatCurrency(essentialSupport)
      });
    }

    return renderInflationProjectionDetail({
      trace: inflationTrace,
      title: "Essential Support Projection",
      currentDollarLabel: "Current-dollar support before survivor offset",
      projectedLabel: "Projected support before survivor offset",
      disabledCurrentDollarLabel: "Current-dollar support before survivor offset",
      afterProjectedRows: bridgeRows
    });
  }

  function getSurvivorIncomeOffsetStatus(derivationTrace) {
    const suppressionReason = formatTraceReason(getTraceInput(derivationTrace, "survivorIncomeSuppressionReason"));
    if (suppressionReason) {
      return `Suppressed: ${suppressionReason}`;
    }

    return getTraceInput(derivationTrace, "survivorIncomeOffsetApplied") === true
      ? "Applied inside essential support"
      : "Not applied";
  }

  function getSurvivorIncomeStartDelayDetail(derivationTrace) {
    const delayMonths = getTraceInput(derivationTrace, "survivorIncomeStartDelayMonths");
    if (getTraceInput(derivationTrace, "applyStartDelay") === false) {
      return `Not applied (${formatMonths(delayMonths)})`;
    }

    return formatMonths(delayMonths);
  }

  function renderSurvivorIncomeDerivationDetail(needsResult) {
    const derivationTrace = findTrace(needsResult, "survivorIncomeDerivation");
    if (!derivationTrace) {
      return "";
    }

    const rows = [
      {
        label: "Survivor income source",
        value: formatTraceReason(getTraceInput(derivationTrace, "survivorIncomeSource")) || "Unavailable"
      },
      { label: "Raw spouse income", value: formatOptionalCurrency(getTraceInput(derivationTrace, "rawSpouseIncome")) },
      { label: "Survivor continues working", value: formatBooleanDetail(getTraceInput(derivationTrace, "survivorContinuesWorking")) },
      { label: "Work reduction", value: formatPercent(getTraceInput(derivationTrace, "workReductionPercent")) },
      { label: "Survivor net income used", value: formatOptionalCurrency(getTraceInput(derivationTrace, "survivorNetAnnualIncomeUsed")) },
      { label: "Start delay", value: getSurvivorIncomeStartDelayDetail(derivationTrace) },
      { label: "Offset status", value: getSurvivorIncomeOffsetStatus(derivationTrace) }
    ];

    return renderProjectionDetailSection("Survivor Income Derivation", rows);
  }

  function renderNeedsDiscretionaryInflationDetail(needsResult) {
    const inflationTrace = findTrace(needsResult, "discretionarySupportInflation");
    if (!inflationTrace || getTraceInput(inflationTrace, "included") !== true) {
      return "";
    }

    return renderInflationProjectionDetail({
      trace: inflationTrace,
      title: "Discretionary Support Projection",
      currentDollarLabel: "Current-dollar discretionary support",
      projectedLabel: "Projected discretionary support",
      disabledCurrentDollarLabel: "Current-dollar discretionary support used"
    });
  }

  function getEducationInflationStatus(inflationTrace) {
    if (getTraceInput(inflationTrace, "educationFundingExcluded") === true) {
      return "Excluded by setting";
    }

    if (getTraceInput(inflationTrace, "applied") === true) {
      return "Applied";
    }

    return getTraceInput(inflationTrace, "enabled") === true ? "Current-dollar" : "Disabled";
  }

  function getEducationCurrentChildDetailValue(inflationTrace) {
    const includedAmount = hasTraceInput(inflationTrace, "currentChildEducationIncludedAmount")
      ? getTraceInput(inflationTrace, "currentChildEducationIncludedAmount")
      : getTraceInput(inflationTrace, "projectedCurrentChildTotal");
    const status = String(getTraceInput(inflationTrace, "currentEducationProjectionStatus") || "").trim();
    const statusLabel = status === "projected"
      ? "projected"
      : (status === "excluded" ? "excluded" : "current-dollar");

    return `${formatCurrency(includedAmount)} ${statusLabel}`;
  }

  function getEducationPlannedDependentDetailValue(inflationTrace) {
    const status = String(getTraceInput(inflationTrace, "plannedDependentEducationStatus") || "").trim();
    const includedAmount = getTraceInput(inflationTrace, "plannedDependentEducationIncludedAmount");
    const excludedAmount = getTraceInput(inflationTrace, "plannedDependentEducationExcludedAmount");
    const rawPlannedAmount = getTraceInput(inflationTrace, "currentDollarPlannedDependentTotal");

    if (status.indexOf("excluded") >= 0) {
      return `${formatCurrency(excludedAmount || rawPlannedAmount)} excluded`;
    }

    if (status === "not-present") {
      return "$0 not present";
    }

    return `${formatCurrency(includedAmount)} current-dollar`;
  }

  function renderNeedsEducationInflationDetail(needsResult) {
    const inflationTrace = findTrace(needsResult, "educationFundingInflation");
    if (!inflationTrace) {
      return "";
    }

    const plannedDependentCount = Number(getTraceInput(inflationTrace, "plannedDependentCount"));
    const hasPlannedDependents = Number.isFinite(plannedDependentCount) && plannedDependentCount > 0;
    const plannedDependentStatus = String(getTraceInput(inflationTrace, "plannedDependentEducationStatus") || "");
    const plannedDependentLabel = plannedDependentStatus.indexOf("excluded") >= 0
      ? "Planned-dependent education"
      : (hasPlannedDependents
          ? "Planned-dependent education (current-dollar)"
          : "Planned-dependent education");
    const educationFundingExcluded = getTraceInput(inflationTrace, "educationFundingExcluded") === true;
    const rows = [
      { label: "Education funding", value: educationFundingExcluded ? "Excluded by setting" : "Included" },
      { label: "Inflation status", value: getEducationInflationStatus(inflationTrace) },
      { label: "Planning as-of date", value: getEducationValuationDateDetailValue(inflationTrace) },
      { label: "Education total used", value: formatCurrency(getTraceInput(inflationTrace, "combinedEducationTotalUsed")) },
      { label: "Current-child education", value: getEducationCurrentChildDetailValue(inflationTrace) },
      { label: plannedDependentLabel, value: getEducationPlannedDependentDetailValue(inflationTrace) },
      { label: "Current-dollar current-child education", value: formatCurrency(getTraceInput(inflationTrace, "currentDollarCurrentChildTotal")) },
      { label: "Current children projected", value: formatCount(getTraceInput(inflationTrace, "currentDatedChildCount")) },
      { label: "Education start age", value: formatCount(getTraceInput(inflationTrace, "educationStartAge")) },
      {
        label: "Inflation rate",
        value: formatEducationInflationRateLabel(
          getTraceInput(inflationTrace, "ratePercent"),
          getTraceInput(inflationTrace, "rateSource")
        )
      }
    ];

    if (educationFundingExcluded) {
      return renderProjectionDetailSection("Education Funding Projection", rows.slice(0, 6));
    }

    return renderProjectionDetailSection("Education Funding Projection", rows);
  }

  function getFinalExpenseInflationStatus(finalExpenseTrace) {
    if (getTraceInput(finalExpenseTrace, "applied") === true) {
      const medicalApplied = getTraceInput(finalExpenseTrace, "medicalApplied") === true;
      const nonMedicalApplied = getTraceInput(finalExpenseTrace, "nonMedicalApplied") === true;
      return medicalApplied && nonMedicalApplied ? "Applied" : "Partially applied";
    }

    const reason = String(getTraceInput(finalExpenseTrace, "reason") || "");
    if (reason === "inflation-assumptions-disabled") {
      return "Disabled";
    }

    return "Current-dollar";
  }

  function getFinalExpenseValuationDateDetailValue(finalExpenseTrace) {
    const valuationDate = getTraceInput(finalExpenseTrace, "valuationDate");
    if (!valuationDate) {
      return "Not set";
    }

    if (getTraceInput(finalExpenseTrace, "valuationDateDefaulted") === true) {
      return `${valuationDate} (defaulted)`;
    }

    return String(valuationDate);
  }

  function getFinalExpenseDobDetailValue(finalExpenseTrace) {
    const status = formatTraceReason(getTraceInput(finalExpenseTrace, "clientDateOfBirthStatus")) || "Not set";
    const clientDateOfBirth = getTraceInput(finalExpenseTrace, "clientDateOfBirth");
    const sourcePath = getTraceInput(finalExpenseTrace, "clientDateOfBirthSourcePath");
    const dateLabel = clientDateOfBirth ? `: ${clientDateOfBirth}` : "";
    const sourceLabel = sourcePath ? ` (${sourcePath})` : "";

    return `${status}${dateLabel}${sourceLabel}`;
  }

  function formatFinalExpenseInflationRateLabel(finalExpenseTrace) {
    return `${formatPercent(getTraceInput(finalExpenseTrace, "finalExpenseInflationRatePercent"))} final expense inflation`;
  }

  function formatHealthcareInflationRateLabel(finalExpenseTrace) {
    return `${formatPercent(getTraceInput(finalExpenseTrace, "healthcareInflationRatePercent"))} healthcare inflation`;
  }

  function formatHealthcareExpenseInflationRateLabel(healthcareExpenseTrace) {
    return `${formatPercent(getTraceInput(healthcareExpenseTrace, "healthcareInflationRatePercent"))} healthcare inflation`;
  }

  function formatHealthcareExpenseProjectionStatus(healthcareExpenseTrace) {
    if (getTraceInput(healthcareExpenseTrace, "enabled") !== true) {
      return "Disabled";
    }

    const warningCode = String(getTraceInput(healthcareExpenseTrace, "warningCode") || "").trim();
    if (warningCode && warningCode !== "healthcare-expense-assumptions-disabled") {
      return "Warning";
    }

    if (
      getTraceInput(healthcareExpenseTrace, "applied") === true
      && getTraceInput(healthcareExpenseTrace, "healthcareInflationApplied") !== true
    ) {
      return "Current-dollar";
    }

    return getTraceInput(healthcareExpenseTrace, "applied") === true ? "Applied" : "Current-dollar";
  }

  function formatTraceList(values) {
    if (!Array.isArray(values) || !values.length) {
      return "None";
    }

    return values
      .map(function (value) {
        return String(value || "").trim();
      })
      .filter(Boolean)
      .join(", ") || "None";
  }

  function getHealthcareExpenseDurationBasisSummary(healthcareExpenseTrace) {
    const projectionYears = formatYears(getTraceInput(healthcareExpenseTrace, "projectionYears"));
    const projectionYearsSource = String(getTraceInput(healthcareExpenseTrace, "projectionYearsSource") || "").trim();
    const includedRecords = getTraceInput(healthcareExpenseTrace, "includedRecords");
    const durationSources = Array.isArray(includedRecords)
      ? Array.from(new Set(includedRecords
          .map(function (record) {
            return String(record?.durationSource || "").trim();
          })
          .filter(Boolean)))
      : [];
    const warnings = getTraceInput(healthcareExpenseTrace, "warnings");
    const durationWarnings = Array.isArray(warnings)
      ? warnings
          .map(getTraceWarningMessage)
          .filter(function (message) {
            return /duration|termYears|fallback/i.test(message || "");
          })
      : [];
    const parts = [];

    parts.push(`Default: ${projectionYears}${projectionYearsSource ? ` (${projectionYearsSource})` : ""}`);

    if (durationSources.length) {
      parts.push(`Included duration sources: ${formatTraceList(durationSources)}`);
    }

    if (durationWarnings.length) {
      parts.push(`Duration warnings: ${durationWarnings.join("; ")}`);
    }

    return parts.join("; ");
  }

  function getTraceWarningMessage(warning) {
    if (!isPlainObject(warning)) {
      return "";
    }

    return String(warning.message || warning.code || "").trim();
  }

  function findHealthcareExpenseOverlapWarning(healthcareExpenseTrace) {
    const warnings = getTraceInput(healthcareExpenseTrace, "warnings");
    if (!Array.isArray(warnings)) {
      return null;
    }

    return warnings.find(function (warning) {
      return warning?.code === "healthcare-expense-overlap-review"
        || /overlap/i.test(getTraceWarningMessage(warning));
    }) || null;
  }

  function getHealthcareExpenseWarningSummary(healthcareExpenseTrace) {
    const reason = formatTraceReason(getTraceInput(healthcareExpenseTrace, "reason"));
    const warningCode = formatTraceReason(getTraceInput(healthcareExpenseTrace, "warningCode"));
    const warnings = getTraceInput(healthcareExpenseTrace, "warnings");
    const messages = Array.isArray(warnings)
      ? warnings
          .map(getTraceWarningMessage)
          .filter(Boolean)
          .filter(function (message) {
            return !/overlap/i.test(message);
          })
      : [];

    if (messages.length) {
      return messages.join("; ");
    }

    if (reason) {
      return reason;
    }

    return warningCode || "None";
  }

  function formatAssetGrowthSourceMode(value) {
    const normalized = String(value || "").trim();
    if (normalized === "currentDollarOnly") {
      return "Current-dollar only";
    }

    if (normalized === "reportingOnly") {
      return "Reporting only";
    }

    if (normalized === "projectedOffsets") {
      return "Projected offsets - future / inactive";
    }

    return normalized || "Not set";
  }

  function formatAssetGrowthProjectionMode(value) {
    const normalized = String(value || "").trim();
    if (normalized === "currentDollarOnly") {
      return "Current-dollar only";
    }

    if (normalized === "reportingOnly") {
      return "Reporting-only projection";
    }

    if (normalized === "projectedOffsetsFutureInactive") {
      return "Projected offsets future/inactive";
    }

    return normalized || "Not set";
  }

  function getAssetGrowthProjectionStatus(projectedAssetGrowth) {
    const sourceMode = String(projectedAssetGrowth?.sourceMode || "").trim();
    const projectionMode = String(projectedAssetGrowth?.projectionMode || "").trim();

    if (sourceMode === "projectedOffsets" || projectionMode === "projectedOffsetsFutureInactive") {
      return "Projected offsets future/inactive; reporting only and not used in current outputs";
    }

    if (sourceMode === "reportingOnly" || projectionMode === "reportingOnly") {
      return "Reporting only; projected values are not used in current DIME, Needs, or HLV outputs";
    }

    return "Current-dollar only; projection years 0 and no current output impact";
  }

  function getAssetGrowthWarningSummary(projectedAssetGrowth) {
    const warnings = Array.isArray(projectedAssetGrowth?.warnings)
      ? projectedAssetGrowth.warnings
      : [];
    const messages = warnings
      .map(getTraceWarningMessage)
      .filter(Boolean);

    return messages.length ? messages.join("; ") : "None";
  }

  function renderAssetGrowthIncludedCategorySummary(projectedAssetGrowth) {
    const categories = Array.isArray(projectedAssetGrowth?.includedCategories)
      ? projectedAssetGrowth.includedCategories
      : [];

    if (!categories.length) {
      return "";
    }

    return `
      <p class="analysis-result-copy"><strong>Included Asset Growth Categories</strong></p>
      <ul class="analysis-result-list">
        ${categories.map(function (category) {
          const label = category?.label || category?.categoryKey || "Asset category";
          const reviewLabel = category?.reviewRequired === true || (Array.isArray(category?.warnings) && category.warnings.length)
            ? "; review warnings present"
            : "";
          const value = [
            `${formatCurrency(category?.currentValue)} current`,
            `${formatPercent(category?.assumedAnnualGrowthRatePercent)} assumed annual growth`,
            formatYears(category?.projectionYears),
            `${formatCurrency(category?.projectedValue)} projected`,
            `${formatCurrency(category?.projectedGrowthAmount)} projected growth${reviewLabel}`
          ].join("; ");

          return `<li><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></li>`;
        }).join("")}
      </ul>
    `;
  }

  function renderProjectedAssetGrowthReportingDetail(lensModel) {
    const projectedAssetGrowth = isPlainObject(lensModel?.projectedAssetGrowth)
      ? lensModel.projectedAssetGrowth
      : null;
    if (!projectedAssetGrowth) {
      return "";
    }

    const rows = [
      { label: "Projection status", value: getAssetGrowthProjectionStatus(projectedAssetGrowth) },
      { label: "Source mode", value: formatAssetGrowthSourceMode(projectedAssetGrowth.sourceMode) },
      { label: "Projection mode", value: formatAssetGrowthProjectionMode(projectedAssetGrowth.projectionMode) },
      { label: "Projection years", value: formatYears(projectedAssetGrowth.projectionYears) },
      { label: "Projection years source", value: projectedAssetGrowth.projectionYearsSource || "Not set" },
      { label: "Current total asset value", value: formatCurrency(projectedAssetGrowth.currentTotalAssetValue) },
      { label: "Projected total asset value", value: formatCurrency(projectedAssetGrowth.projectedTotalAssetValue) },
      { label: "Projected growth amount", value: formatCurrency(projectedAssetGrowth.totalProjectedGrowthAmount) },
      { label: "Included category count", value: formatCount(projectedAssetGrowth.includedCategoryCount) },
      { label: "Excluded category count", value: formatCount(projectedAssetGrowth.excludedCategoryCount) },
      { label: "Review warning count", value: formatCount(projectedAssetGrowth.reviewWarningCount) },
      { label: "Consumed by methods", value: projectedAssetGrowth.consumedByMethods === true ? "Yes" : "No" },
      { label: "Current output impact", value: "Reporting only / none; DIME, Needs, and HLV outputs are unaffected" },
      { label: "Current asset offsets", value: "Current asset offsets remain current-dollar/current treatment based" },
      { label: "Warning summary", value: getAssetGrowthWarningSummary(projectedAssetGrowth) }
    ];

    return `
      ${renderProjectionDetailSection("Projected Asset Growth — Reporting Only", rows)}
      ${renderAssetGrowthIncludedCategorySummary(projectedAssetGrowth)}
    `;
  }

  function formatFinalExpenseSourceMode(finalExpenseTrace) {
    const sourceMode = String(getTraceInput(finalExpenseTrace, "sourceMode") || "").trim();
    if (sourceMode === "expenseFacts-final-expense-components") {
      return "expenseFacts final expense components";
    }

    if (sourceMode === "finalExpenses-fallback") {
      return "finalExpenses fallback";
    }

    return sourceMode || "Not set";
  }

  function renderNeedsFinalExpenseProjectionDetail(needsResult) {
    const finalExpenseTrace = findTrace(needsResult, "finalExpenses");
    if (
      !finalExpenseTrace
      || !hasTraceInput(finalExpenseTrace, "currentFinalExpenseAmount")
    ) {
      return "";
    }

    const rows = [
      { label: "Inflation status", value: getFinalExpenseInflationStatus(finalExpenseTrace) },
      { label: "Combined final expense used", value: formatCurrency(getTraceInput(finalExpenseTrace, "projectedFinalExpenseAmount")) },
      { label: "Current-dollar total", value: formatCurrency(getTraceInput(finalExpenseTrace, "currentFinalExpenseAmount")) },
      { label: "Medical final expense current", value: formatCurrency(getTraceInput(finalExpenseTrace, "currentMedicalFinalExpenseAmount")) },
      { label: "Medical final expense projected", value: formatCurrency(getTraceInput(finalExpenseTrace, "projectedMedicalFinalExpenseAmount")) },
      { label: "Healthcare inflation rate", value: formatHealthcareInflationRateLabel(finalExpenseTrace) },
      { label: "Non-medical final expense current", value: formatCurrency(getTraceInput(finalExpenseTrace, "currentNonMedicalFinalExpenseAmount")) },
      { label: "Non-medical final expense projected", value: formatCurrency(getTraceInput(finalExpenseTrace, "projectedNonMedicalFinalExpenseAmount")) },
      { label: "Final expense inflation rate", value: formatFinalExpenseInflationRateLabel(finalExpenseTrace) },
      { label: "Source mode", value: formatFinalExpenseSourceMode(finalExpenseTrace) },
      { label: "Target age", value: formatCount(getTraceInput(finalExpenseTrace, "finalExpenseTargetAge")) },
      { label: "Client DOB status/source", value: getFinalExpenseDobDetailValue(finalExpenseTrace) },
      { label: "Planning as-of date", value: getFinalExpenseValuationDateDetailValue(finalExpenseTrace) },
      { label: "Current age", value: formatCount(getTraceInput(finalExpenseTrace, "currentAge")) },
      { label: "Projection years", value: formatYears(getTraceInput(finalExpenseTrace, "projectionYears")) }
    ];
    const reason = formatTraceReason(getTraceInput(finalExpenseTrace, "reason"));
    const medicalReason = formatTraceReason(getTraceInput(finalExpenseTrace, "medicalReason"));
    const nonMedicalReason = formatTraceReason(getTraceInput(finalExpenseTrace, "nonMedicalReason"));

    if (getTraceInput(finalExpenseTrace, "applied") !== true && reason) {
      rows.push({ label: "Reason", value: reason });
    }

    if (getTraceInput(finalExpenseTrace, "medicalApplied") !== true && medicalReason && medicalReason !== reason) {
      rows.push({ label: "Medical reason", value: medicalReason });
    }

    if (getTraceInput(finalExpenseTrace, "nonMedicalApplied") !== true && nonMedicalReason && nonMedicalReason !== reason) {
      rows.push({ label: "Non-medical reason", value: nonMedicalReason });
    }

    return renderProjectionDetailSection("Final Expense Projection", rows);
  }

  function renderNeedsHealthcareExpenseProjectionDetail(needsResult) {
    const healthcareExpenseTrace = findTrace(needsResult, "healthcareExpenses");
    if (!healthcareExpenseTrace) {
      return "";
    }

    const rows = [
      { label: "Inclusion status", value: formatHealthcareExpenseProjectionStatus(healthcareExpenseTrace) },
      { label: "Healthcare expense amount used", value: formatCurrency(getTraceInput(healthcareExpenseTrace, "projectedHealthcareExpenseAmount")) },
      { label: "Current annual healthcare expense", value: formatCurrency(getTraceInput(healthcareExpenseTrace, "currentAnnualHealthcareExpenseAmount")) },
      { label: "Projected recurring healthcare need", value: formatCurrency(getTraceInput(healthcareExpenseTrace, "projectedRecurringHealthcareExpenseAmount")) },
      { label: "One-time healthcare amount included", value: formatCurrency(getTraceInput(healthcareExpenseTrace, "includedOneTimeHealthcareExpenseAmount")) },
      { label: "Healthcare inflation rate", value: formatHealthcareExpenseInflationRateLabel(healthcareExpenseTrace) },
      { label: "Projection years", value: formatYears(getTraceInput(healthcareExpenseTrace, "projectionYears")) },
      { label: "Projection years source", value: String(getTraceInput(healthcareExpenseTrace, "projectionYearsSource") || "Not set") },
      { label: "Duration basis", value: getHealthcareExpenseDurationBasisSummary(healthcareExpenseTrace) },
      { label: "Include one-time healthcare expenses", value: formatBooleanDetail(getTraceInput(healthcareExpenseTrace, "includeOneTimeHealthcareExpenses")) },
      { label: "One-time projection mode", value: String(getTraceInput(healthcareExpenseTrace, "oneTimeProjectionMode") || "Not set") },
      { label: "Included record count", value: formatCount(getTraceInput(healthcareExpenseTrace, "includedRecordCount")) },
      { label: "Excluded record count", value: formatCount(getTraceInput(healthcareExpenseTrace, "excludedRecordCount")) },
      { label: "Included buckets", value: formatTraceList(getTraceInput(healthcareExpenseTrace, "includedBuckets")) },
      { label: "Excluded buckets", value: formatTraceList(getTraceInput(healthcareExpenseTrace, "excludedBuckets")) },
      { label: "Warning/reason summary", value: getHealthcareExpenseWarningSummary(healthcareExpenseTrace) }
    ];
    const overlapWarning = findHealthcareExpenseOverlapWarning(healthcareExpenseTrace);

    if (overlapWarning) {
      rows.push({
        label: "Overlap warning",
        value: getTraceWarningMessage(overlapWarning)
      });
    }

    return renderProjectionDetailSection("Healthcare Expense Projection", rows);
  }

  function renderNeedsProjectionDetails(needsResult, lensModel) {
    const projectionDetails = [
      renderNeedsInflationDetail(needsResult),
      renderSurvivorIncomeDerivationDetail(needsResult),
      renderNeedsDiscretionaryInflationDetail(needsResult),
      renderNeedsEducationInflationDetail(needsResult),
      renderNeedsFinalExpenseProjectionDetail(needsResult),
      renderNeedsHealthcareExpenseProjectionDetail(needsResult),
      renderProjectedAssetGrowthReportingDetail(lensModel)
    ].filter(Boolean);

    if (!projectionDetails.length) {
      return "";
    }

    return `
      <div class="analysis-result-eyebrow">Projection Details</div>
      ${projectionDetails.join("")}
    `;
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

  function renderDimeResult(host, dimeResult, sharedWarnings, lensModel) {
    const components = dimeResult.components || {};
    const offsets = dimeResult.commonOffsets || {};
    const assumptions = dimeResult.assumptions || {};
    const warnings = [
      ...(Array.isArray(sharedWarnings) ? sharedWarnings : []),
      ...(Array.isArray(dimeResult.warnings) ? dimeResult.warnings : [])
    ];

    host.innerHTML = `
      <div class="analysis-result-eyebrow">DIME Analysis</div>
      <div class="analysis-result-value">${formatCurrency(dimeResult.netCoverageGap)}</div>
      <p class="analysis-result-copy">Net coverage gap from saved linked PMI data.</p>
      ${renderMoneyList([
        { label: "Gross DIME Need", value: dimeResult.grossNeed },
        { label: "Existing Coverage Offset", value: offsets.existingCoverageOffset },
        { label: "Asset Offset", value: offsets.assetOffset },
        { label: "Net Coverage Gap", value: dimeResult.netCoverageGap }
      ])}
      ${renderExistingCoverageDetails(dimeResult)}
      ${renderAssetOffsetDetails(dimeResult)}
      ${renderDimeDebtTreatmentDetails(dimeResult, lensModel)}
      <div class="analysis-result-eyebrow">DIME Components</div>
      ${renderMoneyList([
        { label: "Debt", value: components.debt },
        { label: "Income", value: components.income },
        { label: "Mortgage", value: components.mortgage },
        { label: "Education", value: components.education }
      ])}
      <div class="analysis-result-eyebrow">Assumptions</div>
      ${renderAssumptionList([
        { label: "DIME income years", value: assumptions.dimeIncomeYears },
        { label: "Existing coverage offset", value: assumptions.includeExistingCoverageOffset },
        { label: "Offset assets", value: assumptions.includeOffsetAssets }
      ])}
      ${renderWarningsAndNotes("DIME", warnings)}
    `;
  }

  function renderNeedsResult(host, needsResult, sharedWarnings, lensModel) {
    const components = needsResult.components || {};
    const offsets = needsResult.commonOffsets || {};
    const assumptions = needsResult.assumptions || {};
    const warnings = [
      ...(Array.isArray(sharedWarnings) ? sharedWarnings : []),
      ...(Array.isArray(needsResult.warnings) ? needsResult.warnings : [])
    ];

    host.innerHTML = `
      <div class="analysis-result-eyebrow">Needs Analysis</div>
      <div class="analysis-result-value">${formatCurrency(needsResult.netCoverageGap)}</div>
      <p class="analysis-result-copy">Net coverage gap from the detailed needs methodology.</p>
      ${renderMoneyList([
        { label: "Gross Needs Analysis Need", value: needsResult.grossNeed },
        { label: "Existing Coverage Offset", value: offsets.existingCoverageOffset },
        { label: "Asset Offset", value: offsets.assetOffset },
        { label: "Net Coverage Gap", value: needsResult.netCoverageGap }
      ])}
      ${renderExistingCoverageDetails(needsResult)}
      ${renderAssetOffsetDetails(needsResult)}
      ${renderNeedsDebtTreatmentDetails(needsResult, lensModel)}
      <div class="analysis-result-eyebrow">Support Reduction</div>
      ${renderMoneyList([
        { label: "Survivor Income Applied to Support", value: offsets.survivorIncomeOffset }
      ])}
      <div class="analysis-result-eyebrow">Needs Components</div>
      ${renderMoneyList([
        { label: "Debt Payoff", value: components.debtPayoff },
        { label: "Essential Support", value: components.essentialSupport },
        { label: "Education", value: components.education },
        { label: "Final Expenses", value: components.finalExpenses },
        { label: "Transition Needs", value: components.transitionNeeds },
        { label: "Discretionary Support", value: components.discretionarySupport }
      ])}
      ${renderNeedsProjectionDetails(needsResult, lensModel)}
      <div class="analysis-result-eyebrow">Assumptions</div>
      ${renderAssumptionList([
        { label: "Support duration years", value: assumptions.needsSupportDurationYears },
        { label: "Support duration source", value: assumptions.supportDurationSource },
        { label: "Existing coverage offset", value: assumptions.includeExistingCoverageOffset },
        { label: "Offset assets", value: assumptions.includeOffsetAssets },
        { label: "Transition needs", value: assumptions.includeTransitionNeeds },
        { label: "Discretionary support", value: assumptions.includeDiscretionarySupport },
        { label: "Survivor income offset", value: assumptions.includeSurvivorIncomeOffset }
      ])}
      ${renderWarningsAndNotes("Needs", warnings)}
    `;
  }

  function renderHumanLifeValueResult(host, humanLifeValueResult, sharedWarnings) {
    const components = humanLifeValueResult.components || {};
    const offsets = humanLifeValueResult.commonOffsets || {};
    const assumptions = humanLifeValueResult.assumptions || {};
    const warnings = [
      ...(Array.isArray(sharedWarnings) ? sharedWarnings : []),
      ...(Array.isArray(humanLifeValueResult.warnings) ? humanLifeValueResult.warnings : [])
    ];

    host.innerHTML = `
      <div class="analysis-result-eyebrow">Simple Human Life Value</div>
      <div class="analysis-result-value">${formatCurrency(humanLifeValueResult.netCoverageGap)}</div>
      <p class="analysis-result-copy">Estimated value of the insured's future economic income through the projection period. Growth and discounting are not applied in this v1 calculation.</p>
      ${renderMoneyList([
        { label: "Gross Human Life Value", value: humanLifeValueResult.grossHumanLifeValue },
        { label: "Existing Coverage Offset", value: offsets.existingCoverageOffset },
        { label: "Asset Offset", value: offsets.assetOffset },
        { label: "Net Coverage Gap", value: humanLifeValueResult.netCoverageGap }
      ])}
      ${renderExistingCoverageDetails(humanLifeValueResult)}
      ${renderAssetOffsetDetails(humanLifeValueResult)}
      <div class="analysis-result-eyebrow">HLV Components</div>
      ${renderAssumptionList([
        { label: "Annual Income Value", value: formatCurrency(components.annualIncomeValue) },
        { label: "Projection Years", value: components.projectionYears },
        { label: "Simple Human Life Value", value: formatCurrency(components.simpleHumanLifeValue) }
      ])}
      <div class="analysis-result-eyebrow">Assumptions</div>
      ${renderAssumptionList([
        { label: "Income value source", value: assumptions.incomeValueSource },
        { label: "Projection years", value: assumptions.projectionYears },
        { label: "Projection years source", value: assumptions.projectionYearsSource },
        { label: "Existing coverage offset", value: assumptions.includeExistingCoverageOffset },
        { label: "Asset offset", value: assumptions.includeOffsetAssets },
        { label: "Income growth applied", value: assumptions.incomeGrowthApplied },
        { label: "Discount rate applied", value: assumptions.discountRateApplied },
        { label: "Survivor income applied", value: assumptions.survivorIncomeApplied }
      ])}
      ${renderWarningsAndNotes("HLV", warnings)}
    `;
  }

  function initializeStepThreeAnalysisDisplay() {
    const dimeHost = document.querySelector("[data-step-three-dime-analysis]");
    const needsHost = document.querySelector("[data-step-three-needs-analysis]");
    const humanLifeValueHost = document.querySelector("[data-step-three-human-life-value-analysis]");
    const hosts = [dimeHost, needsHost, humanLifeValueHost].filter(Boolean);
    if (!hosts.length) {
      return;
    }

    const lensAnalysis = window.LensApp?.lensAnalysis || {};
    const buildLensModelFromSavedProtectionModeling = lensAnalysis.buildLensModelFromSavedProtectionModeling;
    const analysisSettingsAdapter = lensAnalysis.analysisSettingsAdapter;
    const createAnalysisMethodSettings = analysisSettingsAdapter?.createAnalysisMethodSettings;
    const runDimeAnalysis = lensAnalysis.analysisMethods?.runDimeAnalysis;
    const runNeedsAnalysis = lensAnalysis.analysisMethods?.runNeedsAnalysis;
    const runHumanLifeValueAnalysis = lensAnalysis.analysisMethods?.runHumanLifeValueAnalysis;

    if (typeof buildLensModelFromSavedProtectionModeling !== "function") {
      renderMessageToHosts(hosts, "Analysis Methods", "Lens saved-data builder is unavailable.");
      return;
    }

    if (
      typeof runDimeAnalysis !== "function"
      || typeof runNeedsAnalysis !== "function"
      || typeof runHumanLifeValueAnalysis !== "function"
    ) {
      renderMessageToHosts(hosts, "Analysis Methods", "One or more analysis methods are unavailable.");
      return;
    }

    const profileRecord = resolveLinkedProfileRecord();
    if (!profileRecord) {
      renderMessageToHosts(hosts, "Analysis Methods", "Link a client profile before running the analysis display.");
      return;
    }

    const protectionModelingPayload = getProtectionModelingPayload(profileRecord);
    if (!hasProtectionModelingSource(protectionModelingPayload)) {
      renderMessageToHosts(hosts, "Analysis Methods", "No saved protection modeling data was found for this linked profile.");
      return;
    }

    try {
      const builderResult = buildLensModelFromSavedProtectionModeling({
        profileRecord,
        protectionModelingPayload,
        taxConfig: createSavedDataTaxConfig()
      });

      if (!builderResult?.lensModel) {
        renderMessageToHosts(hosts, "Analysis Methods", "The saved Lens model could not be built for this profile.");
        return;
      }

      const methodSettings = typeof createAnalysisMethodSettings === "function"
        ? createAnalysisMethodSettings({
            analysisSettings: profileRecord.analysisSettings,
            lensModel: builderResult.lensModel,
            profileRecord
          })
        : createFallbackAnalysisMethodSettings(analysisSettingsAdapter);
      const sharedWarnings = [
        ...(Array.isArray(builderResult.warnings) ? builderResult.warnings : []),
        ...(Array.isArray(methodSettings.warnings) ? methodSettings.warnings : [])
      ];

      if (dimeHost) {
        renderDimeResult(
          dimeHost,
          runDimeAnalysis(builderResult.lensModel, cloneSettings(methodSettings.dimeSettings)),
          sharedWarnings,
          builderResult.lensModel
        );
      }

      if (needsHost) {
        renderNeedsResult(
          needsHost,
          runNeedsAnalysis(builderResult.lensModel, cloneSettings(methodSettings.needsAnalysisSettings)),
          sharedWarnings,
          builderResult.lensModel
        );
      }

      if (humanLifeValueHost) {
        renderHumanLifeValueResult(
          humanLifeValueHost,
          runHumanLifeValueAnalysis(builderResult.lensModel, cloneSettings(methodSettings.humanLifeValueSettings)),
          sharedWarnings
        );
      }
    } catch (error) {
      renderMessageToHosts(hosts, "Analysis Methods", "Step 3 analysis display could not be prepared from the saved Lens model.");
      console.error("Step 3 analysis display failed", error);
    }
  }

  document.addEventListener("DOMContentLoaded", initializeStepThreeAnalysisDisplay);
})();
