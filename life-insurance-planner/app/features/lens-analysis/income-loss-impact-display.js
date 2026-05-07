(function (window) {
  const root = window.LensApp = window.LensApp || {};
  const lensAnalysis = root.lensAnalysis = root.lensAnalysis || {};

  const UNAVAILABLE_COPY = "Not available";
  const EMPTY_MESSAGE = "Not available until income and survivor inputs are completed.";
  const DEFAULT_PROJECTION_HORIZON_YEARS = 40;
  const MIN_PROJECTION_HORIZON_YEARS = 5;
  const MAX_PROJECTION_HORIZON_YEARS = 100;
  const MIN_LIFESTYLE_SLIDER_VALUE = -100;
  const MAX_LIFESTYLE_SLIDER_VALUE = 100;
  const LIFESTYLE_SLIDER_LABELS = Object.freeze({
    conservative: "Conservative",
    current: "Current",
    elevated: "Elevated"
  });
  const GRAPH_VIEW_BOX = Object.freeze({
    width: 1000,
    height: 430,
    plotLeft: 74,
    plotTop: 36,
    plotWidth: 884,
    plotHeight: 318
  });
  const GRAPH_DETAIL_VIEW_BOX = Object.freeze({
    width: 1000,
    height: 170,
    plotLeft: 74,
    plotTop: 34,
    plotWidth: 884,
    plotHeight: 86
  });
  const COMPRESSION_DETAIL_MILESTONE_MONTHS = Object.freeze([1, 2, 3, 6, 9, 12, 24]);
  const GRAPH_PATH_SMOOTHING_TENSION = 0.55;
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

  function roundMoney(value) {
    return Number.isFinite(Number(value)) ? Number(Number(value).toFixed(2)) : 0;
  }

  function clonePlainValue(value) {
    if (Array.isArray(value)) {
      return value.map(clonePlainValue);
    }

    if (isPlainObject(value)) {
      return Object.keys(value).reduce(function (next, key) {
        next[key] = clonePlainValue(value[key]);
        return next;
      }, {});
    }

    return value;
  }

  function normalizeString(value) {
    return String(value == null ? "" : value).trim();
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

  function addWholeYears(date, years) {
    const targetYear = date.getFullYear() + years;
    const target = new Date(targetYear, date.getMonth(), 1);
    const lastDayOfTargetMonth = new Date(targetYear, date.getMonth() + 1, 0).getDate();
    target.setDate(Math.min(date.getDate(), lastDayOfTargetMonth));
    return target;
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

  function clampLifestyleSliderValue(value) {
    const number = toOptionalNumber(value);
    const rounded = number == null ? 0 : Math.round(number);
    return Math.max(MIN_LIFESTYLE_SLIDER_VALUE, Math.min(MAX_LIFESTYLE_SLIDER_VALUE, rounded));
  }

  function getLifestyleSliderLabel(value) {
    const sliderValue = clampLifestyleSliderValue(value);
    if (sliderValue < 0) {
      return LIFESTYLE_SLIDER_LABELS.conservative;
    }
    if (sliderValue > 0) {
      return LIFESTYLE_SLIDER_LABELS.elevated;
    }
    return LIFESTYLE_SLIDER_LABELS.current;
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
      selectedDeathAge: currentAge,
      dateOfBirth: formatDateOnly(dateOfBirth)
    };
  }

  function resolveSelectedDeathDate(valuationDate, deathAgeState) {
    const asOfDate = parseDateOnlyValue(valuationDate);
    const state = isPlainObject(deathAgeState) ? deathAgeState : {};
    if (!asOfDate || !state.hasDateOfBirth) {
      return normalizeDateOnly(valuationDate) || "";
    }

    const selectedDeathAge = clampRoundedAge(state.selectedDeathAge, state.minAge, state.maxAge);
    if (selectedDeathAge <= state.currentAge) {
      return formatDateOnly(asOfDate);
    }

    const dateOfBirth = parseDateOnlyValue(state.dateOfBirth);
    if (!dateOfBirth) {
      return formatDateOnly(asOfDate);
    }

    const selectedDeathDate = addWholeYears(dateOfBirth, selectedDeathAge);
    return selectedDeathDate < asOfDate ? formatDateOnly(asOfDate) : formatDateOnly(selectedDeathDate);
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
      lifestyleSlider: banner.querySelector("[data-income-impact-lifestyle-slider]"),
      lifestyleValue: banner.querySelector("[data-income-impact-lifestyle-value]"),
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
    const lifestyleSliderValue = clampLifestyleSliderValue(scenarioState.lifestyleSliderValue);
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

    if (elements.lifestyleSlider) {
      elements.lifestyleSlider.min = String(MIN_LIFESTYLE_SLIDER_VALUE);
      elements.lifestyleSlider.max = String(MAX_LIFESTYLE_SLIDER_VALUE);
      elements.lifestyleSlider.step = "1";
      elements.lifestyleSlider.value = String(lifestyleSliderValue);
      elements.lifestyleSlider.setAttribute("aria-valuetext", getLifestyleSliderLabel(lifestyleSliderValue));
    }

    if (elements.lifestyleValue) {
      elements.lifestyleValue.textContent = getLifestyleSliderLabel(lifestyleSliderValue);
    }

    if (elements.scenarioSummary) {
      elements.scenarioSummary.setAttribute("data-income-impact-mortgage-treatment-label", getMortgageTreatmentLabel(mortgageTreatmentOverride));
      elements.scenarioSummary.setAttribute("data-income-impact-lifestyle-label", getLifestyleSliderLabel(lifestyleSliderValue));
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

  function getComposerScenario(timelineResult) {
    return isPlainObject(timelineResult?.scenario) ? timelineResult.scenario : {};
  }

  function getTimelineFacts(timelineResult) {
    const scenario = getComposerScenario(timelineResult);
    return isPlainObject(scenario.timelineFacts) ? scenario.timelineFacts : {};
  }

  function formatMonthsCovered(value) {
    const months = toOptionalNumber(value);
    if (months == null) {
      return UNAVAILABLE_COPY;
    }

    const roundedMonths = Math.max(0, Math.round(months));
    const years = Math.floor(roundedMonths / 12);
    const remainder = roundedMonths % 12;
    if (!years) {
      return `${remainder} ${remainder === 1 ? "month" : "months"}`;
    }
    if (!remainder) {
      return `${years} ${years === 1 ? "year" : "years"}`;
    }
    return `${years} ${years === 1 ? "year" : "years"} ${remainder} ${remainder === 1 ? "month" : "months"}`;
  }

  function getPausedTimelineFacts(timelineResult) {
    const facts = getTimelineFacts(timelineResult);
    return [
      {
        id: "assets-before-death",
        label: "Assets before death",
        value: formatCurrency(facts.assetsBeforeDeath)
      },
      {
        id: "treated-assets-at-death",
        label: "Treated assets at death",
        value: formatCurrency(facts.survivorAvailableTreatedAssets)
      },
      {
        id: "coverage-added",
        label: "Coverage added at death",
        value: formatCurrency(facts.coverageAdded)
      },
      {
        id: "resources-after-obligations",
        label: "Resources after obligations",
        value: formatCurrency(facts.resourcesAfterObligations)
      },
      {
        id: "runway-months-covered",
        label: "Runway covered",
        value: formatMonthsCovered(facts.monthsCovered)
      },
      {
        id: "depletion-date",
        label: "Depletion date",
        value: facts.depletionDate || "Not depleted within horizon"
      }
    ];
  }

  function formatGraphCalloutValue(callout) {
    if (!callout) {
      return UNAVAILABLE_COPY;
    }
    if (callout.kind === "currency") {
      return formatCurrency(callout.value);
    }
    if (callout.kind === "months") {
      return formatMonthsCovered(callout.value);
    }
    if (callout.value == null || callout.value === "") {
      return UNAVAILABLE_COPY;
    }
    return String(callout.value);
  }

  function getGraphModel(timelineResult) {
    return isPlainObject(timelineResult?.graphModel) ? timelineResult.graphModel : {};
  }

  function toGraphX(xRatio) {
    const ratio = toOptionalNumber(xRatio);
    return Math.round(GRAPH_VIEW_BOX.plotLeft + ((ratio == null ? 0 : ratio) * GRAPH_VIEW_BOX.plotWidth));
  }

  function toGraphY(yRatio) {
    const ratio = toOptionalNumber(yRatio);
    return Math.round(GRAPH_VIEW_BOX.plotTop + ((ratio == null ? 0 : ratio) * GRAPH_VIEW_BOX.plotHeight));
  }

  function toPlotX(xRatio, viewBox) {
    const ratio = toOptionalNumber(xRatio);
    return viewBox.plotLeft + ((ratio == null ? 0 : ratio) * viewBox.plotWidth);
  }

  function toPlotY(yRatio, viewBox) {
    const ratio = toOptionalNumber(yRatio);
    return viewBox.plotTop + ((ratio == null ? 0 : ratio) * viewBox.plotHeight);
  }

  function formatSvgCoordinate(value) {
    const number = toOptionalNumber(value);
    if (number == null) {
      return "0";
    }
    const rounded = Math.round(number);
    if (Math.abs(number - rounded) < 0.005) {
      return String(rounded);
    }
    return number.toFixed(2).replace(/\.?0+$/, "");
  }

  function clampNumber(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function makePlotPoints(points, yRatioKey, viewBox) {
    const key = String(yRatioKey || "yRatio");
    return (Array.isArray(points) ? points : [])
      .filter(function (point) {
        return toOptionalNumber(point?.xRatio) != null && toOptionalNumber(point?.[key]) != null;
      })
      .map(function (point) {
        return {
          x: toPlotX(point.xRatio, viewBox),
          y: toPlotY(point[key], viewBox)
        };
      });
  }

  function buildSmoothedSvgPath(plotPoints) {
    const points = Array.isArray(plotPoints) ? plotPoints : [];
    if (points.length < 2) {
      return "";
    }
    const commands = [`M${formatSvgCoordinate(points[0].x)} ${formatSvgCoordinate(points[0].y)}`];
    if (points.length === 2) {
      commands.push(`L${formatSvgCoordinate(points[1].x)} ${formatSvgCoordinate(points[1].y)}`);
      return commands.join(" ");
    }

    for (let index = 0; index < points.length - 1; index += 1) {
      const previous = points[index - 1] || points[index];
      const current = points[index];
      const next = points[index + 1];
      const afterNext = points[index + 2] || next;
      const minX = Math.min(current.x, next.x);
      const maxX = Math.max(current.x, next.x);
      const minY = Math.min(current.y, next.y);
      const maxY = Math.max(current.y, next.y);
      const cp1 = {
        x: clampNumber(current.x + (((next.x - previous.x) * GRAPH_PATH_SMOOTHING_TENSION) / 6), minX, maxX),
        y: clampNumber(current.y + (((next.y - previous.y) * GRAPH_PATH_SMOOTHING_TENSION) / 6), minY, maxY)
      };
      const cp2 = {
        x: clampNumber(next.x - (((afterNext.x - current.x) * GRAPH_PATH_SMOOTHING_TENSION) / 6), minX, maxX),
        y: clampNumber(next.y - (((afterNext.y - current.y) * GRAPH_PATH_SMOOTHING_TENSION) / 6), minY, maxY)
      };
      commands.push([
        "C",
        `${formatSvgCoordinate(cp1.x)} ${formatSvgCoordinate(cp1.y)}`,
        `${formatSvgCoordinate(cp2.x)} ${formatSvgCoordinate(cp2.y)}`,
        `${formatSvgCoordinate(next.x)} ${formatSvgCoordinate(next.y)}`
      ].join(" "));
    }
    return commands.join(" ");
  }

  function buildStepSvgPath(plotPoints) {
    const points = Array.isArray(plotPoints) ? plotPoints : [];
    if (points.length < 2) {
      return "";
    }
    const commands = [`M${formatSvgCoordinate(points[0].x)} ${formatSvgCoordinate(points[0].y)}`];
    for (let index = 1; index < points.length; index += 1) {
      const point = points[index];
      commands.push(`H${formatSvgCoordinate(point.x)}`);
      commands.push(`V${formatSvgCoordinate(point.y)}`);
    }
    return commands.join(" ");
  }

  function normalizeGraphPathMode(pathMode) {
    return String(pathMode || "").trim() === "step" ? "step" : "smooth";
  }

  function buildSvgPath(points, pathMode = "smooth") {
    const plotPoints = makePlotPoints(points, "yRatio", GRAPH_VIEW_BOX);
    return normalizeGraphPathMode(pathMode) === "step"
      ? buildStepSvgPath(plotPoints)
      : buildSmoothedSvgPath(plotPoints);
  }

  function toDetailX(xRatio) {
    const ratio = toOptionalNumber(xRatio);
    return Math.round(GRAPH_DETAIL_VIEW_BOX.plotLeft + ((ratio == null ? 0 : ratio) * GRAPH_DETAIL_VIEW_BOX.plotWidth));
  }

  function toDetailY(yRatio) {
    const ratio = toOptionalNumber(yRatio);
    return Math.round(GRAPH_DETAIL_VIEW_BOX.plotTop + ((ratio == null ? 0 : ratio) * GRAPH_DETAIL_VIEW_BOX.plotHeight));
  }

  function buildDetailSvgPath(points, yRatioKey, pathMode = "smooth") {
    const plotPoints = makePlotPoints(points, yRatioKey, GRAPH_DETAIL_VIEW_BOX);
    return normalizeGraphPathMode(pathMode) === "step"
      ? buildStepSvgPath(plotPoints)
      : buildSmoothedSvgPath(plotPoints);
  }

  function formatAxisCurrency(value) {
    const number = toOptionalNumber(value);
    if (number == null) {
      return "";
    }
    const absolute = Math.abs(number);
    const prefix = number < 0 ? "-" : "";
    if (absolute >= 1000000) {
      return `${prefix}$${Math.round(absolute / 1000000)}M`;
    }
    if (absolute >= 1000) {
      return `${prefix}$${Math.round(absolute / 1000)}k`;
    }
    return `${prefix}$${Math.round(absolute)}`;
  }

  function renderGraphAxis(graphModel) {
    const yTicks = Array.isArray(graphModel?.axes?.y?.ticks) ? graphModel.axes.y.ticks : [];
    const xTicks = Array.isArray(graphModel?.axes?.x?.ticks) ? graphModel.axes.x.ticks : [];
    const zeroYRatio = toOptionalNumber(graphModel?.axes?.y?.zeroYRatio);
    return `
      <g class="income-impact-graph-axis" data-income-impact-graph-axis="y">
        ${yTicks.map(function (tick) {
          const y = toGraphY(tick.yRatio);
          return `
            <g data-income-impact-graph-y-tick>
              <line x1="${GRAPH_VIEW_BOX.plotLeft}" y1="${y}" x2="${GRAPH_VIEW_BOX.plotLeft + GRAPH_VIEW_BOX.plotWidth}" y2="${y}"></line>
              <text x="${GRAPH_VIEW_BOX.plotLeft - 10}" y="${y + 4}" text-anchor="end">${escapeHtml(formatAxisCurrency(tick.value))}</text>
            </g>
          `;
        }).join("")}
        ${zeroYRatio != null ? `
          <line class="income-impact-graph-zero-baseline" data-income-impact-graph-zero-baseline x1="${GRAPH_VIEW_BOX.plotLeft}" y1="${toGraphY(zeroYRatio)}" x2="${GRAPH_VIEW_BOX.plotLeft + GRAPH_VIEW_BOX.plotWidth}" y2="${toGraphY(zeroYRatio)}"></line>
        ` : ""}
      </g>
      <g class="income-impact-graph-axis" data-income-impact-graph-axis="x">
        ${xTicks.map(function (tick) {
          const x = toGraphX(tick.xRatio);
          return `
            <g data-income-impact-graph-x-tick="${escapeHtml(tick.id || "")}">
              <line x1="${x}" y1="${GRAPH_VIEW_BOX.plotTop}" x2="${x}" y2="${GRAPH_VIEW_BOX.plotTop + GRAPH_VIEW_BOX.plotHeight}"></line>
              <text x="${x}" y="${GRAPH_VIEW_BOX.plotTop + GRAPH_VIEW_BOX.plotHeight + 28}" text-anchor="middle">${escapeHtml(tick.label || "")}</text>
              <text x="${x}" y="${GRAPH_VIEW_BOX.plotTop + GRAPH_VIEW_BOX.plotHeight + 48}" text-anchor="middle">${escapeHtml(tick.date || "")}</text>
            </g>
          `;
        }).join("")}
      </g>
    `;
  }

  function renderGraphPhases(graphModel) {
    const phases = isPlainObject(graphModel?.phases) ? graphModel.phases : {};
    const preDeath = phases.preDeath || {};
    const postDeath = phases.postDeath || {};
    const death = phases.deathEvent || {};
    const preEnd = toOptionalNumber(preDeath.endXRatio);
    const postStart = toOptionalNumber(postDeath.startXRatio);
    const deathX = toOptionalNumber(death.xRatio);
    return `
      <g class="income-impact-graph-phases" data-income-impact-graph-phases>
        ${preEnd != null && preEnd > 0 ? `
          <rect class="income-impact-graph-phase income-impact-graph-phase--pre-death" x="${GRAPH_VIEW_BOX.plotLeft}" y="${GRAPH_VIEW_BOX.plotTop}" width="${Math.max(0, toGraphX(preEnd) - GRAPH_VIEW_BOX.plotLeft)}" height="${GRAPH_VIEW_BOX.plotHeight}"></rect>
          <text x="${GRAPH_VIEW_BOX.plotLeft + 14}" y="${GRAPH_VIEW_BOX.plotTop + 24}">Before death</text>
        ` : ""}
        ${postStart != null && postStart < 1 ? `
          <rect class="income-impact-graph-phase income-impact-graph-phase--post-death" x="${toGraphX(postStart)}" y="${GRAPH_VIEW_BOX.plotTop}" width="${Math.max(0, GRAPH_VIEW_BOX.plotLeft + GRAPH_VIEW_BOX.plotWidth - toGraphX(postStart))}" height="${GRAPH_VIEW_BOX.plotHeight}"></rect>
          <text x="${toGraphX(postStart) + 14}" y="${GRAPH_VIEW_BOX.plotTop + 24}">After death</text>
        ` : ""}
        ${deathX != null ? `
          <line class="income-impact-graph-death-axis" data-income-impact-graph-death-axis x1="${toGraphX(deathX)}" y1="${GRAPH_VIEW_BOX.plotTop}" x2="${toGraphX(deathX)}" y2="${GRAPH_VIEW_BOX.plotTop + GRAPH_VIEW_BOX.plotHeight}"></line>
          <text class="income-impact-graph-death-label" x="${toGraphX(deathX)}" y="${GRAPH_VIEW_BOX.plotTop - 12}" text-anchor="middle">Death event</text>
        ` : ""}
      </g>
    `;
  }

  function renderGraphMarkers(graphModel) {
    const markers = (Array.isArray(graphModel?.markers) ? graphModel.markers : []).filter(function (marker) {
      return marker?.positionable && toOptionalNumber(marker.xRatio) != null && toOptionalNumber(marker.yRatio) != null;
    });
    if (!markers.length) {
      return "";
    }
    return `
      <g class="income-impact-graph-markers" data-income-impact-graph-markers>
        ${markers.map(function (marker) {
          const x = toGraphX(marker.xRatio);
          const y = toGraphY(marker.yRatio);
          const radius = marker.kind === "stable" ? 4 : 5;
          return `
            <g
              data-income-impact-graph-marker
              data-income-impact-graph-marker-kind="${escapeHtml(marker.kind)}"
              data-income-impact-graph-marker-severity="${escapeHtml(marker.severity || "")}"
              data-income-impact-graph-marker-rule-id="${escapeHtml(marker.ruleId || marker.id || "")}"
              transform="translate(${x} ${y})"
            >
              <circle r="${radius}"></circle>
              <title>${escapeHtml(marker.title || marker.markerLabel || "Scenario marker")}</title>
            </g>
          `;
        }).join("")}
      </g>
    `;
  }

  function getCompressionMarkerLabelOffset(markerType, index) {
    if (markerType === "compressionAction") {
      return { x: 10, y: -18 };
    }
    if (markerType === "pauseAction") {
      return { x: 10, y: 28 };
    }
    if (markerType === "baseDepletion") {
      return { x: -112, y: -16 };
    }
    if (markerType === "compressionDepletion") {
      return { x: 10, y: -34 };
    }
    if (markerType === "shortfallRemains") {
      return { x: 10, y: 42 };
    }
    return { x: 10, y: index % 2 === 0 ? -18 : 28 };
  }

  function shouldRenderCompressionMarkerLabel(markerType) {
    return markerType !== "compressionAction" && markerType !== "pauseAction";
  }

  function getCompressionMarkerTitle(marker) {
    const label = normalizeString(marker?.label || "Compression comparison event");
    const summary = normalizeString(marker?.summary);
    return summary && summary !== label ? `${label}: ${summary}` : label;
  }

  function renderCompressionComparisonMarkers(graphModel) {
    const markers = (Array.isArray(graphModel?.comparisonMarkers) ? graphModel.comparisonMarkers : []).filter(function (marker) {
      return marker?.positionable && toOptionalNumber(marker.xRatio) != null && toOptionalNumber(marker.yRatio) != null;
    });
    if (!markers.length) {
      return "";
    }
    return `
      <g class="income-impact-compression-markers" data-income-impact-compression-markers>
        ${markers.map(function (marker, index) {
          const x = toGraphX(marker.xRatio);
          const y = toGraphY(marker.yRatio);
          const labelOffset = getCompressionMarkerLabelOffset(marker.markerType, index);
          const labelX = labelOffset.x;
          const labelY = labelOffset.y;
          const renderLabel = shouldRenderCompressionMarkerLabel(marker.markerType);
          return `
            <g
              class="income-impact-compression-marker income-impact-compression-marker--${escapeHtml(marker.markerType || "event")}"
              data-income-impact-compression-marker
              data-income-impact-compression-marker-type="${escapeHtml(marker.markerType || "")}"
              data-income-impact-compression-marker-scenario-id="${escapeHtml(marker.scenarioId || "")}"
              transform="translate(${x} ${y})"
            >
              ${renderLabel ? `<line x1="0" y1="0" x2="${labelX}" y2="${labelY}"></line>` : ""}
              <circle r="4"></circle>
              ${renderLabel ? `<text x="${labelX}" y="${labelY}" text-anchor="${labelX < 0 ? "end" : "start"}">${escapeHtml(marker.label || "Compression event")}</text>` : ""}
              <title>${escapeHtml(getCompressionMarkerTitle(marker))}</title>
            </g>
          `;
        }).join("")}
      </g>
    `;
  }

  function renderGraphPath(pathId, points, label, pathMode = "smooth") {
    const normalizedPathMode = normalizeGraphPathMode(pathMode);
    const path = buildSvgPath(points, normalizedPathMode);
    if (!path) {
      return "";
    }
    return `<path class="income-impact-graph-path income-impact-graph-path--${escapeHtml(pathId)} income-impact-graph-path--${escapeHtml(normalizedPathMode)}" data-income-impact-graph-path="${escapeHtml(pathId)}" data-income-impact-graph-path-mode="${escapeHtml(normalizedPathMode)}" d="${escapeHtml(path)}" aria-label="${escapeHtml(label)}"></path>`;
  }

  function getComparisonGraphSeries(graphModel) {
    return (Array.isArray(graphModel?.series?.comparisonPostDeathResources)
      ? graphModel.series.comparisonPostDeathResources
      : []).filter(function (comparisonSeries) {
      return isPlainObject(comparisonSeries) && buildSvgPath(
        comparisonSeries.points,
        getComparisonGraphPathMode(comparisonSeries)
      );
    }).slice(0, 1);
  }

  function renderComparisonGraphPaths(graphModel) {
    const comparisonSeries = getComparisonGraphSeries(graphModel);
    if (!comparisonSeries.length) {
      return "";
    }
    return comparisonSeries.map(function (series, index) {
      const pathId = getComparisonGraphPathId(series, index);
      return renderGraphPath(
        pathId,
        series.points,
        series.label || getComparisonGraphLabel(pathId),
        getComparisonGraphPathMode(series, pathId)
      );
    }).join("");
  }

  function getComparisonGraphPathId(series, index) {
    const explicitPathId = normalizeString(series?.pathId || series?.graphPathId);
    if (explicitPathId === "compression-post-death-resources") {
      return explicitPathId;
    }
    return "compression-post-death-resources";
  }

  function getComparisonGraphLabel(pathId) {
    return "Lifestyle-adjusted projection";
  }

  function getComparisonGraphPathMode(series, pathId) {
    const explicitMode = normalizeGraphPathMode(series?.pathMode || series?.renderMode);
    return explicitMode;
  }

  function getComparisonLegendItemKey(pathId) {
    return "compression";
  }

  function renderGraphLegend(graphModel) {
    const comparisonSeries = getComparisonGraphSeries(graphModel);
    if (!comparisonSeries.length) {
      return "";
    }
    return `
      <div class="income-impact-graph-legend" data-income-impact-graph-legend>
        <span data-income-impact-graph-legend-item="base"><i></i>Base projection</span>
        ${comparisonSeries.map(function (series, index) {
          const pathId = getComparisonGraphPathId(series, index);
          const label = series.label || getComparisonGraphLabel(pathId);
          return `<span data-income-impact-graph-legend-item="${escapeHtml(getComparisonLegendItemKey(pathId))}"><i></i>${escapeHtml(label)}</span>`;
        }).join("")}
        <p>Comparison only - base projection unchanged.</p>
      </div>
    `;
  }

  function renderGraphDeathAnchor(graphModel) {
    const anchor = graphModel?.series?.currentAnchor;
    if (!anchor || toOptionalNumber(anchor.xRatio) == null || toOptionalNumber(anchor.yRatio) == null) {
      return "";
    }
    return `
      <g class="income-impact-graph-current-anchor" data-income-impact-graph-current-anchor transform="translate(${toGraphX(anchor.xRatio)} ${toGraphY(anchor.yRatio)})">
        <rect x="-5" y="-5" width="10" height="10" rx="2"></rect>
        <title>Current asset value at selected death date</title>
      </g>
    `;
  }

  function renderGraphSvg(graphModel) {
    const preDeathPath = renderGraphPath("preDeathAssets", graphModel?.series?.preDeathAssets, "Projected assets before death");
    const deathPath = renderGraphPath("deathTransition", graphModel?.series?.deathTransition, "Death-event resource conversion");
    const postDeathPath = renderGraphPath("postDeathResources", graphModel?.series?.postDeathResources, "Survivor resources after death");
    const comparisonPaths = renderComparisonGraphPaths(graphModel);
    return `
      <svg
        class="income-impact-graph-svg"
        data-income-impact-graph-svg
        viewBox="0 0 ${GRAPH_VIEW_BOX.width} ${GRAPH_VIEW_BOX.height}"
        role="img"
        aria-label="Income Impact timeline graph"
      >
        ${renderGraphPhases(graphModel)}
        ${renderGraphAxis(graphModel)}
        <g class="income-impact-graph-series" data-income-impact-graph-series>
          ${preDeathPath}
          ${deathPath}
          ${postDeathPath}
          ${comparisonPaths}
          ${renderGraphDeathAnchor(graphModel)}
        </g>
        ${renderGraphMarkers(graphModel)}
        ${renderCompressionComparisonMarkers(graphModel)}
      </svg>
    `;
  }

  function renderGraphCallouts(graphModel) {
    const callouts = Array.isArray(graphModel?.callouts) ? graphModel.callouts : [];
    if (!callouts.length) {
      return "";
    }
    return `
      <div class="income-impact-graph-callouts" data-income-impact-graph-callouts>
        ${callouts.map(function (callout) {
          return `
            <span data-income-impact-graph-callout="${escapeHtml(callout.id || "")}" data-income-impact-graph-callout-phase="${escapeHtml(callout.phase || "")}">
              <b>${escapeHtml(callout.label || "Graph fact")}</b>
              <strong>${escapeHtml(formatGraphCalloutValue(callout))}</strong>
            </span>
          `;
        }).join("")}
      </div>
    `;
  }

  function renderSelectedGraphEvent(graphModel) {
    const selectedEvent = isPlainObject(graphModel?.selectedEvent) ? graphModel.selectedEvent : null;
    if (!selectedEvent) {
      return "";
    }
    return `
      <aside class="income-impact-graph-selected-event" data-income-impact-graph-selected-event>
        <span>${escapeHtml(getRiskSeverityLabel(selectedEvent.severity || selectedEvent.kind))}</span>
        <strong>${escapeHtml(selectedEvent.title || selectedEvent.markerLabel || "Selected event")}</strong>
        <p>${escapeHtml(selectedEvent.summary || "Review this event against the scenario facts.")}</p>
        ${renderPivotalEventMeta(selectedEvent)}
        ${renderPivotalEventEvidence(selectedEvent)}
      </aside>
    `;
  }

  function renderTimelineUnavailableState(timelineResult) {
    const runway = getFinancialRunway(timelineResult);
    const status = normalizeRunwayStatus(runway.status);
    const selectedDeathDate = timelineResult?.selectedDeath?.date || UNAVAILABLE_COPY;
    const selectedDeathAge = timelineResult?.selectedDeath?.age == null ? UNAVAILABLE_COPY : `Age ${timelineResult.selectedDeath.age}`;
    const facts = getPausedTimelineFacts(timelineResult);

    return `
      <div class="income-impact-timeline-paused" data-income-impact-visual-timeline data-income-impact-timeline-paused data-income-impact-runway-status="${escapeHtml(status)}">
        <div class="income-impact-paused-copy">
          <span>Timeline unavailable</span>
          <strong>Timeline graph unavailable with the current profile facts.</strong>
          <p>The scenario facts and risk panel remain available. Add the missing linked-profile data below to render the graph.</p>
        </div>
        <div class="income-impact-paused-facts" aria-label="Paused Income Impact preview facts">
          <span><b>Selected death date</b><strong>${escapeHtml(selectedDeathDate)}</strong></span>
          <span><b>Selected death age</b><strong>${escapeHtml(selectedDeathAge)}</strong></span>
          ${facts.map(function (fact) {
            return `<span data-income-impact-paused-fact="${escapeHtml(fact.id)}"><b>${escapeHtml(fact.label)}</b><strong>${escapeHtml(fact.value)}</strong></span>`;
          }).join("")}
        </div>
      </div>
    `;
  }

  function renderIncomeImpactTimelineGraph(timelineResult) {
    const graphModel = getGraphModel(timelineResult);
    if (!isPlainObject(graphModel) || !graphModel.status || graphModel.status === "unavailable" || !isPlainObject(graphModel.axes)) {
      return renderTimelineUnavailableState(timelineResult);
    }
    return `
      <div class="income-impact-graph" data-income-impact-visual-timeline data-income-impact-graph data-income-impact-graph-status="${escapeHtml(graphModel.status || "partial")}">
        <div class="income-impact-graph-header">
          <div>
            <span>Selected scenario</span>
            <strong>Remaining resources timeline</strong>
          </div>
          <p>Before-death projection, death-event conversion, and survivor runway from the composed Income Impact scenario.</p>
        </div>
        ${renderGraphSvg(graphModel)}
        ${renderGraphLegend(graphModel)}
        ${renderGraphCallouts(graphModel)}
        ${renderSelectedGraphEvent(graphModel)}
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

  function getCompressionItems(timelineResult, key) {
    const reporting = isPlainObject(timelineResult?.compressionReporting) ? timelineResult.compressionReporting : {};
    const layer5 = isPlainObject(reporting.layer5) ? reporting.layer5 : {};
    return Array.isArray(layer5[key]) ? layer5[key].filter(isPlainObject) : [];
  }

  function getCompressionDataGaps(timelineResult) {
    const reporting = isPlainObject(timelineResult?.compressionReporting) ? timelineResult.compressionReporting : {};
    const layer5 = isPlainObject(reporting.layer5) ? reporting.layer5 : {};
    const reportingGaps = Array.isArray(layer5.compressionDataGaps)
      ? layer5.compressionDataGaps.filter(isPlainObject)
      : [];
    const scenarioGaps = Array.isArray(layer5.compressionScenarioDataGaps)
      ? layer5.compressionScenarioDataGaps.filter(isPlainObject)
      : [];
    return reportingGaps.concat(scenarioGaps);
  }

  function getCompressionPolicyRules(timelineResult) {
    const reporting = isPlainObject(timelineResult?.compressionReporting) ? timelineResult.compressionReporting : {};
    const prep = isPlainObject(reporting.prep) ? reporting.prep : {};
    return Array.isArray(prep.compressionPolicyRules) ? prep.compressionPolicyRules.filter(isPlainObject) : [];
  }

  function buildCompressionPolicyByType(timelineResult) {
    return getCompressionPolicyRules(timelineResult).reduce(function (next, rule, index) {
      const typeKey = normalizeString(rule.expenseTypeKey);
      if (!typeKey || next[typeKey]) {
        return next;
      }

      next[typeKey] = Object.assign({}, rule, {
        displayOrderIndex: index
      });
      return next;
    }, {});
  }

  function getCompressionItemPolicy(item, policyByType) {
    const typeKey = normalizeString(item?.typeKey || item?.expenseTypeKey);
    return typeKey && policyByType ? policyByType[typeKey] || null : null;
  }

  function sortCompressionItemsByPolicy(items, policyByType) {
    return items.slice().sort(function (left, right) {
      const leftPolicy = getCompressionItemPolicy(left, policyByType);
      const rightPolicy = getCompressionItemPolicy(right, policyByType);
      const leftRank = toOptionalNumber(leftPolicy?.compressionOrderRank) ?? Number.MAX_SAFE_INTEGER;
      const rightRank = toOptionalNumber(rightPolicy?.compressionOrderRank) ?? Number.MAX_SAFE_INTEGER;
      if (leftRank !== rightRank) {
        return leftRank - rightRank;
      }

      const leftIndex = toOptionalNumber(leftPolicy?.displayOrderIndex) ?? Number.MAX_SAFE_INTEGER;
      const rightIndex = toOptionalNumber(rightPolicy?.displayOrderIndex) ?? Number.MAX_SAFE_INTEGER;
      if (leftIndex !== rightIndex) {
        return leftIndex - rightIndex;
      }

      return getCompressionItemLabel(left).localeCompare(getCompressionItemLabel(right));
    });
  }

  function formatMonthlyCompressionAmount(item) {
    const amount = toOptionalNumber(
      item?.possibleMonthlyReduction
        ?? item?.currentMonthlyAmount
        ?? item?.monthlyAmount
        ?? item?.amount
    );
    return amount == null ? "" : `${formatCurrency(amount)}/mo`;
  }

  function getCompressionItemLabel(item) {
    return item?.label || item?.typeKey || item?.expenseTypeKey || "Expense item";
  }

  function isDebtRecordsOwnedCompressionItem(item) {
    const reasonCode = normalizeString(item?.reasonCode);
    const sourceKey = normalizeString(item?.sourceKey);
    const sourcePath = normalizeString(item?.sourcePath);
    return reasonCode === "generated-debt-payment-excluded"
      || sourceKey === "debtRecords"
      || sourcePath.includes("debtRecords");
  }

  function getCompressionItemDetail(item, policy) {
    if (isDebtRecordsOwnedCompressionItem(item)) {
      return "Source-owned by Debt Records";
    }

    const orderRank = toOptionalNumber(policy?.compressionOrderRank);
    if (orderRank != null) {
      return `Review order ${orderRank}`;
    }

    const reason = item?.reason || item?.reasonCode || item?.status || "";
    if (reason) {
      return reason;
    }

    return "";
  }

  function renderCompressionItemList(items, emptyCopy, options) {
    const safeOptions = isPlainObject(options) ? options : {};
    const policyByType = safeOptions.policyByType || {};
    const sortedItems = sortCompressionItemsByPolicy(items, policyByType);

    if (!sortedItems.length) {
      return `<div class="income-impact-empty-inline">${escapeHtml(emptyCopy)}</div>`;
    }

    return `
      <ul class="income-impact-compression-item-list">
        ${sortedItems.slice(0, 4).map(function (item) {
          const policy = getCompressionItemPolicy(item, policyByType);
          const amount = formatMonthlyCompressionAmount(item);
          const detail = getCompressionItemDetail(item, policy);
          const orderRank = toOptionalNumber(policy?.compressionOrderRank);
          return `
            <li${orderRank == null ? "" : ` data-income-impact-compression-order-rank="${escapeHtml(orderRank)}"`}>
              <span class="income-impact-compression-item-main">
                <span>${escapeHtml(getCompressionItemLabel(item))}</span>
                ${detail ? `<small>${escapeHtml(detail)}</small>` : ""}
              </span>
              <strong>${escapeHtml(amount || "Review")}</strong>
            </li>
          `;
        }).join("")}
      </ul>
    `;
  }

  function getCompressionGapTitle(gap) {
    const code = normalizeString(gap?.code);
    if (code === "scalar-household-expenses-not-itemized-for-compression") {
      return "Scalar household itemization limitation";
    }
    if (code === "expense-frequency-review-required") {
      return "Periodic policy limitation";
    }
    return gap?.label || gap?.code || "Compression reporting limitation";
  }

  function renderCompressionDataGapList(dataGaps) {
    if (!dataGaps.length) {
      return `<div class="income-impact-empty-inline">No compression-specific data gaps reported.</div>`;
    }

    return `
      <ul class="income-impact-compression-gap-list">
        ${dataGaps.slice(0, 4).map(function (gap) {
          const title = getCompressionGapTitle(gap);
          const message = gap.message || gap.label || gap.code || "Compression reporting limitation.";
          return `
            <li>
              <strong>${escapeHtml(title)}</strong>
              <span>${escapeHtml(message)}</span>
            </li>
          `;
        }).join("")}
      </ul>
    `;
  }

  function renderPolicyDecisionSummary(summary) {
    const safeSummary = isPlainObject(summary) ? summary : {};
    return `
      <div class="income-impact-compression-policy" data-income-impact-compression-policy-summary>
        <span><b>YES</b>${escapeHtml(safeSummary.YES ?? 0)}</span>
        <span><b>PAUSE</b>${escapeHtml(safeSummary.PAUSE ?? 0)}</span>
        <span><b>NO</b>${escapeHtml(safeSummary.NO ?? 0)}</span>
        <span><b>INTERVENTION</b>${escapeHtml(safeSummary.INTERVENTION ?? 0)}</span>
      </div>
    `;
  }

  function renderCompressionScenarioStatus(layer5) {
    const trace = isPlainObject(layer5?.compressionScenarioTrace) ? layer5.compressionScenarioTrace : {};
    const scenarios = Array.isArray(layer5?.compressionScenarios) ? layer5.compressionScenarios.filter(isPlainObject) : [];
    const inputProvided = trace.compressionScenarioInputProvided === true;
    const isBlocked = trace.alternateScenarioBlocked === true;
    const status = normalizeString(trace.compressionScenarioStatus);
    let label = "Alternate scenario not prepared";
    let detail = "Compression reporting is visible only; no alternate scenario has been prepared for this preview.";
    let state = "notPrepared";

    if (inputProvided && scenarios.length) {
      label = "Alternate scenario prepared";
      detail = "Prepared as a separate scenario and not applied to the base projection.";
      state = "complete";
    } else if (inputProvided && isBlocked) {
      label = "Alternate scenario blocked";
      detail = "Not applied to the projection. Review the data limitations before using active compression.";
      state = "blocked";
    } else if (inputProvided) {
      label = "Alternate scenario unavailable";
      detail = "No alternate scenario was exposed to Layer 5 for this preview.";
      state = status || "unavailable";
    }

    return `
      <div class="income-impact-empty-inline" data-income-impact-compression-scenario-status="${escapeHtml(state)}">
        <strong>${escapeHtml(label)}</strong>
        <span>${escapeHtml(detail)}</span>
      </div>
    `;
  }

  function renderLifestyleScenarioStatus(timelineResult) {
    const reporting = isPlainObject(timelineResult?.compressionReporting) ? timelineResult.compressionReporting : {};
    const lifestyleScenario = isPlainObject(reporting.lifestyleScenario) ? reporting.lifestyleScenario : null;
    const trace = isPlainObject(reporting.trace) ? reporting.trace : {};
    const sliderValue = clampLifestyleSliderValue(trace.lifestyleSliderValue);
    const label = lifestyleScenario
      ? `Lifestyle comparison: ${getLifestyleSliderLabel(sliderValue)}`
      : "Lifestyle comparison unavailable";
    const detail = lifestyleScenario
      ? "Controls the single comparison line; fixed and review-only expenses stay unchanged."
      : "Lifestyle helper output is not available for this preview.";
    return `
      <div class="income-impact-empty-inline" data-income-impact-lifestyle-scenario-status="${escapeHtml(lifestyleScenario?.status || "unavailable")}">
        <strong>${escapeHtml(label)}</strong>
        <span>${escapeHtml(detail)}</span>
      </div>
    `;
  }

  function renderCompressionReportingPanel(timelineResult) {
    const reporting = isPlainObject(timelineResult?.compressionReporting) ? timelineResult.compressionReporting : {};
    const layer5 = isPlainObject(reporting.layer5) ? reporting.layer5 : {};
    const opportunities = getCompressionItems(timelineResult, "compressionOpportunities");
    const pauseCandidates = getCompressionItems(timelineResult, "pauseCandidates");
    const protectedItems = getCompressionItems(timelineResult, "protectedExpenseItems");
    const excludedItems = getCompressionItems(timelineResult, "excludedExpenseItems");
    const protectedExcludedItems = protectedItems.concat(excludedItems);
    const dataGaps = getCompressionDataGaps(timelineResult);
    const policyByType = buildCompressionPolicyByType(timelineResult);
    const totalItems = opportunities.length + pauseCandidates.length + protectedExcludedItems.length + dataGaps.length;
    const enabled = layer5?.compressionTrace?.compressionReportingEnabled === true;
    const emptyCopy = enabled
      ? "No compression opportunities, pause candidates, protected items, exclusions, or compression-specific gaps were reported."
      : "Compression reporting is not available for this preview yet.";

    return `
      <article class="income-impact-card income-impact-compression-panel" data-income-impact-compression-panel>
        <div class="income-impact-card-header">
          <h3>Expense Compression Readiness</h3>
          <p data-income-impact-compression-reporting-only>Reporting only - not applied to the projection.</p>
        </div>
        ${renderLifestyleScenarioStatus(timelineResult)}
        ${renderCompressionScenarioStatus(layer5)}
        ${totalItems ? `
          <div class="income-impact-compression-counts" data-income-impact-compression-counts>
            <span><b>${opportunities.length}</b>Opportunities</span>
            <span><b>${pauseCandidates.length}</b>Pause</span>
            <span><b>${protectedExcludedItems.length}</b>Protected / excluded</span>
            <span><b>${dataGaps.length}</b>Data gaps</span>
          </div>
          <div class="income-impact-compression-groups">
            <section data-income-impact-compression-group="firstReductions">
              <h4>First reductions to review</h4>
              ${renderCompressionItemList(opportunities, "No reduction candidates reported.", { policyByType })}
            </section>
            <section data-income-impact-compression-group="contributionPauses">
              <h4>Contribution pauses</h4>
              ${renderCompressionItemList(pauseCandidates, "No contribution pause candidates reported.", { policyByType })}
            </section>
            <section data-income-impact-compression-group="protectedExcluded">
              <h4>Protected / excluded items</h4>
              ${renderCompressionItemList(protectedExcludedItems, "No protected or excluded items reported.", { policyByType })}
            </section>
            <section data-income-impact-compression-group="dataLimitations">
              <h4>Data limitations</h4>
              ${renderCompressionDataGapList(dataGaps)}
            </section>
            <section data-income-impact-compression-group="policySummary">
              <h4>Policy summary</h4>
              ${renderPolicyDecisionSummary(layer5.policyDecisionSummary)}
            </section>
          </div>
        ` : `
          <div class="income-impact-empty-inline" data-income-impact-compression-empty>${escapeHtml(emptyCopy)}</div>
          ${renderPolicyDecisionSummary(layer5.policyDecisionSummary)}
        `}
      </article>
    `;
  }

  function getPivotalEvents(timelineResult) {
    const riskEvaluation = isPlainObject(timelineResult?.riskEvaluation) ? timelineResult.riskEvaluation : {};
    return {
      risks: (Array.isArray(riskEvaluation.events) ? riskEvaluation.events : []).filter(isPlainObject),
      stable: (Array.isArray(riskEvaluation.stableEvents) ? riskEvaluation.stableEvents : []).filter(isPlainObject)
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
    if (!pieces.length && event?.monthIndex != null) {
      const months = toOptionalNumber(event.monthIndex);
      if (months === 0) {
        pieces.push("At death");
      } else if (months != null) {
        pieces.push(`Month ${months}`);
      }
    }
    return pieces.join(" - ");
  }

  function formatEvidenceValue(value) {
    const number = toOptionalNumber(value);
    if (number != null && Math.abs(number) >= 1000) {
      return formatCurrency(number);
    }
    if (Array.isArray(value)) {
      const items = value
        .slice(0, 3)
        .map(formatEvidenceValue)
        .filter(function (item) { return item && item !== UNAVAILABLE_COPY; });
      return items.length ? items.join(", ") : UNAVAILABLE_COPY;
    }
    if (isPlainObject(value)) {
      const entries = Object.keys(value)
        .filter(function (key) {
          const entryValue = value[key];
          return entryValue == null
            || typeof entryValue === "string"
            || typeof entryValue === "number"
            || typeof entryValue === "boolean";
        })
        .slice(0, 4)
        .map(function (key) {
          const label = key
            .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
            .replace(/[_-]+/g, " ")
            .replace(/\b\w/g, function (match) { return match.toUpperCase(); });
          return `${label}: ${formatEvidenceValue(value[key])}`;
        });
      return entries.length ? entries.join("; ") : UNAVAILABLE_COPY;
    }
    if (typeof value === "boolean") {
      return value ? "Yes" : "No";
    }
    if (value == null || value === "") {
      return UNAVAILABLE_COPY;
    }
    return String(value);
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

  function renderPivotalEventEvidence(event) {
    const evidence = Array.isArray(event?.evidence) ? event.evidence.filter(isPlainObject).slice(0, 3) : [];
    if (!evidence.length) {
      return "";
    }

    return `
      <dl class="income-impact-risk-evidence" data-income-impact-risk-evidence>
        ${evidence.map(function (item) {
          return `
            <div data-income-impact-risk-evidence-path="${escapeHtml(item.path || "")}">
              <dt>${escapeHtml(item.label || item.path || "Evidence")}</dt>
              <dd>${escapeHtml(formatEvidenceValue(item.value))}</dd>
            </div>
          `;
        }).join("")}
      </dl>
    `;
  }

  function renderRiskEvent(event) {
    const severity = String(event?.severity || "").trim();
    return `
      <article
        class="income-impact-risk-item"
        data-income-impact-risk-event
        data-income-impact-risk-severity="${escapeHtml(severity)}"
        data-income-impact-risk-type="${escapeHtml(event?.category || "")}"
        data-income-impact-risk-rule-id="${escapeHtml(event?.ruleId || event?.id || "")}"
      >
        <div class="income-impact-risk-item-header">
          <span class="income-impact-risk-severity" data-income-impact-risk-severity-label="${escapeHtml(severity)}">${escapeHtml(getRiskSeverityLabel(severity))}</span>
          <strong>${escapeHtml(event?.title || "Risk detected")}</strong>
        </div>
        <p>${escapeHtml(event?.summary || "Review this Income Impact scenario with the available facts.")}</p>
        ${renderPivotalEventMeta(event)}
        ${renderPivotalEventEvidence(event)}
        ${renderPivotalEventDataGaps(event)}
      </article>
    `;
  }

  function renderStableEvent(event) {
    return `
      <li data-income-impact-covered-event data-income-impact-covered-type="${escapeHtml(event?.category || "")}" data-income-impact-covered-rule-id="${escapeHtml(event?.ruleId || event?.id || "")}">
        <div>
          <strong>${escapeHtml(event?.title || "Covered item")}</strong>
          <p>${escapeHtml(event?.summary || "This item is represented in the current preview.")}</p>
        </div>
        ${renderPivotalEventMeta(event)}
        ${renderPivotalEventEvidence(event)}
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
          ${renderIncomeImpactTimelineGraph(timelineResult)}
          ${renderDataGaps(timelineResult)}
          ${renderWarnings(timelineResult)}
        </div>
      </article>
    `;
  }

  function renderIncomeImpact(host, context) {
    const timelineResult = isPlainObject(context?.timelineResult) ? context.timelineResult : {};
    host.innerHTML = `
      <div class="income-impact-layout" data-income-impact-layout>
        <div class="income-impact-layout-main" data-income-impact-layout-main>
          ${renderTimeline(timelineResult)}
        </div>
        <aside class="income-impact-layout-aside" data-income-impact-layout-aside aria-label="Income Impact supporting details">
          ${renderPivotalRiskPanel(timelineResult)}
          ${renderCompressionReportingPanel(timelineResult)}
          ${renderFinancialSecurityCard(timelineResult)}
          <div class="income-impact-runway-metric-stack" data-income-impact-runway-metric-stack>
            ${renderFinancialRunwayCards(timelineResult)}
          </div>
        </aside>
      </div>
    `;
  }

  function resolveAnalysisSettings(profileRecord, builderInput) {
    if (isPlainObject(profileRecord?.analysisSettings)) {
      return profileRecord.analysisSettings;
    }
    if (isPlainObject(builderInput?.analysisSettings)) {
      return builderInput.analysisSettings;
    }
    if (isPlainObject(builderInput?.protectionModelingPayload?.analysisSettings)) {
      return builderInput.protectionModelingPayload.analysisSettings;
    }
    return {};
  }

  function buildFinancialRunwayFromScenario(scenario, projectionHorizonYears) {
    const facts = isPlainObject(scenario?.timelineFacts) ? scenario.timelineFacts : {};
    const deathEvent = isPlainObject(scenario?.deathEvent) ? scenario.deathEvent : {};
    const postDeathSeries = isPlainObject(scenario?.postDeathSeries) ? scenario.postDeathSeries : {};
    const depletion = isPlainObject(postDeathSeries.depletion) ? postDeathSeries.depletion : {};
    const monthsCovered = toOptionalNumber(facts.monthsCovered);
    const yearsOfSecurity = monthsCovered == null ? null : Math.floor(Math.max(0, monthsCovered) / 12);
    const monthsOfSecurity = monthsCovered == null ? null : Math.round(Math.max(0, monthsCovered) % 12);
    const totalResourcesBeforeObligations = toOptionalNumber(deathEvent?.layer2?.resources?.totalResourcesBeforeObligations);
    return {
      status: scenario?.status === "complete" ? "complete" : "partial-estimate",
      startingResources: totalResourcesBeforeObligations,
      existingCoverage: facts.coverageAdded,
      availableAssets: facts.survivorAvailableTreatedAssets,
      immediateObligations: deathEvent.immediateObligations,
      netAvailableResources: facts.resourcesAfterObligations,
      annualHouseholdNeed: null,
      annualSurvivorIncome: null,
      annualShortfall: null,
      yearsOfSecurity,
      monthsOfSecurity,
      totalMonthsOfSecurity: monthsCovered,
      depletionDate: facts.depletionDate,
      depletionYear: facts.depletionDate ? Number(String(facts.depletionDate).slice(0, 4)) : null,
      projectionYears: projectionHorizonYears,
      projectionPoints: [],
      warnings: Array.isArray(scenario?.warnings) ? scenario.warnings : [],
      dataGaps: Array.isArray(scenario?.dataGaps) ? scenario.dataGaps : [],
      trace: {
        source: "composeIncomeImpactScenario.timelineFacts"
      }
    };
  }

  function buildSummaryCardsFromScenario(scenario) {
    const facts = isPlainObject(scenario?.timelineFacts) ? scenario.timelineFacts : {};
    const depletionDate = facts.depletionDate;
    const monthsCovered = facts.monthsCovered;
    const displayValue = depletionDate ? formatMonthsCovered(monthsCovered) : "Not depleted within horizon";
    return [
      {
        id: "yearsOfFinancialSecurity",
        displayValue,
        status: scenario?.status === "complete" ? "complete" : "partial-estimate"
      }
    ];
  }

  function recalculateLifestyleDepletion(points, fallbackDate) {
    const depletedPoint = (Array.isArray(points) ? points : []).find(function (point) {
      const endingResources = toOptionalNumber(point?.endingResources);
      return endingResources != null && endingResources <= 0;
    });
    if (!depletedPoint) {
      return {
        depleted: false,
        depletionDate: null,
        depletionMonthIndex: null,
        monthsCovered: Array.isArray(points) ? points.length : 0,
        precision: "monthly"
      };
    }
    return {
      depleted: true,
      depletionDate: depletedPoint.date || fallbackDate || null,
      depletionMonthIndex: toOptionalNumber(depletedPoint.monthIndex),
      monthsCovered: toOptionalNumber(depletedPoint.monthIndex),
      precision: "monthly"
    };
  }

  function summarizeLifestylePostDeathPoints(points, baseSummary) {
    const totals = (Array.isArray(points) ? points : []).reduce(function (next, point) {
      next.totalSurvivorNeeds = roundMoney(next.totalSurvivorNeeds + (toOptionalNumber(point?.survivorNeeds) || 0));
      next.totalNetUse = roundMoney(next.totalNetUse + (toOptionalNumber(point?.netUse) || 0));
      return next;
    }, {
      totalSurvivorNeeds: 0,
      totalNetUse: 0
    });
    const lastPoint = Array.isArray(points) ? points[points.length - 1] || {} : {};
    return Object.assign({}, clonePlainValue(baseSummary || {}), totals, {
      endingResources: toOptionalNumber(lastPoint.endingResources),
      accumulatedUnmetNeed: toOptionalNumber(lastPoint.accumulatedUnmetNeed)
    });
  }

  function buildLifestyleAdjustedPostDeathSeries(basePostDeathSeries, lifestyleScenario) {
    const basePoints = Array.isArray(basePostDeathSeries?.points) ? basePostDeathSeries.points : [];
    const monthlyDelta = toOptionalNumber(lifestyleScenario?.monthlyDelta) || 0;
    let cumulativeExpenseDelta = 0;
    const points = basePoints.map(function (basePoint) {
      const point = clonePlainValue(basePoint);
      const baseSurvivorNeeds = toOptionalNumber(basePoint.survivorNeeds);
      const baseDiscretionaryNeeds = toOptionalNumber(basePoint.discretionaryNeeds);
      const baseNetUse = toOptionalNumber(basePoint.netUse);
      const baseStartingResources = toOptionalNumber(basePoint.startingResources);
      const baseEndingResources = toOptionalNumber(basePoint.endingResources);
      const baseAvailableResources = toOptionalNumber(basePoint.availableResources);
      cumulativeExpenseDelta = roundMoney(cumulativeExpenseDelta + monthlyDelta);
      const endingResources = baseEndingResources == null ? null : roundMoney(baseEndingResources - cumulativeExpenseDelta);
      const availableResources = endingResources == null
        ? (baseAvailableResources == null ? null : roundMoney(baseAvailableResources - cumulativeExpenseDelta))
        : roundMoney(Math.max(0, endingResources));
      const accumulatedUnmetNeed = endingResources == null ? null : roundMoney(Math.max(0, -endingResources));
      const survivorNeeds = baseSurvivorNeeds == null ? point.survivorNeeds : roundMoney(Math.max(0, baseSurvivorNeeds + monthlyDelta));
      const discretionaryNeeds = baseDiscretionaryNeeds == null ? point.discretionaryNeeds : roundMoney(Math.max(0, baseDiscretionaryNeeds + monthlyDelta));
      const netUse = baseNetUse == null ? point.netUse : roundMoney(Math.max(0, baseNetUse + monthlyDelta));

      return Object.assign({}, point, {
        startingResources: baseStartingResources == null
          ? point.startingResources
          : roundMoney(baseStartingResources - cumulativeExpenseDelta + monthlyDelta),
        discretionaryNeeds,
        survivorNeeds,
        netUse,
        endingResources,
        availableResources,
        accumulatedUnmetNeed,
        status: endingResources != null && endingResources <= 0 ? "depleted" : "available",
        trace: Object.assign({}, isPlainObject(point.trace) ? point.trace : {}, {
          lifestyleScenarioApplied: true,
          baseScenarioPointMutated: false,
          lifestyleSliderValue: lifestyleScenario?.sliderValue ?? 0,
          monthlyExpenseDeltaApplied: monthlyDelta,
          cumulativeExpenseDeltaApplied: cumulativeExpenseDelta
        }),
        sourcePaths: Array.from(new Set([].concat(point.sourcePaths || [], ["lifestyleScenario.adjustedExpenses"])))
      });
    });
    const depletion = recalculateLifestyleDepletion(points, basePostDeathSeries?.depletion?.depletionDate);
    return {
      points,
      summary: summarizeLifestylePostDeathPoints(points, basePostDeathSeries?.summary),
      depletion
    };
  }

  function buildLifestyleComparisonScenario(scenario, lifestyleScenario) {
    const basePostDeathSeries = isPlainObject(scenario?.postDeathSeries) ? scenario.postDeathSeries : {};
    if (!isPlainObject(lifestyleScenario) || !Array.isArray(basePostDeathSeries.points) || basePostDeathSeries.points.length < 2) {
      return null;
    }
    const postDeathSeries = buildLifestyleAdjustedPostDeathSeries(basePostDeathSeries, lifestyleScenario);
    return {
      scenarioId: "income-impact-lifestyle-adjusted-comparison",
      kind: "compression",
      pathId: "compression-post-death-resources",
      label: "Lifestyle-adjusted projection",
      status: lifestyleScenario.status || "complete",
      reductionsApplied: [],
      pausesApplied: [],
      postDeathSeries,
      depletion: postDeathSeries.depletion,
      accumulatedUnmetNeed: postDeathSeries.summary.accumulatedUnmetNeed ?? null,
      trace: {
        calculationMethod: "income-impact-lifestyle-comparison-adapter-v1",
        sourceCalculationMethod: lifestyleScenario.trace?.calculationMethod || null,
        sliderValue: lifestyleScenario.sliderValue ?? 0,
        monthlyDelta: lifestyleScenario.monthlyDelta ?? 0,
        baseScenarioMutated: false,
        timingApplied: false,
        graphPathId: "compression-post-death-resources"
      }
    };
  }

  function buildIncomeImpactResultFromState(state) {
    const safeState = isPlainObject(state) ? state : {};
    const scenarioState = isPlainObject(safeState.scenarioState) ? safeState.scenarioState : {};
    const projectionHorizonYears = clampProjectionHorizonYears(scenarioState.projectionHorizonYears);
    const mortgageTreatmentOverride = normalizeMortgageTreatmentOverride(scenarioState.mortgageTreatmentOverride);
    const lifestyleSliderValue = clampLifestyleSliderValue(scenarioState.lifestyleSliderValue);
    const deathAgeState = isPlainObject(safeState.deathAgeState) ? safeState.deathAgeState : {};
    const selectedDeathAge = deathAgeState.hasDateOfBirth
      ? clampRoundedAge(deathAgeState.selectedDeathAge, deathAgeState.minAge, deathAgeState.maxAge)
      : null;
    const selectedDeathDate = resolveSelectedDeathDate(safeState.valuationDate, deathAgeState);
    const scenarioOptions = {
      mortgageTreatmentOverride,
      includeDiscretionaryNeeds: true,
      projectionCadence: "monthly"
    };

    if (deathAgeState.hasDateOfBirth) {
      deathAgeState.selectedDeathAge = selectedDeathAge;
    }

    const scenario = safeState.composeIncomeImpactScenario({
      valuationDate: safeState.valuationDate,
      selectedDeathDate,
      selectedDeathAge,
      projectionHorizonMonths: projectionHorizonYears * 12,
      lensModel: safeState.lensModel,
      analysisSettings: safeState.analysisSettings,
      scenarioOptions
    });
    const riskEvaluation = safeState.evaluateIncomeImpactRiskEvents({
      scenario
    });
    const compressionPrep = typeof safeState.prepareIncomeImpactCompressionReportingInputs === "function"
      ? safeState.prepareIncomeImpactCompressionReportingInputs({
        lensModel: safeState.lensModel,
        options: {
          householdContext: "survivor",
          includeAdvisorConfirmed: false,
          includePauseCandidates: true
        }
      })
      : null;
    const compressionScenarioResult = compressionPrep && typeof safeState.calculateIncomeImpactCompressionScenario === "function"
      ? safeState.calculateIncomeImpactCompressionScenario({
        scenario,
        compressionReport: compressionPrep.compressionReport,
        compressionPolicyRules: compressionPrep.compressionPolicyRules,
        options: {
          mode: "alternateScenarioOnly",
          scenarioId: "income-impact-expense-compression-alternate",
          applyPauseCandidates: true,
          requireCompleteItemization: true
        }
      })
      : null;
    const lifestyleScenario = typeof safeState.calculateIncomeImpactLifestyleScenario === "function"
      ? safeState.calculateIncomeImpactLifestyleScenario({
        expenseFacts: safeState.lensModel?.expenseFacts,
        sliderValue: lifestyleSliderValue
      })
      : null;
    const lifestyleComparisonScenario = buildLifestyleComparisonScenario(scenario, lifestyleScenario);
    const triageInterventions = typeof safeState.calculateIncomeImpactTriageInterventions === "function"
      ? safeState.calculateIncomeImpactTriageInterventions({
        scenario,
        riskEvaluation,
        compressionReport: compressionPrep?.compressionReport,
        compressionPolicyRules: compressionPrep?.compressionPolicyRules,
        compressionScenarioResult
      })
      : null;
    const comparisonScenarios = lifestyleComparisonScenario ? [lifestyleComparisonScenario] : [];
    const graphModel = safeState.buildIncomeImpactTimelineGraphModel({
      scenario,
      riskEvaluation,
      comparisonScenarios,
      options: {
        preserveSignedResources: true,
        currentAgeMode: "death-event-only"
      }
    });
    const dataGaps = []
      .concat(Array.isArray(scenario?.dataGaps) ? scenario.dataGaps : [])
      .concat(Array.isArray(riskEvaluation?.dataGaps) ? riskEvaluation.dataGaps : [])
      .concat(Array.isArray(graphModel?.dataGaps) ? graphModel.dataGaps : []);
    const warnings = []
      .concat(Array.isArray(scenario?.warnings) ? scenario.warnings : [])
      .concat(Array.isArray(riskEvaluation?.warnings) ? riskEvaluation.warnings : [])
      .concat(Array.isArray(graphModel?.warnings) ? graphModel.warnings : []);

    return {
      selectedDeath: {
        date: scenario?.scenario?.selectedDeathDate || selectedDeathDate,
        age: scenario?.scenario?.selectedDeathAge ?? selectedDeathAge
      },
      scenario,
      riskEvaluation,
      triageInterventions,
      compressionReporting: {
        prep: compressionPrep,
        scenario: compressionScenarioResult,
        lifestyleScenario,
        layer5: triageInterventions,
        trace: {
          reportingOnly: true,
          displayWired: Boolean(compressionPrep && triageInterventions),
          alternateScenarioPrepared: Boolean(compressionScenarioResult),
          alternateScenarioStatus: compressionScenarioResult?.status || null,
          lifestyleScenarioPrepared: Boolean(lifestyleScenario),
          lifestyleScenarioStatus: lifestyleScenario?.status || null,
          lifestyleSliderValue,
          timelineMarkersCreated: false,
          graphPathChanged: Boolean(lifestyleComparisonScenario),
          reductionsApplied: false
        }
      },
      graphModel,
      financialRunway: buildFinancialRunwayFromScenario(scenario, projectionHorizonYears),
      summaryCards: buildSummaryCardsFromScenario(scenario),
      dataGaps,
      warnings,
      trace: {
        source: "income-impact-display-composer-risk-bridge",
        composerStatus: scenario?.status || null,
        riskEvaluatorStatus: riskEvaluation?.status || null,
        retiredTimelineChartRendered: false
      }
    };
  }

  function renderIncomeImpactFromState() {
    if (
      !incomeImpactState?.host
      || typeof incomeImpactState.composeIncomeImpactScenario !== "function"
      || typeof incomeImpactState.evaluateIncomeImpactRiskEvents !== "function"
      || typeof incomeImpactState.buildIncomeImpactTimelineGraphModel !== "function"
    ) {
      return;
    }

    const timelineResult = buildIncomeImpactResultFromState(incomeImpactState);
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

    if (scenarioElements.lifestyleSlider) {
      const updateLifestyleSlider = function (event) {
        const scenarioState = incomeImpactState?.scenarioState;
        if (!scenarioState) {
          return;
        }

        scenarioState.lifestyleSliderValue = clampLifestyleSliderValue(event?.target?.value);
        renderIncomeImpactFromState();
      };
      scenarioElements.lifestyleSlider.addEventListener("input", updateLifestyleSlider);
      scenarioElements.lifestyleSlider.addEventListener("change", updateLifestyleSlider);
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
    const composeIncomeImpactScenario = currentLensAnalysis.composeIncomeImpactScenario;
    const evaluateIncomeImpactRiskEvents = currentLensAnalysis.evaluateIncomeImpactRiskEvents;
    const buildIncomeImpactTimelineGraphModel = currentLensAnalysis.buildIncomeImpactTimelineGraphModel;
    const prepareIncomeImpactCompressionReportingInputs = currentLensAnalysis.prepareIncomeImpactCompressionReportingInputs;
    const calculateIncomeImpactCompressionScenario = currentLensAnalysis.calculateIncomeImpactCompressionScenario;
    const calculateIncomeImpactLifestyleScenario = currentLensAnalysis.incomeImpactLifestyleScenarioCalculations?.calculateIncomeImpactLifestyleScenario;
    const calculateIncomeImpactTriageInterventions = currentLensAnalysis.calculateIncomeImpactTriageInterventions;

    if (typeof buildLensModelFromSavedProtectionModeling !== "function") {
      renderEmptyState(host, "Income impact unavailable", "Lens saved-data builder is unavailable.");
      return;
    }

    if (typeof composeIncomeImpactScenario !== "function") {
      renderEmptyState(host, "Income impact unavailable", "Income impact scenario composer is unavailable.");
      return;
    }

    if (typeof evaluateIncomeImpactRiskEvents !== "function") {
      renderEmptyState(host, "Income impact unavailable", "Income impact risk evaluator is unavailable.");
      return;
    }

    if (typeof buildIncomeImpactTimelineGraphModel !== "function") {
      renderEmptyState(host, "Income impact unavailable", "Income impact graph model builder is unavailable.");
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
      const builderInput = {
        profileRecord,
        protectionModelingPayload,
        taxConfig: createSavedDataTaxConfig()
      };
      const builderResult = buildLensModelFromSavedProtectionModeling(builderInput);

      if (!builderResult?.lensModel) {
        renderEmptyState(host, "Income impact unavailable", "The saved Lens model could not be built for this profile.");
        return;
      }

      const valuationDate = resolveTimelineValuationDate(profileRecord, builderResult.lensModel);
      incomeImpactState = {
        host,
        lensModel: builderResult.lensModel,
        profileRecord,
        analysisSettings: resolveAnalysisSettings(profileRecord, builderInput),
        valuationDate,
        composeIncomeImpactScenario,
        evaluateIncomeImpactRiskEvents,
        buildIncomeImpactTimelineGraphModel,
        prepareIncomeImpactCompressionReportingInputs,
        calculateIncomeImpactCompressionScenario,
        calculateIncomeImpactLifestyleScenario,
        calculateIncomeImpactTriageInterventions,
        deathAgeState: resolveDeathAgeControlState(builderResult.lensModel, valuationDate),
        scenarioState: {
          projectionHorizonYears: DEFAULT_PROJECTION_HORIZON_YEARS,
          mortgageTreatmentOverride: "followAssumptions",
          lifestyleSliderValue: 0,
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
