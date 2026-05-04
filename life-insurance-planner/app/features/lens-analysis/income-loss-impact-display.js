(function (window) {
  const root = window.LensApp = window.LensApp || {};
  const lensAnalysis = root.lensAnalysis = root.lensAnalysis || {};

  const UNAVAILABLE_COPY = "Not available";
  const EMPTY_MESSAGE = "Not available until income and survivor inputs are completed.";
  const PLACEHOLDER_SUPPORT_GAP_TIMELINE_START_YEAR = 2026;
  const PLACEHOLDER_SUPPORT_GAP_TIMELINE_YEARS = 15;
  const PLACEHOLDER_SUPPORT_GAP_TIMELINE_START_VALUE = 184000;
  const MONTH_LABELS = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec"
  ];

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

  function formatPercent(value) {
    const number = toOptionalNumber(value);
    if (number == null) {
      return UNAVAILABLE_COPY;
    }

    return `${number.toLocaleString("en-US", { maximumFractionDigits: 2 })}%`;
  }

  function formatMonths(value) {
    const number = toOptionalNumber(value);
    if (number == null) {
      return UNAVAILABLE_COPY;
    }

    const rounded = Math.round(number * 10) / 10;
    return `${rounded.toLocaleString("en-US", { maximumFractionDigits: 1 })} ${rounded === 1 ? "month" : "months"}`;
  }

  function formatYears(value) {
    const number = toOptionalNumber(value);
    if (number == null) {
      return UNAVAILABLE_COPY;
    }

    const rounded = Math.round(number * 10) / 10;
    return `${rounded.toLocaleString("en-US", { maximumFractionDigits: 1 })} ${rounded === 1 ? "year" : "years"}`;
  }

  function formatCompactCurrency(value) {
    const number = toOptionalNumber(value);
    if (number == null) {
      return UNAVAILABLE_COPY;
    }

    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      notation: "compact",
      maximumFractionDigits: 0
    }).format(number);
  }

  function formatBoolean(value) {
    if (value === true) {
      return "Yes";
    }

    if (value === false) {
      return "No";
    }

    return UNAVAILABLE_COPY;
  }

  function formatSource(value) {
    const normalized = String(value || "").trim();
    return normalized || "Linked profile and Protection Modeling facts";
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

    return `
      <article class="income-impact-card income-impact-card--wide" data-income-impact-financial-security-card data-income-impact-summary-card-id="yearsOfFinancialSecurity" data-income-impact-summary-status="${escapeHtml(status)}">
        <div class="income-impact-card-header">
          <h2>Years of Financial Security</h2>
          <p>Read-only estimate from linked profile and Protection Modeling information. It does not change the LENS recommendation.</p>
        </div>
        <strong class="income-impact-financial-security-value" data-income-impact-financial-security-value data-income-impact-helper-summary-card="yearsOfFinancialSecurity">${escapeHtml(displayValue)}</strong>
      </article>
    `;
  }

  function renderMetric(label, value, helper) {
    return `
      <article class="income-impact-metric">
        <span>${escapeHtml(label)}</span>
        <strong>${escapeHtml(value)}</strong>
        <p>${escapeHtml(helper)}</p>
      </article>
    `;
  }

  function renderRows(rows) {
    return `
      <ul class="income-impact-list">
        ${rows.map(function (row) {
          return `
            <li>
              <span>${escapeHtml(row.label)}</span>
              <strong>${escapeHtml(row.value)}</strong>
            </li>
          `;
        }).join("")}
      </ul>
    `;
  }

  function renderCard(title, helper, rows) {
    return `
      <article class="income-impact-card">
        <div class="income-impact-card-header">
          <h3>${escapeHtml(title)}</h3>
          <p>${escapeHtml(helper)}</p>
        </div>
        ${renderRows(rows)}
      </article>
    `;
  }

  function smoothPlaceholderPoints(points) {
    if (!Array.isArray(points) || points.length < 5) {
      return Array.isArray(points) ? points : [];
    }

    const weights = [1, 3, 4, 3, 1];
    const weightTotal = weights.reduce(function (total, weight) {
      return total + weight;
    }, 0);

    return points.map(function (point, index) {
      if (index < 2 || index > points.length - 3) {
        return point;
      }

      const y = weights.reduce(function (total, weight, weightIndex) {
        return total + (points[index + weightIndex - 2].y * weight);
      }, 0) / weightTotal;

      return {
        ...point,
        y: Math.round(y * 100) / 100
      };
    });
  }

  function buildSmoothPath(points) {
    if (!Array.isArray(points) || !points.length) {
      return "";
    }

    if (points.length === 1) {
      return `M ${points[0].x} ${points[0].y}`;
    }

    let path = `M ${points[0].x} ${points[0].y}`;
    const tension = 0.82;
    for (let index = 0; index < points.length - 1; index += 1) {
      const previous = points[Math.max(0, index - 1)];
      const current = points[index];
      const next = points[index + 1];
      const after = points[Math.min(points.length - 1, index + 2)];
      const firstControl = {
        x: current.x + ((next.x - previous.x) * tension / 6),
        y: current.y + ((next.y - previous.y) * tension / 6)
      };
      const secondControl = {
        x: next.x - ((after.x - current.x) * tension / 6),
        y: next.y - ((after.y - current.y) * tension / 6)
      };

      path += ` C ${Math.round(firstControl.x * 100) / 100} ${Math.round(firstControl.y * 100) / 100}, ${Math.round(secondControl.x * 100) / 100} ${Math.round(secondControl.y * 100) / 100}, ${next.x} ${next.y}`;
    }

    return path;
  }

  function getPlaceholderChartY(value, maxValue, chartTop, chartBottom) {
    const ratio = Math.max(0, Math.min(1, value / Math.max(maxValue, 1)));
    return Math.round((chartBottom - (ratio * (chartBottom - chartTop))) * 100) / 100;
  }

  function buildPlaceholderSupportGapTimelineValues() {
    const totalMonths = PLACEHOLDER_SUPPORT_GAP_TIMELINE_YEARS * 12;
    const lastIndex = totalMonths - 1;

    return Array.from({ length: totalMonths }, function (_item, index) {
      const progress = lastIndex <= 0 ? 1 : index / lastIndex;
      const monthIndex = index % 12;
      const year = PLACEHOLDER_SUPPORT_GAP_TIMELINE_START_YEAR + Math.floor(index / 12);
      const taper = Math.pow(1 - progress, 1.18);
      const primaryWave = Math.sin(index * 0.42) * 4200 * (1 - progress);
      const referenceWave = Math.cos(index * 0.38) * 2600 * (1 - progress);
      const primaryGap = index === lastIndex
        ? 0
        : Math.max(0, Math.round((PLACEHOLDER_SUPPORT_GAP_TIMELINE_START_VALUE * taper) + primaryWave));
      const referenceGap = index === lastIndex
        ? 0
        : Math.max(0, Math.round((PLACEHOLDER_SUPPORT_GAP_TIMELINE_START_VALUE * 0.78 * taper) + referenceWave));

      return {
        label: `${MONTH_LABELS[monthIndex]} ${year}`,
        shortLabel: MONTH_LABELS[monthIndex],
        year,
        primaryGap,
        referenceGap
      };
    });
  }

  function renderPlaceholderTimelineChart() {
    const values = buildPlaceholderSupportGapTimelineValues();
    const width = 960;
    const height = 260;
    const chartTop = 26;
    const chartBottom = 202;
    const xStart = 10;
    const xEnd = width - 10;
    const monthWidth = (xEnd - xStart) / Math.max(values.length, 1);
    const maxGap = Math.max(...values.map(function (item) {
      return Math.max(item.primaryGap, item.referenceGap);
    }), 1);
    const monthPoints = values.map(function (item, index) {
      const leftX = xStart + (index * monthWidth);
      const rightX = leftX + monthWidth;
      const centerX = leftX + (monthWidth / 2);
      const primaryY = getPlaceholderChartY(item.primaryGap, maxGap, chartTop, chartBottom);

      return {
        x: Math.round(centerX * 100) / 100,
        y: primaryY,
        leftX: Math.round(leftX * 100) / 100,
        rightX: Math.round(rightX * 100) / 100,
        item
      };
    });
    const primaryPoints = monthPoints.map(function (point) {
      return {
        x: point.x,
        y: point.y,
        item: point.item
      };
    });
    const referencePoints = values.map(function (item, index) {
      const centerX = xStart + (index * monthWidth) + (monthWidth / 2);
      return {
        x: Math.round(centerX * 100) / 100,
        y: getPlaceholderChartY(item.referenceGap, maxGap, chartTop, chartBottom),
        item
      };
    });
    const primaryLinePoints = smoothPlaceholderPoints(primaryPoints);
    const referenceLinePoints = smoothPlaceholderPoints(referencePoints);
    const boundaryLines = Array.from({ length: values.length + 1 }, function (_item, index) {
      const x = xStart + (index * monthWidth);
      const previousPoint = monthPoints[Math.max(0, index - 1)];
      const nextPoint = monthPoints[Math.min(monthPoints.length - 1, index)];
      const y = index === 0
        ? nextPoint.y
        : index === values.length
          ? previousPoint.y
          : (previousPoint.y + nextPoint.y) / 2;

      return {
        x: Math.round(x * 100) / 100,
        y: Math.round(y * 100) / 100
      };
    });
    const monthBands = monthPoints.map(function (point) {
      const hitInset = Math.min(0.9, Math.max(0.35, monthWidth * 0.14));
      const x = point.leftX + hitInset;
      const width = Math.max(1, (point.rightX - point.leftX) - (hitInset * 2));

      return {
        x: Math.round(x * 100) / 100,
        width: Math.round(width * 100) / 100,
        point
      };
    });
    const axisValues = values.filter(function (item, index) {
      return index === 0 || index === values.length - 1 || (item.shortLabel === "Jan" && (item.year - PLACEHOLDER_SUPPORT_GAP_TIMELINE_START_YEAR) % 3 === 0);
    });

    return `
      <div class="income-impact-timeline-chart" aria-label="Placeholder household impact timeline visualization">
        <div class="income-impact-chart-topline">
          <span class="income-impact-placeholder-badge">Placeholder visualization</span>
          <p>Chart values are still placeholder-only for layout. The event list below uses fact-based linked profile and Protection Modeling events, not the final LENS recommendation.</p>
        </div>
        <svg class="income-impact-timeline-svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="Sample household impact timeline shown as thin columns under trendlines">
          <g class="income-impact-chart-grid" aria-hidden="true">
            <line x1="${xStart}" y1="${chartTop}" x2="${xEnd}" y2="${chartTop}"></line>
            <line x1="${xStart}" y1="${Math.round(chartTop + ((chartBottom - chartTop) * 0.25))}" x2="${xEnd}" y2="${Math.round(chartTop + ((chartBottom - chartTop) * 0.25))}"></line>
            <line x1="${xStart}" y1="${Math.round(chartTop + ((chartBottom - chartTop) * 0.5))}" x2="${xEnd}" y2="${Math.round(chartTop + ((chartBottom - chartTop) * 0.5))}"></line>
            <line x1="${xStart}" y1="${Math.round(chartTop + ((chartBottom - chartTop) * 0.75))}" x2="${xEnd}" y2="${Math.round(chartTop + ((chartBottom - chartTop) * 0.75))}"></line>
            <line x1="${xStart}" y1="${chartBottom}" x2="${xEnd}" y2="${chartBottom}"></line>
          </g>
          <g class="income-impact-timeline-columns" aria-hidden="true">
            ${boundaryLines.map(function (boundary) {
              return `
                <line
                  class="income-impact-timeline-column"
                  x1="${boundary.x}"
                  y1="${boundary.y}"
                  x2="${boundary.x}"
                  y2="${chartBottom}"
                ></line>
              `;
            }).join("")}
          </g>
          <path class="income-impact-timeline-line income-impact-timeline-line--reference" d="${escapeHtml(buildSmoothPath(referenceLinePoints))}"></path>
          <path class="income-impact-timeline-line income-impact-timeline-line--primary" d="${escapeHtml(buildSmoothPath(primaryLinePoints))}"></path>
          <g class="income-impact-timeline-month-bands">
            ${monthBands.map(function (band) {
              return `
                <rect
                  class="income-impact-timeline-month-band"
                  x="${band.x}"
                  y="${chartTop}"
                  width="${band.width}"
                  height="${chartBottom - chartTop}"
                  data-income-impact-timeline-month="${escapeHtml(band.point.item.label)}"
                  data-income-impact-timeline-gap="${escapeHtml(String(band.point.item.primaryGap))}"
                >
                  <title>${escapeHtml(`${band.point.item.label}: ${formatCurrency(band.point.item.primaryGap)} sample value`)}</title>
                </rect>
              `;
            }).join("")}
          </g>
        </svg>
        <div class="income-impact-chart-axis" aria-hidden="true">
          ${axisValues.map(function (item) {
            return `<span>${escapeHtml(item.label)}</span>`;
          }).join("")}
        </div>
        <div
          class="income-impact-chart-hover-label"
          data-income-impact-chart-hover-label
          data-default-text="Hover over a monthly bar to see the placeholder month and year."
        >Hover over a monthly bar to see the placeholder month and year.</div>
      </div>
    `;
  }

  function bindPlaceholderTimelineHover(host) {
    const charts = Array.from(host.querySelectorAll(".income-impact-timeline-chart"));
    charts.forEach(function (chart) {
      const label = chart.querySelector("[data-income-impact-chart-hover-label]");
      if (!label) {
        return;
      }

      const defaultText = label.getAttribute("data-default-text") || label.textContent;

      function setDefaultText() {
        label.textContent = defaultText;
      }

      function updateLabel(column) {
        const monthLabel = String(column?.getAttribute("data-income-impact-timeline-month") || "").trim();
        const gap = toOptionalNumber(column?.getAttribute("data-income-impact-timeline-gap"));
        if (!monthLabel) {
          setDefaultText();
          return;
        }

        label.textContent = gap == null
          ? monthLabel
          : `${monthLabel} - sample value ${formatCompactCurrency(gap)}`;
      }

      chart.addEventListener("mouseover", function (event) {
        const column = event.target?.closest?.("[data-income-impact-timeline-month]");
        if (column && chart.contains(column)) {
          updateLabel(column);
        }
      });

      chart.addEventListener("mouseleave", setDefaultText);
    });
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
    const events = (Array.isArray(timelineResult?.timelineEvents) ? timelineResult.timelineEvents : [])
      .filter(function (event) {
        return event && event.type && event.type !== "dataGap";
      });

    if (!events.length) {
      return `<div class="income-impact-empty-inline" data-income-impact-helper-timeline-events>${escapeHtml(EMPTY_MESSAGE)}</div>`;
    }

    return `
      <div class="income-impact-timeline-grid" data-income-impact-helper-timeline-events>
        ${events.map(function (event) {
          const amount = toOptionalNumber(event.amount);
          return `
            <div data-income-impact-timeline-event-type="${escapeHtml(event.type)}">
              <span>${escapeHtml(formatTimelineTiming(event))}</span>
              <strong>${escapeHtml(event.label || "Timeline event")}</strong>
              <p>${escapeHtml(amount == null ? "Fact-based event" : formatCurrency(amount))}</p>
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
          <p>Fact-based events from linked profile and Protection Modeling information. The chart remains placeholder-only until the timeline visualization pass.</p>
        </div>
        <div class="income-impact-timeline" aria-label="Fact-based household impact timeline">
          ${renderPlaceholderTimelineChart()}
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
    bindPlaceholderTimelineHover(host);
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

      const timelineResult = calculateIncomeLossImpactTimeline({
        lensModel: builderResult.lensModel,
        valuationDate: resolveTimelineValuationDate(profileRecord, builderResult.lensModel),
        profileRecord
      });

      renderIncomeImpact(host, {
        lensModel: builderResult.lensModel,
        timelineResult,
        builderWarnings: builderResult.warnings
      });
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
