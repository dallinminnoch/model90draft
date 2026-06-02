(function (global) {
  const LensApp = global.LensApp || (global.LensApp = {});
  const lensAnalysis = LensApp.lensAnalysis || (LensApp.lensAnalysis = {});

  // Owner: PMI workflow menu shell.
  // Purpose: define the left-menu structure, section-highlight behavior, and attestation status display.
  // Non-goals: no storage reads, no progress persistence, and no analysis output.

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
  const PMI_WORKFLOW_MENU_ACTIVE_LABEL = "In progress";
  const PMI_WORKFLOW_MENU_CHECK_ICON_SRC = "../Images/home/check.svg";

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
      showTitle: false,
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

  const PMI_WORKFLOW_MENU_ATTESTATION_FIELD_BY_SECTION = Object.freeze({
    income: "pmiIncomeSectionAccuracy",
    housing: "pmiHousingSectionAccuracy",
    debts: "pmiDebtsSectionAccuracy",
    expenses: "pmiExpensesSectionAccuracy",
    savingsHabits: "pmiSavingsHabitsSectionAccuracy",
    assets: "pmiAssetsSectionAccuracy",
    existingCoverage: "pmiCoverageSectionAccuracy",
    survivorNeeds: "pmiSurvivorSectionAccuracy",
    education: "pmiEducationSectionAccuracy",
    finalExpenses: "pmiFinalSectionAccuracy"
  });

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

  function getStatusLabel(status) {
    return PMI_WORKFLOW_MENU_STATUS_LABELS[normalizeStatus(status)];
  }

  function buildPmiWorkflowMenuModel(input) {
    const source = input && typeof input === "object" ? input : {};
    const currentSectionKey = normalizeCurrentSectionKey(source.currentSectionKey);
    const rows = buildSectionRows(source.sectionStatusByKey, currentSectionKey);
    const completedCount = countSectionsByStatus(rows, PMI_WORKFLOW_MENU_STATUSES.COMPLETE);
    const attentionCount = countSectionsByStatus(rows, PMI_WORKFLOW_MENU_STATUSES.NEEDS_ATTENTION);
    const notStartedCount = countSectionsByStatus(rows, PMI_WORKFLOW_MENU_STATUSES.NOT_STARTED);
    const reviewedCount = completedCount + attentionCount;
    const remainingCount = countSectionsByStatus(rows, PMI_WORKFLOW_MENU_STATUSES.IN_PROGRESS)
      + notStartedCount;

    return {
      version: PMI_WORKFLOW_MENU_VERSION,
      diagnosticOnly: true,
      wiredIntoRuntime: true,
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
        completedCount,
        remainingCount,
        reviewCount: attentionCount
      }
    };
  }

  function formatSectionCount(count, phrase) {
    const sectionLabel = count === 1 ? "section" : "sections";
    return `${count} ${sectionLabel} ${phrase}`;
  }

  function renderStatusIcon(row) {
    const label = escapeHtml(row.statusLabel);
    if (row.status === PMI_WORKFLOW_MENU_STATUSES.COMPLETE) {
      return `<span class="pmi-workflow-menu-status pmi-workflow-menu-status--complete" aria-label="${label}" data-pmi-workflow-menu-status-icon><img class="pmi-workflow-menu-check-icon" src="${escapeHtml(PMI_WORKFLOW_MENU_CHECK_ICON_SRC)}" alt="" aria-hidden="true"></span>`;
    }
    if (row.status === PMI_WORKFLOW_MENU_STATUSES.NEEDS_ATTENTION) {
      return `<span class="pmi-workflow-menu-status pmi-workflow-menu-status--attention" aria-label="${label}" data-pmi-workflow-menu-status-icon></span>`;
    }
    return `<span class="pmi-workflow-menu-status pmi-workflow-menu-status--empty" aria-label="${label}" data-pmi-workflow-menu-status-icon></span>`;
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
          ${row.active ? `<span class="pmi-workflow-menu-active-label">${escapeHtml(PMI_WORKFLOW_MENU_ACTIVE_LABEL)}</span>` : ""}
        </span>
        ${renderStatusIcon(row)}
      </a>
    `;
  }

  function renderWorkflowGroup(group) {
    const titleMarkup = group.showTitle === false
      ? ""
      : `<div class="pmi-workflow-menu-group-title"><span>${escapeHtml(group.label)}</span></div>`;
    return `
      <section class="pmi-workflow-menu-group" data-pmi-workflow-menu-group="${escapeHtml(group.key)}">
        ${titleMarkup}
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
            <span class="pmi-workflow-menu-insight-icon pmi-workflow-menu-insight-icon--complete" aria-hidden="true"></span>
            <span data-pmi-workflow-menu-insight="completed"><small>Sections completed</small><strong>${escapeHtml(formatSectionCount(model.insights.completedCount, "completed"))}</strong></span>
          </div>
          <div class="pmi-workflow-menu-insight-row">
            <span class="pmi-workflow-menu-insight-icon pmi-workflow-menu-insight-icon--empty" aria-hidden="true"></span>
            <span data-pmi-workflow-menu-insight="remaining"><small>Sections remaining</small><strong>${escapeHtml(formatSectionCount(model.insights.remainingCount, "remaining"))}</strong></span>
          </div>
          <div class="pmi-workflow-menu-insight-row">
            <span class="pmi-workflow-menu-insight-icon pmi-workflow-menu-insight-icon--attention" aria-hidden="true"></span>
            <span data-pmi-workflow-menu-insight="review"><small>Sections marked for review</small><strong>${escapeHtml(formatSectionCount(model.insights.reviewCount, "marked for review"))}</strong></span>
          </div>
        </section>
      </aside>
    `;
  }

  function getWorkflowMenuLinks(doc) {
    if (!doc || typeof doc.querySelectorAll !== "function") {
      return [];
    }
    return Array.from(doc.querySelectorAll("[data-pmi-workflow-menu-section]"));
  }

  function getWorkflowMenuSectionEntries(doc) {
    return getWorkflowMenuLinks(doc)
      .map((link) => {
        const href = link.getAttribute("href") || "";
        if (!href.startsWith("#") || href.length < 2) {
          return null;
        }
        const section = doc.getElementById(href.slice(1));
        return section
          ? {
              key: link.getAttribute("data-pmi-workflow-menu-section"),
              link,
              section
            }
          : null;
      })
      .filter(Boolean);
  }

  function syncActiveWorkflowMenuLabel(link, doc) {
    const copy = link.querySelector(".pmi-workflow-menu-copy");
    if (!copy || !doc || typeof doc.createElement !== "function") {
      return;
    }
    let label = copy.querySelector(".pmi-workflow-menu-active-label");
    if (!label) {
      label = doc.createElement("span");
      label.className = "pmi-workflow-menu-active-label";
      copy.appendChild(label);
    }
    label.textContent = PMI_WORKFLOW_MENU_ACTIVE_LABEL;
  }

  function setActivePmiWorkflowMenuSection(sectionKey, doc = global.document) {
    if (!sectionKey || !doc) {
      return false;
    }

    let didActivate = false;
    getWorkflowMenuLinks(doc).forEach((link) => {
      const isActive = link.getAttribute("data-pmi-workflow-menu-section") === sectionKey;
      link.classList.toggle("is-active", isActive);
      if (isActive) {
        link.setAttribute("aria-current", "page");
        syncActiveWorkflowMenuLabel(link, doc);
        didActivate = true;
      } else {
        link.removeAttribute("aria-current");
        link.querySelector(".pmi-workflow-menu-active-label")?.remove();
      }
    });

    return didActivate;
  }

  function getStatusFromAttestationValue(value) {
    const normalizedValue = String(value || "").trim().toLowerCase();
    if (normalizedValue === "yes") {
      return PMI_WORKFLOW_MENU_STATUSES.COMPLETE;
    }
    if (normalizedValue === "review") {
      return PMI_WORKFLOW_MENU_STATUSES.NEEDS_ATTENTION;
    }
    return PMI_WORKFLOW_MENU_STATUSES.NOT_STARTED;
  }

  function getCheckedAttestationValue(doc, fieldName) {
    const selectedInput = doc.querySelector(`input[name="${fieldName}"]:checked`);
    return selectedInput ? selectedInput.value : "";
  }

  function readPmiWorkflowMenuAttestationStatuses(doc = global.document) {
    const statuses = {};
    if (!doc || typeof doc.querySelector !== "function") {
      return statuses;
    }

    Object.entries(PMI_WORKFLOW_MENU_ATTESTATION_FIELD_BY_SECTION).forEach(([sectionKey, fieldName]) => {
      statuses[sectionKey] = getStatusFromAttestationValue(getCheckedAttestationValue(doc, fieldName));
    });

    return statuses;
  }

  function ensureCompleteCheckIcon(statusIcon, doc) {
    if (!statusIcon || !doc) {
      return;
    }
    if (statusIcon.querySelector(".pmi-workflow-menu-check-icon")) {
      return;
    }
    const icon = doc.createElement("img");
    icon.className = "pmi-workflow-menu-check-icon";
    icon.src = PMI_WORKFLOW_MENU_CHECK_ICON_SRC;
    icon.alt = "";
    icon.setAttribute("aria-hidden", "true");
    statusIcon.appendChild(icon);
  }

  function setWorkflowMenuStatusIcon(statusIcon, status, doc) {
    if (!statusIcon) {
      return;
    }

    const normalizedStatus = normalizeStatus(status);
    statusIcon.classList.remove(
      "pmi-workflow-menu-status--complete",
      "pmi-workflow-menu-status--attention",
      "pmi-workflow-menu-status--empty"
    );
    statusIcon.classList.add(
      normalizedStatus === PMI_WORKFLOW_MENU_STATUSES.COMPLETE
        ? "pmi-workflow-menu-status--complete"
        : normalizedStatus === PMI_WORKFLOW_MENU_STATUSES.NEEDS_ATTENTION
          ? "pmi-workflow-menu-status--attention"
          : "pmi-workflow-menu-status--empty"
    );
    statusIcon.setAttribute("aria-label", getStatusLabel(normalizedStatus));
    statusIcon.querySelector(".pmi-workflow-menu-check-icon")?.remove();
    if (normalizedStatus === PMI_WORKFLOW_MENU_STATUSES.COMPLETE) {
      ensureCompleteCheckIcon(statusIcon, doc);
    }
  }

  function getWorkflowMenuStatusCounts(doc) {
    const links = getWorkflowMenuLinks(doc);
    const counts = {
      totalCount: links.length,
      completedCount: 0,
      reviewCount: 0,
      remainingCount: 0
    };

    links.forEach((link) => {
      const status = normalizeStatus(link.getAttribute("data-pmi-workflow-menu-status"));
      if (status === PMI_WORKFLOW_MENU_STATUSES.COMPLETE) {
        counts.completedCount += 1;
      } else if (status === PMI_WORKFLOW_MENU_STATUSES.NEEDS_ATTENTION) {
        counts.reviewCount += 1;
      } else {
        counts.remainingCount += 1;
      }
    });

    return counts;
  }

  function updateWorkflowMenuProgress(statusCounts, doc) {
    const reviewedCount = statusCounts.completedCount + statusCounts.reviewCount;
    const progressCopy = doc.querySelector(".pmi-workflow-menu-progress-copy strong");
    const progressSegments = Array.from(doc.querySelectorAll(".pmi-workflow-menu-progress-segment"));
    if (progressCopy) {
      progressCopy.innerHTML = `${escapeHtml(reviewedCount)} <span>of ${escapeHtml(statusCounts.totalCount)} sections reviewed</span>`;
    }
    progressSegments.forEach((segment, index) => {
      segment.classList.toggle("is-filled", index < reviewedCount);
    });
  }

  function updateWorkflowMenuInsights(statusCounts, doc) {
    const insightValues = {
      completed: formatSectionCount(statusCounts.completedCount, "completed"),
      remaining: formatSectionCount(statusCounts.remainingCount, "remaining"),
      review: formatSectionCount(statusCounts.reviewCount, "marked for review")
    };

    Object.entries(insightValues).forEach(([key, text]) => {
      const value = doc.querySelector(`[data-pmi-workflow-menu-insight="${key}"] strong`);
      if (value) {
        value.textContent = text;
      }
    });
  }

  function syncPmiWorkflowMenuAttestationStatuses(doc = global.document) {
    if (!doc) {
      return false;
    }

    const statuses = readPmiWorkflowMenuAttestationStatuses(doc);
    let didSync = false;
    getWorkflowMenuLinks(doc).forEach((link) => {
      const sectionKey = link.getAttribute("data-pmi-workflow-menu-section");
      if (!Object.prototype.hasOwnProperty.call(statuses, sectionKey)) {
        return;
      }

      const status = normalizeStatus(statuses[sectionKey]);
      link.setAttribute("data-pmi-workflow-menu-status", status);
      setWorkflowMenuStatusIcon(link.querySelector("[data-pmi-workflow-menu-status-icon]"), status, doc);
      didSync = true;
    });

    if (didSync) {
      const statusCounts = getWorkflowMenuStatusCounts(doc);
      updateWorkflowMenuProgress(statusCounts, doc);
      updateWorkflowMenuInsights(statusCounts, doc);
    }
    return didSync;
  }

  function mountPmiWorkflowMenuAttestationStatus(options = {}) {
    const doc = options.document || global.document;
    if (!doc || typeof doc.querySelectorAll !== "function") {
      return null;
    }

    const attestationInputs = Object.values(PMI_WORKFLOW_MENU_ATTESTATION_FIELD_BY_SECTION)
      .flatMap((fieldName) => Array.from(doc.querySelectorAll(`input[name="${fieldName}"]`)));
    if (!attestationInputs.length) {
      return null;
    }

    const syncStatuses = () => {
      syncPmiWorkflowMenuAttestationStatuses(doc);
    };
    attestationInputs.forEach((input) => {
      input.addEventListener("change", syncStatuses);
    });
    syncStatuses();

    return {
      refresh: syncStatuses,
      destroy() {
        attestationInputs.forEach((input) => {
          input.removeEventListener("change", syncStatuses);
        });
      }
    };
  }

  function isScrollRootAtEnd(scrollRoot) {
    return Boolean(
      scrollRoot
      && typeof scrollRoot.scrollTop === "number"
      && scrollRoot.scrollHeight - scrollRoot.clientHeight - scrollRoot.scrollTop <= 4
    );
  }

  function getCurrentWorkflowMenuSectionKey(entries, activationOffset, scrollRoot) {
    if (!entries.length) {
      return "";
    }
    if (isScrollRootAtEnd(scrollRoot)) {
      return entries[entries.length - 1].key;
    }

    let activeEntry = entries[0];
    entries.forEach((entry) => {
      const rect = entry.section.getBoundingClientRect();
      if (rect.top <= activationOffset && rect.bottom > 0) {
        activeEntry = entry;
      }
    });

    return activeEntry.key;
  }

  function getWorkflowMenuScrollRoot(doc, win) {
    const pmiFormMain = doc.querySelector(".pmi-form-main");
    if (pmiFormMain) {
      return pmiFormMain;
    }
    const pane = doc.querySelector(".lens-workflow-pane");
    if (pane && pane.scrollHeight > pane.clientHeight) {
      return pane;
    }
    return doc.scrollingElement || win;
  }

  function isElementScrollRoot(scrollRoot) {
    return Boolean(scrollRoot && scrollRoot.nodeType === 1);
  }

  function scrollWorkflowSectionIntoView(section, scrollRoot) {
    if (!section || !scrollRoot) {
      return;
    }

    if (isElementScrollRoot(scrollRoot)) {
      const sectionRect = section.getBoundingClientRect();
      const rootRect = scrollRoot.getBoundingClientRect();
      scrollRoot.scrollTop += sectionRect.top - rootRect.top;
      return;
    }

    if (typeof section.scrollIntoView === "function") {
      section.scrollIntoView({ block: "start", inline: "nearest" });
    }
  }

  function replaceWorkflowMenuHash(hash, win) {
    if (!hash || !win || !win.history || typeof win.history.replaceState !== "function") {
      return;
    }

    const nextUrl = `${win.location.pathname}${win.location.search}${hash}`;
    win.history.replaceState(null, "", nextUrl);
  }

  function mountPmiWorkflowMenuScrollSpy(options = {}) {
    const doc = options.document || global.document;
    const win = options.window || global.window;
    if (!doc || !win) {
      return null;
    }

    const entries = getWorkflowMenuSectionEntries(doc);
    if (!entries.length) {
      return null;
    }
    const scrollRoot = getWorkflowMenuScrollRoot(doc, win);

    const getActivationOffset = () => {
      const topbar = doc.querySelector(".workspace-page-topbar");
      const topbarHeight = topbar ? topbar.getBoundingClientRect().height : 0;
      return topbarHeight + 72;
    };

    let frame = 0;
    const updateActiveSection = () => {
      frame = 0;
      setActivePmiWorkflowMenuSection(
        getCurrentWorkflowMenuSectionKey(entries, getActivationOffset(), scrollRoot),
        doc
      );
    };
    const scheduleUpdate = () => {
      if (frame) {
        return;
      }
      frame = win.requestAnimationFrame(updateActiveSection);
    };

    entries.forEach(({ key, link }) => {
      link.addEventListener("click", (event) => {
        event.preventDefault();
        setActivePmiWorkflowMenuSection(key, doc);
        const href = link.getAttribute("href") || "";
        const targetEntry = entries.find((entry) => entry.key === key);
        if (targetEntry) {
          scrollWorkflowSectionIntoView(targetEntry.section, scrollRoot);
        }
        replaceWorkflowMenuHash(href, win);
      });
    });
    scrollRoot.addEventListener("scroll", scheduleUpdate, { passive: true });
    win.addEventListener("resize", scheduleUpdate, { passive: true });
    const syncLocationHashTarget = () => {
      if (!win.location || !win.location.hash) {
        return;
      }
      const targetEntry = entries.find((entry) => `#${entry.section.id}` === win.location.hash);
      if (targetEntry) {
        scrollWorkflowSectionIntoView(targetEntry.section, scrollRoot);
      }
    };

    syncLocationHashTarget();
    if (typeof win.requestAnimationFrame === "function") {
      win.requestAnimationFrame(syncLocationHashTarget);
    }
    win.addEventListener("load", syncLocationHashTarget, { passive: true });
    updateActiveSection();

    return {
      refresh: updateActiveSection,
      destroy() {
        if (frame) {
          win.cancelAnimationFrame(frame);
          frame = 0;
        }
        scrollRoot.removeEventListener("scroll", scheduleUpdate);
        win.removeEventListener("resize", scheduleUpdate);
        win.removeEventListener("load", syncLocationHashTarget);
      }
    };
  }

  lensAnalysis.pmiWorkflowMenu = {
    version: PMI_WORKFLOW_MENU_VERSION,
    statuses: PMI_WORKFLOW_MENU_STATUSES,
    sections: PMI_WORKFLOW_MENU_SECTIONS,
    groups: PMI_WORKFLOW_MENU_GROUPS,
    buildPmiWorkflowMenuModel,
    renderPmiWorkflowMenu,
    setActivePmiWorkflowMenuSection,
    mountPmiWorkflowMenuScrollSpy,
    readPmiWorkflowMenuAttestationStatuses,
    syncPmiWorkflowMenuAttestationStatuses,
    mountPmiWorkflowMenuAttestationStatus
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = {
      PMI_WORKFLOW_MENU_VERSION,
      PMI_WORKFLOW_MENU_STATUSES,
      PMI_WORKFLOW_MENU_SECTIONS,
      PMI_WORKFLOW_MENU_GROUPS,
      buildPmiWorkflowMenuModel,
      renderPmiWorkflowMenu,
      setActivePmiWorkflowMenuSection,
      mountPmiWorkflowMenuScrollSpy,
      readPmiWorkflowMenuAttestationStatuses,
      syncPmiWorkflowMenuAttestationStatuses,
      mountPmiWorkflowMenuAttestationStatus
    };
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
