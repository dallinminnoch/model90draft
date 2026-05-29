// TEMPORARY DIAGNOSTIC EXPORT - safe to remove after Coverage Strategy truthfulness review tooling is no longer needed.
(function (global) {
  const root = global.LensApp || (global.LensApp = {});
  const lensAnalysis = root.lensAnalysis || (root.lensAnalysis = {});

  const COVERAGE_STRATEGY_DIAGNOSTIC_EXPORT_VERSION =
    "coverage-strategy-diagnostic-export-v1";

  function isPlainObject(value) {
    return Boolean(value && typeof value === "object" && !Array.isArray(value));
  }

  function clonePlainValue(value) {
    if (value == null) {
      return value;
    }
    try {
      return JSON.parse(JSON.stringify(value));
    } catch (_error) {
      return {
        unavailable: true,
        reason: "value-not-json-serializable"
      };
    }
  }

  function normalizeString(value) {
    return String(value == null ? "" : value).trim();
  }

  function escapeHtml(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function toOptionalDate(value) {
    const raw = normalizeString(value);
    const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) {
      return null;
    }
    const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
    return Number.isNaN(date.getTime()) ? null : date;
  }

  function calculateAge(dateOfBirth, valuationDate) {
    const birth = toOptionalDate(dateOfBirth);
    const valuation = toOptionalDate(valuationDate) || new Date();
    if (!birth) {
      return null;
    }
    let age = valuation.getUTCFullYear() - birth.getUTCFullYear();
    const valuationMonthDay = (valuation.getUTCMonth() * 100) + valuation.getUTCDate();
    const birthMonthDay = (birth.getUTCMonth() * 100) + birth.getUTCDate();
    if (valuationMonthDay < birthMonthDay) {
      age -= 1;
    }
    return age >= 0 ? age : null;
  }

  function getPath(source, path) {
    if (!path) {
      return undefined;
    }
    return String(path).split(".").reduce(function (cursor, key) {
      if (cursor == null) {
        return undefined;
      }
      return cursor[key];
    }, source);
  }

  function firstPresent(source, paths) {
    for (let index = 0; index < paths.length; index += 1) {
      const value = getPath(source, paths[index]);
      if (value != null && value !== "") {
        return value;
      }
    }
    return null;
  }

  function formatJson(value) {
    const cloned = clonePlainValue(value);
    return JSON.stringify(cloned == null ? "Not available" : cloned, null, 2);
  }

  function hasVisibleScenarioControls(visibleScenarioControls) {
    return Object.keys(isPlainObject(visibleScenarioControls) ? visibleScenarioControls : {}).some(function (key) {
      return visibleScenarioControls[key] === true;
    });
  }

  function enrichScenarioSettingsForDiagnostic(scenarioSettings, visibleScenarioControls) {
    if (!isPlainObject(scenarioSettings)) {
      return scenarioSettings || "Not available";
    }
    const controlsVisible = hasVisibleScenarioControls(visibleScenarioControls);
    const enriched = clonePlainValue(scenarioSettings);
    enriched.visibleControlsAdded = controlsVisible;
    enriched.controlsVisible = controlsVisible;
    enriched.visibleScenarioControls = clonePlainValue(visibleScenarioControls || {});
    enriched.trace = isPlainObject(enriched.trace) ? enriched.trace : {};
    enriched.trace.visibleControlsAdded = controlsVisible;
    enriched.trace.controlsVisible = controlsVisible;
    enriched.trace.visibleScenarioControls = clonePlainValue(visibleScenarioControls || {});
    enriched.trace.visibilitySource = controlsVisible
      ? "coverage-strategy-page-visible-controls"
      : "coverage-strategy-scenario-settings-resolver";
    return enriched;
  }

  function buildProjectedDependentTimingMetadataForDiagnostic(context, coverageStrategyScenarioSettings) {
    const directMetadata = coverageStrategyScenarioSettings?.education?.projectedDependentTimingMetadata
      || context.needLine?.componentModels?.education?.lifetimeProjection?.projectedDependentTimingMetadata
      || context.needLine?.componentModels?.education?.lifetimeProjection?.assumptionsUsed?.projectedDependentTimingMetadata;
    if (isPlainObject(directMetadata)) {
      return clonePlainValue(directMetadata);
    }
    const rows = (
      coverageStrategyScenarioSettings?.education?.projectedDependentTimingRows
      || context.needLine?.componentModels?.coverageStrategyScenarioSettings?.education?.projectedDependentTimingRows
      || context.needLine?.assumptionsUsed?.coverageStrategyScenarioSettings?.education?.projectedDependentTimingRows
      || []
    );
    const defaultMode = (
      coverageStrategyScenarioSettings?.education?.projectedDependentTimingMode
      || context.needLine?.componentModels?.coverageStrategyScenarioSettings?.education?.projectedDependentTimingMode
      || "untimedKeepThroughHorizon"
    );
    const safeRows = Array.isArray(rows) ? rows : [];
    const timedRows = safeRows.filter(function (row) {
      return isPlainObject(row)
        && row.included !== false
        && row.expectedBirthYear != null
        && row.validationStatus !== "invalid";
    });
    const includedRows = safeRows.filter(function (row) {
      return isPlainObject(row) && row.included !== false;
    });
    const invalidRows = includedRows.filter(function (row) {
      return row.validationStatus === "invalid";
    });
    return {
      projectedDependentDefaultTimingMode: defaultMode,
      projectedDependentRowTimingOverridesApplied: timedRows.length > 0,
      projectedDependentTimedRowCount: timedRows.length,
      projectedDependentUntimedRowCount: Math.max(0, includedRows.length - timedRows.length),
      projectedDependentInvalidRowCount: invalidRows.length,
      effectiveProjectedDependentTimingSummary: timedRows.length > 0
        ? `Default mode keeps untimed projected dependents through the horizon; ${timedRows.length} row-level expected birth year override${timedRows.length === 1 ? " was" : "s were"} applied.`
        : "Default mode keeps untimed projected dependents through the horizon; no row-level expected birth year overrides were applied.",
      rowTimingTrace: includedRows.map(function (row) {
        return {
          id: row.id || null,
          label: row.label || null,
          included: row.included !== false,
          timingMode: row.timingMode || null,
          expectedBirthYear: row.expectedBirthYear ?? null,
          rawExpectedBirthYear: row.rawExpectedBirthYear ?? null,
          validationStatus: row.validationStatus || null,
          validationCode: row.validationCode || null,
          rowOverrideApplied: row.expectedBirthYear != null && row.validationStatus !== "invalid"
        };
      })
    };
  }

  function createHouseholdSnapshot(context) {
    const safeContext = isPlainObject(context) ? context : {};
    const profileRecord = isPlainObject(safeContext.profileRecord) ? safeContext.profileRecord : {};
    const lensModel = isPlainObject(safeContext.lensModel) ? safeContext.lensModel : {};
    const sourceData = isPlainObject(safeContext.protectionModelingData)
      ? safeContext.protectionModelingData
      : {};
    const valuationDate = normalizeString(
      safeContext.valuationDate
      || safeContext.needLine?.valuationDate
      || safeContext.needsResult?.assumptions?.valuationDate
    ) || null;
    const clientDateOfBirth = firstPresent({ profileRecord, lensModel, sourceData }, [
      "lensModel.profileFacts.clientDateOfBirth",
      "profileRecord.dateOfBirth",
      "sourceData.clientDateOfBirth",
      "sourceData.dateOfBirth"
    ]);
    const spouseDateOfBirth = firstPresent({ profileRecord, lensModel, sourceData }, [
      "profileRecord.spouseDateOfBirth",
      "profileRecord.partnerDateOfBirth",
      "sourceData.spouseDateOfBirth",
      "sourceData.partnerDateOfBirth"
    ]);
    const dependents = Array.isArray(profileRecord.dependentDetails)
      ? profileRecord.dependentDetails
      : Array.isArray(lensModel.educationSupport?.currentDependentDetails)
        ? lensModel.educationSupport.currentDependentDetails
        : [];

    return {
      client: {
        name: profileRecord.displayName || profileRecord.clientName || sourceData.clientName || "Not available",
        dateOfBirth: clientDateOfBirth || "Not available",
        currentAge: calculateAge(clientDateOfBirth, valuationDate)
      },
      spouseOrPartner: {
        name: profileRecord.spouseName || profileRecord.partnerName || sourceData.spouseName || sourceData.partnerName || "Not available",
        dateOfBirth: spouseDateOfBirth || "Not available",
        currentAge: calculateAge(spouseDateOfBirth, valuationDate)
      },
      dependents: dependents.map(function (dependent, index) {
        const dateOfBirth = dependent.dateOfBirth || dependent.dob || dependent.birthDate || null;
        return {
          id: dependent.id || dependent.dependentId || `dependent-${index + 1}`,
          name: dependent.name || dependent.label || `Dependent ${index + 1}`,
          dateOfBirth: dateOfBirth || "Not available",
          currentAge: calculateAge(dateOfBirth, valuationDate),
          educationTiming: {
            currentAge: dependent.currentAge ?? null,
            yearsUntilEducationStart: dependent.yearsUntilEducationStart ?? null,
            educationStartAge: dependent.educationStartAge ?? null
          }
        };
      }),
      householdMemberCount: profileRecord.householdMemberCount
        ?? sourceData.householdMemberCount
        ?? null,
      valuationDate: valuationDate || "Not available"
    };
  }

  function createDiagnosticSnapshot(context) {
    const safeContext = isPlainObject(context) ? context : {};
    const protectionModelingPayload = isPlainObject(safeContext.protectionModelingPayload)
      ? safeContext.protectionModelingPayload
      : {};
    const protectionModelingData = isPlainObject(safeContext.protectionModelingData)
      ? safeContext.protectionModelingData
      : isPlainObject(protectionModelingPayload.data)
        ? protectionModelingPayload.data
        : {};
    const combinedWarnings = [
      ...(Array.isArray(safeContext.builderResult?.warnings) ? safeContext.builderResult.warnings : []),
      ...(Array.isArray(safeContext.methodSettings?.warnings) ? safeContext.methodSettings.warnings : []),
      ...(Array.isArray(safeContext.needLine?.warnings) ? safeContext.needLine.warnings : []),
      ...(Array.isArray(safeContext.resourceLine?.warnings) ? safeContext.resourceLine.warnings : []),
      ...(Array.isArray(safeContext.existingCoverageLine?.warnings) ? safeContext.existingCoverageLine.warnings : []),
      ...(Array.isArray(safeContext.gapSurplus?.warnings) ? safeContext.gapSurplus.warnings : []),
      ...(Array.isArray(safeContext.chartModel?.warnings) ? safeContext.chartModel.warnings : [])
    ];
    const combinedDataGaps = [
      ...(Array.isArray(safeContext.builderResult?.dataGaps) ? safeContext.builderResult.dataGaps : []),
      ...(Array.isArray(safeContext.methodSettings?.dataGaps) ? safeContext.methodSettings.dataGaps : []),
      ...(Array.isArray(safeContext.needLine?.dataGaps) ? safeContext.needLine.dataGaps : []),
      ...(Array.isArray(safeContext.resourceLine?.dataGaps) ? safeContext.resourceLine.dataGaps : []),
      ...(Array.isArray(safeContext.existingCoverageLine?.dataGaps) ? safeContext.existingCoverageLine.dataGaps : []),
      ...(Array.isArray(safeContext.gapSurplus?.dataGaps) ? safeContext.gapSurplus.dataGaps : []),
      ...(Array.isArray(safeContext.chartModel?.dataGaps) ? safeContext.chartModel.dataGaps : [])
    ];
    const visibleScenarioControls = isPlainObject(safeContext.visibleScenarioControls)
      ? safeContext.visibleScenarioControls
      : {};
    const rawCoverageStrategyScenarioSettings = safeContext.coverageStrategyScenarioSettings
      || safeContext.needLine?.componentModels?.coverageStrategyScenarioSettings
      || safeContext.needLine?.assumptionsUsed?.coverageStrategyScenarioSettings
      || null;
    const coverageStrategyScenarioSettings = enrichScenarioSettingsForDiagnostic(
      rawCoverageStrategyScenarioSettings,
      visibleScenarioControls
    );
    const projectedDependentTimingMetadata = buildProjectedDependentTimingMetadataForDiagnostic(
      safeContext,
      isPlainObject(coverageStrategyScenarioSettings) ? coverageStrategyScenarioSettings : null
    );
    const coverageStrategyScenarioSettingsTrace = isPlainObject(coverageStrategyScenarioSettings)
      ? coverageStrategyScenarioSettings.trace
      : "Not available";
    const visibleControlsAdded = hasVisibleScenarioControls(visibleScenarioControls);

    return {
      exportMetadata: {
        exportDateTime: new Date().toISOString(),
        pageSource: "Coverage Strategy",
        route: safeContext.route || global.location?.href || "Not available",
        reportType: "coverage-strategy-diagnostic-report",
        exportFormat: "html",
        exportFileType: "html",
        notPdf: true,
        temporaryDiagnosticExport: true,
        privacyNote: "This diagnostic file may contain personal and financial data. Share only in trusted review channels.",
        moduleVersion: COVERAGE_STRATEGY_DIAGNOSTIC_EXPORT_VERSION
      },
      profileHousehold: createHouseholdSnapshot({
        ...safeContext,
        protectionModelingData
      }),
      pmiProtectionModelingInputs: {
        source: "saved linked profile protectionModeling payload",
        data: protectionModelingData,
        payloadMetadata: {
          id: protectionModelingPayload.id ?? null,
          updatedAt: protectionModelingPayload.updatedAt ?? null,
          savedAt: protectionModelingPayload.savedAt ?? null
        }
      },
      analysisSetupAssumptions: {
        savedAnalysisSettings: safeContext.profileRecord?.analysisSettings || "Not available",
        resolvedMethodSettings: safeContext.methodSettings || "Not available",
        coverageStrategyScenarioSettings,
        coverageStrategyScenarioSettingsTrace,
        projectionHorizonYears: safeContext.projectionHorizonYears ?? "Not available"
      },
      lensModelNormalizedFactsSnapshot: {
        profileFacts: safeContext.lensModel?.profileFacts || "Not available",
        debtFacts: safeContext.lensModel?.debtFacts || "Not available",
        treatedDebtPayoff: safeContext.lensModel?.treatedDebtPayoff || "Not available",
        treatedMortgagePaymentPlan: safeContext.lensModel?.treatedMortgagePaymentPlan || "Not available",
        assetFacts: safeContext.lensModel?.assetFacts || "Not available",
        treatedAssetOffsets: safeContext.lensModel?.treatedAssetOffsets || safeContext.lensModel?.projectedAssetGrowth || "Not available",
        resourceProjectionInputs: safeContext.lensModel?.resourceProjectionInputs || "Not available",
        savingsContributionFacts: safeContext.lensModel?.savingsContributionFacts || "Not available",
        coveragePolicies: safeContext.profileRecord?.coveragePolicies || "Not available",
        educationSupport: safeContext.lensModel?.educationSupport || "Not available",
        expenseFacts: {
          ongoingSupport: safeContext.lensModel?.ongoingSupport || "Not available",
          nonHousingSupport: safeContext.lensModel?.nonHousingSupport || "Not available"
        },
        healthcareAndFinalExpenseFacts: {
          healthcareExpenses: safeContext.lensModel?.healthcareExpenses || "Not available",
          finalExpenses: safeContext.lensModel?.finalExpenses || "Not available"
        },
        fullLensModel: safeContext.lensModel || "Not available"
      },
      coverageStrategyGeneratedOutputs: {
        needsResult: safeContext.needsResult || "Not available",
        needPoints: safeContext.needLine?.needPoints || "Not available",
        resourcePoints: safeContext.resourceLine?.resourcePoints || "Not available",
        existingCoveragePoints: safeContext.existingCoverageLine?.coveragePoints || "Not available",
        existingCoverageLayers: safeContext.existingCoverageLine?.layers || "Not available",
        gapSurplusPoints: safeContext.gapSurplus?.gapSurplusPoints || "Not available",
        chartHorizon: {
          projectionHorizonYears: safeContext.projectionHorizonYears ?? null,
          age110Horizon: safeContext.age110Horizon || "Not available"
        },
        chartModelSummary: safeContext.chartModel || "Not available",
        warnings: combinedWarnings,
        dataGaps: combinedDataGaps,
        coverageStrategyScenarioSettings,
        educationScenarioSettingsConsumed: (
          coverageStrategyScenarioSettings?.education
          || "Not available"
        ),
        educationPaymentScheduleMode: (
          coverageStrategyScenarioSettings?.education?.educationPaymentScheduleMode
          || safeContext.needLine?.componentModels?.education?.lifetimeProjection?.assumptionsUsed?.educationPaymentScheduleMode
          || "Not available"
        ),
        educationResourceSpendingMode: (
          coverageStrategyScenarioSettings?.education?.educationResourceSpendingMode
          || safeContext.needLine?.componentModels?.education?.lifetimeProjection?.assumptionsUsed?.educationResourceSpendingMode
          || "Not available"
        ),
        educationResourceSpending: (
          safeContext.needLine?.componentModels?.education?.lifetimeProjection?.educationResourceSpending
          || "Not available"
        ),
        visibleEducationResourceSpendingControl: Boolean(
          safeContext.visibleScenarioControls?.educationResourceSpendingMode
          || safeContext.visibleScenarioControls?.educationResourceSpending
        ),
        visiblePaymentScheduleControl: Boolean(
          safeContext.visibleScenarioControls?.educationPaymentScheduleMode
          || safeContext.visibleScenarioControls?.educationPaymentSchedule
        ),
        projectedDependentTimingRowsConsumed: (
          safeContext.coverageStrategyScenarioSettings?.education?.projectedDependentTimingRows
          || safeContext.needLine?.componentModels?.coverageStrategyScenarioSettings?.education?.projectedDependentTimingRows
          || safeContext.needLine?.assumptionsUsed?.coverageStrategyScenarioSettings?.education?.projectedDependentTimingRows
          || "Not available"
        ),
        projectedDependentTimingMetadata,
        projectedDependentDefaultTimingMode:
          projectedDependentTimingMetadata.projectedDependentDefaultTimingMode,
        projectedDependentRowTimingOverridesApplied:
          projectedDependentTimingMetadata.projectedDependentRowTimingOverridesApplied,
        projectedDependentTimedRowCount:
          projectedDependentTimingMetadata.projectedDependentTimedRowCount,
        projectedDependentUntimedRowCount:
          projectedDependentTimingMetadata.projectedDependentUntimedRowCount,
        coverageStrategyVisibleScenarioControlsAdded: visibleControlsAdded,
        visibleScenarioControls,
        coverageStrategyScenarioSettingsPersistence: (
          coverageStrategyScenarioSettings?.persistenceStatus
          || "Not available"
        ),
        mortgageLifetimeProjectionTraces: safeContext.needLine?.componentModels?.mortgageLifetimeProjection || "Not available",
        debtLifetimeProjectionTraces: safeContext.needLine?.componentModels?.debtLifetimeProjection || "Not available",
        educationLifetimeProjection: safeContext.needLine?.componentModels?.education?.lifetimeProjection || "Not available",
        educationSavingsOffset: safeContext.needLine?.componentModels?.education?.lifetimeProjection?.educationSavingsOffset || "Not available",
        educationResourceSpendingTrace: safeContext.needLine?.componentModels?.education?.lifetimeProjection?.educationResourceSpending || "Not available",
        healthcareLifetimeProjection: safeContext.needLine?.componentModels?.healthcare?.lifetimeProjection || "Not available",
        finalExpenseLifetimeProjection: safeContext.needLine?.componentModels?.finalExpenses?.lifetimeProjection || "Not available"
      },
      checksVersionInfo: {
        appVersion: root.version || root.appVersion || "Not available",
        commitHash: "Not available in browser runtime",
        loadedModules: [
          "coverage-strategy-page.js",
          "coverage-strategy-scenario-settings.js",
          "coverage-strategy-education-lifetime-projection.js",
          "coverage-strategy-final-expense-lifetime-projection.js",
          "coverage-strategy-need-line-adapter.js",
          "coverage-strategy-resource-line-adapter.js",
          "coverage-timeline-existing-coverage-adapter.js",
          "coverage-strategy-gap-surplus-composer.js",
          "coverage-strategy-chart-model.js",
          "coverage-strategy-diagnostic-export.js"
        ]
      }
    };
  }

  function renderSection(title, value) {
    return `
      <section class="diagnostic-section">
        <h2>${escapeHtml(title)}</h2>
        <pre>${escapeHtml(formatJson(value))}</pre>
      </section>
    `;
  }

  function renderDiagnosticHtml(snapshot) {
    return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>Coverage Strategy Diagnostic Report</title>
  <style>
    :root { color-scheme: light; }
    body {
      margin: 0;
      padding: 28px;
      font-family: Arial, sans-serif;
      color: #172126;
      background: #ffffff;
    }
    h1 { margin: 0 0 6px; font-size: 24px; }
    h2 { margin: 0 0 10px; font-size: 16px; }
    .diagnostic-note {
      margin: 0 0 18px;
      color: #4f5c63;
      font-size: 12px;
      line-height: 1.45;
    }
    .diagnostic-section {
      break-inside: avoid;
      page-break-inside: avoid;
      margin: 0 0 18px;
      padding: 14px;
      border: 1px solid #d8e0e4;
      border-radius: 6px;
      background: #f8fafb;
    }
    pre {
      white-space: pre-wrap;
      overflow-wrap: anywhere;
      margin: 0;
      font: 11px/1.45 Consolas, Monaco, monospace;
      color: #203039;
    }
    @media print {
      body { padding: 18px; }
      .diagnostic-section { page-break-inside: avoid; }
    }
  </style>
</head>
<body>
  <h1>Coverage Strategy Diagnostic Report</h1>
  <p class="diagnostic-note">
    TEMPORARY DIAGNOSTIC EXPORT - safe to remove after Coverage Strategy truthfulness review tooling is no longer needed.
    This diagnostic file may contain personal and financial data. Share only in trusted review channels.
  </p>
  ${renderSection("A. Export Metadata", snapshot.exportMetadata)}
  ${renderSection("B. Profile / Household", snapshot.profileHousehold)}
  ${renderSection("C. PMI / Protection Modeling Inputs", snapshot.pmiProtectionModelingInputs)}
  ${renderSection("D. Analysis Setup / Assumption Controls", snapshot.analysisSetupAssumptions)}
  ${renderSection("E. Lens Model / Normalized Facts Snapshot", snapshot.lensModelNormalizedFactsSnapshot)}
  ${renderSection("F. Coverage Strategy Generated Outputs", snapshot.coverageStrategyGeneratedOutputs)}
  ${renderSection("G. Checks / Version Info", snapshot.checksVersionInfo)}
</body>
</html>`;
  }

  function exportCoverageStrategyDiagnosticPdf(context) {
    const snapshot = createDiagnosticSnapshot(context);
    const html = renderDiagnosticHtml(snapshot);
    const printWindow = global.open("", "_blank", "noopener,noreferrer,width=1100,height=800");
    if (!printWindow || !printWindow.document) {
      const blob = new Blob([html], { type: "text/html;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const anchor = global.document.createElement("a");
      anchor.href = url;
      anchor.download = "coverage-strategy-diagnostic-report.html";
      anchor.click();
      URL.revokeObjectURL(url);
      return {
        status: "downloaded-html-fallback",
        snapshot
      };
    }
    printWindow.document.open();
    printWindow.document.write(html);
    printWindow.document.close();
    printWindow.focus();
    printWindow.setTimeout(function () {
      printWindow.print();
    }, 250);
    return {
      status: "html-report-opened-for-print",
      snapshot
    };
  }

  lensAnalysis.COVERAGE_STRATEGY_DIAGNOSTIC_EXPORT_VERSION =
    COVERAGE_STRATEGY_DIAGNOSTIC_EXPORT_VERSION;
  lensAnalysis.buildCoverageStrategyDiagnosticExportSnapshot = createDiagnosticSnapshot;
  lensAnalysis.renderCoverageStrategyDiagnosticExportHtml = renderDiagnosticHtml;
  lensAnalysis.exportCoverageStrategyDiagnosticPdf = exportCoverageStrategyDiagnosticPdf;

  if (typeof module !== "undefined" && module.exports) {
    module.exports = {
      COVERAGE_STRATEGY_DIAGNOSTIC_EXPORT_VERSION,
      buildCoverageStrategyDiagnosticExportSnapshot: createDiagnosticSnapshot,
      renderCoverageStrategyDiagnosticExportHtml: renderDiagnosticHtml,
      exportCoverageStrategyDiagnosticPdf
    };
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
