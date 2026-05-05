(function (window) {
  const root = window.LensApp = window.LensApp || {};
  const lensAnalysis = root.lensAnalysis = root.lensAnalysis || {};

  const UNAVAILABLE_COPY = "Not available";
  const EMPTY_MESSAGE = "Not available until income and survivor inputs are completed.";
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
      ageValue: control.querySelector("[data-income-impact-death-age-value]"),
      dateValue: control.querySelector("[data-income-impact-death-date-value]"),
      warning: control.querySelector("[data-income-impact-death-age-warning]")
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

  function findSummaryCard(timelineResult, id) {
    const summaryCards = Array.isArray(timelineResult?.summaryCards) ? timelineResult.summaryCards : [];
    return summaryCards.find(function (card) {
      return card?.id === id;
    }) || null;
  }

  function renderFinancialSecurityCard(timelineResult) {
    const card = findSummaryCard(timelineResult, "yearsOfFinancialSecurity");
    const displayValue = card?.displayValue || UNAVAILABLE_COPY;
    const status = card?.status || "notAvailable";
    const warnings = Array.isArray(timelineResult?.warnings) ? timelineResult.warnings : [];
    const dataGaps = Array.isArray(timelineResult?.dataGaps) ? timelineResult.dataGaps : [];
    const unavailableReason = status === "available"
      ? ""
      : (
        warnings.find(function (warning) {
          return String(warning?.code || "").includes("annual")
            || String(warning?.code || "").includes("resources")
            || String(warning?.message || "").includes("Years of Financial Security");
        })?.message
        || dataGaps[0]?.label
        || "Complete income, survivor income, coverage, liquidity, and obligation facts to calculate this estimate."
      );

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

  function getTimelineEventColor(event) {
    const type = String(event?.type || "");
    if (type === "death") {
      return "#111827";
    }
    if (type === "incomeStops" || type === "debtObligation" || type === "mortgageObligation" || type === "finalExpensesDue") {
      return "#b42318";
    }
    if (type === "coverageAvailable" || type === "liquidityCheckpoint") {
      return "#166534";
    }
    if (type === "survivorIncomeContinues" || type === "householdExpenseRunway" || type === "supportNeedEnds") {
      return "#1d4ed8";
    }
    if (type === "dependentMilestone" || type === "educationWindow") {
      return "#6d28d9";
    }
    if (type === "dataGap" || (Array.isArray(event?.warnings) && event.warnings.length)) {
      return "#b45309";
    }
    return "#475569";
  }

  function getTimelineEventLabel(event) {
    const label = String(event?.label || event?.type || "Timeline event").trim();
    return label.length > 28 ? `${label.slice(0, 25)}...` : label;
  }

  function getTimelineEventAmountLabel(event) {
    const amount = toOptionalNumber(event?.amount);
    return amount == null ? "Fact-based event" : formatCurrency(amount);
  }

  function buildVisualTimelineEvents(events) {
    const sortedEvents = events
      .map(function (event, index) {
        return {
          event,
          index,
          date: parseDateOnlyValue(event.date)
        };
      })
      .sort(function (left, right) {
        if (left.date && right.date) {
          return left.date.getTime() - right.date.getTime() || left.index - right.index;
        }
        if (left.date) {
          return -1;
        }
        if (right.date) {
          return 1;
        }
        return left.index - right.index;
      });

    const width = 960;
    const height = 260;
    const xStart = 58;
    const xEnd = width - 58;
    const markerY = 132;
    const datedEvents = sortedEvents.filter(function (item) {
      return item.date;
    });
    const times = datedEvents.map(function (item) {
      return item.date.getTime();
    });
    const minTime = times.length ? Math.min(...times) : null;
    const maxTime = times.length ? Math.max(...times) : null;
    const hasDateSpan = minTime != null && maxTime != null && maxTime > minTime;

    return {
      width,
      height,
      xStart,
      xEnd,
      markerY,
      axisStart: datedEvents[0]?.event?.date || sortedEvents[0]?.event?.date || "",
      axisEnd: datedEvents[datedEvents.length - 1]?.event?.date || sortedEvents[sortedEvents.length - 1]?.event?.date || "",
      events: sortedEvents.map(function (item, index) {
        const distributedX = xStart + (((index + 1) / (sortedEvents.length + 1)) * (xEnd - xStart));
        const dateX = item.date && hasDateSpan
          ? xStart + (((item.date.getTime() - minTime) / (maxTime - minTime)) * (xEnd - xStart))
          : distributedX;
        const labelY = index % 2 === 0 ? 72 : 205;
        const anchor = dateX < 150 ? "start" : (dateX > width - 150 ? "end" : "middle");

        return {
          event: item.event,
          x: Math.round(dateX * 100) / 100,
          labelY,
          anchor,
          markerY
        };
      })
    };
  }

  function renderVisualTimelineChart(timelineResult) {
    const events = getTimelineEvents(timelineResult);
    if (!events.length) {
      return `<div class="income-impact-empty-inline" data-income-impact-visual-timeline>${escapeHtml(EMPTY_MESSAGE)}</div>`;
    }

    const model = buildVisualTimelineEvents(events);

    return `
      <div class="income-impact-timeline-chart" data-income-impact-visual-timeline data-income-impact-visual-event-count="${escapeHtml(String(events.length))}" aria-label="Helper-driven household impact timeline visualization">
        <div class="income-impact-chart-topline">
          <strong>Selected scenario timeline</strong>
          <p>Built from helper events for the selected death age/date. This preview does not change the LENS recommendation.</p>
        </div>
        <svg class="income-impact-timeline-svg" viewBox="0 0 ${model.width} ${model.height}" role="img" aria-label="Fact-based household impact timeline for selected death scenario">
          <g class="income-impact-chart-grid" aria-hidden="true">
            <line x1="${model.xStart}" y1="132" x2="${model.xEnd}" y2="132"></line>
            <line x1="${model.xStart}" y1="64" x2="${model.xStart}" y2="206"></line>
            <line x1="${model.xEnd}" y1="64" x2="${model.xEnd}" y2="206"></line>
          </g>
          <g class="income-impact-timeline-columns" data-income-impact-visual-timeline-events>
            ${model.events.map(function (item) {
              const event = item.event;
              const color = getTimelineEventColor(event);
              const label = getTimelineEventLabel(event);
              const hasWarning = Array.isArray(event?.warnings) && event.warnings.length > 0;
              return `
                <g
                  data-income-impact-visual-event
                  data-income-impact-visual-event-type="${escapeHtml(event.type)}"
                  data-income-impact-visual-event-date="${escapeHtml(event.date || "")}"
                  data-income-impact-visual-event-age="${escapeHtml(event.age == null ? "" : String(event.age))}"
                  data-income-impact-visual-event-warning="${hasWarning ? "true" : "false"}"
                >
                  <line class="income-impact-timeline-column" x1="${item.x}" y1="${item.labelY < item.markerY ? item.labelY + 10 : item.markerY}" x2="${item.x}" y2="${item.labelY < item.markerY ? item.markerY : item.labelY - 10}"></line>
                  <circle cx="${item.x}" cy="${item.markerY}" r="8" fill="${color}" stroke="#ffffff" stroke-width="3"></circle>
                  <text x="${item.x}" y="${item.labelY}" text-anchor="${item.anchor}" fill="${color}" font-size="16" font-weight="700">${escapeHtml(label)}</text>
                  <text x="${item.x}" y="${item.labelY + 18}" text-anchor="${item.anchor}" fill="#647085" font-size="13">${escapeHtml(formatTimelineTiming(event))}</text>
                  <title>${escapeHtml(`${event.label || event.type}: ${formatTimelineTiming(event)} - ${getTimelineEventAmountLabel(event)}`)}</title>
                </g>
              `;
            }).join("")}
          </g>
        </svg>
        <div class="income-impact-chart-axis" aria-hidden="true">
          <span>${escapeHtml(formatTimelineAxisDate(model.axisStart) || "Start")}</span>
          <span>${escapeHtml(formatTimelineAxisDate(model.axisEnd) || "End")}</span>
        </div>
        <div class="income-impact-chart-hover-label">Timeline events are sourced from calculateIncomeLossImpactTimeline().</div>
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

  function renderTimeline(timelineResult) {
    return `
      <article class="income-impact-card income-impact-card--wide" data-income-impact-helper-timeline>
        <div class="income-impact-card-header">
          <h3>Household Impact Timeline</h3>
          <p>Fact-based events from linked profile and Protection Modeling information for the selected death age/date.</p>
        </div>
        <div class="income-impact-timeline" aria-label="Fact-based household impact timeline">
          ${renderVisualTimelineChart(timelineResult)}
          ${renderTimelineEvents(timelineResult)}
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
        ${renderFinancialSecurityCard(timelineResult)}
        ${renderTimeline(timelineResult)}
      </div>
    `;
  }

  function calculateTimelineResultFromState(state) {
    const safeState = isPlainObject(state) ? state : {};
    const input = {
      lensModel: safeState.lensModel,
      valuationDate: safeState.valuationDate,
      profileRecord: safeState.profileRecord
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
    }

    return safeState.calculateIncomeLossImpactTimeline(input);
  }

  function renderIncomeImpactFromState() {
    if (!incomeImpactState?.host || typeof incomeImpactState.calculateIncomeLossImpactTimeline !== "function") {
      return;
    }

    const timelineResult = calculateTimelineResultFromState(incomeImpactState);
    renderIncomeImpact(incomeImpactState.host, {
      lensModel: incomeImpactState.lensModel,
      timelineResult,
      builderWarnings: incomeImpactState.builderWarnings
    });
    updateDeathAgeControl(timelineResult, incomeImpactState.deathAgeState);
  }

  function bindDeathAgeControl() {
    const elements = getDeathAgeControlElements();
    if (!elements?.slider) {
      return;
    }

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

    elements.slider.addEventListener("input", updateSelectedDeathAge);
    elements.slider.addEventListener("change", updateSelectedDeathAge);
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
        builderWarnings: builderResult.warnings
      };

      renderIncomeImpactFromState();
      bindDeathAgeControl();
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
