(function (window) {
  const root = window.LensApp = window.LensApp || {};
  const lensAnalysis = root.lensAnalysis = root.lensAnalysis || {};

  const UNAVAILABLE_COPY = "Not available";
  const EMPTY_MESSAGE = "Not available until income and survivor inputs are completed.";
  const DEFAULT_PROJECTION_HORIZON_YEARS = 40;
  const MIN_PROJECTION_HORIZON_YEARS = 5;
  const MAX_PROJECTION_HORIZON_YEARS = 100;
  const GRAPH_VIEW_BOX = Object.freeze({
    width: 1000,
    height: 430,
    plotLeft: 74,
    plotTop: 36,
    plotWidth: 884,
    plotHeight: 318
  });
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

  function buildSvgPath(points) {
    const usablePoints = (Array.isArray(points) ? points : []).filter(function (point) {
      return toOptionalNumber(point?.xRatio) != null && toOptionalNumber(point?.yRatio) != null;
    });
    if (usablePoints.length < 2) {
      return "";
    }
    return usablePoints.map(function (point, index) {
      const command = index === 0 ? "M" : "L";
      return `${command}${toGraphX(point.xRatio)} ${toGraphY(point.yRatio)}`;
    }).join(" ");
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
          const radius = marker.kind === "stable" ? 5 : 7;
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

  function renderGraphPath(pathId, points, label) {
    const path = buildSvgPath(points);
    if (!path) {
      return "";
    }
    return `<path class="income-impact-graph-path income-impact-graph-path--${escapeHtml(pathId)}" data-income-impact-graph-path="${escapeHtml(pathId)}" d="${escapeHtml(path)}" aria-label="${escapeHtml(label)}"></path>`;
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
          ${renderGraphDeathAnchor(graphModel)}
        </g>
        ${renderGraphMarkers(graphModel)}
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

  function buildIncomeImpactResultFromState(state) {
    const safeState = isPlainObject(state) ? state : {};
    const scenarioState = isPlainObject(safeState.scenarioState) ? safeState.scenarioState : {};
    const projectionHorizonYears = clampProjectionHorizonYears(scenarioState.projectionHorizonYears);
    const mortgageTreatmentOverride = normalizeMortgageTreatmentOverride(scenarioState.mortgageTreatmentOverride);
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
    const graphModel = safeState.buildIncomeImpactTimelineGraphModel({
      scenario,
      riskEvaluation,
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
