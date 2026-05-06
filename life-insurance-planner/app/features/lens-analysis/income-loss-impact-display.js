(function (window) {
  const root = window.LensApp = window.LensApp || {};
  const lensAnalysis = root.lensAnalysis = root.lensAnalysis || {};

  const UNAVAILABLE_COPY = "Not available";
  const EMPTY_MESSAGE = "Not available until income and survivor inputs are completed.";
  const DEFAULT_PROJECTION_HORIZON_YEARS = 40;
  const MIN_PROJECTION_HORIZON_YEARS = 5;
  const MAX_PROJECTION_HORIZON_YEARS = 100;
  const RUNWAY_CHART_TOP_HEADROOM_RATIO = 0.18;
  const RUNWAY_CHART_BOTTOM_HEADROOM_RATIO = 0.08;
  const RUNWAY_CHART_PRE_DEATH_SEGMENT_RATIO = 0.28;
  const RUNWAY_CHART_PRE_DEATH_MIN_WIDTH = 220;
  const RUNWAY_CHART_PRE_DEATH_MAX_RATIO = 0.36;
  const RUNWAY_CHART_DEATH_EVENT_TOP_BUFFER = 500000;
  const RUNWAY_CHART_PRIMARY_LINE_STYLE = "fill: none; stroke: #141820; stroke-width: 4.8; stroke-linecap: round; stroke-linejoin: round; opacity: 1;";
  const MORTGAGE_TREATMENT_LABELS = Object.freeze({
    followAssumptions: "Follow Assumption Controls",
    payOffMortgage: "Pay off mortgage",
    continueMortgagePayments: "Continue mortgage payments"
  });
  let incomeImpactState = null;

  function isPlainObject(value) {
    return Boolean(value && typeof value === "object" && !Array.isArray(value));
  }

  function escapeHtml(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function toOptionalNumber(value) {
    if (value === "" || value == null) {
      return null;
    }

    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  }

  function getPath(source, path) {
    return String(path || "")
      .split(".")
      .filter(Boolean)
      .reduce(function (current, key) {
        return current && typeof current === "object" ? current[key] : undefined;
      }, source);
  }

  function formatCurrency(value) {
    const number = toOptionalNumber(value);
    if (number == null) {
      return UNAVAILABLE_COPY;
    }

    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 0
    }).format(number);
  }

  function formatDateOnly(date) {
    return [
      String(date.getFullYear()).padStart(4, "0"),
      String(date.getMonth() + 1).padStart(2, "0"),
      String(date.getDate()).padStart(2, "0")
    ].join("-");
  }

  function normalizeDateOnly(value) {
    if (value == null || value === "") {
      return "";
    }

    if (value instanceof Date && !Number.isNaN(value.getTime())) {
      return formatDateOnly(value);
    }

    const normalized = String(value).trim();
    const match = normalized.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) {
      return "";
    }

    const year = Number(match[1]);
    const monthIndex = Number(match[2]) - 1;
    const day = Number(match[3]);
    const parsed = new Date(year, monthIndex, day);
    if (
      Number.isNaN(parsed.getTime())
      || parsed.getFullYear() !== year
      || parsed.getMonth() !== monthIndex
      || parsed.getDate() !== day
    ) {
      return "";
    }

    return formatDateOnly(parsed);
  }

  function parseDateOnlyValue(value) {
    const normalized = normalizeDateOnly(value);
    if (!normalized) {
      return null;
    }

    const parts = normalized.split("-").map(Number);
    return new Date(parts[0], parts[1] - 1, parts[2]);
  }

  function calculateAge(dateOfBirth, asOfDate) {
    if (!dateOfBirth || !asOfDate) {
      return null;
    }

    let age = asOfDate.getFullYear() - dateOfBirth.getFullYear();
    const birthdayHasOccurred = asOfDate.getMonth() > dateOfBirth.getMonth()
      || (
        asOfDate.getMonth() === dateOfBirth.getMonth()
        && asOfDate.getDate() >= dateOfBirth.getDate()
      );
    if (!birthdayHasOccurred) {
      age -= 1;
    }

    return age >= 0 ? age : null;
  }

  function clampRoundedAge(value, minAge, maxAge) {
    const number = toOptionalNumber(value);
    const rounded = number == null ? minAge : Math.round(number);
    return Math.max(minAge, Math.min(maxAge, rounded));
  }

  function clampProjectionHorizonYears(value) {
    const number = toOptionalNumber(value);
    const rounded = number == null ? DEFAULT_PROJECTION_HORIZON_YEARS : Math.round(number);
    return Math.max(MIN_PROJECTION_HORIZON_YEARS, Math.min(MAX_PROJECTION_HORIZON_YEARS, rounded));
  }

  function normalizeMortgageTreatmentOverride(value) {
    const normalized = String(value || "").trim();
    return Object.prototype.hasOwnProperty.call(MORTGAGE_TREATMENT_LABELS, normalized)
      ? normalized
      : "followAssumptions";
  }

  function getMortgageTreatmentLabel(value) {
    const normalized = normalizeMortgageTreatmentOverride(value);
    return MORTGAGE_TREATMENT_LABELS[normalized];
  }

  function resolveDeathAgeControlState(lensModel, valuationDate) {
    const dateOfBirth = parseDateOnlyValue(getPath(lensModel, "profileFacts.clientDateOfBirth"));
    const asOfDate = parseDateOnlyValue(valuationDate);
    const currentAge = calculateAge(dateOfBirth, asOfDate);

    if (currentAge == null) {
      return {
        hasDateOfBirth: false,
        currentAge: null,
        minAge: null,
        maxAge: null,
        selectedDeathAge: null
      };
    }

    const maxAge = Math.max(currentAge, Math.min(100, currentAge + 40));
    return {
      hasDateOfBirth: true,
      currentAge,
      minAge: currentAge,
      maxAge,
      selectedDeathAge: currentAge
    };
  }

  function resolveTimelineValuationDate(profileRecord, lensModel) {
    const candidates = [
      getPath(lensModel, "treatedExistingCoverageOffset.metadata.valuationDate"),
      getPath(lensModel, "treatedExistingCoverageOffset.valuationDate"),
      getPath(profileRecord, "analysisSettings.valuationDate"),
      getPath(profileRecord, "analysisSettings.existingCoverageAssumptions.valuationDate"),
      getPath(profileRecord, "analysisSettings.existingCoverageAssumptions.asOfDate")
    ];

    for (let index = 0; index < candidates.length; index += 1) {
      const normalized = normalizeDateOnly(candidates[index]);
      if (normalized) {
        return normalized;
      }
    }

    return formatDateOnly(new Date());
  }

  function syncIncomeImpactWorkflowLinks() {
    const currentParams = new URLSearchParams(window.location.search);
    if (!Array.from(currentParams.keys()).length) {
      return;
    }

    Array.from(document.querySelectorAll("[data-income-impact-route-link]")).forEach(function (link) {
      const rawHref = link.getAttribute("href");
      if (!rawHref) {
        return;
      }

      const targetUrl = new URL(rawHref, window.location.href);
      currentParams.forEach(function (value, key) {
        if (!targetUrl.searchParams.has(key)) {
          targetUrl.searchParams.append(key, value);
        }
      });

      link.setAttribute(
        "href",
        `${targetUrl.pathname.split("/").pop()}${targetUrl.search}${targetUrl.hash}`
      );
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

  function renderEmptyState(host, title, message) {
    host.innerHTML = `
      <div class="income-impact-empty-state">
        <div class="section-label">Income Impact Review</div>
        <h2>${escapeHtml(title)}</h2>
        <p>${escapeHtml(message)}</p>
      </div>
    `;
  }

  function getDeathAgeControlElements() {
    const control = document.querySelector("[data-income-impact-death-age-control]");
    if (!control) {
      return null;
    }

    return {
      control,
      sliderRow: control.querySelector("[data-income-impact-death-age-slider-row]"),
      slider: control.querySelector("[data-income-impact-death-age-slider]"),
      ageValue: control.querySelector("[data-income-impact-death-age-value]") || document.querySelector("[data-income-impact-death-age-value]"),
      dateValue: control.querySelector("[data-income-impact-death-date-value]") || document.querySelector("[data-income-impact-death-date-value]"),
      warning: control.querySelector("[data-income-impact-death-age-warning]")
    };
  }

  function getScenarioBannerElements() {
    const banner = document.querySelector("[data-income-impact-scenario-banner]");
    if (!banner) {
      return null;
    }

    return {
      banner,
      toggle: banner.querySelector("[data-income-impact-scenario-toggle]"),
      content: banner.querySelector("[data-income-impact-scenario-content]"),
      projectionHorizon: banner.querySelector("[data-income-impact-projection-horizon]"),
      projectionHorizonValue: banner.querySelector("[data-income-impact-projection-horizon-value]"),
      mortgageTreatment: banner.querySelector("[data-income-impact-mortgage-treatment]"),
      mortgageTreatmentValue: banner.querySelector("[data-income-impact-mortgage-treatment-value]"),
      scenarioSummary: banner.querySelector("[data-income-impact-scenario-summary]")
    };
  }

  function updateDeathAgeControl(timelineResult, deathAgeState) {
    const elements = getDeathAgeControlElements();
    if (!elements) {
      return;
    }

    const {
      control,
      sliderRow,
      slider,
      ageValue,
      dateValue,
      warning
    } = elements;
    const state = isPlainObject(deathAgeState) ? deathAgeState : {};
    control.hidden = false;

    if (!state.hasDateOfBirth) {
      control.setAttribute("data-income-impact-death-age-status", "missing-dob");
      if (sliderRow) {
        sliderRow.hidden = true;
      }
      if (slider) {
        slider.disabled = true;
      }
      if (ageValue) {
        ageValue.textContent = UNAVAILABLE_COPY;
      }
      if (dateValue) {
        dateValue.textContent = UNAVAILABLE_COPY;
      }
      if (warning) {
        warning.hidden = false;
        warning.textContent = "Add insured date of birth to preview by age.";
      }
      return;
    }

    const selectedDeathAge = clampRoundedAge(state.selectedDeathAge, state.minAge, state.maxAge);
    control.setAttribute("data-income-impact-death-age-status", "available");
    if (sliderRow) {
      sliderRow.hidden = false;
    }
    if (slider) {
      slider.disabled = false;
      slider.min = String(state.minAge);
      slider.max = String(state.maxAge);
      slider.step = "1";
      slider.value = String(selectedDeathAge);
      slider.setAttribute("aria-valuetext", `Age ${selectedDeathAge}`);
    }
    if (ageValue) {
      ageValue.textContent = String(selectedDeathAge);
    }
    if (dateValue) {
      dateValue.textContent = timelineResult?.selectedDeath?.date || UNAVAILABLE_COPY;
    }
    if (warning) {
      warning.hidden = true;
      warning.textContent = "";
    }
  }

  function updateScenarioControls(timelineResult) {
    updateDeathAgeControl(timelineResult, incomeImpactState?.deathAgeState);

    const elements = getScenarioBannerElements();
    if (!elements) {
      return;
    }

    const scenarioState = isPlainObject(incomeImpactState?.scenarioState)
      ? incomeImpactState.scenarioState
      : {};
    const projectionHorizonYears = clampProjectionHorizonYears(scenarioState.projectionHorizonYears);
    const mortgageTreatmentOverride = normalizeMortgageTreatmentOverride(scenarioState.mortgageTreatmentOverride);
    const collapsed = scenarioState.bannerCollapsed === true;

    elements.banner.classList.toggle("is-collapsed", collapsed);
    elements.banner.setAttribute("data-income-impact-scenario-state", collapsed ? "collapsed" : "expanded");

    if (elements.toggle) {
      elements.toggle.setAttribute("aria-expanded", String(!collapsed));
      elements.toggle.textContent = collapsed ? "Show controls" : "Hide controls";
    }

    if (elements.content) {
      elements.content.hidden = collapsed;
    }

    if (elements.projectionHorizon) {
      elements.projectionHorizon.min = String(MIN_PROJECTION_HORIZON_YEARS);
      elements.projectionHorizon.max = String(MAX_PROJECTION_HORIZON_YEARS);
      elements.projectionHorizon.step = "1";
      elements.projectionHorizon.value = String(projectionHorizonYears);
      elements.projectionHorizon.setAttribute("aria-valuetext", `${projectionHorizonYears} years`);
    }

    if (elements.projectionHorizonValue) {
      elements.projectionHorizonValue.textContent = `${projectionHorizonYears} years`;
    }

    if (elements.mortgageTreatment) {
      elements.mortgageTreatment.value = mortgageTreatmentOverride;
    }

    if (elements.mortgageTreatmentValue) {
      elements.mortgageTreatmentValue.textContent = getMortgageTreatmentLabel(mortgageTreatmentOverride);
    }

    if (elements.scenarioSummary) {
      elements.scenarioSummary.setAttribute("data-income-impact-mortgage-treatment-label", getMortgageTreatmentLabel(mortgageTreatmentOverride));
    }
  }

  function findSummaryCard(timelineResult, id) {
    const summaryCards = Array.isArray(timelineResult?.summaryCards) ? timelineResult.summaryCards : [];
    return summaryCards.find(function (card) {
      return card?.id === id;
    }) || null;
  }

  function getFinancialRunway(timelineResult) {
    return isPlainObject(timelineResult?.financialRunway) ? timelineResult.financialRunway : {};
  }

  function formatYearsMonthsFromRunway(runway, fallbackValue) {
    const years = toOptionalNumber(runway?.yearsOfSecurity);
    const months = toOptionalNumber(runway?.monthsOfSecurity);
    if (years != null && months != null) {
      return `${years} ${years === 1 ? "year" : "years"} ${months} ${months === 1 ? "month" : "months"}`;
    }
    return fallbackValue || UNAVAILABLE_COPY;
  }

  function normalizeRunwayStatus(status) {
    const normalized = String(status || "").trim();
    if (normalized === "available") {
      return "complete";
    }
    if (normalized === "notAvailable") {
      return "not-available";
    }
    if (normalized === "noShortfall") {
      return "no-shortfall";
    }
    return normalized || "not-available";
  }

  function findRunwayReason(warnings, dataGaps) {
    return (
      warnings.find(function (warning) {
        const code = String(warning?.code || "");
        const message = String(warning?.message || "");
        return code.includes("annual")
          || code.includes("resources")
          || code.includes("partial")
          || message.includes("Years of Financial Security")
          || message.includes("Financial runway");
      })?.message
      || dataGaps[0]?.label
      || "Add annual household need and at least one resource bucket to calculate this preview."
    );
  }

  function renderFinancialSecurityCard(timelineResult) {
    const card = findSummaryCard(timelineResult, "yearsOfFinancialSecurity");
    const runway = getFinancialRunway(timelineResult);
    const status = normalizeRunwayStatus(runway.status || card?.status);
    const computedDisplayValue = formatYearsMonthsFromRunway(runway, card?.displayValue);
    const displayValue = status === "no-shortfall"
      ? "No shortfall identified"
      : (status === "partial-estimate"
        ? "Partial runway estimate"
        : (status === "complete" ? computedDisplayValue : "Runway estimate unavailable"));
    const warnings = Array.isArray(runway.warnings) ? runway.warnings : (Array.isArray(timelineResult?.warnings) ? timelineResult.warnings : []);
    const dataGaps = Array.isArray(runway.dataGaps) ? runway.dataGaps : (Array.isArray(timelineResult?.dataGaps) ? timelineResult.dataGaps : []);
    const unavailableReason = status === "complete"
      ? ""
      : (status === "partial-estimate"
        ? `This preview is using the facts currently available. Add the missing items below to improve the estimate. Current estimate: ${computedDisplayValue}.`
        : findRunwayReason(warnings, dataGaps));

    return `
      <article class="income-impact-card income-impact-card--wide" data-income-impact-financial-security-card data-income-impact-summary-card-id="yearsOfFinancialSecurity" data-income-impact-summary-status="${escapeHtml(status)}">
        <div class="income-impact-card-header">
          <h2>Years of Financial Security</h2>
          <p>Fact-based runway estimate from linked profile and Protection Modeling information. It does not change the LENS recommendation.</p>
        </div>
        <strong class="income-impact-financial-security-value" data-income-impact-financial-security-value data-income-impact-helper-summary-card="yearsOfFinancialSecurity">${escapeHtml(displayValue)}</strong>
        <p data-income-impact-financial-security-explanation>Existing coverage + available assets, less immediate obligations, divided by estimated annual household shortfall.</p>
        ${unavailableReason ? `<p data-income-impact-financial-security-reason>${escapeHtml(unavailableReason)}</p>` : ""}
      </article>
    `;
  }

  function renderRunwayMetricCard(id, title, value, description, status) {
    return `
      <article class="income-impact-card" data-income-impact-runway-metric-card="${escapeHtml(id)}" data-income-impact-runway-metric-status="${escapeHtml(status || "notAvailable")}">
        <div class="income-impact-card-header">
          <h3>${escapeHtml(title)}</h3>
          <p>${escapeHtml(description)}</p>
        </div>
        <strong data-income-impact-runway-metric-value="${escapeHtml(id)}">${escapeHtml(formatCurrency(value))}</strong>
      </article>
    `;
  }

  function renderFinancialRunwayCards(timelineResult) {
    const runway = getFinancialRunway(timelineResult);
    return `
      ${renderRunwayMetricCard(
        "immediateResources",
        "Immediate Money Available",
        runway.startingResources,
        "Existing coverage plus available assets at the selected death date.",
        runway.startingResources == null ? "notAvailable" : "available"
      )}
      ${renderRunwayMetricCard(
        "immediateObligations",
        "Immediate Obligations",
        runway.immediateObligations,
        "Final expenses, transition needs, and debt payoff obligations where available.",
        runway.immediateObligations == null ? "notAvailable" : "available"
      )}
      ${renderRunwayMetricCard(
        "annualShortfall",
        "Annual Household Shortfall",
        runway.annualShortfall,
        "Annual household need less survivor income.",
        runway.annualShortfall == null ? "notAvailable" : (runway.annualShortfall <= 0 ? "no-shortfall" : "available")
      )}
    `;
  }

  function getTimelineEvents(timelineResult) {
    return (Array.isArray(timelineResult?.timelineEvents) ? timelineResult.timelineEvents : [])
      .filter(function (event) {
        return event && event.type;
      });
  }

  function formatTimelineAxisDate(value) {
    const date = parseDateOnlyValue(value);
    if (!date) {
      return "";
    }

    return new Intl.DateTimeFormat("en-US", {
      month: "short",
      year: "numeric"
    }).format(date);
  }

  function getTimelineEventAmountLabel(event) {
    const amount = toOptionalNumber(event?.amount);
    return amount == null ? "Fact-based event" : formatCurrency(amount);
  }

  function getRunwayPointBalance(point) {
    const endingBalance = toOptionalNumber(point?.endingBalance);
    if (endingBalance != null) {
      return endingBalance;
    }
    return toOptionalNumber(point?.startingBalance);
  }

  function getScenarioTimeline(timelineResult) {
    return isPlainObject(timelineResult?.scenarioTimeline) ? timelineResult.scenarioTimeline : {};
  }

  function getScenarioResourcePoints(timelineResult) {
    const scenarioTimeline = getScenarioTimeline(timelineResult);
    const resourceSeries = isPlainObject(scenarioTimeline.resourceSeries) ? scenarioTimeline.resourceSeries : {};
    return (Array.isArray(resourceSeries.points) ? resourceSeries.points : []).filter(isPlainObject);
  }

  function getPointRelativeMonthIndex(point) {
    const relativeMonthIndex = toOptionalNumber(point?.relativeMonthIndex);
    if (relativeMonthIndex != null) {
      return relativeMonthIndex;
    }

    const yearIndex = toOptionalNumber(point?.yearIndex);
    return yearIndex == null ? null : yearIndex * 12;
  }

  function getPointRelativeYear(point) {
    const relativeYear = toOptionalNumber(point?.relativeYear);
    if (relativeYear != null) {
      return relativeYear;
    }

    const relativeMonthIndex = getPointRelativeMonthIndex(point);
    if (relativeMonthIndex != null) {
      return relativeMonthIndex / 12;
    }

    return toOptionalNumber(point?.yearIndex);
  }

  function getScenarioPointDisplayBalance(point) {
    const displayedBalance = toOptionalNumber(point?.displayedBalance);
    if (displayedBalance != null) {
      return displayedBalance;
    }

    const fallbackBalance = getRunwayPointBalance(point);
    return fallbackBalance == null ? null : fallbackBalance;
  }

  function getScenarioPointPlotBalance(point) {
    return getScenarioPointDisplayBalance(point);
  }

  function getRunwayYearMarkerLabel(yearIndex) {
    if (yearIndex === 0) {
      return "Death";
    }
    if (yearIndex < 0) {
      return `${Math.abs(yearIndex)} yrs before`;
    }
    return `Year ${yearIndex}`;
  }

  function resolveScenarioAxisDomainMonths(scenarioTimeline) {
    const axis = isPlainObject(scenarioTimeline?.axis) ? scenarioTimeline.axis : {};
    const deathDate = axis.deathDate || scenarioTimeline?.scenario?.deathDate || "";
    const preDeathYears = toOptionalNumber(axis.preDeathYears);
    const minCandidates = [0];
    const maxCandidates = [12];
    const axisStartOffset = deathDate && axis.startDate
      ? calculateMonthOffset(deathDate, axis.startDate)
      : null;
    const axisEndOffset = deathDate && axis.endDate
      ? calculateMonthOffset(deathDate, axis.endDate)
      : null;

    if (axisStartOffset != null && axisStartOffset < 0) {
      minCandidates.push(axisStartOffset);
    }
    if (preDeathYears != null && preDeathYears > 0) {
      minCandidates.push(-Math.ceil(preDeathYears * 12));
    }
    if (axisEndOffset != null && axisEndOffset > 0) {
      maxCandidates.push(axisEndOffset);
    }

    return {
      minRelativeMonthIndex: Math.min(...minCandidates),
      maxRelativeMonthIndex: Math.max(...maxCandidates)
    };
  }

  function resolveRunwayChartMaxBalance(maxPlottedBalance, deathEventBalance) {
    const safeMaxPlottedBalance = Math.max(1, maxPlottedBalance || 0);
    const ratioHeadroomMax = safeMaxPlottedBalance / (1 - RUNWAY_CHART_TOP_HEADROOM_RATIO);
    const deathEventHeadroomMax = deathEventBalance == null
      ? 0
      : deathEventBalance + RUNWAY_CHART_DEATH_EVENT_TOP_BUFFER;
    return Math.max(ratioHeadroomMax, deathEventHeadroomMax);
  }

  function resolveRunwayChartMinBalance(minPlottedBalance) {
    const safeMinPlottedBalance = Math.min(0, minPlottedBalance || 0);
    if (safeMinPlottedBalance >= 0) {
      return 0;
    }

    return safeMinPlottedBalance / (1 - RUNWAY_CHART_BOTTOM_HEADROOM_RATIO);
  }

  function resolveRunwayChartPreDeathWidth(plotWidth, hasPreDeathDomain) {
    if (!hasPreDeathDomain) {
      return 0;
    }

    const maxWidth = plotWidth * RUNWAY_CHART_PRE_DEATH_MAX_RATIO;
    const preferredWidth = plotWidth * RUNWAY_CHART_PRE_DEATH_SEGMENT_RATIO;
    return Math.min(maxWidth, Math.max(RUNWAY_CHART_PRE_DEATH_MIN_WIDTH, preferredWidth));
  }

  function buildSvgPath(points) {
    return points.map(function (point, index) {
      return `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`;
    }).join(" ");
  }

  function buildSvgAreaPath(points, yBottom) {
    if (!points.length) {
      return "";
    }

    return `${buildSvgPath(points)} L ${points[points.length - 1].x} ${yBottom} L ${points[0].x} ${yBottom} Z`;
  }

  function getVisualPercentForRelativeMonthIndex(chartModel, relativeMonthIndex) {
    const visualScale = isPlainObject(chartModel?.visualScale) ? chartModel.visualScale : null;
    if (!visualScale) {
      const minRelativeMonthIndex = toOptionalNumber(chartModel?.minRelativeMonthIndex) ?? 0;
      const maxRelativeMonthIndex = toOptionalNumber(chartModel?.maxRelativeMonthIndex)
        ?? Math.max(12, (toOptionalNumber(chartModel?.maxYearIndex) || 1) * 12);
      const relativeMonthSpan = Math.max(1, maxRelativeMonthIndex - minRelativeMonthIndex);
      return ((relativeMonthIndex - minRelativeMonthIndex) / relativeMonthSpan) * 100;
    }

    const minRelativeMonthIndex = toOptionalNumber(visualScale.minRelativeMonthIndex) ?? 0;
    const maxRelativeMonthIndex = toOptionalNumber(visualScale.maxRelativeMonthIndex) ?? 12;
    const preDeathPercent = toOptionalNumber(visualScale.preDeathPercent) ?? 0;

    if (relativeMonthIndex < 0 && minRelativeMonthIndex < 0) {
      const preDeathSpan = Math.max(1, 0 - minRelativeMonthIndex);
      return ((relativeMonthIndex - minRelativeMonthIndex) / preDeathSpan) * preDeathPercent;
    }

    const postDeathSpan = Math.max(1, maxRelativeMonthIndex);
    return preDeathPercent + (relativeMonthIndex / postDeathSpan) * (100 - preDeathPercent);
  }

  function buildRunwayChartModel(timelineResult) {
    const runway = getFinancialRunway(timelineResult);
    const scenarioTimeline = getScenarioTimeline(timelineResult);
    const scenarioPoints = getScenarioResourcePoints(timelineResult);
    const usesScenarioSeries = scenarioPoints.length > 0;
    const points = usesScenarioSeries
      ? scenarioPoints
      : (Array.isArray(runway.projectionPoints) ? runway.projectionPoints : []);
    const width = 1040;
    const height = 680;
    const xStart = 82;
    const xEnd = width - 82;
    const yTop = 112;
    const yBottom = 535;
    const plotWidth = xEnd - xStart;
    const relativeMonths = points
      .map(getPointRelativeMonthIndex)
      .filter(function (value) {
        return value != null;
      });
    const fallbackMaxMonthIndex = Math.max(12, (runway.projectionYears || 1) * 12);
    const scenarioAxisDomain = usesScenarioSeries
      ? resolveScenarioAxisDomainMonths(scenarioTimeline)
      : null;
    const minRelativeMonthIndex = usesScenarioSeries
      ? Math.min(scenarioAxisDomain.minRelativeMonthIndex, 0, ...relativeMonths)
      : 0;
    const maxRelativeMonthIndex = usesScenarioSeries
      ? Math.max(scenarioAxisDomain.maxRelativeMonthIndex, 12, ...relativeMonths)
      : fallbackMaxMonthIndex;
    const hasPreDeathDomain = minRelativeMonthIndex < 0;
    const preDeathVisualWidth = resolveRunwayChartPreDeathWidth(plotWidth, hasPreDeathDomain);
    const deathX = hasPreDeathDomain ? xStart + preDeathVisualWidth : xStart;
    const preDeathMonthSpan = Math.max(1, 0 - minRelativeMonthIndex);
    const postDeathMonthSpan = Math.max(1, maxRelativeMonthIndex);
    const maxYearIndex = Math.max(1, Math.ceil(maxRelativeMonthIndex / 12));
    const balances = points
      .map(function (point) {
        return usesScenarioSeries ? getScenarioPointPlotBalance(point) : getRunwayPointBalance(point);
      })
      .filter(function (value) {
        return value != null;
      })
      .concat(toOptionalNumber(runway.netAvailableResources) || 0);
    const deathEventSourcePoint = usesScenarioSeries
      ? points.find(function (point) {
          return point?.id === "death-point" || point?.phase === "death";
        })
      : null;
    const deathEventBalance = deathEventSourcePoint
      ? getScenarioPointPlotBalance(deathEventSourcePoint)
      : toOptionalNumber(runway.netAvailableResources);
    const maxPlottedBalance = Math.max(1, ...balances);
    const minPlottedBalance = Math.min(0, ...balances);
    const maxBalance = resolveRunwayChartMaxBalance(maxPlottedBalance, deathEventBalance);
    const minBalance = resolveRunwayChartMinBalance(minPlottedBalance);
    const balanceSpan = Math.max(1, maxBalance - minBalance);
    const yFromBalance = function (balance) {
      return yBottom - (((balance - minBalance) / balanceSpan) * (yBottom - yTop));
    };
    const zeroY = yFromBalance(0);
    const xFromRelativeMonthIndex = function (relativeMonthIndex) {
      const safeMonthIndex = Math.max(minRelativeMonthIndex, Math.min(maxRelativeMonthIndex, relativeMonthIndex));
      if (hasPreDeathDomain && safeMonthIndex < 0) {
        return xStart + ((safeMonthIndex - minRelativeMonthIndex) / preDeathMonthSpan) * preDeathVisualWidth;
      }

      return deathX + (Math.max(0, safeMonthIndex) / postDeathMonthSpan) * (xEnd - deathX);
    };
    const chartPoints = points.map(function (point) {
      const relativeMonthIndex = getPointRelativeMonthIndex(point);
      const relativeYear = getPointRelativeYear(point);
      const rawBalance = getRunwayPointBalance(point);
      const displayedBalance = usesScenarioSeries ? getScenarioPointDisplayBalance(point) : rawBalance;
      const plotBalance = usesScenarioSeries ? getScenarioPointPlotBalance(point) : rawBalance;
      const safePlotBalance = plotBalance == null ? 0 : plotBalance;
      const safeRelativeMonthIndex = relativeMonthIndex == null ? 0 : relativeMonthIndex;
      const x = xFromRelativeMonthIndex(safeRelativeMonthIndex);
      const y = yFromBalance(safePlotBalance);
      return {
        ...point,
        yearIndex: point.yearIndex == null && relativeYear != null ? relativeYear : point.yearIndex,
        x: Math.round(x * 100) / 100,
        y: Math.round(y * 100) / 100,
        balance: rawBalance,
        displayedBalance: displayedBalance == null ? null : displayedBalance,
        plotBalance: plotBalance == null ? null : Math.round(plotBalance * 100) / 100,
        relativeMonthIndex,
        relativeYear
      };
    });
    const totalMonths = toOptionalNumber(runway.totalMonthsOfSecurity);
    const depletionMonthIndex = totalMonths == null
      ? (
          chartPoints.find(function (point) {
            return point.status === "depleted" || toOptionalNumber(point.accumulatedUnmetNeed) > 0;
          })?.relativeMonthIndex ?? null
        )
      : totalMonths;
    const depletionX = depletionMonthIndex == null
      ? null
      : xFromRelativeMonthIndex(depletionMonthIndex);
    const markerStep = maxYearIndex <= 20 ? 5 : 10;
    const minYearIndex = Math.floor(minRelativeMonthIndex / 12);
    const yearMarkerIndexes = [];
    if (minYearIndex < 0) {
      yearMarkerIndexes.push(minYearIndex);
    }
    yearMarkerIndexes.push(0);
    for (let markerIndex = markerStep; markerIndex < maxYearIndex; markerIndex += markerStep) {
      yearMarkerIndexes.push(markerIndex);
    }
    if (!yearMarkerIndexes.includes(maxYearIndex)) {
      yearMarkerIndexes.push(maxYearIndex);
    }
    const phaseDeathPoint = chartPoints.find(function (point) {
      return point.phase === "death";
    });
    const deathPoint = phaseDeathPoint || chartPoints.find(function (point) {
      return point.relativeMonthIndex === 0;
    });
    const preDeathRegion = minRelativeMonthIndex < 0
      ? {
          x: xStart,
          y: yTop,
          width: Math.max(0, deathX - xStart),
          height: yBottom - yTop
        }
      : null;
    const maxAccumulatedUnmetNeed = Math.max(0, ...chartPoints.map(function (point) {
      return toOptionalNumber(point.accumulatedUnmetNeed) || 0;
    }));
    const preDeathPathPoints = chartPoints.filter(function (point) {
      return point.phase === "preDeath";
    });
    const survivorRunwayPathPoints = usesScenarioSeries && preDeathPathPoints.length
      ? chartPoints.filter(function (point) {
          return point.phase !== "preDeath";
        })
      : chartPoints;
    const linePath = buildSvgPath(chartPoints);
    const preDeathPath = buildSvgPath(preDeathPathPoints);
    const survivorRunwayPath = buildSvgPath(survivorRunwayPathPoints);
    const survivorRunwayAreaPath = buildSvgAreaPath(survivorRunwayPathPoints, zeroY);
    const preDeathThresholdPoint = preDeathPathPoints.length
      ? preDeathPathPoints[preDeathPathPoints.length - 1]
      : null;
    const deathTransitionPath = preDeathThresholdPoint && phaseDeathPoint
      && Math.round(preDeathThresholdPoint.x * 100) === Math.round(phaseDeathPoint.x * 100)
      && Math.round(preDeathThresholdPoint.y * 100) !== Math.round(phaseDeathPoint.y * 100)
      ? buildSvgPath([preDeathThresholdPoint, phaseDeathPoint])
      : "";

    return {
      width,
      height,
      xStart,
      xEnd,
      yTop,
      yBottom,
      maxBalance,
      minBalance,
      zeroY: Math.round(zeroY * 100) / 100,
      maxYearIndex,
      minRelativeMonthIndex,
      maxRelativeMonthIndex,
      visualScale: {
        minRelativeMonthIndex,
        maxRelativeMonthIndex,
        preDeathWidth: Math.round(preDeathVisualWidth * 100) / 100,
        preDeathPercent: plotWidth > 0 ? Math.round((preDeathVisualWidth / plotWidth) * 10000) / 100 : 0
      },
      source: usesScenarioSeries ? "scenarioTimeline.resourceSeries.points" : "financialRunway.projectionPoints",
      fallbackUsed: !usesScenarioSeries,
      axisStart: scenarioTimeline.axis?.startDate || points[0]?.date || timelineResult?.selectedDeath?.date || "",
      axisEnd: scenarioTimeline.axis?.endDate || points[points.length - 1]?.date || "",
      points: chartPoints,
      linePath,
      preDeathPath,
      deathTransitionPath,
      survivorRunwayPath,
      postDeathPath: survivorRunwayPath,
      areaPath: survivorRunwayAreaPath || buildSvgAreaPath(chartPoints, zeroY),
      yearMarkers: yearMarkerIndexes.map(function (yearIndex) {
        const markerRelativeMonthIndex = yearIndex * 12;
        const x = xFromRelativeMonthIndex(markerRelativeMonthIndex);
        const point = chartPoints.find(function (candidate) {
          return Math.round(candidate.relativeMonthIndex || 0) === markerRelativeMonthIndex
            || Math.round(candidate.relativeYear || 0) === yearIndex;
        });
        return {
          yearIndex,
          x: Math.round(x * 100) / 100,
          date: point?.date || "",
          label: getRunwayYearMarkerLabel(yearIndex)
        };
      }),
      depletionPoint: depletionX == null || !runway.depletionDate
        ? null
        : {
            x: Math.round(depletionX * 100) / 100,
            y: Math.round(zeroY * 100) / 100,
            date: runway.depletionDate
          },
      deathPoint: {
        x: Math.round(deathX * 100) / 100,
        y: deathPoint?.y || yBottom,
        date: deathPoint?.date || timelineResult?.selectedDeath?.date || scenarioTimeline.axis?.deathDate || "",
        age: deathPoint?.age == null ? timelineResult?.selectedDeath?.age : deathPoint.age
      },
      preDeathRegion,
      maxAccumulatedUnmetNeed
    };
  }

  function calculateMonthOffset(startDateValue, endDateValue) {
    const startDate = parseDateOnlyValue(startDateValue);
    const endDate = parseDateOnlyValue(endDateValue);
    if (!startDate || !endDate) {
      return null;
    }

    const wholeMonths = (endDate.getFullYear() - startDate.getFullYear()) * 12
      + (endDate.getMonth() - startDate.getMonth());
    return endDate.getDate() < startDate.getDate() ? wholeMonths - 1 : wholeMonths;
  }

  function getPivotalMarkerMonthOffset(event, timelineResult) {
    const relativeMonthIndex = toOptionalNumber(event?.relativeMonthIndex);
    if (relativeMonthIndex != null) {
      return relativeMonthIndex;
    }

    const selectedDeathDate = timelineResult?.selectedDeath?.date
      || timelineResult?.scenarioTimeline?.scenario?.deathDate
      || timelineResult?.scenarioTimeline?.axis?.deathDate;
    if (!event?.date || !selectedDeathDate) {
      return null;
    }

    return calculateMonthOffset(selectedDeathDate, event.date);
  }

  function getPivotalMarkerLaneLabel(lane, kind) {
    if (kind === "stable") {
      return "Covered facts";
    }

    const normalized = String(lane || "").trim();
    if (normalized === "housing") {
      return "Housing";
    }
    if (normalized === "education") {
      return "Education";
    }
    if (normalized === "income") {
      return "Income";
    }
    if (normalized === "dataQuality") {
      return "Data quality";
    }
    return "Resources";
  }

  function normalizePivotalMarkerLane(lane, kind) {
    if (kind === "stable") {
      return "stable";
    }

    const normalized = String(lane || "").trim();
    return ["resources", "housing", "education", "income", "dataQuality"].includes(normalized)
      ? normalized
      : "resources";
  }

  function normalizePivotalMarkerSeverity(severity, kind) {
    if (kind === "stable") {
      return "stable";
    }

    const normalized = String(severity || "").trim();
    return ["critical", "at-risk", "caution"].includes(normalized) ? normalized : "caution";
  }

  function getPivotalMarkerLabel(event) {
    const rawLabel = String(event?.shortLabel || event?.label || "Event").trim();
    const withoutAmounts = rawLabel.replace(/\$\s?[\d,]+(?:\.\d+)?/g, "").trim();
    return withoutAmounts || "Event";
  }

  function getPivotalMarkerTimingLabel(marker) {
    if (marker.date && marker.age != null) {
      return `${marker.date} - Age ${marker.age}`;
    }
    if (marker.date) {
      return marker.date;
    }
    if (marker.relativeMonthIndex === 0) {
      return "At death";
    }
    if (marker.relativeMonthIndex != null) {
      return `Month ${marker.relativeMonthIndex}`;
    }
    return "Timing unavailable";
  }

  function buildPivotalMarkerModel(timelineResult, chartModel) {
    const events = getPivotalEvents(timelineResult);
    const minRelativeMonthIndex = toOptionalNumber(chartModel?.minRelativeMonthIndex) ?? 0;
    const maxRelativeMonthIndex = toOptionalNumber(chartModel?.maxRelativeMonthIndex)
      ?? Math.max(12, (toOptionalNumber(chartModel?.maxYearIndex) || 1) * 12);
    const markers = [];
    const undated = [];

    [
      { kind: "risk", events: events.risks },
      { kind: "stable", events: events.stable }
    ].forEach(function (group) {
      group.events.forEach(function (event) {
        const relativeMonthIndex = getPivotalMarkerMonthOffset(event, timelineResult);
        const lane = normalizePivotalMarkerLane(event?.lane, group.kind);
        const severity = normalizePivotalMarkerSeverity(event?.severity, group.kind);
        const marker = {
          id: String(event?.id || event?.type || `${group.kind}-${markers.length + undated.length}`),
          type: String(event?.type || event?.id || ""),
          kind: group.kind,
          lane,
          laneLabel: getPivotalMarkerLaneLabel(lane, group.kind),
          severity,
          label: getPivotalMarkerLabel(event),
          date: event?.date || "",
          age: event?.age,
          relativeMonthIndex,
          sourcePaths: Array.isArray(event?.sourcePaths) ? event.sourcePaths : []
        };

        if (relativeMonthIndex == null || !Number.isFinite(relativeMonthIndex)) {
          undated.push(marker);
          return;
        }

        const safeRelativeMonthIndex = Math.max(
          minRelativeMonthIndex,
          Math.min(maxRelativeMonthIndex, relativeMonthIndex)
        );
        const percent = getVisualPercentForRelativeMonthIndex(chartModel, safeRelativeMonthIndex);
        marker.percent = Math.round(percent * 100) / 100;
        marker.bucket = Math.round(percent / 6) * 6;
        markers.push(marker);
      });
    });

    const laneOrder = ["resources", "income", "housing", "education", "dataQuality", "stable"];
    const lanes = laneOrder.map(function (lane) {
      const laneMarkers = markers.filter(function (marker) {
        return marker.lane === lane;
      });
      if (!laneMarkers.length) {
        return null;
      }

      const bucketMap = new Map();
      laneMarkers.forEach(function (marker) {
        const key = String(marker.bucket);
        if (!bucketMap.has(key)) {
          bucketMap.set(key, []);
        }
        bucketMap.get(key).push(marker);
      });

      return {
        lane,
        label: getPivotalMarkerLaneLabel(lane, lane === "stable" ? "stable" : "risk"),
        kind: lane === "stable" ? "stable" : "risk",
        groups: Array.from(bucketMap.entries()).map(function (entry) {
          const groupMarkers = entry[1].sort(function (left, right) {
            return (left.relativeMonthIndex || 0) - (right.relativeMonthIndex || 0);
          });
          const groupPercent = groupMarkers.reduce(function (total, marker) {
            return total + marker.percent;
          }, 0) / groupMarkers.length;
          return {
            bucket: entry[0],
            percent: Math.round(groupPercent * 100) / 100,
            edge: groupPercent <= 4 ? "start" : (groupPercent >= 96 ? "end" : "middle"),
            markers: groupMarkers
          };
        }).sort(function (left, right) {
          return left.percent - right.percent;
        })
      };
    }).filter(Boolean);

    return {
      lanes,
      undated
    };
  }

  function renderPivotalMarker(marker) {
    return `
      <span
        class="income-impact-marker-pill"
        data-income-impact-timeline-marker
        data-income-impact-marker-kind="${escapeHtml(marker.kind)}"
        data-income-impact-marker-severity="${escapeHtml(marker.severity)}"
        data-income-impact-marker-lane="${escapeHtml(marker.lane)}"
        data-income-impact-marker-type="${escapeHtml(marker.type)}"
        data-income-impact-marker-month="${escapeHtml(marker.relativeMonthIndex == null ? "" : String(marker.relativeMonthIndex))}"
      >
        <span class="income-impact-marker-dot" aria-hidden="true"></span>
        <span>${escapeHtml(marker.label)}</span>
        <span class="sr-only">${escapeHtml(getPivotalMarkerTimingLabel(marker))}</span>
      </span>
    `;
  }

  function renderPivotalMarkerGroup(group) {
    return `
      <div
        class="income-impact-marker-group"
        data-income-impact-timeline-marker-group
        data-income-impact-marker-group-count="${escapeHtml(String(group.markers.length))}"
        data-income-impact-marker-edge="${escapeHtml(group.edge)}"
        style="left: ${group.percent}%"
      >
        ${group.markers.length > 1 ? `<span class="income-impact-marker-count">${escapeHtml(String(group.markers.length))}</span>` : ""}
        <div class="income-impact-marker-stack">
          ${group.markers.map(renderPivotalMarker).join("")}
        </div>
      </div>
    `;
  }

  function renderPivotalMarkerLanes(timelineResult, chartModel) {
    const markerModel = buildPivotalMarkerModel(timelineResult, chartModel);
    const hasMarkers = markerModel.lanes.length || markerModel.undated.length;
    if (!hasMarkers) {
      return "";
    }

    return `
      <div class="income-impact-marker-lanes" data-income-impact-timeline-marker-lanes aria-label="Income Impact scenario warning and coverage markers">
        ${markerModel.lanes.map(function (lane) {
          return `
            <div
              class="income-impact-marker-lane income-impact-marker-lane--${escapeHtml(lane.kind)}"
              data-income-impact-marker-lane="${escapeHtml(lane.lane)}"
              data-income-impact-marker-kind="${escapeHtml(lane.kind)}"
            >
              <span class="income-impact-marker-lane-label">${escapeHtml(lane.label)}</span>
              <div class="income-impact-marker-track">
                ${lane.groups.map(renderPivotalMarkerGroup).join("")}
              </div>
            </div>
          `;
        }).join("")}
        ${markerModel.undated.length ? `
          <div class="income-impact-marker-undated" data-income-impact-marker-undated>
            <span>Undated events</span>
            <div>
              ${markerModel.undated.map(renderPivotalMarker).join("")}
            </div>
          </div>
        ` : ""}
      </div>
    `;
  }

  function renderRunwayMarkerLegend() {
    return `
      <div class="income-impact-marker-legend" data-income-impact-marker-legend aria-label="Timeline marker legend">
        <span data-income-impact-marker-legend-item="critical"><i aria-hidden="true"></i>Critical</span>
        <span data-income-impact-marker-legend-item="at-risk"><i aria-hidden="true"></i>At Risk</span>
        <span data-income-impact-marker-legend-item="caution"><i aria-hidden="true"></i>Caution</span>
        <span data-income-impact-marker-legend-item="covered"><i aria-hidden="true"></i>Covered</span>
      </div>
    `;
  }

  function renderFinancialRunwayChart(timelineResult) {
    const runway = getFinancialRunway(timelineResult);
    const status = normalizeRunwayStatus(runway.status);
    const model = buildRunwayChartModel(timelineResult);
    if (!model.points.length) {
      const warnings = Array.isArray(runway.warnings) ? runway.warnings : (Array.isArray(timelineResult?.warnings) ? timelineResult.warnings : []);
      const dataGaps = Array.isArray(runway.dataGaps) ? runway.dataGaps : (Array.isArray(timelineResult?.dataGaps) ? timelineResult.dataGaps : []);
      return `
        <div class="income-impact-empty-inline" data-income-impact-visual-timeline data-income-impact-financial-runway data-income-impact-runway-status="${escapeHtml(status)}">
          <strong>Runway estimate unavailable</strong>
          <span>${escapeHtml(findRunwayReason(warnings, dataGaps))}</span>
        </div>
      `;
    }

    const startLabel = runway.netAvailableResources == null
      ? UNAVAILABLE_COPY
      : formatCurrency(runway.netAvailableResources);
    const startingResourcesLabel = runway.startingResources == null
      ? UNAVAILABLE_COPY
      : formatCurrency(runway.startingResources);
    const obligationsLabel = runway.immediateObligations == null
      ? UNAVAILABLE_COPY
      : formatCurrency(runway.immediateObligations);
    const annualShortfallLabel = runway.annualShortfall == null
      ? UNAVAILABLE_COPY
      : formatCurrency(runway.annualShortfall);
    const statusNote = status === "partial-estimate"
      ? "Partial runway estimate. This preview is using the facts currently available. Add the missing items below to improve the estimate."
      : (status === "not-available"
        ? "Runway estimate unavailable. Add the missing items below to calculate this preview."
        : "");
    const chartSourceNote = model.fallbackUsed
      ? "Scenario timeline points are unavailable, so this chart is using the prior runway projection as a fallback."
      : "";
    const depletionLabel = status === "no-shortfall"
      ? "No depletion projected from annual shortfall in this preview."
      : (status === "partial-estimate"
        ? (runway.depletionDate ? `Partial depletion estimate: ${runway.depletionDate}` : "Partial depletion estimate unavailable.")
        : (runway.depletionDate ? `Estimated depletion: ${runway.depletionDate}` : "Estimated depletion not available."));
    const unmetNeedLabel = model.maxAccumulatedUnmetNeed > 0
      ? formatCurrency(model.maxAccumulatedUnmetNeed)
      : "";

    return `
      <div class="income-impact-timeline-chart" data-income-impact-visual-timeline data-income-impact-financial-runway data-income-impact-runway-primary-visual data-income-impact-runway-status="${escapeHtml(status)}" data-income-impact-chart-source="${escapeHtml(model.source)}" aria-label="Income Impact timeline">
        <div class="income-impact-chart-topline">
          <strong>Income Impact Timeline</strong>
          <p>Resources before and after the selected death age, based on saved planning facts.</p>
          ${statusNote ? `<p data-income-impact-runway-status-note>${escapeHtml(statusNote)}</p>` : ""}
          ${chartSourceNote ? `<p data-income-impact-scenario-chart-fallback>${escapeHtml(chartSourceNote)}</p>` : ""}
        </div>
        <div class="income-impact-chart-explainer" data-income-impact-chart-explainer>
          <span data-income-impact-y-axis-explanation>Y-axis: Remaining available resources.</span>
          <span data-income-impact-x-axis-explanation>X-axis: Years relative to death; key markers show dates and client age.</span>
        </div>
        <div class="income-impact-runway-snapshot" data-income-impact-runway-snapshot>
          <div>
            <span>Money available at death</span>
            <strong data-income-impact-runway-starting-total>${escapeHtml(startingResourcesLabel)}</strong>
          </div>
          <div>
            <span>Immediate obligations</span>
            <strong data-income-impact-runway-obligations-total>${escapeHtml(obligationsLabel)}</strong>
          </div>
          <div>
            <span>Used each year</span>
            <strong data-income-impact-runway-annual-use>${escapeHtml(annualShortfallLabel)}</strong>
          </div>
        </div>
        ${renderRunwayMarkerLegend()}
        <svg class="income-impact-timeline-svg income-impact-runway-svg" data-income-impact-runway-svg width="${model.width}" height="${model.height}" viewBox="0 0 ${model.width} ${model.height}" role="img" aria-label="Projected remaining resources from five years before death through the selected horizon">
          <rect x="0" y="0" width="${model.width}" height="${model.height}" rx="18" class="income-impact-runway-frame"></rect>
          ${model.preDeathRegion ? `<rect data-income-impact-pre-death-region x="${model.preDeathRegion.x}" y="${model.preDeathRegion.y}" width="${model.preDeathRegion.width}" height="${model.preDeathRegion.height}" class="income-impact-pre-death-region"></rect>` : ""}
          ${model.preDeathRegion ? `<text x="${model.preDeathRegion.x + 12}" y="${model.yTop + 24}" text-anchor="start" class="income-impact-runway-region-label" data-income-impact-pre-death-region-label>5-year context before death</text>` : ""}
          <text x="${Math.round(((model.deathPoint?.x || model.xStart) + model.xEnd) / 2)}" y="${model.yTop + 24}" text-anchor="middle" class="income-impact-runway-region-label" data-income-impact-post-death-region-label>Survivor financial runway</text>
          <g class="income-impact-chart-grid" aria-hidden="true">
            <line x1="${model.xStart}" y1="${model.yBottom}" x2="${model.xEnd}" y2="${model.yBottom}"></line>
            <line x1="${model.xStart}" y1="${model.yTop}" x2="${model.xStart}" y2="${model.yBottom}"></line>
            <line x1="${model.xEnd}" y1="${model.yTop}" x2="${model.xEnd}" y2="${model.yBottom}"></line>
            <line x1="${model.xStart}" y1="${model.yTop}" x2="${model.xEnd}" y2="${model.yTop}"></line>
          </g>
          <g class="income-impact-runway-year-markers" aria-hidden="true">
            ${model.yearMarkers.map(function (marker) {
              return `
                <g data-income-impact-runway-year-marker data-income-impact-runway-year-index="${escapeHtml(String(marker.yearIndex))}">
                  <line x1="${marker.x}" y1="${model.yTop}" x2="${marker.x}" y2="${model.yBottom}" class="income-impact-runway-year-line"></line>
                  <text x="${marker.x}" y="${model.yBottom + 34}" text-anchor="middle" class="income-impact-runway-year-label">${escapeHtml(marker.label)}</text>
                  <text x="${marker.x}" y="${model.yBottom + 54}" text-anchor="middle" class="income-impact-runway-year-date">${escapeHtml(formatTimelineAxisDate(marker.date) || "")}</text>
                </g>
              `;
            }).join("")}
          </g>
          ${model.areaPath ? `<path class="income-impact-runway-area" data-income-impact-runway-area d="${escapeHtml(model.areaPath)}"></path>` : ""}
          <path class="income-impact-timeline-line income-impact-timeline-line--reference" data-income-impact-runway-zero-line d="M ${model.xStart} ${model.zeroY} L ${model.xEnd} ${model.zeroY}"></path>
          <path class="income-impact-timeline-line income-impact-timeline-line--primary" data-income-impact-runway-line data-income-impact-runway-post-death-line d="${escapeHtml(model.survivorRunwayPath || model.linePath)}" style="${RUNWAY_CHART_PRIMARY_LINE_STYLE}"></path>
          <g data-income-impact-runway-points aria-hidden="true">
            ${model.points.map(function (point) {
              return `
                <metadata
                  data-income-impact-runway-point
                  data-income-impact-runway-point-year-index="${escapeHtml(String(point.yearIndex))}"
                  data-income-impact-runway-point-relative-year="${escapeHtml(point.relativeYear == null ? "" : String(point.relativeYear))}"
                  data-income-impact-runway-point-relative-month="${escapeHtml(point.relativeMonthIndex == null ? "" : String(point.relativeMonthIndex))}"
                  data-income-impact-runway-point-phase="${escapeHtml(point.phase || "")}"
                  data-income-impact-runway-point-resolution="${escapeHtml(point.resolution || "")}"
                  data-income-impact-runway-point-date="${escapeHtml(point.date || "")}"
                  data-income-impact-runway-point-age="${escapeHtml(point.age == null ? "" : String(point.age))}"
                  data-income-impact-runway-point-balance="${escapeHtml(point.balance == null ? "" : String(point.balance))}"
                  data-income-impact-runway-point-displayed-balance="${escapeHtml(point.displayedBalance == null ? "" : String(point.displayedBalance))}"
                  data-income-impact-runway-point-accumulated-unmet-need="${escapeHtml(point.accumulatedUnmetNeed == null ? "" : String(point.accumulatedUnmetNeed))}"
                  data-income-impact-runway-point-status="${escapeHtml(point.status || "")}"
                ></metadata>
              `;
            }).join("")}
          </g>
          ${model.preDeathPath ? `<path class="income-impact-timeline-line income-impact-timeline-line--primary" data-income-impact-runway-pre-death-line data-income-impact-runway-pre-death-signed-line d="${escapeHtml(model.preDeathPath)}" style="${RUNWAY_CHART_PRIMARY_LINE_STYLE}"></path>` : ""}
          ${model.deathPoint ? `
            <g data-income-impact-runway-death data-income-impact-runway-death-date="${escapeHtml(model.deathPoint.date)}">
              <line x1="${model.deathPoint.x}" y1="${model.yTop}" x2="${model.deathPoint.x}" y2="${model.yBottom}" class="income-impact-runway-death-line"></line>
              <text x="${model.deathPoint.x}" y="${model.yTop - 24}" text-anchor="middle" class="income-impact-runway-death-label" data-income-impact-death-marker-label>Death occurs</text>
              <text x="${model.deathPoint.x}" y="${model.yTop - 5}" text-anchor="middle" class="income-impact-runway-year-date">${escapeHtml(model.deathPoint.date || "")}</text>
            </g>
          ` : ""}
          ${model.deathTransitionPath ? `<path class="income-impact-timeline-line income-impact-timeline-line--primary" data-income-impact-runway-death-transition-line d="${escapeHtml(model.deathTransitionPath)}" style="${RUNWAY_CHART_PRIMARY_LINE_STYLE}"></path>` : ""}
          ${model.depletionPoint ? `
            <g data-income-impact-runway-depletion data-income-impact-runway-depletion-date="${escapeHtml(model.depletionPoint.date)}">
              <line x1="${model.depletionPoint.x}" y1="${model.yTop}" x2="${model.depletionPoint.x}" y2="${model.yBottom}" stroke="#b42318" stroke-width="1.5" stroke-dasharray="5 5"></line>
              <text x="${model.depletionPoint.x}" y="${model.yTop - 24}" text-anchor="middle" class="income-impact-runway-depletion-label">Money runs out</text>
              <text x="${model.depletionPoint.x}" y="${model.yTop - 5}" text-anchor="middle" class="income-impact-runway-depletion-date">${escapeHtml(model.depletionPoint.date)}</text>
            </g>
          ` : ""}
          <text x="${model.xStart}" y="42" text-anchor="start" class="income-impact-runway-start-label" data-income-impact-runway-starting-resources>Available after obligations: ${escapeHtml(startLabel)}</text>
          <text x="${model.xStart}" y="${model.yTop - 10}" text-anchor="start" class="income-impact-runway-axis-label">${escapeHtml(formatCurrency(model.maxBalance))}</text>
          <text x="${model.xStart}" y="${model.zeroY <= model.yTop + 18 ? model.zeroY + 16 : model.zeroY - 10}" text-anchor="start" class="income-impact-runway-axis-label" data-income-impact-runway-zero-label>$0</text>
          ${model.minBalance < 0 ? `<text x="${model.xStart}" y="${model.yBottom - 10}" text-anchor="start" class="income-impact-runway-axis-label" data-income-impact-runway-negative-axis-label>${escapeHtml(formatCurrency(model.minBalance))}</text>` : ""}
        </svg>
        <div class="income-impact-chart-axis" aria-hidden="true">
          <span>${escapeHtml(formatTimelineAxisDate(model.axisStart) || "Start")}</span>
          <span>${escapeHtml(formatTimelineAxisDate(model.axisEnd) || "End")}</span>
        </div>
        <p class="income-impact-axis-note" data-income-impact-axis-note>Remaining available resources can plot above or below $0. Timing runs from 5 years before death through the selected projection horizon.</p>
        ${unmetNeedLabel ? `
          <div class="income-impact-unmet-need" data-income-impact-accumulated-unmet-need>
            <span>Accumulated unmet need after resources are depleted. Unmet need is tracked separately after resources reach $0.</span>
            <strong data-income-impact-accumulated-unmet-need-value>${escapeHtml(unmetNeedLabel)}</strong>
          </div>
        ` : ""}
        ${renderPivotalMarkerLanes(timelineResult, model)}
        <div class="income-impact-chart-hover-label">${escapeHtml(depletionLabel)}</div>
      </div>
    `;
  }

  function formatTimelineTiming(event) {
    const pieces = [];
    if (event?.date) {
      pieces.push(event.date);
    }
    if (event?.age != null) {
      pieces.push(`Age ${event.age}`);
    }

    return pieces.length ? pieces.join(" - ") : "Timing unavailable";
  }

  function renderTimelineEvents(timelineResult) {
    const events = getTimelineEvents(timelineResult);

    if (!events.length) {
      return `<div class="income-impact-empty-inline" data-income-impact-helper-timeline-events>${escapeHtml(EMPTY_MESSAGE)}</div>`;
    }

    return `
      <div class="income-impact-timeline-grid" data-income-impact-helper-timeline-events>
        ${events.map(function (event) {
          const warnings = Array.isArray(event?.warnings) ? event.warnings : [];
          return `
            <div data-income-impact-timeline-event-type="${escapeHtml(event.type)}">
              <span>${escapeHtml(formatTimelineTiming(event))}</span>
              <strong>${escapeHtml(event.label || "Timeline event")}</strong>
              <p>${escapeHtml(getTimelineEventAmountLabel(event))}</p>
              ${warnings.length ? `
                <ul>
                  ${warnings.map(function (warning) {
                    return `<li>${escapeHtml(warning.message || warning.code || "Review this event.")}</li>`;
                  }).join("")}
                </ul>
              ` : ""}
            </div>
          `;
        }).join("")}
      </div>
    `;
  }

  function renderDataGaps(timelineResult) {
    const dataGaps = Array.isArray(timelineResult?.dataGaps) ? timelineResult.dataGaps : [];
    if (!dataGaps.length) {
      return "";
    }

    return `
      <div class="income-impact-empty-inline" data-income-impact-data-gaps>
        <strong>Data needed</strong>
        <ul>
          ${dataGaps.map(function (dataGap) {
            return `<li>${escapeHtml(dataGap.label || dataGap.code || "Additional profile information is needed.")}</li>`;
          }).join("")}
        </ul>
      </div>
    `;
  }

  function renderWarnings(timelineResult) {
    const warnings = Array.isArray(timelineResult?.warnings) ? timelineResult.warnings : [];
    if (!warnings.length) {
      return "";
    }

    return `
      <div class="income-impact-empty-inline" data-income-impact-warnings>
        <strong>Review notes</strong>
        <ul>
          ${warnings.map(function (warning) {
            return `<li>${escapeHtml(warning.message || warning.code || "Review the linked profile facts.")}</li>`;
          }).join("")}
        </ul>
      </div>
    `;
  }

  function getPivotalEvents(timelineResult) {
    const scenarioTimeline = isPlainObject(timelineResult?.scenarioTimeline) ? timelineResult.scenarioTimeline : {};
    const pivotalEvents = isPlainObject(scenarioTimeline.pivotalEvents) ? scenarioTimeline.pivotalEvents : {};
    return {
      risks: (Array.isArray(pivotalEvents.risks) ? pivotalEvents.risks : []).filter(isPlainObject),
      stable: (Array.isArray(pivotalEvents.stable) ? pivotalEvents.stable : []).filter(isPlainObject)
    };
  }

  function getRiskSeverityLabel(severity) {
    const normalized = String(severity || "").trim();
    if (normalized === "critical") {
      return "Critical";
    }
    if (normalized === "at-risk") {
      return "At Risk";
    }
    if (normalized === "caution") {
      return "Caution";
    }
    if (normalized === "stable") {
      return "Stable";
    }
    return normalized || "Review";
  }

  function formatPivotalEventTiming(event) {
    const pieces = [];
    if (event?.date) {
      pieces.push(event.date);
    }
    if (event?.age != null) {
      pieces.push(`Age ${event.age}`);
    }
    if (!pieces.length && event?.relativeMonthIndex != null) {
      const months = toOptionalNumber(event.relativeMonthIndex);
      if (months === 0) {
        pieces.push("At death");
      } else if (months != null) {
        pieces.push(`Month ${months}`);
      }
    }
    return pieces.join(" - ");
  }

  function renderPivotalEventMeta(event) {
    const timing = formatPivotalEventTiming(event);
    const amount = toOptionalNumber(event?.amount);
    const pieces = [];
    if (timing) {
      pieces.push(`<span>${escapeHtml(timing)}</span>`);
    }
    if (amount != null) {
      pieces.push(`<span>${escapeHtml(formatCurrency(amount))}</span>`);
    }
    return pieces.length ? `<div class="income-impact-risk-meta">${pieces.join("")}</div>` : "";
  }

  function renderPivotalEventDataGaps(event) {
    const dataGaps = Array.isArray(event?.dataGaps) ? event.dataGaps : [];
    if (!dataGaps.length) {
      return "";
    }
    return `
      <ul class="income-impact-risk-gaps">
        ${dataGaps.map(function (gap) {
          return `<li>${escapeHtml(gap?.label || gap?.code || "Additional profile information is needed.")}</li>`;
        }).join("")}
      </ul>
    `;
  }

  function renderRiskEvent(event) {
    const severity = String(event?.severity || "").trim();
    return `
      <article
        class="income-impact-risk-item"
        data-income-impact-risk-event
        data-income-impact-risk-severity="${escapeHtml(severity)}"
        data-income-impact-risk-type="${escapeHtml(event?.type || event?.id || "")}"
      >
        <div class="income-impact-risk-item-header">
          <span class="income-impact-risk-severity" data-income-impact-risk-severity-label="${escapeHtml(severity)}">${escapeHtml(getRiskSeverityLabel(severity))}</span>
          <strong>${escapeHtml(event?.label || event?.shortLabel || "Risk detected")}</strong>
        </div>
        <p>${escapeHtml(event?.advisorCopy || "Review this Income Impact scenario with the available facts.")}</p>
        ${renderPivotalEventMeta(event)}
        ${renderPivotalEventDataGaps(event)}
      </article>
    `;
  }

  function renderStableEvent(event) {
    return `
      <li data-income-impact-covered-event data-income-impact-covered-type="${escapeHtml(event?.type || event?.id || "")}">
        <div>
          <strong>${escapeHtml(event?.label || event?.shortLabel || "Covered item")}</strong>
          <p>${escapeHtml(event?.advisorCopy || "This item is represented in the current preview.")}</p>
        </div>
        ${renderPivotalEventMeta(event)}
      </li>
    `;
  }

  function renderPivotalRiskPanel(timelineResult) {
    const events = getPivotalEvents(timelineResult);
    const dataGaps = Array.isArray(timelineResult?.dataGaps) ? timelineResult.dataGaps : [];
    const hasRisks = events.risks.length > 0;
    const stablePanel = events.stable.length
      ? `
        <details class="income-impact-covered-panel" data-income-impact-covered-panel>
          <summary>What is covered</summary>
          <ul>
            ${events.stable.map(renderStableEvent).join("")}
          </ul>
        </details>
      `
      : "";
    const emptyCopy = dataGaps.length
      ? "No risk events are available yet because the preview is missing key facts. Review the data needed below."
      : "No major risks detected from the available facts.";

    return `
      <article class="income-impact-card income-impact-card--wide income-impact-risk-panel" data-income-impact-risk-panel>
        <div class="income-impact-card-header">
          <h3>Key risks detected</h3>
          <p>These events are generated from the available scenario facts for this local preview. This does not change the LENS recommendation.</p>
        </div>
        ${hasRisks ? `
          <div class="income-impact-risk-list" data-income-impact-risk-list>
            ${events.risks.map(renderRiskEvent).join("")}
          </div>
        ` : `
          <div class="income-impact-empty-inline" data-income-impact-risk-empty>${escapeHtml(emptyCopy)}</div>
        `}
        ${stablePanel}
      </article>
    `;
  }

  function renderTimeline(timelineResult) {
    return `
      <article class="income-impact-card income-impact-card--wide" data-income-impact-helper-timeline>
        <div class="income-impact-card-header">
          <h3>Financial Runway if Death Occurs at Selected Age</h3>
          <p>Fact-based runway from linked profile and Protection Modeling information for the selected death age/date.</p>
        </div>
        <div class="income-impact-timeline" aria-label="Fact-based household impact timeline">
          ${renderFinancialRunwayChart(timelineResult)}
          <details class="income-impact-supporting-events" data-income-impact-helper-timeline-events-panel>
            <summary>Supporting timeline events</summary>
            ${renderTimelineEvents(timelineResult)}
          </details>
          ${renderDataGaps(timelineResult)}
          ${renderWarnings(timelineResult)}
        </div>
      </article>
    `;
  }

  function renderIncomeImpact(host, context) {
    const timelineResult = isPlainObject(context?.timelineResult) ? context.timelineResult : {};
    host.innerHTML = `
      <div class="income-impact-grid">
        ${renderTimeline(timelineResult)}
        ${renderPivotalRiskPanel(timelineResult)}
        ${renderFinancialSecurityCard(timelineResult)}
        ${renderFinancialRunwayCards(timelineResult)}
      </div>
    `;
  }

  function calculateTimelineResultFromState(state) {
    const safeState = isPlainObject(state) ? state : {};
    const scenarioState = isPlainObject(safeState.scenarioState) ? safeState.scenarioState : {};
    const projectionHorizonYears = clampProjectionHorizonYears(scenarioState.projectionHorizonYears);
    const mortgageTreatmentOverride = normalizeMortgageTreatmentOverride(scenarioState.mortgageTreatmentOverride);
    const input = {
      lensModel: safeState.lensModel,
      valuationDate: safeState.valuationDate,
      profileRecord: safeState.profileRecord,
      options: {
        scenario: {
          projectionHorizonYears,
          mortgageTreatmentOverride
        }
      }
    };
    const deathAgeState = isPlainObject(safeState.deathAgeState) ? safeState.deathAgeState : {};

    if (deathAgeState.hasDateOfBirth) {
      const selectedDeathAge = clampRoundedAge(
        deathAgeState.selectedDeathAge,
        deathAgeState.minAge,
        deathAgeState.maxAge
      );
      deathAgeState.selectedDeathAge = selectedDeathAge;
      input.selectedDeathAge = selectedDeathAge;
      input.options.scenario.deathAge = selectedDeathAge;
    }

    return safeState.calculateIncomeLossImpactTimeline(input);
  }

  function renderIncomeImpactFromState() {
    if (!incomeImpactState?.host || typeof incomeImpactState.calculateIncomeLossImpactTimeline !== "function") {
      return;
    }

    const timelineResult = calculateTimelineResultFromState(incomeImpactState);
    incomeImpactState.latestTimelineResult = timelineResult;
    renderIncomeImpact(incomeImpactState.host, {
      lensModel: incomeImpactState.lensModel,
      timelineResult,
      builderWarnings: incomeImpactState.builderWarnings
    });
    updateScenarioControls(timelineResult);
  }

  function bindScenarioControls() {
    const elements = getDeathAgeControlElements();

    function updateSelectedDeathAge(event) {
      const state = incomeImpactState?.deathAgeState;
      if (!state?.hasDateOfBirth) {
        return;
      }

      state.selectedDeathAge = clampRoundedAge(
        event?.target?.value,
        state.minAge,
        state.maxAge
      );
      renderIncomeImpactFromState();
    }

    if (elements?.slider) {
      elements.slider.addEventListener("input", updateSelectedDeathAge);
      elements.slider.addEventListener("change", updateSelectedDeathAge);
    }

    const scenarioElements = getScenarioBannerElements();
    if (!scenarioElements) {
      return;
    }

    if (scenarioElements.projectionHorizon) {
      const updateProjectionHorizon = function (event) {
        const scenarioState = incomeImpactState?.scenarioState;
        if (!scenarioState) {
          return;
        }

        scenarioState.projectionHorizonYears = clampProjectionHorizonYears(event?.target?.value);
        renderIncomeImpactFromState();
      };
      scenarioElements.projectionHorizon.addEventListener("input", updateProjectionHorizon);
      scenarioElements.projectionHorizon.addEventListener("change", updateProjectionHorizon);
    }

    if (scenarioElements.mortgageTreatment) {
      scenarioElements.mortgageTreatment.addEventListener("change", function (event) {
        const scenarioState = incomeImpactState?.scenarioState;
        if (!scenarioState) {
          return;
        }

        scenarioState.mortgageTreatmentOverride = normalizeMortgageTreatmentOverride(event?.target?.value);
        renderIncomeImpactFromState();
      });
    }

    if (scenarioElements.toggle) {
      scenarioElements.toggle.addEventListener("click", function () {
        const scenarioState = incomeImpactState?.scenarioState;
        if (!scenarioState) {
          return;
        }

        scenarioState.bannerCollapsed = !scenarioState.bannerCollapsed;
        updateScenarioControls(incomeImpactState.latestTimelineResult);
      });
    }
  }

  function initializeIncomeLossImpactDisplay() {
    const host = document.querySelector("[data-income-impact-display]");
    if (!host) {
      return;
    }
    syncIncomeImpactWorkflowLinks();

    const currentLensAnalysis = window.LensApp?.lensAnalysis || {};
    const buildLensModelFromSavedProtectionModeling = currentLensAnalysis.buildLensModelFromSavedProtectionModeling;
    const calculateIncomeLossImpactTimeline = currentLensAnalysis.calculateIncomeLossImpactTimeline;

    if (typeof buildLensModelFromSavedProtectionModeling !== "function") {
      renderEmptyState(host, "Income impact unavailable", "Lens saved-data builder is unavailable.");
      return;
    }

    if (typeof calculateIncomeLossImpactTimeline !== "function") {
      renderEmptyState(host, "Income impact unavailable", "Income impact timeline helper is unavailable.");
      return;
    }

    const profileRecord = resolveLinkedProfileRecord();
    if (!profileRecord) {
      renderEmptyState(host, "Link a client profile", "Income Loss Impact needs a linked client profile before it can render.");
      return;
    }

    const protectionModelingPayload = getProtectionModelingPayload(profileRecord);
    if (!hasProtectionModelingSource(protectionModelingPayload)) {
      renderEmptyState(host, "Protection Modeling Inputs needed", "No saved protection modeling data was found for this linked profile.");
      return;
    }

    try {
      const builderResult = buildLensModelFromSavedProtectionModeling({
        profileRecord,
        protectionModelingPayload,
        taxConfig: createSavedDataTaxConfig()
      });

      if (!builderResult?.lensModel) {
        renderEmptyState(host, "Income impact unavailable", "The saved Lens model could not be built for this profile.");
        return;
      }

      const valuationDate = resolveTimelineValuationDate(profileRecord, builderResult.lensModel);
      incomeImpactState = {
        host,
        lensModel: builderResult.lensModel,
        profileRecord,
        valuationDate,
        calculateIncomeLossImpactTimeline,
        deathAgeState: resolveDeathAgeControlState(builderResult.lensModel, valuationDate),
        scenarioState: {
          projectionHorizonYears: DEFAULT_PROJECTION_HORIZON_YEARS,
          mortgageTreatmentOverride: "followAssumptions",
          bannerCollapsed: false
        },
        builderWarnings: builderResult.warnings
      };

      renderIncomeImpactFromState();
      bindScenarioControls();
    } catch (error) {
      renderEmptyState(host, "Income impact unavailable", "Income Loss Impact could not be prepared from the saved Lens model.");
      console.error("Income Loss Impact display failed", error);
    }
  }

  lensAnalysis.incomeLossImpactDisplay = {
    initializeIncomeLossImpactDisplay
  };

  document.addEventListener("DOMContentLoaded", initializeIncomeLossImpactDisplay);
})(window);
