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

  function formatPercent(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) {
      return "0%";
    }
    return `${new Intl.NumberFormat("en-US", {
      maximumFractionDigits: 0
    }).format(number)}%`;
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

  function normalizeNeedPointValue(point) {
    const amount = Number(point?.needAmount);
    return Number.isFinite(amount) ? Math.max(0, amount) : 0;
  }

  function normalizeResourcePointValue(point) {
    const amount = Number(point?.resourceAmount ?? point?.eligibleResourceAmount);
    return Number.isFinite(amount) ? Math.max(0, amount) : 0;
  }

  function normalizeChartPointValue(point) {
    const amount = Number(point?.chartValue);
    return Number.isFinite(amount) ? Math.max(0, amount) : 0;
  }

  function resolveResourcePointForNeedPoint(resourcePoints, needPoint, index) {
    const resources = Array.isArray(resourcePoints) ? resourcePoints : [];
    const yearIndex = Number(needPoint?.yearIndex);
    if (Number.isFinite(yearIndex)) {
      const match = resources.find(function (point) {
        return Number(point?.yearIndex) === yearIndex;
      });
      if (match) {
        return match;
      }
    }
    return resources[index] || null;
  }

  function buildCoverageRatioChartSeries(needPoints, resourcePoints) {
    const rawResourceRatios = [];
    const needRatioPoints = [];
    const resourceRatioPoints = [];

    (Array.isArray(needPoints) ? needPoints : []).forEach(function (needPoint, index) {
      const needAmount = normalizeNeedPointValue(needPoint);
      if (needAmount <= 0) {
        return;
      }

      needRatioPoints.push({
        ...needPoint,
        chartValue: 100,
        rawRatioValue: 100
      });

      const resourcePoint = resolveResourcePointForNeedPoint(resourcePoints, needPoint, index);
      if (!resourcePoint) {
        return;
      }

      const resourceAmount = normalizeResourcePointValue(resourcePoint);
      const rawRatio = (resourceAmount / needAmount) * 100;
      if (!Number.isFinite(rawRatio)) {
        return;
      }
      rawResourceRatios.push(rawRatio);
      resourceRatioPoints.push({
        ...resourcePoint,
        chartValue: rawRatio,
        rawRatioValue: rawRatio
      });
    });

    const maxResourceRatio = rawResourceRatios.length ? Math.max(...rawResourceRatios) : 0;
    const ratioCeiling = Math.max(200, Math.min(300, Math.ceil(Math.max(maxResourceRatio, 100) / 50) * 50));
    const resourceRatioPointsCapped = resourceRatioPoints.map(function (point) {
      return {
        ...point,
        chartValue: Math.min(point.chartValue, ratioCeiling),
        chartValueCapped: point.chartValue > ratioCeiling
      };
    });

    return {
      chartMode: "coverage-ratio",
      needRatioPoints,
      resourceRatioPoints: resourceRatioPointsCapped,
      ratioCeiling,
      resourceRatiosCapped: resourceRatioPointsCapped.some(function (point) {
        return point.chartValueCapped === true;
      })
    };
  }

  function createChartPath(points, width, height, padding, maxValue, getValue) {
    const safePoints = Array.isArray(points) ? points : [];
    if (!safePoints.length) {
      return "";
    }
    const safeMax = Math.max(Number(maxValue) || 0, 1);
    const innerWidth = width - padding.left - padding.right;
    const innerHeight = height - padding.top - padding.bottom;
    const maxIndex = Math.max(safePoints.length - 1, 1);

    return safePoints.map(function (point, index) {
      const x = padding.left + (innerWidth * (index / maxIndex));
      const y = padding.top + innerHeight - (innerHeight * (getValue(point) / safeMax));
      return `${index === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`;
    }).join(" ");
  }

  function valueToY(value, height, padding, maxValue) {
    const innerHeight = height - padding.top - padding.bottom;
    const safeMax = Math.max(Number(maxValue) || 0, 1);
    return padding.top + innerHeight - (innerHeight * (Math.max(0, Number(value) || 0) / safeMax));
  }

  function renderTimelineSvg(needPoints, resourcePoints) {
    const points = Array.isArray(needPoints) ? needPoints : [];
    if (points.length < 2) {
      return "";
    }
    const resources = Array.isArray(resourcePoints) ? resourcePoints : [];
    const ratioChart = buildCoverageRatioChartSeries(points, resources);
    if (ratioChart.needRatioPoints.length < 2) {
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
    const maxChartValue = ratioChart.ratioCeiling;
    const path = createChartPath(ratioChart.needRatioPoints, width, height, padding, maxChartValue, normalizeChartPointValue);
    const resourcePath = ratioChart.resourceRatioPoints.length >= 2
      ? createChartPath(ratioChart.resourceRatioPoints, width, height, padding, maxChartValue, normalizeChartPointValue)
      : "";
    const first = ratioChart.needRatioPoints[0];
    const last = ratioChart.needRatioPoints[ratioChart.needRatioPoints.length - 1];
    const firstResource = ratioChart.resourceRatioPoints[0];
    const lastResource = ratioChart.resourceRatioPoints[ratioChart.resourceRatioPoints.length - 1];
    const axisLabels = ratioChart.ratioCeiling >= 300
      ? [300, 200, 100, 0]
      : [200, 100, 50, 0];

    return `
      <svg class="coverage-need-timeline-svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="Coverage ratio timeline; projected need equals 100 percent and eligible resources are plotted as resources divided by need">
        <g class="coverage-need-timeline-grid" aria-hidden="true">
          ${axisLabels.map(function (value) {
            const y = valueToY(value, height, padding, maxChartValue);
            return `
              <line x1="${padding.left}" y1="${y.toFixed(2)}" x2="${width - padding.right}" y2="${y.toFixed(2)}"></line>
              <text x="${padding.left - 10}" y="${(y + 4).toFixed(2)}">${escapeHtml(formatPercent(value))}</text>
            `;
          }).join("")}
        </g>
        <path class="coverage-need-timeline-line" d="${path}"></path>
        ${resourcePath ? `<path class="coverage-need-timeline-line coverage-need-timeline-resource-line" d="${resourcePath}"></path>` : ""}
        <circle class="coverage-need-timeline-point" cx="${padding.left}" cy="${valueToY(normalizeChartPointValue(first), height, padding, maxChartValue).toFixed(2)}" r="4"></circle>
        <circle class="coverage-need-timeline-point" cx="${width - padding.right}" cy="${valueToY(normalizeChartPointValue(last), height, padding, maxChartValue).toFixed(2)}" r="4"></circle>
        ${resourcePath && firstResource && lastResource ? `
          <circle class="coverage-need-timeline-point coverage-need-timeline-resource-point" cx="${padding.left}" cy="${valueToY(normalizeChartPointValue(firstResource), height, padding, maxChartValue).toFixed(2)}" r="4"></circle>
          <circle class="coverage-need-timeline-point coverage-need-timeline-resource-point" cx="${width - padding.right}" cy="${valueToY(normalizeChartPointValue(lastResource), height, padding, maxChartValue).toFixed(2)}" r="4"></circle>
        ` : ""}
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

  function hasBlockingResourceGap(result) {
    const codes = (Array.isArray(result?.dataGaps) ? result.dataGaps : []).map(function (issue) {
      return issue?.code;
    });
    return codes.includes("missing-asset-treatment-helper") || codes.includes("missing-asset-facts");
  }

  function getRenderableResourcePoints(result) {
    if (hasBlockingResourceGap(result)) {
      return [];
    }
    return Array.isArray(result?.resourcePoints) ? result.resourcePoints : [];
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
    const resourceResult = isPlainObject(result?.resourceLine) ? result.resourceLine : null;
    const resourcePoints = getRenderableResourcePoints(resourceResult);
    const firstResourcePoint = resourcePoints[0] || null;
    const lastResourcePoint = resourcePoints[resourcePoints.length - 1] || null;
    const resourceUnavailable = !resourcePoints.length;
    const componentRows = getComponentRows(firstPoint);
    const warningCount = (Array.isArray(result.warnings) ? result.warnings.length : 0)
      + (Array.isArray(resourceResult?.warnings) ? resourceResult.warnings.length : 0);
    const dataGapCount = (Array.isArray(result.dataGaps) ? result.dataGaps.length : 0)
      + (Array.isArray(resourceResult?.dataGaps) ? resourceResult.dataGaps.length : 0);
    const combinedWarnings = [
      ...(Array.isArray(result.warnings) ? result.warnings : []),
      ...(Array.isArray(resourceResult?.warnings) ? resourceResult.warnings : [])
    ];
    const combinedDataGaps = [
      ...(Array.isArray(result.dataGaps) ? result.dataGaps : []),
      ...(Array.isArray(resourceResult?.dataGaps) ? resourceResult.dataGaps : [])
    ];

    host.innerHTML = `
      <article class="analysis-result-card coverage-need-timeline-card">
        <div class="coverage-need-timeline-header">
          <div>
            <div class="analysis-result-eyebrow">Need over time</div>
            <h2>Coverage Need Timeline</h2>
          </div>
          <div class="coverage-need-timeline-legend" aria-label="Timeline series">
            <span><i class="coverage-need-timeline-legend-need" aria-hidden="true"></i>Projected need</span>
            <span><i class="coverage-need-timeline-legend-resource" aria-hidden="true"></i>Projected eligible resources</span>
          </div>
        </div>
        <div class="coverage-need-timeline-metrics" aria-label="Need point summary">
          <div>
            <span>Current need</span>
            <strong>${escapeHtml(formatCurrency(firstPoint.grossNeedAmount ?? firstPoint.needAmount))}</strong>
          </div>
          <div>
            <span>Current eligible resources</span>
            <strong>${escapeHtml(firstResourcePoint ? formatCurrency(firstResourcePoint.resourceAmount) : "Unavailable")}</strong>
          </div>
          <div>
            <span>Final need</span>
            <strong>${escapeHtml(formatCurrency(lastPoint.grossNeedAmount ?? lastPoint.needAmount))}</strong>
          </div>
          <div>
            <span>Final eligible resources</span>
            <strong>${escapeHtml(lastResourcePoint ? formatCurrency(lastResourcePoint.resourceAmount) : "Unavailable")}</strong>
          </div>
          <div>
            <span>Need points</span>
            <strong>${escapeHtml(formatCount(needPoints.length))}</strong>
          </div>
          <div>
            <span>Warnings / data gaps</span>
            <strong>${escapeHtml(formatCount(warningCount + dataGapCount))}</strong>
          </div>
        </div>
        <div class="coverage-need-timeline-chart">
          ${renderTimelineSvg(needPoints, resourcePoints)}
          ${resourceUnavailable ? `
            <div class="coverage-need-timeline-resource-unavailable">
              Projected eligible resources unavailable from current source data.
            </div>
          ` : ""}
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
            ${renderIssueList("Warnings", combinedWarnings)}
            ${renderIssueList("Data gaps", combinedDataGaps)}
            ${!combinedWarnings.length && !combinedDataGaps.length ? '<p class="analysis-result-copy">No component warnings.</p>' : ""}
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
    const buildCoverageStrategyResourceLine = lensAnalysis.buildCoverageStrategyResourceLine;

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
      const resourceLine = typeof buildCoverageStrategyResourceLine === "function"
        ? buildCoverageStrategyResourceLine({
            lensModel: builderResult.lensModel,
            analysisSettings: profileRecord.analysisSettings,
            needPoints: needLine.needPoints,
            valuationDate: needLine.valuationDate || needsResult?.assumptions?.valuationDate,
            horizonYears: needLine.horizonYears
          })
        : {
            status: "partial",
            resourcePoints: [],
            warnings: [],
            dataGaps: [
              {
                code: "coverage-strategy-resource-line-adapter-unavailable",
                message: "Projected eligible resources are unavailable because the resource adapter did not load."
              }
            ]
          };

      renderNeedTimeline(host, {
        ...needLine,
        resourceLine,
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
