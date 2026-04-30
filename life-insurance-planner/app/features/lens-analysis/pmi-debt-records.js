(function (global) {
  const LensApp = global.LensApp || (global.LensApp = {});
  const lensAnalysis = LensApp.lensAnalysis || (LensApp.lensAnalysis = {});

  // Owner: PMI debt records controller.
  // Purpose: collect repeatable raw-only debtRecords[] rows from PMI.
  // Non-goals: no treatment assumptions, no debtPayoff writes, no method
  // calculation calls, no normalization, and no storage access.

  let generatedDebtIdCounter = 0;
  let activeController = null;

  function escapeHtml(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function normalizeString(value) {
    return String(value == null ? "" : value).trim();
  }

  function toOptionalNumber(value) {
    const normalized = normalizeString(value).replace(/,/g, "");
    if (!normalized) {
      return null;
    }

    const numericValue = Number(normalized);
    return Number.isFinite(numericValue) ? numericValue : null;
  }

  function toOptionalNonNegativeNumber(value) {
    const number = toOptionalNumber(value);
    return number == null || number < 0 ? null : number;
  }

  function clonePlainObject(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return {};
    }

    return Object.assign({}, value);
  }

  function getDebtLibraryApi() {
    return lensAnalysis.debtLibrary && typeof lensAnalysis.debtLibrary === "object"
      ? lensAnalysis.debtLibrary
      : {};
  }

  function getDebtTaxonomyApi() {
    return lensAnalysis.debtTaxonomy && typeof lensAnalysis.debtTaxonomy === "object"
      ? lensAnalysis.debtTaxonomy
      : {};
  }

  function getLibraryEntries() {
    const debtLibrary = getDebtLibraryApi();
    if (typeof debtLibrary.getDebtLibraryEntries === "function") {
      return debtLibrary.getDebtLibraryEntries();
    }

    return Array.isArray(debtLibrary.DEBT_LIBRARY_ENTRIES)
      ? debtLibrary.DEBT_LIBRARY_ENTRIES.slice()
      : [];
  }

  function findLibraryEntry(typeKey) {
    const debtLibrary = getDebtLibraryApi();
    if (typeof debtLibrary.findDebtLibraryEntry === "function") {
      return debtLibrary.findDebtLibraryEntry(typeKey);
    }

    return getLibraryEntries().find(function (entry) {
      return entry && (entry.typeKey === typeKey || entry.libraryEntryKey === typeKey);
    }) || null;
  }

  function getAddableLibraryEntries() {
    return getLibraryEntries().filter(function (entry) {
      return entry && entry.isAddable !== false && entry.isHousingFieldOwned !== true;
    });
  }

  function getTaxonomyCategory(categoryKey) {
    const taxonomy = getDebtTaxonomyApi();
    const categories = Array.isArray(taxonomy.DEFAULT_DEBT_CATEGORIES)
      ? taxonomy.DEFAULT_DEBT_CATEGORIES
      : [];
    return categories.find(function (category) {
      return category && category.categoryKey === categoryKey;
    }) || null;
  }

  function getCategoryLabel(categoryKey) {
    const category = getTaxonomyCategory(categoryKey);
    return normalizeString(category && category.label) || normalizeString(categoryKey) || "Debt";
  }

  function generateDebtId() {
    if (global.crypto && typeof global.crypto.randomUUID === "function") {
      return "debt_" + global.crypto.randomUUID().replace(/-/g, "_");
    }

    generatedDebtIdCounter += 1;
    return "debt_" + Date.now() + "_" + generatedDebtIdCounter;
  }

  function createDebtRecordFromLibraryEntry(entry) {
    const safeEntry = entry && typeof entry === "object" ? entry : {};
    if (safeEntry.isAddable === false || safeEntry.isHousingFieldOwned === true) {
      return null;
    }

    const typeKey = normalizeString(safeEntry.typeKey || safeEntry.libraryEntryKey);
    const categoryKey = normalizeString(safeEntry.categoryKey);
    const label = normalizeString(safeEntry.label) || typeKey || "Added Debt";

    if (!typeKey || !categoryKey) {
      return null;
    }

    return {
      debtId: generateDebtId(),
      categoryKey,
      typeKey,
      label,
      currentBalance: null,
      minimumMonthlyPayment: null,
      interestRatePercent: null,
      remainingTermMonths: null,
      securedBy: null,
      sourceKey: null,
      isDefaultDebt: false,
      isCustomDebt: safeEntry.isCustomType === true || typeKey === "customDebt" || categoryKey === "otherDebt",
      notes: null,
      metadata: {
        sourceType: "user-input",
        source: "debt-library",
        libraryEntryKey: normalizeString(safeEntry.libraryEntryKey || typeKey)
      }
    };
  }

  function normalizeRecordForUi(record, index) {
    const safeRecord = record && typeof record === "object" ? record : {};
    const entry = findLibraryEntry(safeRecord.typeKey || safeRecord.libraryEntryKey);
    if (entry && (entry.isAddable === false || entry.isHousingFieldOwned === true)) {
      return null;
    }

    const categoryKey = normalizeString(safeRecord.categoryKey || (entry && entry.categoryKey));
    const typeKey = normalizeString(safeRecord.typeKey || (entry && entry.typeKey));
    const label = normalizeString(safeRecord.label || (entry && entry.label));

    if (!categoryKey || !typeKey || !label) {
      return null;
    }

    const metadata = clonePlainObject(safeRecord.metadata);
    return {
      debtId: normalizeString(safeRecord.debtId) || generateDebtId(),
      categoryKey,
      typeKey,
      label,
      currentBalance: toOptionalNumber(safeRecord.currentBalance),
      minimumMonthlyPayment: toOptionalNumber(safeRecord.minimumMonthlyPayment),
      interestRatePercent: toOptionalNumber(safeRecord.interestRatePercent),
      remainingTermMonths: toOptionalNumber(safeRecord.remainingTermMonths),
      securedBy: normalizeString(safeRecord.securedBy) || null,
      sourceKey: normalizeString(safeRecord.sourceKey) || null,
      isDefaultDebt: safeRecord.isDefaultDebt === true,
      isCustomDebt: safeRecord.isCustomDebt === true || typeKey === "customDebt" || categoryKey === "otherDebt",
      notes: normalizeString(safeRecord.notes) || null,
      metadata: Object.assign({
        sourceType: "user-input",
        source: "debt-library",
        libraryEntryKey: normalizeString(typeKey)
      }, metadata, {
        sourceIndex: Number.isInteger(index) ? index : null
      })
    };
  }

  function createSearchText(entry) {
    return [
      entry.label,
      entry.typeKey,
      entry.libraryEntryKey,
      entry.categoryKey,
      entry.group,
      entry.description
    ].concat(Array.isArray(entry.aliases) ? entry.aliases : [])
      .map(function (value) {
        return normalizeString(value).toLowerCase();
      })
      .filter(Boolean)
      .join(" ");
  }

  function matchesSearch(entry, query) {
    const normalizedQuery = normalizeString(query).toLowerCase();
    if (!normalizedQuery) {
      return true;
    }

    return createSearchText(entry).indexOf(normalizedQuery) !== -1;
  }

  const SUGGESTED_DEBT_TYPE_KEYS = Object.freeze([
    "heloc",
    "autoLoan",
    "creditCard",
    "personalLoan",
    "federalStudentLoan",
    "medicalBill",
    "irsTaxDebt",
    "businessLoan",
    "familyLoan",
    "buyNowPayLater",
    "customDebt"
  ]);

  function groupEntriesByCategory(entries) {
    return entries.reduce(function (groups, entry) {
      const categoryLabel = getCategoryLabel(entry.categoryKey);
      const existingGroup = groups.find(function (group) {
        return group.categoryLabel === categoryLabel;
      });
      const group = existingGroup || {
        categoryLabel,
        entries: []
      };

      if (!existingGroup) {
        groups.push(group);
      }

      group.entries.push(entry);
      return groups;
    }, []);
  }

  function formatValueForInput(value) {
    if (value == null || !Number.isFinite(Number(value))) {
      return "";
    }

    return String(Number(value));
  }

  function createInputId(prefix, debtId, suffix) {
    return [
      prefix,
      normalizeString(debtId).replace(/[^A-Za-z0-9_-]+/g, "-"),
      suffix
    ].filter(Boolean).join("-");
  }

  function renderShell(root) {
    if (!root || root.dataset.pmiDebtRecordsInitialized === "true") {
      return;
    }

    root.innerHTML = `
      <div class="pmi-debt-records-list" data-pmi-debt-records-list></div>
      <div class="field-group pmi-debt-records-add-field">
        <button class="button tertiary-button pmi-debt-records-add-button" type="button" data-pmi-debt-records-add>Add Debt</button>
      </div>
    `;
    root.dataset.pmiDebtRecordsInitialized = "true";
  }

  function createModal(controller) {
    const documentRef = controller.documentRef;
    if (!documentRef || !documentRef.body) {
      return null;
    }

    const modal = documentRef.createElement("div");
    modal.className = "profile-search-modal";
    modal.setAttribute("data-pmi-debt-library-modal", "");
    modal.hidden = true;
    modal.innerHTML = `
      <div class="profile-search-modal-backdrop" data-pmi-debt-library-close></div>
      <div class="profile-search-modal-panel" role="dialog" aria-modal="true" aria-labelledby="pmi-debt-library-title">
        <button class="profile-search-modal-close" type="button" aria-label="Close debt library" data-pmi-debt-library-close>x</button>
        <div class="profile-search-modal-header">
          <div>
            <h2 id="pmi-debt-library-title">Add Debt</h2>
            <p>Search or browse debt types to add to the plan.</p>
          </div>
        </div>
        <div class="pmi-debt-library-search">
          <input id="pmi-debt-library-search" type="text" placeholder="Search debt types" data-pmi-debt-library-search>
        </div>
        <div class="pmi-debt-library-filter-row" aria-label="Debt library views">
          <button class="pmi-debt-library-filter is-active" type="button" data-pmi-debt-library-filter="suggested" aria-pressed="true">Suggested</button>
          <button class="pmi-debt-library-filter" type="button" data-pmi-debt-library-filter="all" aria-pressed="false">All Debts</button>
          <button class="pmi-debt-library-filter" type="button" data-pmi-debt-library-filter="recent" aria-pressed="false">Recent</button>
        </div>
        <div class="profile-search-results" data-pmi-debt-library-results></div>
      </div>
    `;

    documentRef.body.appendChild(modal);
    return modal;
  }

  function initPmiDebtRecords(options) {
    const safeOptions = options && typeof options === "object" ? options : {};
    const root = typeof safeOptions.root === "string"
      ? document.querySelector(safeOptions.root)
      : safeOptions.root;

    if (!root) {
      return null;
    }

    renderShell(root);

    const controller = {
      root,
      documentRef: root.ownerDocument || document,
      records: [],
      list: root.querySelector("[data-pmi-debt-records-list]"),
      addButton: root.querySelector("[data-pmi-debt-records-add]"),
      modal: null,
      searchInput: null,
      results: null
    };
    controller.libraryFilter = "suggested";
    controller.recentTypeKeys = [];

    function syncRecordsFromDom() {
      if (!controller.list) {
        return;
      }

      const previousById = controller.records.reduce(function (map, record) {
        if (record.debtId) {
          map[record.debtId] = record;
        }
        return map;
      }, {});

      controller.records = Array.from(controller.list.querySelectorAll("[data-pmi-debt-record-entry]"))
        .map(function (row) {
          const debtId = normalizeString(row.getAttribute("data-pmi-debt-id"));
          const existingRecord = previousById[debtId] || {};
          const labelInput = row.querySelector("[data-pmi-debt-record-label]");
          const balanceInput = row.querySelector("[data-pmi-debt-record-balance]");
          const paymentInput = row.querySelector("[data-pmi-debt-record-payment]");
          const rateInput = row.querySelector("[data-pmi-debt-record-rate]");
          const termInput = row.querySelector("[data-pmi-debt-record-term]");
          const label = normalizeString(labelInput && labelInput.value) || existingRecord.label || "Added Debt";

          return Object.assign({}, existingRecord, {
            debtId: existingRecord.debtId || debtId || generateDebtId(),
            label,
            currentBalance: toOptionalNumber(balanceInput && balanceInput.value),
            minimumMonthlyPayment: toOptionalNumber(paymentInput && paymentInput.value),
            interestRatePercent: toOptionalNumber(rateInput && rateInput.value),
            remainingTermMonths: toOptionalNumber(termInput && termInput.value)
          });
        });
    }

    function renderRows() {
      if (!controller.list) {
        return;
      }

      if (!controller.records.length) {
        controller.list.innerHTML = "";
        return;
      }

      controller.list.innerHTML = controller.records.map(function (record) {
        const debtId = normalizeString(record.debtId);
        const labelInputId = createInputId("pmi-debt-record", debtId, "label");
        const balanceInputId = createInputId("pmi-debt-record", debtId, "balance");
        const paymentInputId = createInputId("pmi-debt-record", debtId, "payment");
        const rateInputId = createInputId("pmi-debt-record", debtId, "rate");
        const termInputId = createInputId("pmi-debt-record", debtId, "term");
        return `
          <div class="field-group full-width pmi-debt-record-field" data-pmi-debt-record-entry data-pmi-debt-id="${escapeHtml(debtId)}">
            <div class="pmi-asset-record-label-row pmi-debt-record-label-row">
              <label for="${escapeHtml(labelInputId)}">Debt</label>
              <button class="pmi-asset-record-remove pmi-debt-record-remove" type="button" data-pmi-debt-record-remove aria-label="Remove ${escapeHtml(record.label)}">Remove</button>
            </div>
            <input id="${escapeHtml(labelInputId)}" data-pmi-debt-record-label type="text" value="${escapeHtml(record.label)}">
            <div class="form-grid pmi-debt-record-grid">
              <div class="field-group">
                <label for="${escapeHtml(balanceInputId)}">Current Balance</label>
                <div class="profile-currency-field">
                  <input id="${escapeHtml(balanceInputId)}" data-pmi-debt-record-balance type="number" min="0" step="100" value="${escapeHtml(formatValueForInput(record.currentBalance))}">
                  <span class="profile-currency-suffix">USD</span>
                </div>
              </div>
              <div class="field-group">
                <label for="${escapeHtml(paymentInputId)}">Minimum Monthly Payment</label>
                <div class="profile-currency-field">
                  <input id="${escapeHtml(paymentInputId)}" data-pmi-debt-record-payment type="number" min="0" step="25" value="${escapeHtml(formatValueForInput(record.minimumMonthlyPayment))}">
                  <span class="profile-currency-suffix">USD</span>
                </div>
              </div>
              <div class="field-group">
                <label for="${escapeHtml(rateInputId)}">Interest Rate</label>
                <div class="profile-currency-field">
                  <input id="${escapeHtml(rateInputId)}" data-pmi-debt-record-rate type="number" min="0" step="0.01" value="${escapeHtml(formatValueForInput(record.interestRatePercent))}">
                  <span class="profile-currency-suffix">%</span>
                </div>
              </div>
              <div class="field-group">
                <label for="${escapeHtml(termInputId)}">Remaining Term</label>
                <div class="profile-currency-field">
                  <input id="${escapeHtml(termInputId)}" data-pmi-debt-record-term type="number" min="0" step="1" value="${escapeHtml(formatValueForInput(record.remainingTermMonths))}">
                  <span class="profile-currency-suffix">Months</span>
                </div>
              </div>
            </div>
          </div>
        `;
      }).join("");
    }

    function renderResults() {
      if (!controller.results) {
        return;
      }

      const query = controller.searchInput ? controller.searchInput.value : "";
      const allEntries = getAddableLibraryEntries();
      const suggestedTypeKeys = SUGGESTED_DEBT_TYPE_KEYS.reduce(function (map, typeKey) {
        map[typeKey] = true;
        return map;
      }, {});
      const recentTypeKeys = controller.recentTypeKeys.reduce(function (map, typeKey) {
        map[typeKey] = true;
        return map;
      }, {});
      const entries = allEntries.filter(function (entry) {
        if (!query && controller.libraryFilter === "suggested" && !suggestedTypeKeys[entry.typeKey]) {
          return false;
        }

        if (!query && controller.libraryFilter === "recent" && !recentTypeKeys[entry.typeKey]) {
          return false;
        }

        return matchesSearch(entry, query);
      });

      if (!entries.length) {
        controller.results.innerHTML = controller.libraryFilter === "recent" && !query
          ? '<div class="profile-search-results-empty">No recent debts added in this session.</div>'
          : '<div class="profile-search-results-empty">No matching debt types found.</div>';
        return;
      }

      controller.results.innerHTML = groupEntriesByCategory(entries).map(function (group) {
        return `
          <section class="pmi-debt-library-group">
            <div class="pmi-asset-library-group-heading pmi-debt-library-group-heading">
              <h3>${escapeHtml(group.categoryLabel)}</h3>
              <span>${escapeHtml(group.entries.length)} ${group.entries.length === 1 ? "debt type" : "debt types"}</span>
            </div>
            <div class="pmi-asset-library-items pmi-debt-library-items">
              ${group.entries.map(function (entry) {
                return `
                  <button class="profile-search-result-button pmi-debt-library-result" type="button" data-pmi-debt-library-type-key="${escapeHtml(entry.typeKey)}">
                    <span class="pmi-asset-library-result-copy pmi-debt-library-result-copy">
                      <strong>${escapeHtml(entry.label)}</strong>
                      <span>${escapeHtml(entry.description || "")}</span>
                    </span>
                    <span class="pmi-asset-library-result-meta pmi-debt-library-result-meta">${escapeHtml(getCategoryLabel(entry.categoryKey))}</span>
                    <span class="pmi-asset-library-result-action pmi-debt-library-result-action" aria-hidden="true">
                      <img src="../Images/addasset.svg" alt="">
                    </span>
                  </button>
                `;
              }).join("")}
            </div>
          </section>
        `;
      }).join("");
    }

    function updateFilterButtons() {
      if (!controller.modal) {
        return;
      }

      controller.modal.querySelectorAll("[data-pmi-debt-library-filter]").forEach(function (button) {
        const isActive = button.getAttribute("data-pmi-debt-library-filter") === controller.libraryFilter;
        button.classList.toggle("is-active", isActive);
        button.setAttribute("aria-pressed", isActive ? "true" : "false");
      });
    }

    function closeModal() {
      if (controller.modal) {
        controller.modal.hidden = true;
      }
    }

    function openModal() {
      if (!controller.modal) {
        controller.modal = createModal(controller);
        if (!controller.modal) {
          return;
        }

        controller.searchInput = controller.modal.querySelector("[data-pmi-debt-library-search]");
        controller.results = controller.modal.querySelector("[data-pmi-debt-library-results]");

        controller.modal.addEventListener("click", function (event) {
          if (event.target.closest("[data-pmi-debt-library-close]")) {
            closeModal();
            return;
          }

          const filterButton = event.target.closest("[data-pmi-debt-library-filter]");
          if (filterButton) {
            controller.libraryFilter = filterButton.getAttribute("data-pmi-debt-library-filter") || "suggested";
            updateFilterButtons();
            renderResults();
            return;
          }

          const resultButton = event.target.closest("[data-pmi-debt-library-type-key]");
          if (!resultButton) {
            return;
          }

          const entry = findLibraryEntry(resultButton.getAttribute("data-pmi-debt-library-type-key"));
          const record = createDebtRecordFromLibraryEntry(entry);
          if (!record) {
            return;
          }

          syncRecordsFromDom();
          controller.records.push(record);
          controller.recentTypeKeys = [record.typeKey].concat(controller.recentTypeKeys.filter(function (typeKey) {
            return typeKey !== record.typeKey;
          })).slice(0, 8);
          renderRows();
          closeModal();

          const row = controller.list
            ? Array.from(controller.list.querySelectorAll("[data-pmi-debt-record-entry]")).find(function (candidate) {
              return normalizeString(candidate.getAttribute("data-pmi-debt-id")) === record.debtId;
            })
            : null;
          const balanceInput = row && row.querySelector("[data-pmi-debt-record-balance]");
          if (balanceInput && typeof balanceInput.focus === "function") {
            balanceInput.focus();
          }
        });

        controller.searchInput?.addEventListener("input", renderResults);
        controller.modal.addEventListener("keydown", function (event) {
          if (event.key === "Escape") {
            closeModal();
          }
        });
      }

      if (controller.searchInput) {
        controller.searchInput.value = "";
      }
      updateFilterButtons();
      renderResults();
      controller.modal.hidden = false;
      controller.searchInput?.focus();
    }

    function hydrateDebtRecords(records) {
      controller.records = Array.isArray(records)
        ? records.map(normalizeRecordForUi).filter(Boolean)
        : [];
      renderRows();
    }

    function serializeDebtRecords() {
      syncRecordsFromDom();
      return controller.records
        .map(function (record) {
          const currentBalance = toOptionalNumber(record.currentBalance);
          if (currentBalance == null || currentBalance < 0) {
            return null;
          }

          return {
            debtId: normalizeString(record.debtId) || generateDebtId(),
            categoryKey: normalizeString(record.categoryKey),
            typeKey: normalizeString(record.typeKey),
            label: normalizeString(record.label) || normalizeString(record.typeKey) || "Added Debt",
            currentBalance,
            minimumMonthlyPayment: toOptionalNonNegativeNumber(record.minimumMonthlyPayment),
            interestRatePercent: toOptionalNonNegativeNumber(record.interestRatePercent),
            remainingTermMonths: toOptionalNonNegativeNumber(record.remainingTermMonths),
            securedBy: normalizeString(record.securedBy) || null,
            sourceKey: normalizeString(record.sourceKey) || null,
            isDefaultDebt: record.isDefaultDebt === true,
            isCustomDebt: record.isCustomDebt === true || normalizeString(record.typeKey) === "customDebt" || normalizeString(record.categoryKey) === "otherDebt",
            notes: normalizeString(record.notes) || null,
            metadata: Object.assign({
              sourceType: "user-input",
              source: "debt-library",
              libraryEntryKey: normalizeString(record.typeKey)
            }, clonePlainObject(record.metadata))
          };
        })
        .filter(Boolean);
    }

    controller.hydrateDebtRecords = hydrateDebtRecords;
    controller.serializeDebtRecords = serializeDebtRecords;

    controller.addButton?.addEventListener("click", openModal);
    controller.list?.addEventListener("click", function (event) {
      const removeButton = event.target.closest("[data-pmi-debt-record-remove]");
      if (!removeButton) {
        return;
      }

      const row = removeButton.closest("[data-pmi-debt-record-entry]");
      const debtId = normalizeString(row && row.getAttribute("data-pmi-debt-id"));
      controller.records = controller.records.filter(function (record) {
        return record.debtId !== debtId;
      });
      renderRows();
    });

    controller.list?.addEventListener("input", function (event) {
      if (!event.target.closest("[data-pmi-debt-record-entry]")) {
        return;
      }

      syncRecordsFromDom();
    });

    hydrateDebtRecords([]);
    activeController = controller;
    return controller;
  }

  function hydrateDebtRecords(records) {
    if (activeController && typeof activeController.hydrateDebtRecords === "function") {
      activeController.hydrateDebtRecords(records);
    }
  }

  function serializeDebtRecords() {
    return activeController && typeof activeController.serializeDebtRecords === "function"
      ? activeController.serializeDebtRecords()
      : [];
  }

  lensAnalysis.pmiDebtRecords = {
    initPmiDebtRecords,
    hydrateDebtRecords,
    serializeDebtRecords,
    createDebtRecordFromLibraryEntry
  };
})(window);
