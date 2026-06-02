(function (global) {
  const LensApp = global.LensApp || (global.LensApp = {});
  const lensAnalysis = LensApp.lensAnalysis || (LensApp.lensAnalysis = {});

  // Owner: PMI workflow menu shell.
  // Purpose: define the dormant left-menu structure for the next PMI nav pass.
  // Non-goals: no DOM mounting, no scrollspy wiring, no attestation/storage reads,
  // no progress calculation, and no replacement of the current pmi-section-nav.

  const PMI_WORKFLOW_MENU_VERSION = "pmi-workflow-menu-shell-v1";

  const PMI_WORKFLOW_MENU_STATUSES = Object.freeze({
    COMPLETE: "complete",
    IN_PROGRESS: "inProgress",
    NEEDS_ATTENTION: "needsAttention",
    NOT_STARTED: "notStarted"
  });

  const PMI_WORKFLOW_MENU_STATUS_LABELS = Object.freeze({
    complete: "Complete",
    inProgress: "In progress",
    needsAttention: "Needs attention",
    notStarted: "Not started"
  });

  const PMI_WORKFLOW_MENU_GROUPS = Object.freeze([
    Object.freeze({
      key: "householdFoundation",
      label: "Household Foundation",
      sectionKeys: Object.freeze([
        "income",
        "housing",
        "debts",
        "expenses",
        "savingsHabits",
        "assets"
      ])
    }),
    Object.freeze({
      key: "protectionPlanning",
      label: "Protection Planning",
      sectionKeys: Object.freeze([
        "existingCoverage",
        "survivorNeeds",
        "education",
        "finalExpenses"
      ])
    })
  ]);

  const PMI_WORKFLOW_MENU_SECTIONS = Object.freeze([
    Object.freeze({
      key: "income",
      number: "01",
      label: "Income",
      description: "Complete household earnings",
      href: "#pmi-income"
    }),
    Object.freeze({
      key: "housing",
      number: "02",
      label: "Housing",
      description: "Mortgage, rent, property costs",
      href: "#pmi-housing"
    }),
    Object.freeze({
      key: "debts",
      number: "03",
      label: "Debts & Liabilities",
      description: "Loans, cards, required payments",
      href: "#pmi-debts"
    }),
    Object.freeze({
      key: "expenses",
      number: "04",
      label: "Expenses",
      description: "Living expenses and lifestyle",
      href: "#pmi-expenses"
    }),
    Object.freeze({
      key: "savingsHabits",
      number: "05",
      label: "Savings Habits",
      description: "Savings behavior and goals",
      href: "#pmi-savings-habits"
    }),
    Object.freeze({
      key: "assets",
      number: "06",
      label: "Assets",
      description: "Bank, investments, real estate",
      href: "#pmi-assets"
    }),
    Object.freeze({
      key: "existingCoverage",
      number: "07",
      label: "Existing Coverage",
      description: "Insurance and benefits",
      href: "#pmi-coverage"
    }),
    Object.freeze({
      key: "survivorNeeds",
      number: "08",
      label: "Survivor Needs",
      description: "Ongoing financial needs",
      href: "#pmi-survivor"
    }),
    Object.freeze({
      key: "education",
      number: "09",
      label: "Education",
      description: "Education goals and funding",
      href: "#pmi-education"
    }),
    Object.freeze({
      key: "finalExpenses",
      number: "10",
      label: "Final Expenses",
      description: "End-of-life and final costs",
      href: "#pmi-final"
    })
  ]);

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function normalizeStatus(value) {
    const rawValue = String(value || "").trim();
    return Object.prototype.hasOwnProperty.call(PMI_WORKFLOW_MENU_STATUS_LABELS, rawValue)
      ? rawValue
      : PMI_WORKFLOW_MENU_STATUSES.NOT_STARTED;
  }

  function normalizeCurrentSectionKey(value) {
    const rawValue = String(value || "").trim();
    return PMI_WORKFLOW_MENU_SECTIONS.some((section) => section.key === rawValue)
      ? rawValue
      : "income";
  }

  function buildSectionRows(sectionStatusByKey, currentSectionKey) {
    const statusMap = sectionStatusByKey && typeof sectionStatusByKey === "object"
      ? sectionStatusByKey
      : {};
    return PMI_WORKFLOW_MENU_SECTIONS.map((section) => {
      const status = normalizeStatus(statusMap[section.key]);
      return {
        ...section,
        status,
        statusLabel: PMI_WORKFLOW_MENU_STATUS_LABELS[status],
        active: section.key === currentSectionKey
      };
    });
  }

  function countSectionsByStatus(rows, status) {
    return rows.filter((row) => row.status === status).length;
  }

  function buildPmiWorkflowMenuModel(input) {
    const source = input && typeof input === "object" ? input : {};
    const currentSectionKey = normalizeCurrentSectionKey(source.currentSectionKey);
    const rows = buildSectionRows(source.sectionStatusByKey, currentSectionKey);
    const reviewedCount = countSectionsByStatus(rows, PMI_WORKFLOW_MENU_STATUSES.COMPLETE)
      + countSectionsByStatus(rows, PMI_WORKFLOW_MENU_STATUSES.IN_PROGRESS);
    const attentionCount = countSectionsByStatus(rows, PMI_WORKFLOW_MENU_STATUSES.NEEDS_ATTENTION);
    const notStartedCount = countSectionsByStatus(rows, PMI_WORKFLOW_MENU_STATUSES.NOT_STARTED);
    const nextSection = rows.find((row) => row.status === PMI_WORKFLOW_MENU_STATUSES.IN_PROGRESS)
      || rows.find((row) => row.status === PMI_WORKFLOW_MENU_STATUSES.NEEDS_ATTENTION)
      || rows.find((row) => row.status === PMI_WORKFLOW_MENU_STATUSES.NOT_STARTED)
      || rows[0];

    return {
      version: PMI_WORKFLOW_MENU_VERSION,
      diagnosticOnly: true,
      wiredIntoRuntime: false,
      currentSectionKey,
      rows,
      groups: PMI_WORKFLOW_MENU_GROUPS.map((group) => ({
        ...group,
        rows: rows.filter((row) => group.sectionKeys.includes(row.key))
      })),
      progress: {
        reviewedCount,
        totalCount: rows.length,
        segmentCount: rows.length
      },
      insights: {
        nextUpLabel: nextSection ? `Add ${nextSection.label.toLowerCase()} record` : "Review workflow",
        needsAttentionCount: attentionCount,
        notStartedCount
      }
    };
  }

  function renderStatusIcon(row) {
    const label = escapeHtml(row.statusLabel);
    if (row.status === PMI_WORKFLOW_MENU_STATUSES.COMPLETE) {
      return `<span class="pmi-workflow-menu-status pmi-workflow-menu-status--complete" aria-label="${label}"></span>`;
    }
    if (row.status === PMI_WORKFLOW_MENU_STATUSES.NEEDS_ATTENTION) {
      return `<span class="pmi-workflow-menu-status pmi-workflow-menu-status--attention" aria-label="${label}"></span>`;
    }
    return `<span class="pmi-workflow-menu-status pmi-workflow-menu-status--empty" aria-label="${label}"></span>`;
  }

  function renderProgressSegments(model) {
    return model.rows.map((row, index) => {
      const filled = index < model.progress.reviewedCount;
      const className = filled
        ? "pmi-workflow-menu-progress-segment is-filled"
        : "pmi-workflow-menu-progress-segment";
      return `<span class="${className}" aria-hidden="true"></span>`;
    }).join("");
  }

  function renderWorkflowRow(row) {
    const activeClass = row.active ? " is-active" : "";
    return `
      <a class="pmi-workflow-menu-item${activeClass}" href="${escapeHtml(row.href)}" data-pmi-workflow-menu-section="${escapeHtml(row.key)}" data-pmi-workflow-menu-status="${escapeHtml(row.status)}">
        <span class="pmi-workflow-menu-number">${escapeHtml(row.number)}</span>
        <span class="pmi-workflow-menu-copy">
          <span class="pmi-workflow-menu-label">${escapeHtml(row.label)}</span>
          <span class="pmi-workflow-menu-description">${escapeHtml(row.description)}</span>
          ${row.active ? `<span class="pmi-workflow-menu-active-label">${escapeHtml(row.statusLabel)}</span>` : ""}
        </span>
        ${renderStatusIcon(row)}
      </a>
    `;
  }

  function renderWorkflowGroup(group) {
    return `
      <section class="pmi-workflow-menu-group" data-pmi-workflow-menu-group="${escapeHtml(group.key)}">
        <div class="pmi-workflow-menu-group-title"><span>${escapeHtml(group.label)}</span></div>
        <div class="pmi-workflow-menu-list">
          ${group.rows.map(renderWorkflowRow).join("")}
        </div>
      </section>
    `;
  }

  function renderPmiWorkflowMenu(input) {
    const model = buildPmiWorkflowMenuModel(input);
    return `
      <aside class="pmi-workflow-menu" data-pmi-workflow-menu-shell data-pmi-workflow-menu-version="${escapeHtml(model.version)}" aria-label="Protection Modeling Inputs workflow">
        <header class="pmi-workflow-menu-header">
          <span class="pmi-workflow-menu-kicker">Protection Modeling Inputs</span>
          <div class="pmi-workflow-menu-progress-copy">
            <span>Workflow Progress</span>
            <strong>${escapeHtml(model.progress.reviewedCount)} <span>of ${escapeHtml(model.progress.totalCount)} sections reviewed</span></strong>
          </div>
          <div class="pmi-workflow-menu-progress-track" aria-hidden="true">
            ${renderProgressSegments(model)}
          </div>
        </header>
        ${model.groups.map(renderWorkflowGroup).join("")}
        <section class="pmi-workflow-menu-insights" aria-label="Workflow insights">
          <div class="pmi-workflow-menu-group-title"><span>Workflow Insights</span></div>
          <div class="pmi-workflow-menu-insight-row">
            <span class="pmi-workflow-menu-insight-icon pmi-workflow-menu-insight-icon--next" aria-hidden="true"></span>
            <span><small>Next up</small><strong>${escapeHtml(model.insights.nextUpLabel)}</strong></span>
          </div>
          <div class="pmi-workflow-menu-insight-row">
            <span class="pmi-workflow-menu-insight-icon pmi-workflow-menu-insight-icon--attention" aria-hidden="true"></span>
            <span><small>Needs attention</small><strong>${escapeHtml(model.insights.needsAttentionCount)} sections need review</strong></span>
          </div>
          <div class="pmi-workflow-menu-insight-row">
            <span class="pmi-workflow-menu-insight-icon pmi-workflow-menu-insight-icon--empty" aria-hidden="true"></span>
            <span><small>Not started</small><strong>${escapeHtml(model.insights.notStartedCount)} sections remaining</strong></span>
          </div>
        </section>
      </aside>
    `;
  }

  lensAnalysis.pmiWorkflowMenu = {
    version: PMI_WORKFLOW_MENU_VERSION,
    statuses: PMI_WORKFLOW_MENU_STATUSES,
    sections: PMI_WORKFLOW_MENU_SECTIONS,
    groups: PMI_WORKFLOW_MENU_GROUPS,
    buildPmiWorkflowMenuModel,
    renderPmiWorkflowMenu
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = {
      PMI_WORKFLOW_MENU_VERSION,
      PMI_WORKFLOW_MENU_STATUSES,
      PMI_WORKFLOW_MENU_SECTIONS,
      PMI_WORKFLOW_MENU_GROUPS,
      buildPmiWorkflowMenuModel,
      renderPmiWorkflowMenu
    };
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
