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

  function formatDisplayValue(value) {
    if (typeof value === "boolean") {
      return value ? "Included" : "Excluded";
    }

    if (value == null || value === "") {
      return "Not set";
    }

    return String(value);
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

  function formatInflationRateLabel(ratePercent, rateSource) {
    const sourceLabel = String(rateSource || "").includes("householdExpenseInflationRatePercent")
      ? "household expense inflation"
      : "general inflation";

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

    const rows = inflationApplied
      ? [
          { label: "Inflation status", value: "Applied" },
          { label: currentDollarLabel, value: formatCurrency(currentDollarTotal) },
          { label: projectedLabel, value: formatCurrency(projectedTotal) },
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
          { label: "Projection duration", value: formatYears(durationYears) }
        ];

    return `
      <div class="analysis-result-eyebrow">${escapeHtml(normalizedOptions.title)}</div>
      ${renderAssumptionList(rows)}
    `;
  }

  function renderNeedsInflationDetail(needsResult) {
    const inflationTrace = findTrace(needsResult, "essentialSupportInflation");

    return renderInflationProjectionDetail({
      trace: inflationTrace,
      title: "Essential Support Projection",
      currentDollarLabel: "Current-dollar support",
      projectedLabel: "Projected support",
      disabledCurrentDollarLabel: "Current-dollar support used"
    });
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

  function renderDimeResult(host, dimeResult, sharedWarnings) {
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

  function renderNeedsResult(host, needsResult, sharedWarnings) {
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
      ${renderNeedsInflationDetail(needsResult)}
      ${renderNeedsDiscretionaryInflationDetail(needsResult)}
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
          sharedWarnings
        );
      }

      if (needsHost) {
        renderNeedsResult(
          needsHost,
          runNeedsAnalysis(builderResult.lensModel, cloneSettings(methodSettings.needsAnalysisSettings)),
          sharedWarnings
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
