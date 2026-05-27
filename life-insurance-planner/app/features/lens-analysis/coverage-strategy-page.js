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

  function formatCount(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) {
      return "0";
    }
    return new Intl.NumberFormat("en-US", {
      maximumFractionDigits: 0
    }).format(number);
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

  function createFallbackAnalysisMethodSettings(analysisSettingsAdapter) {
    const adapter = isPlainObject(analysisSettingsAdapter) ? analysisSettingsAdapter : {};
    return {
      needsAnalysisSettings: cloneSettings(adapter.DEFAULT_NEEDS_ANALYSIS_SETTINGS),
      warnings: [
        {
          code: "analysis-settings-adapter-unavailable",
          message: "Analysis settings adapter was unavailable; current default method settings were used."
        }
      ]
    };
  }

  function normalizePointValue(point) {
    const amount = Number(point?.needAmount);
    return Number.isFinite(amount) ? Math.max(0, amount) : 0;
  }

  function createChartPath(points, width, height, padding) {
    const safePoints = Array.isArray(points) ? points : [];
    if (!safePoints.length) {
      return "";
    }
    const maxNeed = Math.max(...safePoints.map(normalizePointValue), 1);
    const innerWidth = width - padding.left - padding.right;
    const innerHeight = height - padding.top - padding.bottom;
    const maxIndex = Math.max(safePoints.length - 1, 1);

    return safePoints.map(function (point, index) {
      const x = padding.left + (innerWidth * (index / maxIndex));
      const y = padding.top + innerHeight - (innerHeight * (normalizePointValue(point) / maxNeed));
      return `${index === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`;
    }).join(" ");
  }

  function renderTimelineSvg(needPoints) {
    const points = Array.isArray(needPoints) ? needPoints : [];
    if (points.length < 2) {
      return "";
    }

    const width = 720;
    const height = 260;
    const padding = {
      top: 22,
      right: 26,
      bottom: 36,
      left: 64
    };
    const path = createChartPath(points, width, height, padding);
    const first = points[0];
    const last = points[points.length - 1];
    const maxNeed = Math.max(...points.map(normalizePointValue), 1);
    const axisLabels = [maxNeed, maxNeed / 2, 0];

    return `
      <svg class="coverage-need-timeline-svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="Projected need over time">
        <g class="coverage-need-timeline-grid" aria-hidden="true">
          ${axisLabels.map(function (value, index) {
            const y = padding.top + ((height - padding.top - padding.bottom) * (index / 2));
            return `
              <line x1="${padding.left}" y1="${y.toFixed(2)}" x2="${width - padding.right}" y2="${y.toFixed(2)}"></line>
              <text x="${padding.left - 10}" y="${(y + 4).toFixed(2)}">${escapeHtml(formatCurrency(value))}</text>
            `;
          }).join("")}
        </g>
        <path class="coverage-need-timeline-line" d="${path}"></path>
        <circle class="coverage-need-timeline-point" cx="${padding.left}" cy="${(padding.top + height - padding.top - padding.bottom - ((height - padding.top - padding.bottom) * (normalizePointValue(first) / maxNeed))).toFixed(2)}" r="4"></circle>
        <circle class="coverage-need-timeline-point" cx="${width - padding.right}" cy="${(padding.top + height - padding.top - padding.bottom - ((height - padding.top - padding.bottom) * (normalizePointValue(last) / maxNeed))).toFixed(2)}" r="4"></circle>
        <g class="coverage-need-timeline-axis" aria-hidden="true">
          <text x="${padding.left}" y="${height - 10}">${escapeHtml(String(first.calendarYear || first.yearIndex || 0))}</text>
          <text x="${width - padding.right}" y="${height - 10}" text-anchor="end">${escapeHtml(String(last.calendarYear || last.yearIndex || 0))}</text>
        </g>
      </svg>
    `;
  }

  function getComponentRows(needPoint) {
    const components = isPlainObject(needPoint?.componentAmounts) ? needPoint.componentAmounts : {};
    return [
      ["essentialSupport", "Essential support"],
      ["mortgage", "Mortgage"],
      ["debtPayoff", "Debt payoff"],
      ["education", "Education"],
      ["finalExpenses", "Final expenses"],
      ["healthcareExpenses", "Healthcare"],
      ["transitionNeeds", "Transition needs"],
      ["discretionarySupport", "Discretionary support"]
    ].map(function ([key, label]) {
      return {
        key,
        label,
        amount: Number(components[key]) || 0
      };
    }).filter(function (row) {
      return row.amount > 0;
    });
  }

  function renderIssueList(title, issues) {
    const safeIssues = Array.isArray(issues) ? issues : [];
    if (!safeIssues.length) {
      return "";
    }

    return `
      <details class="coverage-need-timeline-issues">
        <summary>${escapeHtml(title)}</summary>
        <ul class="analysis-result-list">
          ${safeIssues.slice(0, 5).map(function (issue) {
            return `
              <li>
                <span>${escapeHtml(issue.message || issue.code || "Source note")}</span>
                <strong>${escapeHtml(issue.code || "note")}</strong>
              </li>
            `;
          }).join("")}
        </ul>
      </details>
    `;
  }

  function renderMissingState(host, title, message, issues) {
    host.innerHTML = `
      <article class="analysis-result-card coverage-need-timeline-card">
        <div class="analysis-result-eyebrow">Need over time</div>
        <h2>Coverage Need Timeline</h2>
        <div class="coverage-need-timeline-empty">
          <strong>${escapeHtml(title)}</strong>
          <span>${escapeHtml(message)}</span>
        </div>
        ${renderIssueList("Data gaps", issues)}
      </article>
    `;
  }

  function renderNeedTimeline(host, result) {
    const needPoints = Array.isArray(result?.needPoints) ? result.needPoints : [];
    if (!needPoints.length) {
      renderMissingState(
        host,
        "Need points unavailable",
        "Coverage need timeline will appear when linked LENS data is available.",
        result?.dataGaps
      );
      return;
    }

    const firstPoint = needPoints[0];
    const lastPoint = needPoints[needPoints.length - 1];
    const componentRows = getComponentRows(firstPoint);

    host.innerHTML = `
      <article class="analysis-result-card coverage-need-timeline-card">
        <div class="coverage-need-timeline-header">
          <div>
            <div class="analysis-result-eyebrow">Need over time</div>
            <h2>Coverage Need Timeline</h2>
          </div>
          <div class="coverage-need-timeline-badge">Projected need</div>
        </div>
        <div class="coverage-need-timeline-metrics" aria-label="Need point summary">
          <div>
            <span>Current need</span>
            <strong>${escapeHtml(formatCurrency(firstPoint.grossNeedAmount ?? firstPoint.needAmount))}</strong>
          </div>
          <div>
            <span>Final need</span>
            <strong>${escapeHtml(formatCurrency(lastPoint.grossNeedAmount ?? lastPoint.needAmount))}</strong>
          </div>
          <div>
            <span>Need points</span>
            <strong>${escapeHtml(formatCount(needPoints.length))}</strong>
          </div>
        </div>
        <div class="coverage-need-timeline-chart">
          ${renderTimelineSvg(needPoints)}
        </div>
        <div class="coverage-need-timeline-summary">
          <section>
            <div class="analysis-result-eyebrow">Component summary</div>
            <ul class="analysis-result-list">
              ${componentRows.length ? componentRows.map(function (row) {
                return `
                  <li>
                    <span>${escapeHtml(row.label)}</span>
                    <strong>${escapeHtml(formatCurrency(row.amount))}</strong>
                  </li>
                `;
              }).join("") : "<li><span>Components</span><strong>Not set</strong></li>"}
            </ul>
          </section>
          <section>
            <div class="analysis-result-eyebrow">Component warnings</div>
            ${renderIssueList("Warnings", result.warnings)}
            ${renderIssueList("Data gaps", result.dataGaps)}
            ${!result.warnings?.length && !result.dataGaps?.length ? '<p class="analysis-result-copy">No component warnings.</p>' : ""}
          </section>
        </div>
      </article>
    `;
  }

  function initializeCoverageStrategyPage() {
    const host = document.querySelector("[data-coverage-need-timeline]");
    if (!host) {
      return;
    }

    const lensAnalysis = window.LensApp?.lensAnalysis || {};
    const buildLensModelFromSavedProtectionModeling = lensAnalysis.buildLensModelFromSavedProtectionModeling;
    const analysisSettingsAdapter = lensAnalysis.analysisSettingsAdapter;
    const createAnalysisMethodSettings = analysisSettingsAdapter?.createAnalysisMethodSettings;
    const runNeedsAnalysis = lensAnalysis.analysisMethods?.runNeedsAnalysis;
    const buildCoverageStrategyNeedLine = lensAnalysis.buildCoverageStrategyNeedLine;

    if (
      typeof buildLensModelFromSavedProtectionModeling !== "function"
      || typeof runNeedsAnalysis !== "function"
      || typeof buildCoverageStrategyNeedLine !== "function"
    ) {
      renderMissingState(host, "Need timeline unavailable", "Required planning modules are unavailable.", []);
      return;
    }

    const profileRecord = resolveLinkedProfileRecord();
    if (!profileRecord) {
      renderMissingState(host, "Linked profile needed", "Open Coverage Strategy from a linked LENS profile.", []);
      return;
    }

    const protectionModelingPayload = getProtectionModelingPayload(profileRecord);
    if (!hasProtectionModelingSource(protectionModelingPayload)) {
      renderMissingState(host, "LENS data needed", "Complete the LENS workflow before reviewing need over time.", []);
      return;
    }

    try {
      const builderResult = buildLensModelFromSavedProtectionModeling({
        profileRecord,
        protectionModelingPayload,
        taxConfig: createSavedDataTaxConfig()
      });

      if (!builderResult?.lensModel) {
        renderMissingState(host, "Need points unavailable", "The saved LENS model could not be built for this profile.", builderResult?.warnings);
        return;
      }

      const methodSettings = typeof createAnalysisMethodSettings === "function"
        ? createAnalysisMethodSettings({
            analysisSettings: profileRecord.analysisSettings,
            lensModel: builderResult.lensModel,
            profileRecord
          })
        : createFallbackAnalysisMethodSettings(analysisSettingsAdapter);
      const needsResult = runNeedsAnalysis(
        builderResult.lensModel,
        cloneSettings(methodSettings.needsAnalysisSettings)
      );
      const needLine = buildCoverageStrategyNeedLine({
        lensModel: builderResult.lensModel,
        needsResult,
        analysisSettings: methodSettings.needsAnalysisSettings,
        valuationDate: needsResult?.assumptions?.valuationDate
      });

      renderNeedTimeline(host, {
        ...needLine,
        warnings: [
          ...(Array.isArray(builderResult.warnings) ? builderResult.warnings : []),
          ...(Array.isArray(methodSettings.warnings) ? methodSettings.warnings : []),
          ...(Array.isArray(needLine.warnings) ? needLine.warnings : [])
        ]
      });
    } catch (error) {
      renderMissingState(host, "Need timeline unavailable", "Coverage need timeline could not be prepared from the saved LENS model.", []);
      console.error("Coverage Strategy need timeline failed", error);
    }
  }

  document.addEventListener("DOMContentLoaded", initializeCoverageStrategyPage);
})();
