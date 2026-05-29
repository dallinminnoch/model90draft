(function () {
  const MIN_PROJECTION_HORIZON_YEARS = 1;
  const MAX_PROJECTION_HORIZON_YEARS = 80;
  const HORIZON_NUMBER_INPUT_COMMIT_DELAY_MS = 450;

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

  function formatCompactCurrency(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) {
      return "$0";
    }
    const absolute = Math.abs(number);
    const sign = number < 0 ? "-" : "";
    if (absolute >= 1000000000) {
      return `${sign}$${new Intl.NumberFormat("en-US", {
        maximumFractionDigits: absolute >= 10000000000 ? 0 : 1
      }).format(absolute / 1000000000)}B`;
    }
    if (absolute >= 1000000) {
      return `${sign}$${new Intl.NumberFormat("en-US", {
        maximumFractionDigits: absolute >= 10000000 ? 0 : 1
      }).format(absolute / 1000000)}M`;
    }
    if (absolute >= 1000) {
      return `${sign}$${new Intl.NumberFormat("en-US", {
        maximumFractionDigits: absolute >= 10000 ? 0 : 1
      }).format(absolute / 1000)}k`;
    }
    return formatCurrency(number);
  }

  function formatYearValue(value) {
    if (value == null || value === "") {
      return "None";
    }
    return String(value);
  }

  function formatScenarioClockTime(date) {
    return date.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit"
    });
  }

  function getStartOfLocalDay(date) {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate());
  }

  function formatScenarioLastCalculatedLabel(calculatedAt, nowValue) {
    const calculatedDate = calculatedAt instanceof Date
      ? calculatedAt
      : new Date(calculatedAt || Date.now());
    const now = nowValue instanceof Date ? nowValue : new Date(nowValue || Date.now());
    if (!Number.isFinite(calculatedDate.getTime())) {
      return "Last calculated: Unknown";
    }
    const daysDifference = Math.max(
      0,
      Math.floor((getStartOfLocalDay(now).getTime() - getStartOfLocalDay(calculatedDate).getTime()) / 86400000)
    );
    if (daysDifference === 0) {
      return `Last calculated: Today at ${formatScenarioClockTime(calculatedDate)}`;
    }
    if (daysDifference === 1) {
      return `Last calculated: Yesterday at ${formatScenarioClockTime(calculatedDate)}`;
    }
    if (daysDifference <= 14) {
      return `Last calculated: ${daysDifference} days ago`;
    }
    return `Last calculated: ${calculatedDate.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric"
    })}`;
  }

  function renderScenarioActionIcon(iconName) {
    if (iconName === "save") {
      return `
        <svg class="coverage-strategy-scenario-action-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path>
        </svg>
      `;
    }
    if (iconName === "recalculate") {
      return `
        <svg class="coverage-strategy-scenario-action-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path d="M21 12a9 9 0 1 1-2.64-6.36"></path>
          <polyline points="21 3 21 9 15 9"></polyline>
        </svg>
      `;
    }
    return "";
  }

  function clampProjectionHorizonYears(value, fallbackValue) {
    const fallback = Number.isFinite(Number(fallbackValue))
      ? Number(fallbackValue)
      : MAX_PROJECTION_HORIZON_YEARS;
    const parsed = Number(value);
    const candidate = Number.isFinite(parsed) ? parsed : fallback;
    return Math.min(
      MAX_PROJECTION_HORIZON_YEARS,
      Math.max(MIN_PROJECTION_HORIZON_YEARS, Math.round(candidate))
    );
  }

  function toOptionalNumber(value) {
    if (value == null || value === "") {
      return null;
    }
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  function getYearFromDate(value) {
    const normalizedDate = normalizeDateOnly(value);
    return normalizedDate ? normalizedDate.getUTCFullYear() : null;
  }

  function formatStatusLabel(value) {
    const normalized = String(value == null ? "" : value).trim().toLowerCase();
    if (normalized === "gap") {
      return "Gap";
    }
    if (normalized === "covered") {
      return "Covered";
    }
    if (normalized === "surplus") {
      return "Surplus";
    }
    return "Unknown";
  }

  function getStatusClass(value) {
    const normalized = String(value == null ? "" : value).trim().toLowerCase();
    if (normalized === "gap" || normalized === "covered" || normalized === "surplus") {
      return `is-${normalized}`;
    }
    return "is-unknown";
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

  function normalizeDateOnly(value) {
    const raw = String(value == null ? "" : value).trim();
    const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!match) {
      return null;
    }
    const year = Number(match[1]);
    const monthIndex = Number(match[2]) - 1;
    const day = Number(match[3]);
    const date = new Date(Date.UTC(year, monthIndex, day));
    if (
      Number.isNaN(date.getTime())
      || date.getUTCFullYear() !== year
      || date.getUTCMonth() !== monthIndex
      || date.getUTCDate() !== day
    ) {
      return null;
    }
    return date;
  }

  function calculateAgeOnDate(dateOfBirth, valuationDate) {
    const birth = normalizeDateOnly(dateOfBirth);
    const valuation = normalizeDateOnly(valuationDate);
    if (!birth || !valuation || birth > valuation) {
      return null;
    }
    let age = valuation.getUTCFullYear() - birth.getUTCFullYear();
    const monthDelta = valuation.getUTCMonth() - birth.getUTCMonth();
    if (monthDelta < 0 || (monthDelta === 0 && valuation.getUTCDate() < birth.getUTCDate())) {
      age -= 1;
    }
    return age >= 0 ? age : null;
  }

  function resolveAge110Horizon(options) {
    const safeOptions = isPlainObject(options) ? options : {};
    const dateOfBirth = String(safeOptions.clientDateOfBirth || "").trim();
    const valuationDate = String(safeOptions.valuationDate || "").trim();
    const currentAge = calculateAgeOnDate(dateOfBirth, valuationDate);
    if (currentAge != null) {
      return {
        horizonYears: Math.max(0, 110 - currentAge),
        currentAge,
        warning: null
      };
    }
    return {
      horizonYears: null,
      currentAge: null,
      warning: {
        code: "coverage-strategy-age-110-horizon-unavailable",
        message: "Coverage Strategy could not derive current age from DOB and valuation date; adapter-derived horizon was used.",
        details: {
          clientDateOfBirth: dateOfBirth || null,
          valuationDate: valuationDate || null
        }
      }
    };
  }

  function resolveDefaultProjectionHorizon(age110Horizon) {
    return clampProjectionHorizonYears(age110Horizon?.horizonYears, MAX_PROJECTION_HORIZON_YEARS);
  }

  function getProjectedDependentCount(lensModel) {
    const educationSupport = isPlainObject(lensModel?.educationSupport) ? lensModel.educationSupport : {};
    const explicitCount = toOptionalNumber(
      educationSupport.desiredAdditionalDependentCount
      ?? educationSupport.projectedDependentsCount
    );
    if (explicitCount != null) {
      return Math.max(0, Math.round(explicitCount));
    }
    return Array.isArray(educationSupport.projectedDependentDetails)
      ? educationSupport.projectedDependentDetails.length
      : 0;
  }

  function getProjectedDependentFundingAmount(lensModel, projectedDependentCount) {
    const educationSupport = isPlainObject(lensModel?.educationSupport) ? lensModel.educationSupport : {};
    const perDependent = toOptionalNumber(
      educationSupport.perDesiredAdditionalDependentEducationFunding
      ?? educationSupport.projectedEducationFundingPerDependent
    );
    if (perDependent != null) {
      return Math.max(0, perDependent);
    }
    const aggregate = toOptionalNumber(
      educationSupport.desiredAdditionalDependentEducationFundingNeed
      ?? educationSupport.projectedDependentEducationFundingNeed
    );
    if (aggregate != null && projectedDependentCount > 0) {
      return Math.max(0, aggregate / projectedDependentCount);
    }
    return null;
  }

  function validateProjectedDependentBirthYear(value, valuationDate) {
    const rawValue = String(value == null ? "" : value).trim();
    if (!rawValue) {
      return {
        expectedBirthYear: null,
        rawExpectedBirthYear: "",
        validationStatus: "untimed",
        validationCode: null
      };
    }
    const valuationYear = getYearFromDate(valuationDate) || new Date().getFullYear();
    const minYear = valuationYear - 1;
    const maxYear = valuationYear + 50;
    if (!/^\d{4}$/.test(rawValue)) {
      return {
        expectedBirthYear: null,
        rawExpectedBirthYear: rawValue,
        validationStatus: "invalid",
        validationCode: "projected-dependent-birth-year-invalid"
      };
    }
    const parsed = Number(rawValue);
    if (!Number.isFinite(parsed) || parsed < minYear || parsed > maxYear) {
      return {
        expectedBirthYear: null,
        rawExpectedBirthYear: rawValue,
        validationStatus: "invalid",
        validationCode: "projected-dependent-birth-year-invalid"
      };
    }
    return {
      expectedBirthYear: parsed,
      rawExpectedBirthYear: rawValue,
      validationStatus: "valid",
      validationCode: null
    };
  }

  function getProjectedDependentTimingRowsFromSettings(settings) {
    return Array.isArray(settings?.education?.projectedDependentTimingRows)
      ? settings.education.projectedDependentTimingRows
      : [];
  }

  function getEducationPaymentScheduleModeFromSettings(settings) {
    const mode = String(settings?.education?.educationPaymentScheduleMode || "").trim();
    return mode === "lumpSumAtStart" ? "lumpSumAtStart" : "fourYearAnnual";
  }

  function getEducationResourceSpendingModeFromSettings(settings) {
    const mode = String(settings?.education?.educationResourceSpendingMode || "").trim();
    if (mode === "educationSavingsOnly" || settings?.education?.useEducationSavingsOffset === true) {
      return "educationSavingsOnly";
    }
    return "off";
  }

  function buildProjectedDependentTimingRows(lensModel, existingRows, valuationDate) {
    const projectedDependentCount = getProjectedDependentCount(lensModel);
    if (!projectedDependentCount) {
      return [];
    }
    const existingRowsById = new Map();
    (Array.isArray(existingRows) ? existingRows : []).forEach(function (row) {
      if (!isPlainObject(row)) {
        return;
      }
      const id = String(row.id || "").trim();
      if (id && !existingRowsById.has(id)) {
        existingRowsById.set(id, row);
      }
    });
    const fundingAmount = getProjectedDependentFundingAmount(lensModel, projectedDependentCount);
    return Array.from({ length: projectedDependentCount }, function (_unused, index) {
      const id = `projected-dependent-${index + 1}`;
      const existingRow = existingRowsById.get(id) || {};
      const validation = validateProjectedDependentBirthYear(
        existingRow.rawExpectedBirthYear
        ?? existingRow.expectedBirthYear
        ?? existingRow.birthYear
        ?? "",
        valuationDate
      );
      return {
        id,
        label: String(existingRow.label || `Projected dependent ${index + 1}`),
        included: existingRow.included === false ? false : true,
        timingMode: validation.expectedBirthYear != null
          ? "expectedBirthYear"
          : "untimedKeepThroughHorizon",
        expectedBirthYear: validation.expectedBirthYear,
        rawExpectedBirthYear: validation.rawExpectedBirthYear,
        validationStatus: validation.validationStatus,
        validationCode: validation.validationCode,
        educationFundingAmount: existingRow.educationFundingAmount ?? fundingAmount,
        sourcePath: `coverageStrategyScenarioSettings.education.projectedDependentTimingRows[${index}]`
      };
    });
  }

  function renderProjectedDependentTimingControls(rows) {
    const timingRows = Array.isArray(rows) ? rows : [];
    if (!timingRows.length) {
      return `
        <div class="coverage-strategy-scenario-control is-projected-dependents is-empty" aria-label="Projected dependents">
          <span class="coverage-strategy-scenario-control-label">Projected dependents</span>
          <strong>No projected dependents</strong>
        </div>
      `;
    }
    return `
      <div class="coverage-strategy-scenario-control is-projected-dependents">
        <span class="coverage-strategy-scenario-control-label">Projected dependents</span>
        <div class="coverage-strategy-projected-dependent-list">
          ${timingRows.map(function (row) {
            const validationStatus = row.validationStatus === "invalid"
              ? "Invalid"
              : (row.expectedBirthYear != null ? "Timed" : "Untimed");
            return `
              <label class="coverage-strategy-projected-dependent-row">
                <span>${escapeHtml(row.label || "Projected dependent")}</span>
                <input
                  class="coverage-strategy-projected-dependent-birth-year-input"
                  type="text"
                  inputmode="numeric"
                  pattern="[0-9]{4}"
                  maxlength="4"
                  placeholder="Year"
                  title="Birth year"
                  aria-label="${escapeHtml((row.label || "Projected dependent") + " birth year")}"
                  value="${escapeHtml(row.rawExpectedBirthYear ?? row.expectedBirthYear ?? "")}"
                  data-projected-dependent-id="${escapeHtml(row.id)}"
                  data-coverage-strategy-projected-dependent-birth-year>
                <em class="${row.validationStatus === "invalid" ? "is-invalid" : ""}">${escapeHtml(validationStatus)}</em>
              </label>
            `;
          }).join("")}
        </div>
      </div>
    `;
  }

  function normalizeChartPointValue(point) {
    const amount = Number(point?.chartValue);
    return Number.isFinite(amount) ? Math.max(0, amount) : 0;
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

  function getChartSeries(chartModel, key) {
    const series = Array.isArray(chartModel?.series) ? chartModel.series : [];
    return series.find(function (item) {
      return item?.key === key;
    }) || null;
  }

  function getChartPointX(index, pointCount, width, padding) {
    const innerWidth = width - padding.left - padding.right;
    const maxIndex = Math.max(pointCount - 1, 1);
    return padding.left + (innerWidth * (index / maxIndex));
  }

  function buildXAxisTicks(points) {
    const safePoints = Array.isArray(points) ? points : [];
    if (!safePoints.length) {
      return [];
    }
    const lastIndex = safePoints.length - 1;
    const targetTickCount = lastIndex <= 8 ? Math.min(lastIndex + 1, 9) : 7;
    const rawStep = Math.max(1, Math.ceil(lastIndex / Math.max(targetTickCount - 1, 1)));
    const ticks = [];
    for (let index = 0; index <= lastIndex; index += rawStep) {
      ticks.push({
        index,
        point: safePoints[index]
      });
    }
    if (!ticks.some(function (tick) {
      return tick.index === lastIndex;
    })) {
      ticks.push({
        index: lastIndex,
        point: safePoints[lastIndex]
      });
    }
    return ticks;
  }

  function formatXAxisTick(point) {
    const year = point?.calendarYear || point?.yearIndex || 0;
    const age = point?.age == null ? "" : ` / ${point.age}`;
    return `${year}${age}`;
  }

  function buildIntermediatePointMarkers(points, pointCount, width, height, padding, maxValue) {
    const safePoints = Array.isArray(points) ? points : [];
    if (safePoints.length < 4) {
      return "";
    }
    const step = Math.max(2, Math.ceil((safePoints.length - 1) / 8));
    const markers = [];
    for (let index = step; index < safePoints.length - 1; index += step) {
      const point = safePoints[index];
      markers.push(`
        <circle
          class="coverage-need-timeline-inspection-point"
          cx="${getChartPointX(index, pointCount, width, padding).toFixed(2)}"
          cy="${valueToY(normalizeChartPointValue(point), height, padding, maxValue).toFixed(2)}"
          r="2.4"></circle>
      `);
    }
    return markers.join("");
  }

  function renderTimelineSvg(chartModel) {
    const needSeries = getChartSeries(chartModel, "need");
    const resourceSeries = getChartSeries(chartModel, "resources");
    const existingCoverageSeries = getChartSeries(chartModel, "existingCoverage");
    const remainingExposureSeries = getChartSeries(chartModel, "remainingExposure");
    const needPoints = Array.isArray(needSeries?.points) ? needSeries.points : [];
    if (needPoints.length < 2) {
      return "";
    }
    const resourcePoints = Array.isArray(resourceSeries?.points) ? resourceSeries.points : [];
    const existingCoveragePoints = Array.isArray(existingCoverageSeries?.points) ? existingCoverageSeries.points : [];
    const remainingExposurePoints = Array.isArray(remainingExposureSeries?.points) ? remainingExposureSeries.points : [];
    const width = 860;
    const height = 340;
    const padding = {
      top: 28,
      right: 34,
      bottom: 40,
      left: 70
    };
    const maxChartValue = Number(chartModel?.yAxisMax) || 100000;
    const path = createChartPath(needPoints, width, height, padding, maxChartValue, normalizeChartPointValue);
    const resourcePath = resourcePoints.length >= 2
      ? createChartPath(resourcePoints, width, height, padding, maxChartValue, normalizeChartPointValue)
      : "";
    const existingCoveragePath = existingCoveragePoints.length >= 2
      ? createChartPath(existingCoveragePoints, width, height, padding, maxChartValue, normalizeChartPointValue)
      : "";
    const remainingExposurePath = remainingExposurePoints.length >= 2
      ? createChartPath(remainingExposurePoints, width, height, padding, maxChartValue, normalizeChartPointValue)
      : "";
    const first = needPoints[0];
    const last = needPoints[needPoints.length - 1];
    const firstResource = resourcePoints[0];
    const lastResource = resourcePoints[resourcePoints.length - 1];
    const firstExistingCoverage = existingCoveragePoints[0];
    const lastExistingCoverage = existingCoveragePoints[existingCoveragePoints.length - 1];
    const firstRemainingExposure = remainingExposurePoints[0];
    const lastRemainingExposure = remainingExposurePoints[remainingExposurePoints.length - 1];
    const axisLabels = Array.isArray(chartModel?.axisLabels) ? chartModel.axisLabels : [100000, 75000, 50000, 25000, 0];
    const xAxisTicks = buildXAxisTicks(needPoints);

    return `
      <svg class="coverage-need-timeline-svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="Coverage Strategy dollar timeline showing projected need, projected eligible resources, existing coverage, and remaining exposure">
        <g class="coverage-need-timeline-grid" aria-hidden="true">
          ${axisLabels.map(function (value) {
            const y = valueToY(value, height, padding, maxChartValue);
            return `
              <line x1="${padding.left}" y1="${y.toFixed(2)}" x2="${width - padding.right}" y2="${y.toFixed(2)}"></line>
              <text x="${padding.left - 10}" y="${(y + 4).toFixed(2)}">${escapeHtml(formatCompactCurrency(value))}</text>
            `;
          }).join("")}
        </g>
        <g class="coverage-need-timeline-x-grid" aria-hidden="true">
          ${xAxisTicks.map(function (tick) {
            const x = getChartPointX(tick.index, needPoints.length, width, padding);
            return `<line x1="${x.toFixed(2)}" y1="${padding.top}" x2="${x.toFixed(2)}" y2="${height - padding.bottom}"></line>`;
          }).join("")}
        </g>
        <path class="coverage-need-timeline-line" d="${path}"></path>
        ${resourcePath ? `<path class="coverage-need-timeline-line coverage-need-timeline-resource-line" d="${resourcePath}"></path>` : ""}
        ${existingCoveragePath ? `<path class="coverage-need-timeline-line coverage-need-timeline-existing-coverage-line" d="${existingCoveragePath}"></path>` : ""}
        ${remainingExposurePath ? `<path class="coverage-need-timeline-line coverage-need-timeline-remaining-exposure-line" d="${remainingExposurePath}"></path>` : ""}
        ${buildIntermediatePointMarkers(needPoints, needPoints.length, width, height, padding, maxChartValue)}
        ${resourcePath ? buildIntermediatePointMarkers(resourcePoints, needPoints.length, width, height, padding, maxChartValue) : ""}
        ${existingCoveragePath ? buildIntermediatePointMarkers(existingCoveragePoints, needPoints.length, width, height, padding, maxChartValue) : ""}
        ${remainingExposurePath ? buildIntermediatePointMarkers(remainingExposurePoints, needPoints.length, width, height, padding, maxChartValue) : ""}
        <circle class="coverage-need-timeline-point" cx="${padding.left}" cy="${valueToY(normalizeChartPointValue(first), height, padding, maxChartValue).toFixed(2)}" r="4"></circle>
        <circle class="coverage-need-timeline-point" cx="${width - padding.right}" cy="${valueToY(normalizeChartPointValue(last), height, padding, maxChartValue).toFixed(2)}" r="4"></circle>
        ${resourcePath && firstResource && lastResource ? `
          <circle class="coverage-need-timeline-point coverage-need-timeline-resource-point" cx="${padding.left}" cy="${valueToY(normalizeChartPointValue(firstResource), height, padding, maxChartValue).toFixed(2)}" r="4"></circle>
          <circle class="coverage-need-timeline-point coverage-need-timeline-resource-point" cx="${width - padding.right}" cy="${valueToY(normalizeChartPointValue(lastResource), height, padding, maxChartValue).toFixed(2)}" r="4"></circle>
        ` : ""}
        ${existingCoveragePath && firstExistingCoverage && lastExistingCoverage ? `
          <circle class="coverage-need-timeline-point coverage-need-timeline-existing-coverage-point" cx="${padding.left}" cy="${valueToY(normalizeChartPointValue(firstExistingCoverage), height, padding, maxChartValue).toFixed(2)}" r="4"></circle>
          <circle class="coverage-need-timeline-point coverage-need-timeline-existing-coverage-point" cx="${width - padding.right}" cy="${valueToY(normalizeChartPointValue(lastExistingCoverage), height, padding, maxChartValue).toFixed(2)}" r="4"></circle>
        ` : ""}
        ${remainingExposurePath && firstRemainingExposure && lastRemainingExposure ? `
          <circle class="coverage-need-timeline-point coverage-need-timeline-remaining-exposure-point" cx="${padding.left}" cy="${valueToY(normalizeChartPointValue(firstRemainingExposure), height, padding, maxChartValue).toFixed(2)}" r="4"></circle>
          <circle class="coverage-need-timeline-point coverage-need-timeline-remaining-exposure-point" cx="${width - padding.right}" cy="${valueToY(normalizeChartPointValue(lastRemainingExposure), height, padding, maxChartValue).toFixed(2)}" r="4"></circle>
        ` : ""}
        <g class="coverage-need-timeline-axis" aria-hidden="true">
          ${xAxisTicks.map(function (tick) {
            const x = getChartPointX(tick.index, needPoints.length, width, padding);
            const textAnchor = tick.index === 0 ? "start" : (tick.index === needPoints.length - 1 ? "end" : "middle");
            return `
              <text x="${x.toFixed(2)}" y="${height - 10}" text-anchor="${textAnchor}">${escapeHtml(formatXAxisTick(tick.point))}</text>
            `;
          }).join("")}
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

  function roundMoney(value) {
    const number = Number(value);
    return Number.isFinite(number) ? Number(number.toFixed(2)) : 0;
  }

  function getCoveragePolicies(profileRecord) {
    return Array.isArray(profileRecord?.coveragePolicies)
      ? profileRecord.coveragePolicies.filter(function (policy) {
          return isPlainObject(policy);
        }).map(function (policy) {
          return { ...policy };
        })
      : [];
  }

  function getLayerScheduleAmount(layer, yearIndex) {
    const schedulePoints = Array.isArray(layer?.benefitSchedule)
      ? layer.benefitSchedule
      : (Array.isArray(layer?.benefitSchedule?.points) ? layer.benefitSchedule.points : []);
    const exact = schedulePoints.find(function (point) {
      return Number(point?.yearIndex) === yearIndex;
    });
    const amount = Number(exact?.amount ?? exact?.deathBenefit ?? exact?.coverageAmount ?? exact?.benefitAmount);
    return Number.isFinite(amount) ? Math.max(0, amount) : 0;
  }

  function getLayerCoverageAmount(layer, yearIndex) {
    if (!isPlainObject(layer) || layer.included === false || layer.source !== "existing") {
      return 0;
    }
    const startYearIndex = Number(layer.startYearIndex ?? 0);
    if (Number.isFinite(startYearIndex) && yearIndex < startYearIndex) {
      return 0;
    }
    if (layer.policyType === "custom") {
      return getLayerScheduleAmount(layer, yearIndex);
    }
    const endYearIndex = Number(layer.endYearIndex);
    if (Number.isFinite(endYearIndex) && yearIndex > endYearIndex) {
      return 0;
    }
    const deathBenefit = Number(layer.deathBenefit);
    return Number.isFinite(deathBenefit) ? Math.max(0, deathBenefit) : 0;
  }

  function buildExistingCoveragePoint(needPoint, index, layers) {
    const yearIndex = Number.isFinite(Number(needPoint?.yearIndex))
      ? Number(needPoint.yearIndex)
      : index;
    const existingCoverageAmount = roundMoney((Array.isArray(layers) ? layers : []).reduce(function (sum, layer) {
      return sum + getLayerCoverageAmount(layer, yearIndex);
    }, 0));

    return {
      yearIndex,
      date: needPoint?.date || null,
      calendarYear: needPoint?.calendarYear || null,
      age: needPoint?.age ?? null,
      existingCoverageAmount
    };
  }

  function buildExistingCoverageLine(options) {
    const safeOptions = isPlainObject(options) ? options : {};
    const needPoints = Array.isArray(safeOptions.needPoints) ? safeOptions.needPoints : [];
    const buildExistingCoverageTimelineLayers = window.LensApp?.lensAnalysis?.buildExistingCoverageTimelineLayers;

    if (typeof buildExistingCoverageTimelineLayers !== "function") {
      return {
        status: "partial",
        coveragePoints: needPoints.map(function (needPoint, index) {
          return buildExistingCoveragePoint(needPoint, index, []);
        }),
        layers: [],
        warnings: [],
        dataGaps: [
          {
            code: "coverage-timeline-existing-coverage-adapter-unavailable",
            message: "Existing coverage is unavailable because the existing coverage adapter did not load."
          }
        ],
        trace: {
          source: "profileRecord.coveragePolicies",
          includedLayerCount: 0,
          skippedPolicyCount: 0
        }
      };
    }

    const coveragePolicies = getCoveragePolicies(safeOptions.profileRecord);
    const adapterResult = buildExistingCoverageTimelineLayers({
      valuationDate: safeOptions.valuationDate,
      clientDateOfBirth: safeOptions.clientDateOfBirth,
      coveragePolicies,
      defaultGroupCoverageEndAge: safeOptions.defaultGroupCoverageEndAge
    });
    const layers = Array.isArray(adapterResult?.layers) ? adapterResult.layers : [];
    const coveragePoints = needPoints.map(function (needPoint, index) {
      return buildExistingCoveragePoint(needPoint, index, layers);
    });

    return {
      status: adapterResult?.dataGaps?.length ? "partial" : "complete",
      coveragePoints,
      layers,
      warnings: Array.isArray(adapterResult?.warnings) ? adapterResult.warnings : [],
      dataGaps: Array.isArray(adapterResult?.dataGaps) ? adapterResult.dataGaps : [],
      trace: {
        source: "profileRecord.coveragePolicies",
        inputPolicyCount: coveragePolicies.length,
        includedLayerCount: adapterResult?.trace?.includedLayerCount ?? layers.filter(function (layer) {
          return layer?.included !== false;
        }).length,
        skippedPolicyCount: adapterResult?.trace?.excludedPolicyCount ?? 0,
        adapterTrace: adapterResult?.trace || null
      }
    };
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
    const existingCoverageResult = isPlainObject(result?.existingCoverageLine) ? result.existingCoverageLine : null;
    const existingCoveragePoints = Array.isArray(existingCoverageResult?.coveragePoints)
      ? existingCoverageResult.coveragePoints
      : [];
    const firstExistingCoveragePoint = existingCoveragePoints[0] || null;
    const lastExistingCoveragePoint = existingCoveragePoints[existingCoveragePoints.length - 1] || null;
    const gapSurplusResult = isPlainObject(result?.gapSurplus) ? result.gapSurplus : null;
    const gapSurplusPoints = Array.isArray(gapSurplusResult?.gapSurplusPoints)
      ? gapSurplusResult.gapSurplusPoints
      : [];
    const chartModelResult = isPlainObject(result?.chartModel) ? result.chartModel : null;
    const firstGapSurplusPoint = gapSurplusPoints[0] || null;
    const lastGapSurplusPoint = gapSurplusPoints[gapSurplusPoints.length - 1] || null;
    const gapSurplusUnavailable = !gapSurplusPoints.length;
    const componentRows = getComponentRows(firstPoint);
    const warningCount = (Array.isArray(result.warnings) ? result.warnings.length : 0)
      + (Array.isArray(resourceResult?.warnings) ? resourceResult.warnings.length : 0)
      + (Array.isArray(existingCoverageResult?.warnings) ? existingCoverageResult.warnings.length : 0)
      + (Array.isArray(gapSurplusResult?.warnings) ? gapSurplusResult.warnings.length : 0)
      + (Array.isArray(chartModelResult?.warnings) ? chartModelResult.warnings.length : 0);
    const dataGapCount = (Array.isArray(result.dataGaps) ? result.dataGaps.length : 0)
      + (Array.isArray(resourceResult?.dataGaps) ? resourceResult.dataGaps.length : 0)
      + (Array.isArray(existingCoverageResult?.dataGaps) ? existingCoverageResult.dataGaps.length : 0)
      + (Array.isArray(gapSurplusResult?.dataGaps) ? gapSurplusResult.dataGaps.length : 0)
      + (Array.isArray(chartModelResult?.dataGaps) ? chartModelResult.dataGaps.length : 0);
    const combinedWarnings = [
      ...(Array.isArray(result.warnings) ? result.warnings : []),
      ...(Array.isArray(resourceResult?.warnings) ? resourceResult.warnings : []),
      ...(Array.isArray(existingCoverageResult?.warnings) ? existingCoverageResult.warnings : []),
      ...(Array.isArray(gapSurplusResult?.warnings) ? gapSurplusResult.warnings : []),
      ...(Array.isArray(chartModelResult?.warnings) ? chartModelResult.warnings : [])
    ];
    const combinedDataGaps = [
      ...(Array.isArray(result.dataGaps) ? result.dataGaps : []),
      ...(Array.isArray(resourceResult?.dataGaps) ? resourceResult.dataGaps : []),
      ...(Array.isArray(existingCoverageResult?.dataGaps) ? existingCoverageResult.dataGaps : []),
      ...(Array.isArray(gapSurplusResult?.dataGaps) ? gapSurplusResult.dataGaps : []),
      ...(Array.isArray(chartModelResult?.dataGaps) ? chartModelResult.dataGaps : [])
    ];
    const existingCoverageIssueCount = (Number(existingCoverageResult?.trace?.skippedPolicyCount) || 0)
      + (Array.isArray(existingCoverageResult?.warnings) ? existingCoverageResult.warnings.length : 0)
      + (Array.isArray(existingCoverageResult?.dataGaps) ? existingCoverageResult.dataGaps.length : 0);
    const currentStatus = formatStatusLabel(firstGapSurplusPoint?.status);
    const currentStatusClass = getStatusClass(firstGapSurplusPoint?.status);
    const gapSurplusSummary = isPlainObject(gapSurplusResult?.summary) ? gapSurplusResult.summary : {};
    const projectionHorizonYears = clampProjectionHorizonYears(result?.projectionHorizonYears, result?.horizonYears);
    const scenarioSettings = isPlainObject(result?.assumptionsUsed?.coverageStrategyScenarioSettings)
      ? result.assumptionsUsed.coverageStrategyScenarioSettings
      : (isPlainObject(result?.componentModels?.coverageStrategyScenarioSettings)
        ? result.componentModels.coverageStrategyScenarioSettings
        : {});
    const educationResourceSpendingMode = getEducationResourceSpendingModeFromSettings(scenarioSettings);
    const educationPaymentScheduleMode = getEducationPaymentScheduleModeFromSettings(scenarioSettings);
    const projectedDependentTimingRows = Array.isArray(result?.projectedDependentTimingRows)
      ? result.projectedDependentTimingRows
      : getProjectedDependentTimingRowsFromSettings(scenarioSettings);
    const lastCalculatedLabel = formatScenarioLastCalculatedLabel(result?.lastCalculatedAt);

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
            <span><i class="coverage-need-timeline-legend-existing-coverage" aria-hidden="true"></i>Existing coverage</span>
            <span><i class="coverage-need-timeline-legend-remaining-exposure" aria-hidden="true"></i>Remaining exposure</span>
          </div>
        </div>
        <div class="coverage-strategy-workspace">
          <aside class="coverage-strategy-left-panel" aria-label="Current Coverage Strategy values">
            <section>
              <div class="coverage-need-timeline-status ${escapeHtml(currentStatusClass)}">
                <span>Current status</span>
                <strong>${escapeHtml(currentStatus)}</strong>
              </div>
            </section>
            <section>
              <div class="analysis-result-eyebrow">Current position</div>
              <ul class="analysis-result-list coverage-strategy-current-list">
                <li>
                  <span>Current remaining exposure</span>
                  <strong>${escapeHtml(firstGapSurplusPoint ? formatCurrency(firstGapSurplusPoint.remainingExposureAmount) : "Unavailable")}</strong>
                </li>
                <li>
                  <span>Current need</span>
                  <strong>${escapeHtml(formatCurrency(firstPoint.grossNeedAmount ?? firstPoint.needAmount))}</strong>
                </li>
                <li>
                  <span>Current eligible resources</span>
                  <strong>${escapeHtml(firstResourcePoint ? formatCurrency(firstResourcePoint.resourceAmount) : "Unavailable")}</strong>
                </li>
                <li>
                  <span>Current existing coverage</span>
                  <strong>${escapeHtml(formatCurrency(firstExistingCoveragePoint?.existingCoverageAmount || 0))}</strong>
                </li>
              </ul>
            </section>
          </aside>
          <main class="coverage-strategy-main-stage" aria-label="Coverage Strategy graph stage">
            <div class="coverage-need-timeline-chart coverage-strategy-chart-stage">
              ${renderTimelineSvg(chartModelResult)}
              <div class="coverage-need-timeline-chart-note">
                Dollar scale uses visible series max; gridlines shown for inspection.
              </div>
              ${resourceUnavailable ? `
                <div class="coverage-need-timeline-resource-unavailable">
                  Projected eligible resources unavailable from current source data.
                </div>
              ` : ""}
              ${gapSurplusUnavailable ? `
                <div class="coverage-need-timeline-resource-unavailable">
                  Remaining exposure unavailable from current source data.
                </div>
              ` : ""}
            </div>
          </main>
          <aside class="coverage-strategy-right-panel" aria-label="Coverage Strategy detail">
            <section>
              <div class="analysis-result-eyebrow">Planning answer</div>
              <ul class="analysis-result-list">
                <li>
                  <span>Current remaining exposure</span>
                  <strong>${escapeHtml(firstGapSurplusPoint ? formatCurrency(firstGapSurplusPoint.remainingExposureAmount) : "Unavailable")}</strong>
                </li>
                <li>
                  <span>Current surplus</span>
                  <strong>${escapeHtml(firstGapSurplusPoint ? formatCurrency(firstGapSurplusPoint.surplusAmount) : "Unavailable")}</strong>
                </li>
                <li>
                  <span>Total available now</span>
                  <strong>${escapeHtml(firstGapSurplusPoint ? formatCurrency(firstGapSurplusPoint.totalAvailableAmount) : "Unavailable")}</strong>
                </li>
              </ul>
            </section>
            <section>
              <div class="analysis-result-eyebrow">Projection detail</div>
              <ul class="analysis-result-list">
                <li>
                  <span>Final remaining exposure</span>
                  <strong>${escapeHtml(lastGapSurplusPoint ? formatCurrency(lastGapSurplusPoint.remainingExposureAmount) : "Unavailable")}</strong>
                </li>
                <li>
                  <span>Max remaining exposure</span>
                  <strong>${escapeHtml(gapSurplusUnavailable ? "Unavailable" : formatCurrency(gapSurplusSummary.maxRemainingExposure || 0))}</strong>
                </li>
                <li>
                  <span>First fully covered year</span>
                  <strong>${escapeHtml(formatYearValue(gapSurplusSummary.firstFullyCoveredYear))}</strong>
                </li>
                <li>
                  <span>First surplus year</span>
                  <strong>${escapeHtml(formatYearValue(gapSurplusSummary.firstSurplusYear))}</strong>
                </li>
                <li>
                  <span>Gap / surplus years</span>
                  <strong>${escapeHtml(formatCount(gapSurplusSummary.yearsWithGap || 0))} / ${escapeHtml(formatCount(gapSurplusSummary.yearsWithSurplus || 0))}</strong>
                </li>
                <li>
                  <span>Need points</span>
                  <strong>${escapeHtml(formatCount(needPoints.length))}</strong>
                </li>
                <li>
                  <span>Final need</span>
                  <strong>${escapeHtml(formatCurrency(lastPoint.grossNeedAmount ?? lastPoint.needAmount))}</strong>
                </li>
                <li>
                  <span>Final eligible resources</span>
                  <strong>${escapeHtml(lastResourcePoint ? formatCurrency(lastResourcePoint.resourceAmount) : "Unavailable")}</strong>
                </li>
                <li>
                  <span>Final existing coverage</span>
                  <strong>${escapeHtml(formatCurrency(lastExistingCoveragePoint?.existingCoverageAmount || 0))}</strong>
                </li>
                <li>
                  <span>Warnings / data gaps</span>
                  <strong>${escapeHtml(formatCount(warningCount + dataGapCount))}</strong>
                </li>
              </ul>
            </section>
            <section>
              <div class="analysis-result-eyebrow">Existing coverage</div>
              <ul class="analysis-result-list">
                <li>
                  <span>Included policies</span>
                  <strong>${escapeHtml(formatCount(existingCoverageResult?.trace?.includedLayerCount || 0))}</strong>
                </li>
                <li>
                  <span>Skipped or warned policies</span>
                  <strong>${escapeHtml(formatCount(existingCoverageIssueCount))}</strong>
                </li>
                <li>
                  <span>Current coverage</span>
                  <strong>${escapeHtml(formatCurrency(firstExistingCoveragePoint?.existingCoverageAmount || 0))}</strong>
                </li>
              </ul>
            </section>
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
          </aside>
        </div>
        <div class="coverage-strategy-scenario-tray is-compact-dock" aria-label="Scenario Planner">
          <div class="coverage-strategy-scenario-tray-header">
            <div class="coverage-strategy-scenario-tray-label">Scenario Planner</div>
            <div class="coverage-strategy-scenario-tabs" role="tablist" aria-label="Scenario tabs reserved for future scenario persistence">
              <button type="button" class="coverage-strategy-scenario-tab is-active" role="tab" aria-selected="true" disabled aria-disabled="true" data-scenario-reserved="true">Base Scenario</button>
              <button type="button" class="coverage-strategy-scenario-tab" role="tab" aria-selected="false" disabled aria-disabled="true" data-scenario-reserved="true">Stress Scenario</button>
              <button type="button" class="coverage-strategy-scenario-tab" role="tab" aria-selected="false" disabled aria-disabled="true" data-scenario-reserved="true">Best Case</button>
              <button type="button" class="coverage-strategy-scenario-tab is-new" disabled aria-disabled="true" data-scenario-reserved="true">+ New Scenario</button>
            </div>
            <div class="coverage-strategy-scenario-actions" aria-label="Scenario actions reserved for future persistence">
              <span class="coverage-strategy-scenario-status" data-coverage-strategy-last-calculated><span class="coverage-strategy-scenario-status-dot" aria-hidden="true"></span>${escapeHtml(lastCalculatedLabel)}</span>
              <button type="button" class="coverage-strategy-scenario-action is-secondary" disabled aria-disabled="true" data-scenario-reserved="true">${renderScenarioActionIcon("save")}<span>Save Scenario</span></button>
              <button type="button" class="coverage-strategy-scenario-action is-primary" disabled aria-disabled="true" data-scenario-reserved="true">${renderScenarioActionIcon("recalculate")}<span>Recalculate Plan</span></button>
            </div>
          </div>
          <div class="coverage-strategy-scenario-tray-grid">
            <div class="coverage-strategy-scenario-control is-horizon">
              <div class="coverage-strategy-horizon-control coverage-strategy-horizon-control-compact" aria-label="Projection horizon control">
                <label class="coverage-strategy-horizon-label" for="coverage-strategy-horizon-years">Projection horizon</label>
                <div class="coverage-strategy-horizon-value-row">
                  <input
                    class="coverage-strategy-horizon-number"
                    type="number"
                    min="${MIN_PROJECTION_HORIZON_YEARS}"
                    max="${MAX_PROJECTION_HORIZON_YEARS}"
                    step="1"
                    value="${escapeHtml(projectionHorizonYears)}"
                    aria-label="Projection horizon years"
                    data-coverage-strategy-horizon-number>
                  <output for="coverage-strategy-horizon-years" data-coverage-strategy-horizon-output>${escapeHtml(projectionHorizonYears)} years</output>
                </div>
                <input
                  class="coverage-strategy-horizon-range"
                  id="coverage-strategy-horizon-years"
                  type="range"
                  min="${MIN_PROJECTION_HORIZON_YEARS}"
                  max="${MAX_PROJECTION_HORIZON_YEARS}"
                  step="1"
                  value="${escapeHtml(projectionHorizonYears)}"
                  data-coverage-strategy-horizon-input>
                <div class="coverage-strategy-horizon-range-labels" aria-hidden="true">
                  <span>${escapeHtml(MIN_PROJECTION_HORIZON_YEARS)}</span>
                  <span>${escapeHtml(MAX_PROJECTION_HORIZON_YEARS)}</span>
                </div>
              </div>
            </div>
            <div class="coverage-strategy-scenario-control is-education-resources">
              <span class="coverage-strategy-scenario-control-label">Education resources</span>
              <div class="coverage-strategy-segmented-toggle" role="radiogroup" aria-label="Education resource spending mode">
                <label class="coverage-strategy-segmented-option">
                  <input
                    type="radio"
                    name="coverage-strategy-education-resource-spending"
                    value="off"
                    data-coverage-strategy-education-resource-spending
                    ${educationResourceSpendingMode === "off" ? "checked" : ""}>
                  <span>Off</span>
                </label>
                <label class="coverage-strategy-segmented-option">
                  <input
                    type="radio"
                    name="coverage-strategy-education-resource-spending"
                    value="educationSavingsOnly"
                    data-coverage-strategy-education-resource-spending
                    ${educationResourceSpendingMode === "educationSavingsOnly" ? "checked" : ""}>
                  <span>Savings</span>
                </label>
              </div>
            </div>
            <div class="coverage-strategy-scenario-control is-education-schedule">
              <span class="coverage-strategy-scenario-control-label">Education schedule</span>
              <div class="coverage-strategy-segmented-toggle" role="radiogroup" aria-label="Education payment schedule">
                <label class="coverage-strategy-segmented-option">
                  <input
                    type="radio"
                    name="coverage-strategy-education-payment-schedule"
                    value="fourYearAnnual"
                    data-coverage-strategy-education-payment-schedule
                    ${educationPaymentScheduleMode === "fourYearAnnual" ? "checked" : ""}>
                  <span>4-year</span>
                </label>
                <label class="coverage-strategy-segmented-option">
                  <input
                    type="radio"
                    name="coverage-strategy-education-payment-schedule"
                    value="lumpSumAtStart"
                    data-coverage-strategy-education-payment-schedule
                    ${educationPaymentScheduleMode === "lumpSumAtStart" ? "checked" : ""}>
                  <span>Lump sum</span>
                </label>
              </div>
            </div>
            ${renderProjectedDependentTimingControls(projectedDependentTimingRows)}
          </div>
          <div class="coverage-strategy-scenario-footer">
            <button type="button" class="coverage-strategy-diagnostic-export-button" data-coverage-strategy-diagnostic-export>
              Export Diagnostic Report
            </button>
          </div>
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
    const buildCoverageStrategyGapSurplus = lensAnalysis.buildCoverageStrategyGapSurplus;
    const buildCoverageStrategyTimelineChartModel = lensAnalysis.buildCoverageStrategyTimelineChartModel;
    const exportCoverageStrategyDiagnosticPdf = lensAnalysis.exportCoverageStrategyDiagnosticPdf;
    const resolveCoverageStrategyScenarioSettings = lensAnalysis.resolveCoverageStrategyScenarioSettings;
    let currentDiagnosticExportContext = null;

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
      const protectionModelingData = isPlainObject(protectionModelingPayload?.data)
        ? protectionModelingPayload.data
        : {};
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
      const valuationDate = needsResult?.assumptions?.valuationDate;
      const initialCoverageStrategyScenarioSettings = typeof resolveCoverageStrategyScenarioSettings === "function"
        ? resolveCoverageStrategyScenarioSettings({
            profileRecord,
            analysisSettings: methodSettings.needsAnalysisSettings,
            savedScenarioSettings: profileRecord.coverageStrategyScenarioSettings,
            options: {
              caller: "coverage-strategy-page"
            }
          })
        : null;
      let runtimeScenarioSettings = {
        education: {
          educationPaymentScheduleMode: getEducationPaymentScheduleModeFromSettings(initialCoverageStrategyScenarioSettings),
          educationResourceSpendingMode: getEducationResourceSpendingModeFromSettings(initialCoverageStrategyScenarioSettings),
          useEducationSavingsOffset: getEducationResourceSpendingModeFromSettings(initialCoverageStrategyScenarioSettings)
            === "educationSavingsOnly",
          projectedDependentTimingRows: buildProjectedDependentTimingRows(
            builderResult.lensModel,
            getProjectedDependentTimingRowsFromSettings(initialCoverageStrategyScenarioSettings),
            valuationDate
          )
        }
      };
      const clientDateOfBirth = builderResult.lensModel?.profileFacts?.clientDateOfBirth || profileRecord.dateOfBirth;
      const age110Horizon = resolveAge110Horizon({
        clientDateOfBirth,
        valuationDate
      });
      let selectedProjectionHorizonYears = resolveDefaultProjectionHorizon(age110Horizon);
      let horizonNumberInputCommitTimer = null;

      function clearScheduledHorizonNumberCommit() {
        if (horizonNumberInputCommitTimer) {
          clearTimeout(horizonNumberInputCommitTimer);
          horizonNumberInputCommitTimer = null;
        }
      }

      function getProjectionHorizonControls() {
        return {
          rangeInput: host.querySelector("[data-coverage-strategy-horizon-input]"),
          numberInput: host.querySelector("[data-coverage-strategy-horizon-number]"),
          output: host.querySelector("[data-coverage-strategy-horizon-output]")
        };
      }

      function syncProjectionHorizonControls(horizonYears, options = {}) {
        const safeValue = clampProjectionHorizonYears(horizonYears, selectedProjectionHorizonYears);
        const { rangeInput, numberInput, output } = getProjectionHorizonControls();
        if (rangeInput && options.skipRangeInput !== true) {
          rangeInput.value = String(safeValue);
        }
        if (numberInput && options.skipNumberInput !== true) {
          numberInput.value = String(safeValue);
        }
        if (numberInput) {
          numberInput.setAttribute("aria-invalid", "false");
        }
        if (output) {
          output.textContent = `${safeValue} years`;
        }
        return safeValue;
      }

      function parseProjectionHorizonInputValue(value) {
        const rawValue = String(value ?? "").trim();
        if (!rawValue) {
          return null;
        }
        const parsed = Number(rawValue);
        if (!Number.isFinite(parsed)) {
          return null;
        }
        return clampProjectionHorizonYears(parsed, selectedProjectionHorizonYears);
      }

      function commitProjectionHorizonValue(value) {
        clearScheduledHorizonNumberCommit();
        const parsedValue = parseProjectionHorizonInputValue(value);
        const safeValue = parsedValue == null
          ? selectedProjectionHorizonYears
          : parsedValue;
        syncProjectionHorizonControls(safeValue);
        buildAndRenderCoverageStrategy(safeValue);
      }

      function scheduleProjectionHorizonNumberCommit(target) {
        clearScheduledHorizonNumberCommit();
        horizonNumberInputCommitTimer = setTimeout(function () {
          if (!target?.isConnected) {
            return;
          }
          commitProjectionHorizonValue(target.value);
        }, HORIZON_NUMBER_INPUT_COMMIT_DELAY_MS);
      }

      function buildAndRenderCoverageStrategy(projectionHorizonYears) {
        clearScheduledHorizonNumberCommit();
        const safeProjectionHorizonYears = clampProjectionHorizonYears(projectionHorizonYears, selectedProjectionHorizonYears);
        selectedProjectionHorizonYears = safeProjectionHorizonYears;
        runtimeScenarioSettings = {
          ...runtimeScenarioSettings,
          education: {
            ...(isPlainObject(runtimeScenarioSettings.education) ? runtimeScenarioSettings.education : {}),
            projectedDependentTimingRows: buildProjectedDependentTimingRows(
              builderResult.lensModel,
              getProjectedDependentTimingRowsFromSettings(runtimeScenarioSettings),
              valuationDate
            )
          }
        };
        const coverageStrategyScenarioSettings = typeof resolveCoverageStrategyScenarioSettings === "function"
          ? resolveCoverageStrategyScenarioSettings({
              profileRecord,
              analysisSettings: methodSettings.needsAnalysisSettings,
              savedScenarioSettings: profileRecord.coverageStrategyScenarioSettings,
              runtimeScenarioSettings,
              options: {
                caller: "coverage-strategy-page-runtime"
              }
            })
          : initialCoverageStrategyScenarioSettings;
        const projectedDependentTimingRows = getProjectedDependentTimingRowsFromSettings(coverageStrategyScenarioSettings);
        const projectedDependentBirthYearControlVisible = projectedDependentTimingRows.length > 0;
        const needLine = buildCoverageStrategyNeedLine({
          lensModel: builderResult.lensModel,
          needsResult,
          analysisSettings: methodSettings.needsAnalysisSettings,
          profileRecord,
          coverageStrategyScenarioSettings,
          valuationDate,
          horizonYears: safeProjectionHorizonYears
        });
        const resourceLine = typeof buildCoverageStrategyResourceLine === "function"
          ? buildCoverageStrategyResourceLine({
              lensModel: builderResult.lensModel,
              analysisSettings: profileRecord.analysisSettings,
              needPoints: needLine.needPoints,
              valuationDate: needLine.valuationDate || valuationDate,
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
        const existingCoverageLine = buildExistingCoverageLine({
          profileRecord,
          needPoints: needLine.needPoints,
          valuationDate: needLine.valuationDate || valuationDate,
          clientDateOfBirth,
          defaultGroupCoverageEndAge: profileRecord.analysisSettings?.defaultGroupCoverageEndAge
        });
        const gapSurplus = typeof buildCoverageStrategyGapSurplus === "function"
          ? buildCoverageStrategyGapSurplus({
              needPoints: needLine.needPoints,
              resourcePoints: getRenderableResourcePoints(resourceLine),
              existingCoveragePoints: existingCoverageLine.coveragePoints,
              existingCoverageLayers: existingCoverageLine.layers,
              valuationDate: needLine.valuationDate || valuationDate
            })
          : {
              status: "partial",
              gapSurplusPoints: [],
              warnings: [],
              dataGaps: [
                {
                  code: "coverage-strategy-gap-surplus-composer-unavailable",
                  message: "Remaining exposure is unavailable because the gap/surplus composer did not load."
                }
              ]
            };
        const chartModel = typeof buildCoverageStrategyTimelineChartModel === "function"
          ? buildCoverageStrategyTimelineChartModel({
              needPoints: needLine.needPoints,
              resourcePoints: getRenderableResourcePoints(resourceLine),
              existingCoveragePoints: existingCoverageLine.coveragePoints,
              gapSurplusPoints: gapSurplus.gapSurplusPoints
            })
          : {
              series: [],
              warnings: [],
              dataGaps: [
                {
                  code: "coverage-strategy-chart-model-unavailable",
                  message: "Coverage Strategy chart model is unavailable."
                }
              ]
            };
        const calculationCompletedAt = new Date();

        currentDiagnosticExportContext = {
          profileRecord,
          protectionModelingPayload,
          protectionModelingData,
          builderResult,
          lensModel: builderResult.lensModel,
          methodSettings,
          needsResult,
          needLine,
          resourceLine,
          existingCoverageLine,
          gapSurplus,
          chartModel,
          coverageStrategyScenarioSettings,
          visibleScenarioControls: {
            projectionHorizon: true,
            educationResourceSpendingMode: true,
            educationResourceSpending: true,
            educationPaymentScheduleMode: true,
            educationPaymentSchedule: true,
            projectedDependentBirthYear: projectedDependentBirthYearControlVisible,
            diagnosticExport: true
          },
          projectionHorizonYears: safeProjectionHorizonYears,
          lastCalculatedAt: calculationCompletedAt.toISOString(),
          age110Horizon,
          valuationDate,
          route: window.location.href
        };

        renderNeedTimeline(host, {
          ...needLine,
          projectionHorizonYears: safeProjectionHorizonYears,
          resourceLine,
          existingCoverageLine,
          gapSurplus,
          chartModel,
          projectedDependentTimingRows,
          lastCalculatedAt: calculationCompletedAt,
          warnings: [
            ...(Array.isArray(builderResult.warnings) ? builderResult.warnings : []),
            ...(Array.isArray(methodSettings.warnings) ? methodSettings.warnings : []),
            ...(age110Horizon.warning ? [age110Horizon.warning] : []),
            ...(Array.isArray(needLine.warnings) ? needLine.warnings : [])
          ]
        });
      }

      host.addEventListener("input", function (event) {
        const target = event.target;
        if (target?.matches?.("[data-coverage-strategy-horizon-input]")) {
          const safeValue = syncProjectionHorizonControls(target.value, { skipRangeInput: true });
          selectedProjectionHorizonYears = safeValue;
          return;
        }
        if (!target?.matches?.("[data-coverage-strategy-horizon-number]")) {
          return;
        }
        const parsedValue = parseProjectionHorizonInputValue(target.value);
        if (parsedValue == null) {
          clearScheduledHorizonNumberCommit();
          target.setAttribute("aria-invalid", target.value.trim() ? "true" : "false");
          return;
        }
        syncProjectionHorizonControls(parsedValue, { skipNumberInput: true });
        if (String(target.value ?? "").trim().length >= 2) {
          scheduleProjectionHorizonNumberCommit(target);
        } else {
          clearScheduledHorizonNumberCommit();
        }
      });

      host.addEventListener("change", function (event) {
        const target = event.target;
        if (!target?.matches?.("[data-coverage-strategy-horizon-input], [data-coverage-strategy-horizon-number]")) {
          return;
        }
        commitProjectionHorizonValue(target.value);
      });

      host.addEventListener("focusout", function (event) {
        const target = event.target;
        if (!target?.matches?.("[data-coverage-strategy-horizon-number]")) {
          return;
        }
        commitProjectionHorizonValue(target.value);
      });

      host.addEventListener("keydown", function (event) {
        const target = event.target;
        if (!target?.matches?.("[data-coverage-strategy-horizon-number]") || event.key !== "Enter") {
          return;
        }
        event.preventDefault();
        commitProjectionHorizonValue(target.value);
      });

      host.addEventListener("change", function (event) {
        const target = event.target;
        if (!target?.matches?.("[data-coverage-strategy-education-resource-spending]")) {
          return;
        }
        const mode = target.value === "educationSavingsOnly" ? "educationSavingsOnly" : "off";
        runtimeScenarioSettings = {
          ...runtimeScenarioSettings,
          education: {
            ...(isPlainObject(runtimeScenarioSettings.education) ? runtimeScenarioSettings.education : {}),
            educationResourceSpendingMode: mode,
            useEducationSavingsOffset: mode === "educationSavingsOnly"
          }
        };
        buildAndRenderCoverageStrategy(selectedProjectionHorizonYears);
      });

      host.addEventListener("change", function (event) {
        const target = event.target;
        if (!target?.matches?.("[data-coverage-strategy-education-payment-schedule]")) {
          return;
        }
        runtimeScenarioSettings = {
          ...runtimeScenarioSettings,
          education: {
            ...(isPlainObject(runtimeScenarioSettings.education) ? runtimeScenarioSettings.education : {}),
            educationPaymentScheduleMode: target.value === "lumpSumAtStart"
              ? "lumpSumAtStart"
              : "fourYearAnnual"
          }
        };
        buildAndRenderCoverageStrategy(selectedProjectionHorizonYears);
      });

      host.addEventListener("change", function (event) {
        const target = event.target;
        if (!target?.matches?.("[data-coverage-strategy-projected-dependent-birth-year]")) {
          return;
        }
        const rowId = String(target.getAttribute("data-projected-dependent-id") || "").trim();
        if (!rowId) {
          return;
        }
        const existingRows = buildProjectedDependentTimingRows(
          builderResult.lensModel,
          getProjectedDependentTimingRowsFromSettings(runtimeScenarioSettings),
          valuationDate
        );
        const validation = validateProjectedDependentBirthYear(target.value, valuationDate);
        runtimeScenarioSettings = {
          ...runtimeScenarioSettings,
          education: {
            ...(isPlainObject(runtimeScenarioSettings.education) ? runtimeScenarioSettings.education : {}),
            projectedDependentTimingRows: existingRows.map(function (row) {
              if (row.id !== rowId) {
                return row;
              }
              return {
                ...row,
                timingMode: validation.expectedBirthYear != null
                  ? "expectedBirthYear"
                  : "untimedKeepThroughHorizon",
                expectedBirthYear: validation.expectedBirthYear,
                rawExpectedBirthYear: validation.rawExpectedBirthYear,
                validationStatus: validation.validationStatus,
                validationCode: validation.validationCode
              };
            })
          }
        };
        buildAndRenderCoverageStrategy(selectedProjectionHorizonYears);
      });

      host.addEventListener("click", function (event) {
        const target = event.target;
        if (!target?.closest?.("[data-coverage-strategy-diagnostic-export]")) {
          return;
        }
        if (typeof exportCoverageStrategyDiagnosticPdf !== "function") {
          console.error("Coverage Strategy diagnostic export module is unavailable.");
          return;
        }
        exportCoverageStrategyDiagnosticPdf(currentDiagnosticExportContext || {
          profileRecord,
          protectionModelingPayload,
          protectionModelingData,
          builderResult,
          lensModel: builderResult.lensModel,
          methodSettings,
          needsResult,
          coverageStrategyScenarioSettings: currentDiagnosticExportContext?.coverageStrategyScenarioSettings
            || initialCoverageStrategyScenarioSettings,
          visibleScenarioControls: {
            projectionHorizon: true,
            educationResourceSpendingMode: true,
            educationResourceSpending: true,
            educationPaymentScheduleMode: true,
            educationPaymentSchedule: true,
            projectedDependentBirthYear: buildProjectedDependentTimingRows(
              builderResult.lensModel,
              getProjectedDependentTimingRowsFromSettings(runtimeScenarioSettings),
              valuationDate
            ).length > 0,
            diagnosticExport: true
          },
          projectionHorizonYears: selectedProjectionHorizonYears,
          age110Horizon,
          valuationDate,
          route: window.location.href
        });
      });

      buildAndRenderCoverageStrategy(selectedProjectionHorizonYears);
    } catch (error) {
      renderMissingState(host, "Need timeline unavailable", "Coverage need timeline could not be prepared from the saved LENS model.", []);
      console.error("Coverage Strategy need timeline failed", error);
    }
  }

  document.addEventListener("DOMContentLoaded", initializeCoverageStrategyPage);
})();
