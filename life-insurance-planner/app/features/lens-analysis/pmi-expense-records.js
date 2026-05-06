(function (global) {
  const LensApp = global.LensApp || (global.LensApp = {});
  const lensAnalysis = LensApp.lensAnalysis || (LensApp.lensAnalysis = {});

  // Owner: PMI expense records controller.
  // Purpose: collect repeatable Additional Expenses records from PMI.
  // Healthcare bucket rows can affect Needs healthcareExpenses automatically;
  // non-healthcare rows remain raw-only for current output, and
  // continuationStatus is future support-treatment metadata.
  // Non-goals: no normalization, no formulas, no inflation/projection math,
  // no treatment assumptions, no Step 3 wiring, and no storage access.

  let generatedExpenseIdCounter = 0;
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

  function getExpenseLibraryApi() {
    return lensAnalysis.expenseLibrary && typeof lensAnalysis.expenseLibrary === "object"
      ? lensAnalysis.expenseLibrary
      : {};
  }

  function getExpenseTaxonomyApi() {
    return lensAnalysis.expenseTaxonomy && typeof lensAnalysis.expenseTaxonomy === "object"
      ? lensAnalysis.expenseTaxonomy
      : {};
  }

  function getLibraryEntries() {
    const expenseLibrary = getExpenseLibraryApi();
    if (typeof expenseLibrary.getExpenseLibraryEntries === "function") {
      return expenseLibrary.getExpenseLibraryEntries();
    }

    return Array.isArray(expenseLibrary.EXPENSE_LIBRARY_ENTRIES)
      ? expenseLibrary.EXPENSE_LIBRARY_ENTRIES.slice()
      : [];
  }

  function findLibraryEntry(typeKey) {
    const expenseLibrary = getExpenseLibraryApi();
    if (typeof expenseLibrary.findExpenseLibraryEntry === "function") {
      return expenseLibrary.findExpenseLibraryEntry(typeKey);
    }

    return getLibraryEntries().find(function (entry) {
      return entry && (entry.typeKey === typeKey || entry.libraryEntryKey === typeKey);
    }) || null;
  }

  function isInitialAddableExpenseEntry(entry) {
    return Boolean(
      entry
      && entry.isAddable === true
      && entry.isProtected !== true
      && entry.isScalarFieldOwned !== true
      && entry.uiAvailability === "initial"
    );
  }

  function getInitialAddableLibraryEntries() {
    return getLibraryEntries().filter(isInitialAddableExpenseEntry);
  }

  function getTaxonomyCategory(categoryKey) {
    const taxonomy = getExpenseTaxonomyApi();
    if (typeof taxonomy.getExpenseCategory === "function") {
      return taxonomy.getExpenseCategory(categoryKey);
    }

    const categories = Array.isArray(taxonomy.DEFAULT_EXPENSE_CATEGORIES)
      ? taxonomy.DEFAULT_EXPENSE_CATEGORIES
      : [];
    return categories.find(function (category) {
      return category && category.categoryKey === categoryKey;
    }) || null;
  }

  function getCategoryLabel(categoryKey) {
    const category = getTaxonomyCategory(categoryKey);
    return normalizeString(category && category.label) || normalizeString(categoryKey) || "Expense";
  }

  function getExpenseTypeLabel(record) {
    const safeRecord = record && typeof record === "object" ? record : {};
    const entry = findLibraryEntry(safeRecord.typeKey || safeRecord.libraryEntryKey);
    return normalizeString(entry && entry.label)
      || normalizeString(safeRecord.typeKey)
      || normalizeString(safeRecord.categoryKey)
      || "Expense";
  }

  function formatDisplayAmount(value) {
    const number = toOptionalNumber(value);
    if (number == null) {
      return "-";
    }

    return "$" + number.toLocaleString("en-US", {
      maximumFractionDigits: number % 1 === 0 ? 0 : 2
    });
  }

  function formatDisplayToken(value) {
    const normalized = normalizeString(value);
    if (!normalized) {
      return "-";
    }

    return normalized
      .replace(/([a-z])([A-Z])/g, "$1 $2")
      .replace(/[_-]+/g, " ")
      .replace(/\b\w/g, function (letter) {
        return letter.toUpperCase();
      });
  }

  function normalizeGeneratedExpenseFactForUi(expense) {
    const safeExpense = expense && typeof expense === "object" ? expense : {};
    if (safeExpense.isGeneratedExpense !== true || safeExpense.isDebtPaymentExpense !== true) {
      return null;
    }

    const sourceDebtRecordId = normalizeString(safeExpense.sourceDebtRecordId);
    const sourceDebtTypeKey = normalizeString(safeExpense.sourceDebtTypeKey);
    const amount = toOptionalNumber(safeExpense.amount);
    if (!sourceDebtRecordId || !sourceDebtTypeKey || amount == null) {
      return null;
    }

    return {
      expenseFactId: normalizeString(safeExpense.expenseFactId) || sourceDebtRecordId,
      typeKey: normalizeString(safeExpense.typeKey) || "debtPayment",
      categoryKey: normalizeString(safeExpense.categoryKey) || "debtPayment",
      label: normalizeString(safeExpense.label) || "Debt Payment",
      amount,
      frequency: normalizeString(safeExpense.paymentFrequency || safeExpense.frequency) || "monthly",
      termType: normalizeString(safeExpense.termType) || "ongoing",
      continuationStatus: normalizeString(safeExpense.continuationStatus) || "review",
      remainingTermMonths: toOptionalNonNegativeNumber(safeExpense.remainingTermMonths),
      sourceDebtRecordId,
      sourceDebtTypeKey,
      sourcePath: normalizeString(safeExpense.sourcePath) || null,
      duplicateProtectionKey: normalizeString(safeExpense.duplicateProtectionKey) || null,
      isGeneratedExpense: true,
      isDebtPaymentExpense: true,
      isReadOnly: true,
      isFormulaEligible: false
    };
  }

  function normalizeGeneratedExpenseFactsForUi(expenseFacts) {
    const sourceExpenses = Array.isArray(expenseFacts)
      ? expenseFacts
      : Array.isArray(expenseFacts && expenseFacts.expenses)
        ? expenseFacts.expenses
        : [];
    return sourceExpenses.map(normalizeGeneratedExpenseFactForUi).filter(Boolean);
  }

  function createGeneratedExpenseFactsFromDebtRecords(debtRecords) {
    const sourceRecords = Array.isArray(debtRecords) ? debtRecords : [];
    if (!sourceRecords.length || typeof lensAnalysis.createExpenseFactsFromSourceData !== "function") {
      return [];
    }

    const projection = lensAnalysis.createExpenseFactsFromSourceData({ debtRecords: sourceRecords });
    return normalizeGeneratedExpenseFactsForUi(projection);
  }

  function getFrequencyOptions() {
    const taxonomy = getExpenseTaxonomyApi();
    return Array.isArray(taxonomy.EXPENSE_FREQUENCY_OPTIONS)
      ? taxonomy.EXPENSE_FREQUENCY_OPTIONS.slice()
      : [
        { value: "weekly", label: "Weekly" },
        { value: "monthly", label: "Monthly" },
        { value: "quarterly", label: "Quarterly" },
        { value: "semiAnnual", label: "Semiannual" },
        { value: "annual", label: "Annual" },
        { value: "oneTime", label: "One-Time" }
      ];
  }

  function getTermTypeOptions() {
    const taxonomy = getExpenseTaxonomyApi();
    return Array.isArray(taxonomy.EXPENSE_TERM_TYPE_OPTIONS)
      ? taxonomy.EXPENSE_TERM_TYPE_OPTIONS.slice()
      : [
        { value: "ongoing", label: "Ongoing" },
        { value: "fixedYears", label: "Fixed Years" },
        { value: "untilAge", label: "Until Age" },
        { value: "untilDate", label: "Until Date" },
        { value: "oneTime", label: "One-Time" }
      ];
  }

  function isValidExpenseCategory(categoryKey) {
    const taxonomy = getExpenseTaxonomyApi();
    return typeof taxonomy.isValidExpenseCategory === "function"
      ? taxonomy.isValidExpenseCategory(categoryKey)
      : Boolean(getTaxonomyCategory(categoryKey));
  }

  function normalizeExpenseFrequency(frequency, fallback) {
    const taxonomy = getExpenseTaxonomyApi();
    if (typeof taxonomy.normalizeExpenseFrequency === "function") {
      return taxonomy.normalizeExpenseFrequency(frequency, fallback);
    }

    const normalized = normalizeString(frequency);
    const values = getFrequencyOptions().map(function (option) {
      return option.value;
    });
    if (values.indexOf(normalized) !== -1) {
      return normalized;
    }

    const normalizedFallback = normalizeString(fallback);
    return values.indexOf(normalizedFallback) !== -1 ? normalizedFallback : "monthly";
  }

  function normalizeExpenseTermType(termType, fallback) {
    const taxonomy = getExpenseTaxonomyApi();
    if (typeof taxonomy.normalizeExpenseTermType === "function") {
      return taxonomy.normalizeExpenseTermType(termType, fallback);
    }

    const normalized = normalizeString(termType);
    const values = getTermTypeOptions().map(function (option) {
      return option.value;
    });
    if (values.indexOf(normalized) !== -1) {
      return normalized;
    }

    const normalizedFallback = normalizeString(fallback);
    return values.indexOf(normalizedFallback) !== -1 ? normalizedFallback : "ongoing";
  }

  function getContinuationStatusOptions() {
    return [
      { value: "continues", label: "Continues after death" },
      { value: "stops", label: "Stops/reduces after death" },
      { value: "review", label: "Review case-by-case" }
    ];
  }

  function normalizeContinuationStatus(value, fallback) {
    const values = getContinuationStatusOptions().map(function (option) {
      return option.value;
    });
    const normalized = normalizeString(value);
    if (values.indexOf(normalized) !== -1) {
      return normalized;
    }

    const normalizedFallback = normalizeString(fallback);
    return values.indexOf(normalizedFallback) !== -1 ? normalizedFallback : "review";
  }

  function getLibraryDefaultContinuationStatus(entry) {
    return normalizeContinuationStatus(entry && entry.defaultContinuationStatus, "review");
  }

  function normalizeDateOnlyValue(value) {
    const normalized = normalizeString(value);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
      return null;
    }

    const parsed = new Date(normalized + "T00:00:00Z");
    if (Number.isNaN(parsed.getTime())) {
      return null;
    }

    return parsed.toISOString().slice(0, 10) === normalized ? normalized : null;
  }

  function generateExpenseId() {
    if (global.crypto && typeof global.crypto.randomUUID === "function") {
      return "expense_" + global.crypto.randomUUID().replace(/-/g, "_");
    }

    generatedExpenseIdCounter += 1;
    return "expense_" + Date.now() + "_" + generatedExpenseIdCounter;
  }

  function createExpenseRecordFromLibraryEntry(entry) {
    const safeEntry = entry && typeof entry === "object" ? entry : {};
    if (!isInitialAddableExpenseEntry(safeEntry)) {
      return null;
    }

    const typeKey = normalizeString(safeEntry.typeKey || safeEntry.libraryEntryKey);
    const categoryKey = normalizeString(safeEntry.categoryKey);
    const label = normalizeString(safeEntry.label) || typeKey || "Added Expense";

    if (!typeKey || !categoryKey || !isValidExpenseCategory(categoryKey)) {
      return null;
    }

    const termType = normalizeExpenseTermType(safeEntry.defaultTermType, "ongoing");

    return {
      expenseId: generateExpenseId(),
      categoryKey,
      typeKey,
      label,
      amount: null,
      frequency: normalizeExpenseFrequency(safeEntry.defaultFrequency, "monthly"),
      termType,
      continuationStatus: getLibraryDefaultContinuationStatus(safeEntry),
      termYears: termType === "fixedYears" && Number.isFinite(Number(safeEntry.suggestedTermYears))
        ? Number(safeEntry.suggestedTermYears)
        : null,
      endAge: null,
      endDate: null,
      sourceKey: null,
      isDefaultExpense: false,
      isScalarFieldOwned: false,
      isProtected: false,
      isRepeatableExpenseRecord: true,
      isCustomExpense: safeEntry.isCustomType === true || typeKey === "customExpenseRecord" || categoryKey === "customExpense",
      notes: null,
      metadata: {
        sourceType: "user-input",
        source: "expense-library",
        libraryEntryKey: normalizeString(safeEntry.libraryEntryKey || typeKey)
      }
    };
  }

  function normalizeRecordForUi(record, index) {
    const safeRecord = record && typeof record === "object" ? record : {};
    const entry = findLibraryEntry(safeRecord.typeKey || safeRecord.libraryEntryKey);
    if (entry && !isInitialAddableExpenseEntry(entry)) {
      return null;
    }

    const categoryKey = normalizeString(safeRecord.categoryKey || (entry && entry.categoryKey));
    const typeKey = normalizeString(safeRecord.typeKey || (entry && entry.typeKey));
    const label = normalizeString(safeRecord.label || (entry && entry.label));

    if (!categoryKey || !typeKey || !label || !isValidExpenseCategory(categoryKey)) {
      return null;
    }

    if (!entry && typeKey !== "customExpenseRecord") {
      return null;
    }

    const metadata = clonePlainObject(safeRecord.metadata);
    const termType = normalizeExpenseTermType(safeRecord.termType, entry && entry.defaultTermType);
    const continuationStatus = normalizeContinuationStatus(
      safeRecord.continuationStatus,
      getLibraryDefaultContinuationStatus(entry)
    );
    return {
      expenseId: normalizeString(safeRecord.expenseId) || generateExpenseId(),
      categoryKey,
      typeKey,
      label,
      amount: toOptionalNumber(safeRecord.amount),
      frequency: normalizeExpenseFrequency(safeRecord.frequency, entry && entry.defaultFrequency),
      termType,
      continuationStatus,
      termYears: termType === "fixedYears" ? toOptionalNonNegativeNumber(safeRecord.termYears) : null,
      endAge: termType === "untilAge" ? toOptionalNonNegativeNumber(safeRecord.endAge) : null,
      endDate: termType === "untilDate" ? normalizeDateOnlyValue(safeRecord.endDate) : null,
      sourceKey: normalizeString(safeRecord.sourceKey) || null,
      isDefaultExpense: false,
      isScalarFieldOwned: false,
      isProtected: false,
      isRepeatableExpenseRecord: true,
      isCustomExpense: safeRecord.isCustomExpense === true || typeKey === "customExpenseRecord" || categoryKey === "customExpense",
      notes: normalizeString(safeRecord.notes) || null,
      metadata: Object.assign({
        sourceType: "user-input",
        source: "expense-library",
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
    ].concat(Array.isArray(entry.searchTerms) ? entry.searchTerms : [])
      .concat(Array.isArray(entry.tags) ? entry.tags : [])
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

  const SUGGESTED_EXPENSE_TYPE_KEYS = Object.freeze([
    "healthInsurancePremiums",
    "medicalOutOfPocket",
    "prescriptionMedications",
    "dentalOutOfPocket",
    "visionOutOfPocket",
    "longTermCareInsurancePremiums",
    "householdUtilities",
    "groceries",
    "childcareExpense",
    "customExpenseRecord"
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

  function createInputId(prefix, expenseId, suffix) {
    return [
      prefix,
      normalizeString(expenseId).replace(/[^A-Za-z0-9_-]+/g, "-"),
      suffix
    ].filter(Boolean).join("-");
  }

  function renderSelectOptions(options, selectedValue) {
    return options.map(function (option) {
      const value = normalizeString(option.value);
      const label = normalizeString(option.label) || value;
      return `<option value="${escapeHtml(value)}"${value === selectedValue ? " selected" : ""}>${escapeHtml(label)}</option>`;
    }).join("");
  }

  function renderCompactTermDetailField(record, expenseId) {
    const termType = normalizeString(record.termType);
    if (termType === "fixedYears") {
      const termYearsInputId = createInputId("pmi-expense-record", expenseId, "term-years");
      return `<input id="${escapeHtml(termYearsInputId)}" data-pmi-expense-record-term-years type="number" min="0" step="1" value="${escapeHtml(formatValueForInput(record.termYears))}" aria-label="Term Years">`;
    }

    if (termType === "untilAge") {
      const endAgeInputId = createInputId("pmi-expense-record", expenseId, "end-age");
      return `<input id="${escapeHtml(endAgeInputId)}" data-pmi-expense-record-end-age type="number" min="0" step="1" value="${escapeHtml(formatValueForInput(record.endAge))}" aria-label="End Age">`;
    }

    if (termType === "untilDate") {
      const endDateInputId = createInputId("pmi-expense-record", expenseId, "end-date");
      return `<input id="${escapeHtml(endDateInputId)}" data-pmi-expense-record-end-date type="date" value="${escapeHtml(record.endDate || "")}" aria-label="End Date">`;
    }

    return '<span class="pmi-expense-record-muted" aria-label="No term detail">-</span>';
  }

  function renderReadOnlyExpenseValue(value, className) {
    return `<span class="pmi-expense-record-readonly-value ${escapeHtml(className || "")}">${escapeHtml(value || "-")}</span>`;
  }

  function renderGeneratedExpenseRow(record) {
    const safeRecord = record && typeof record === "object" ? record : {};
    const expenseFactId = normalizeString(safeRecord.expenseFactId);
    const sourceDebtRecordId = normalizeString(safeRecord.sourceDebtRecordId);
    const termDetail = safeRecord.remainingTermMonths == null
      ? "-"
      : String(safeRecord.remainingTermMonths) + " mo";
    return `
      <div class="pmi-expense-record-row pmi-expense-record-row-generated" role="row" data-pmi-expense-generated-entry data-pmi-expense-generated-id="${escapeHtml(expenseFactId)}" data-source-debt-record-id="${escapeHtml(sourceDebtRecordId)}">
        <div class="pmi-expense-record-cell pmi-expense-record-type-cell" role="cell" data-column-label="Expense Type">
          <span class="pmi-expense-record-type-label" title="Debt Payment">Debt Payment</span>
          <span class="pmi-expense-record-source-chip">From Debt Records</span>
        </div>
        <div class="pmi-expense-record-cell" role="cell" data-column-label="Label / Vendor">
          ${renderReadOnlyExpenseValue(safeRecord.label, "pmi-expense-record-generated-label")}
        </div>
        <div class="pmi-expense-record-cell" role="cell" data-column-label="Amount">
          ${renderReadOnlyExpenseValue(formatDisplayAmount(safeRecord.amount), "pmi-expense-record-generated-amount")}
        </div>
        <div class="pmi-expense-record-cell" role="cell" data-column-label="Frequency">
          ${renderReadOnlyExpenseValue(formatDisplayToken(safeRecord.frequency), "")}
        </div>
        <div class="pmi-expense-record-cell" role="cell" data-column-label="Duration">
          ${renderReadOnlyExpenseValue(formatDisplayToken(safeRecord.termType), "")}
        </div>
        <div class="pmi-expense-record-cell" role="cell" data-column-label="Term Detail">
          ${renderReadOnlyExpenseValue(termDetail, "")}
        </div>
        <div class="pmi-expense-record-cell" role="cell" data-column-label="Continues?">
          ${renderReadOnlyExpenseValue("Review", "")}
        </div>
        <div class="pmi-expense-record-cell" role="cell" data-column-label="Category">
          ${renderReadOnlyExpenseValue("Debt Payment", "pmi-expense-record-category-label")}
        </div>
        <div class="pmi-expense-record-cell pmi-expense-record-remove-cell" role="cell" data-column-label="Remove">
          <span class="pmi-expense-record-source-hint">Edit in Debt Records</span>
        </div>
      </div>
    `;
  }

  function renderShell(root) {
    if (!root || root.dataset.pmiExpenseRecordsInitialized === "true") {
      return;
    }

    root.innerHTML = `
      <div class="field-group full-width form-subgroup-label pmi-expense-records-heading">
        <span>Additional Expenses</span>
      </div>
      <div class="field-group full-width pmi-expense-records-copy">
        <p class="underwriting-helper-text">Use this for expenses not already captured in Household Spending. Healthcare bucket rows are included in LENS healthcare expenses automatically; recurring healthcare rows are projected with Healthcare Inflation, and one-time healthcare rows are included current-dollar. Non-healthcare rows remain raw facts unless another LENS component explicitly owns them.</p>
        <p class="underwriting-helper-text">"Continues after death?" is saved for future support-treatment review. Review overlap with Household Spending to avoid duplicate entry.</p>
      </div>
      <div class="pmi-expense-records-list" data-pmi-expense-records-list></div>
      <div class="field-group pmi-expense-records-add-field">
        <button class="button tertiary-button pmi-expense-records-add-button" type="button" data-pmi-expense-records-add>Add Expense</button>
      </div>
    `;
    root.dataset.pmiExpenseRecordsInitialized = "true";
  }

  function createModal(controller) {
    const documentRef = controller.documentRef;
    if (!documentRef || !documentRef.body) {
      return null;
    }

    const modal = documentRef.createElement("div");
    modal.className = "profile-search-modal";
    modal.setAttribute("data-pmi-expense-library-modal", "");
    modal.hidden = true;
    modal.innerHTML = `
      <div class="profile-search-modal-backdrop" data-pmi-expense-library-close></div>
      <div class="profile-search-modal-panel" role="dialog" aria-modal="true" aria-labelledby="pmi-expense-library-title">
        <button class="profile-search-modal-close" type="button" aria-label="Close expense library" data-pmi-expense-library-close>x</button>
        <div class="profile-search-modal-header">
          <div>
            <h2 id="pmi-expense-library-title">Add Expense</h2>
            <p>Add expenses not already captured in Household Spending. Healthcare bucket rows are included in LENS healthcare expenses automatically; recurring healthcare rows are projected with Healthcare Inflation, and one-time healthcare rows are included current-dollar. Non-healthcare rows remain saved raw facts unless another LENS component explicitly owns them.</p>
          </div>
        </div>
        <div class="pmi-expense-library-search">
          <input id="pmi-expense-library-search" type="text" placeholder="Search expense types" data-pmi-expense-library-search>
        </div>
        <div class="pmi-expense-library-filter-row" aria-label="Expense library views">
          <button class="pmi-expense-library-filter is-active" type="button" data-pmi-expense-library-filter="suggested" aria-pressed="true">Suggested</button>
          <button class="pmi-expense-library-filter" type="button" data-pmi-expense-library-filter="all" aria-pressed="false">All Expenses</button>
          <button class="pmi-expense-library-filter" type="button" data-pmi-expense-library-filter="recent" aria-pressed="false">Recent</button>
        </div>
        <div class="profile-search-results" data-pmi-expense-library-results></div>
      </div>
    `;

    documentRef.body.appendChild(modal);
    return modal;
  }

  function initPmiExpenseRecords(options) {
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
      generatedRecords: [],
      list: root.querySelector("[data-pmi-expense-records-list]"),
      addButton: root.querySelector("[data-pmi-expense-records-add]"),
      modal: null,
      searchInput: null,
      results: null
    };
    controller.libraryFilter = "suggested";
    controller.recentTypeKeys = [];
    controller.debtRecordsProvider = typeof safeOptions.debtRecordsProvider === "function"
      ? safeOptions.debtRecordsProvider
      : function () {
        const debtRecordsApi = lensAnalysis.pmiDebtRecords && typeof lensAnalysis.pmiDebtRecords === "object"
          ? lensAnalysis.pmiDebtRecords
          : {};
        return typeof debtRecordsApi.serializeDebtRecords === "function"
          ? debtRecordsApi.serializeDebtRecords()
          : [];
      };

    function syncRecordsFromDom() {
      if (!controller.list) {
        return;
      }

      const previousById = controller.records.reduce(function (map, record) {
        if (record.expenseId) {
          map[record.expenseId] = record;
        }
        return map;
      }, {});

      controller.records = Array.from(controller.list.querySelectorAll("[data-pmi-expense-record-entry]"))
        .map(function (row) {
          const expenseId = normalizeString(row.getAttribute("data-pmi-expense-id"));
          const existingRecord = previousById[expenseId] || {};
          const labelInput = row.querySelector("[data-pmi-expense-record-label]");
          const amountInput = row.querySelector("[data-pmi-expense-record-amount]");
          const frequencyInput = row.querySelector("[data-pmi-expense-record-frequency]");
          const termTypeInput = row.querySelector("[data-pmi-expense-record-term-type]");
          const continuationStatusInput = row.querySelector("[data-pmi-expense-record-continuation-status]");
          const termYearsInput = row.querySelector("[data-pmi-expense-record-term-years]");
          const endAgeInput = row.querySelector("[data-pmi-expense-record-end-age]");
          const endDateInput = row.querySelector("[data-pmi-expense-record-end-date]");
          const label = normalizeString(labelInput && labelInput.value) || existingRecord.label || "Added Expense";
          const termType = normalizeExpenseTermType(termTypeInput && termTypeInput.value, existingRecord.termType);

          return Object.assign({}, existingRecord, {
            expenseId: existingRecord.expenseId || expenseId || generateExpenseId(),
            label,
            amount: toOptionalNumber(amountInput && amountInput.value),
            frequency: normalizeExpenseFrequency(frequencyInput && frequencyInput.value, existingRecord.frequency),
            termType,
            continuationStatus: normalizeContinuationStatus(
              continuationStatusInput && continuationStatusInput.value,
              existingRecord.continuationStatus
            ),
            termYears: termType === "fixedYears" ? toOptionalNonNegativeNumber(termYearsInput && termYearsInput.value) : null,
            endAge: termType === "untilAge" ? toOptionalNonNegativeNumber(endAgeInput && endAgeInput.value) : null,
            endDate: termType === "untilDate" ? normalizeDateOnlyValue(endDateInput && endDateInput.value) : null
          });
        });
    }

    function renderRows() {
      if (!controller.list) {
        return;
      }

      if (!controller.records.length && !controller.generatedRecords.length) {
        controller.list.innerHTML = "";
        return;
      }

      const manualRowsMarkup = controller.records.map(function (record) {
        const expenseId = normalizeString(record.expenseId);
        const labelInputId = createInputId("pmi-expense-record", expenseId, "label");
        const amountInputId = createInputId("pmi-expense-record", expenseId, "amount");
        const frequencyInputId = createInputId("pmi-expense-record", expenseId, "frequency");
        const termTypeInputId = createInputId("pmi-expense-record", expenseId, "term-type");
        const continuationStatusInputId = createInputId("pmi-expense-record", expenseId, "continuation-status");
        const categoryId = createInputId("pmi-expense-record", expenseId, "category");
        const expenseTypeLabel = getExpenseTypeLabel(record);
        const categoryLabel = getCategoryLabel(record.categoryKey);
        return `
          <div class="pmi-expense-record-row" role="row" data-pmi-expense-record-entry data-pmi-expense-id="${escapeHtml(expenseId)}">
            <div class="pmi-expense-record-cell pmi-expense-record-type-cell" role="cell" data-column-label="Expense Type">
              <span class="pmi-expense-record-type-label" data-pmi-expense-record-type-label title="${escapeHtml(expenseTypeLabel)}">${escapeHtml(expenseTypeLabel)}</span>
            </div>
            <div class="pmi-expense-record-cell" role="cell" data-column-label="Label / Vendor">
              <input id="${escapeHtml(labelInputId)}" data-pmi-expense-record-label type="text" value="${escapeHtml(record.label)}" aria-label="Label / Vendor">
            </div>
            <div class="pmi-expense-record-cell" role="cell" data-column-label="Amount">
              <div class="profile-currency-field pmi-expense-record-compact-currency">
                <input id="${escapeHtml(amountInputId)}" data-pmi-expense-record-amount type="number" min="0" step="25" value="${escapeHtml(formatValueForInput(record.amount))}" aria-label="Amount">
                <span class="profile-currency-suffix">USD</span>
              </div>
            </div>
            <div class="pmi-expense-record-cell" role="cell" data-column-label="Frequency">
              <select id="${escapeHtml(frequencyInputId)}" data-pmi-expense-record-frequency aria-label="Frequency">
                ${renderSelectOptions(getFrequencyOptions(), normalizeString(record.frequency))}
              </select>
            </div>
            <div class="pmi-expense-record-cell" role="cell" data-column-label="Duration">
              <select id="${escapeHtml(termTypeInputId)}" data-pmi-expense-record-term-type aria-label="Duration">
                ${renderSelectOptions(getTermTypeOptions(), normalizeString(record.termType))}
              </select>
            </div>
            <div class="pmi-expense-record-cell" role="cell" data-column-label="Term Detail">
              ${renderCompactTermDetailField(record, expenseId)}
            </div>
            <div class="pmi-expense-record-cell" role="cell" data-column-label="Continues?">
              <select id="${escapeHtml(continuationStatusInputId)}" data-pmi-expense-record-continuation-status aria-label="Continues after death?">
                ${renderSelectOptions(getContinuationStatusOptions(), normalizeContinuationStatus(record.continuationStatus, "review"))}
              </select>
            </div>
            <div class="pmi-expense-record-cell" role="cell" data-column-label="Category">
              <span class="pmi-expense-record-category-label" id="${escapeHtml(categoryId)}" title="${escapeHtml(categoryLabel)}">${escapeHtml(categoryLabel)}</span>
            </div>
            <div class="pmi-expense-record-cell pmi-expense-record-remove-cell" role="cell" data-column-label="Remove">
              <button class="pmi-asset-record-remove pmi-expense-record-remove" type="button" data-pmi-expense-record-remove aria-label="Remove ${escapeHtml(record.label)}">Remove</button>
            </div>
          </div>
        `;
      }).join("");
      const generatedRowsMarkup = controller.generatedRecords.map(renderGeneratedExpenseRow).join("");
      const rowsMarkup = manualRowsMarkup + generatedRowsMarkup;

      controller.list.innerHTML = `
        <div class="pmi-expense-records-table" role="table" aria-label="Expense records notebook" data-pmi-expense-records-table>
          <div class="pmi-expense-records-header" role="row" data-pmi-expense-records-header>
            <span role="columnheader">Expense Type</span>
            <span role="columnheader">Label / Vendor</span>
            <span role="columnheader">Amount</span>
            <span role="columnheader">Frequency</span>
            <span role="columnheader">Duration</span>
            <span role="columnheader">Term Detail</span>
            <span role="columnheader">Continues?</span>
            <span role="columnheader">Category</span>
            <span role="columnheader">Remove</span>
          </div>
          <div class="pmi-expense-records-body" role="rowgroup" data-pmi-expense-records-body>
            ${rowsMarkup}
          </div>
        </div>
      `;
    }

    function renderResults() {
      if (!controller.results) {
        return;
      }

      const query = controller.searchInput ? controller.searchInput.value : "";
      const allEntries = getInitialAddableLibraryEntries();
      const suggestedTypeKeys = SUGGESTED_EXPENSE_TYPE_KEYS.reduce(function (map, typeKey) {
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
          ? '<div class="profile-search-results-empty">No recent expenses added in this session.</div>'
          : '<div class="profile-search-results-empty">No matching initial expense types found.</div>';
        return;
      }

      controller.results.innerHTML = groupEntriesByCategory(entries).map(function (group) {
        return `
          <section class="pmi-expense-library-group">
            <div class="pmi-asset-library-group-heading pmi-expense-library-group-heading">
              <h3>${escapeHtml(group.categoryLabel)}</h3>
              <span>${escapeHtml(group.entries.length)} ${group.entries.length === 1 ? "expense type" : "expense types"}</span>
            </div>
            <div class="pmi-asset-library-items pmi-expense-library-items">
              ${group.entries.map(function (entry) {
                return `
                  <button class="profile-search-result-button pmi-expense-library-result" type="button" data-pmi-expense-library-type-key="${escapeHtml(entry.typeKey)}">
                    <span class="pmi-asset-library-result-copy pmi-expense-library-result-copy">
                      <strong>${escapeHtml(entry.label)}</strong>
                      <span>${escapeHtml(entry.description || "")}</span>
                    </span>
                    <span class="pmi-asset-library-result-meta pmi-expense-library-result-meta">${escapeHtml(getCategoryLabel(entry.categoryKey))}</span>
                    <span class="pmi-asset-library-result-action pmi-expense-library-result-action" aria-hidden="true">
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

      controller.modal.querySelectorAll("[data-pmi-expense-library-filter]").forEach(function (button) {
        const isActive = button.getAttribute("data-pmi-expense-library-filter") === controller.libraryFilter;
        button.classList.toggle("is-active", isActive);
        button.setAttribute("aria-pressed", isActive ? "true" : "false");
      });
    }

    function closeModal() {
      if (controller.modal) {
        controller.modal.hidden = true;
      }
    }

    function addExpenseRecordFromLibraryEntry(entry) {
      const record = createExpenseRecordFromLibraryEntry(entry);
      if (!record) {
        return null;
      }

      syncRecordsFromDom();
      controller.records.push(record);
      controller.recentTypeKeys = [record.typeKey].concat(controller.recentTypeKeys.filter(function (typeKey) {
        return typeKey !== record.typeKey;
      })).slice(0, 8);
      renderRows();
      return record;
    }

    function removeExpenseRecordById(expenseId) {
      const normalizedExpenseId = normalizeString(expenseId);
      if (!normalizedExpenseId) {
        return false;
      }

      syncRecordsFromDom();
      const nextRecords = controller.records.filter(function (record) {
        return record.expenseId !== normalizedExpenseId;
      });
      if (nextRecords.length === controller.records.length) {
        return false;
      }

      controller.records = nextRecords;
      renderRows();
      return true;
    }

    function openModal() {
      if (!controller.modal) {
        controller.modal = createModal(controller);
        if (!controller.modal) {
          return;
        }

        controller.searchInput = controller.modal.querySelector("[data-pmi-expense-library-search]");
        controller.results = controller.modal.querySelector("[data-pmi-expense-library-results]");

        controller.modal.addEventListener("click", function (event) {
          if (event.target.closest("[data-pmi-expense-library-close]")) {
            closeModal();
            return;
          }

          const filterButton = event.target.closest("[data-pmi-expense-library-filter]");
          if (filterButton) {
            controller.libraryFilter = filterButton.getAttribute("data-pmi-expense-library-filter") || "suggested";
            updateFilterButtons();
            renderResults();
            return;
          }

          const resultButton = event.target.closest("[data-pmi-expense-library-type-key]");
          if (!resultButton) {
            return;
          }

          const entry = findLibraryEntry(resultButton.getAttribute("data-pmi-expense-library-type-key"));
          const record = addExpenseRecordFromLibraryEntry(entry);
          if (!record) {
            return;
          }

          closeModal();

          const row = controller.list
            ? Array.from(controller.list.querySelectorAll("[data-pmi-expense-record-entry]")).find(function (candidate) {
              return normalizeString(candidate.getAttribute("data-pmi-expense-id")) === record.expenseId;
            })
            : null;
          const amountInput = row && row.querySelector("[data-pmi-expense-record-amount]");
          if (amountInput && typeof amountInput.focus === "function") {
            amountInput.focus();
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

    function hydrateExpenseRecords(records) {
      controller.records = Array.isArray(records)
        ? records.map(normalizeRecordForUi).filter(Boolean)
        : [];
      renderRows();
    }

    function hydrateGeneratedExpenseFacts(expenseFacts) {
      controller.generatedRecords = normalizeGeneratedExpenseFactsForUi(expenseFacts);
      renderRows();
    }

    function refreshGeneratedExpenseFactsFromDebtRecords() {
      const debtRecords = controller.debtRecordsProvider();
      controller.generatedRecords = createGeneratedExpenseFactsFromDebtRecords(debtRecords);
      renderRows();
    }

    function connectDebtRecordsGeneratedRows() {
      const form = root.closest && root.closest("form");
      const debtRoot = form && typeof form.querySelector === "function"
        ? form.querySelector("[data-pmi-debt-records-root]")
        : null;
      if (!debtRoot) {
        return;
      }

      const scheduleRefresh = function () {
        if (typeof global.requestAnimationFrame === "function") {
          global.requestAnimationFrame(refreshGeneratedExpenseFactsFromDebtRecords);
          return;
        }

        refreshGeneratedExpenseFactsFromDebtRecords();
      };

      debtRoot.addEventListener("input", scheduleRefresh);
      debtRoot.addEventListener("change", scheduleRefresh);
      debtRoot.addEventListener("click", scheduleRefresh);

      if (typeof global.MutationObserver === "function") {
        const observer = new global.MutationObserver(scheduleRefresh);
        observer.observe(debtRoot, {
          childList: true,
          subtree: true
        });
        controller.generatedDebtRowsObserver = observer;
      }
    }

    function serializeExpenseRecords() {
      syncRecordsFromDom();
      return controller.records
        .map(function (record) {
          const amount = toOptionalNumber(record.amount);
          const categoryKey = normalizeString(record.categoryKey);
          const typeKey = normalizeString(record.typeKey);
          const termType = normalizeExpenseTermType(record.termType, "ongoing");
          const frequency = normalizeExpenseFrequency(record.frequency, "monthly");
          const continuationStatus = normalizeContinuationStatus(record.continuationStatus, "review");

          if (amount == null || amount < 0 || !categoryKey || !typeKey || !isValidExpenseCategory(categoryKey)) {
            return null;
          }

          return {
            expenseId: normalizeString(record.expenseId) || generateExpenseId(),
            categoryKey,
            typeKey,
            label: normalizeString(record.label) || typeKey || "Added Expense",
            amount,
            frequency,
            termType,
            continuationStatus,
            termYears: termType === "fixedYears" ? toOptionalNonNegativeNumber(record.termYears) : null,
            endAge: termType === "untilAge" ? toOptionalNonNegativeNumber(record.endAge) : null,
            endDate: termType === "untilDate" ? normalizeDateOnlyValue(record.endDate) : null,
            sourceKey: normalizeString(record.sourceKey) || null,
            isDefaultExpense: false,
            isScalarFieldOwned: false,
            isProtected: false,
            isRepeatableExpenseRecord: true,
            isCustomExpense: record.isCustomExpense === true || typeKey === "customExpenseRecord" || categoryKey === "customExpense",
            notes: normalizeString(record.notes) || null,
            metadata: Object.assign({
              sourceType: "user-input",
              source: "expense-library",
              libraryEntryKey: typeKey
            }, clonePlainObject(record.metadata))
          };
        })
        .filter(Boolean);
    }

    controller.hydrateExpenseRecords = hydrateExpenseRecords;
    controller.hydrateGeneratedExpenseFacts = hydrateGeneratedExpenseFacts;
    controller.refreshGeneratedExpenseFactsFromDebtRecords = refreshGeneratedExpenseFactsFromDebtRecords;
    controller.serializeExpenseRecords = serializeExpenseRecords;
    controller.addExpenseRecordFromLibraryEntry = addExpenseRecordFromLibraryEntry;
    controller.removeExpenseRecordById = removeExpenseRecordById;

    controller.addButton?.addEventListener("click", openModal);
    controller.list?.addEventListener("click", function (event) {
      const removeButton = event.target.closest("[data-pmi-expense-record-remove]");
      if (!removeButton) {
        return;
      }

      const row = removeButton.closest("[data-pmi-expense-record-entry]");
      const expenseId = normalizeString(row && row.getAttribute("data-pmi-expense-id"));
      removeExpenseRecordById(expenseId);
    });

    controller.list?.addEventListener("input", function (event) {
      if (!event.target.closest("[data-pmi-expense-record-entry]")) {
        return;
      }

      syncRecordsFromDom();
    });

    controller.list?.addEventListener("change", function (event) {
      if (!event.target.closest("[data-pmi-expense-record-entry]")) {
        return;
      }

      syncRecordsFromDom();
      if (event.target.closest("[data-pmi-expense-record-term-type]")) {
        renderRows();
      }
    });

    hydrateExpenseRecords([]);
    connectDebtRecordsGeneratedRows();
    refreshGeneratedExpenseFactsFromDebtRecords();
    activeController = controller;
    return controller;
  }

  function hydrateExpenseRecords(records) {
    if (activeController && typeof activeController.hydrateExpenseRecords === "function") {
      activeController.hydrateExpenseRecords(records);
    }
  }

  function hydrateGeneratedExpenseFacts(expenseFacts) {
    if (activeController && typeof activeController.hydrateGeneratedExpenseFacts === "function") {
      activeController.hydrateGeneratedExpenseFacts(expenseFacts);
    }
  }

  function refreshGeneratedExpenseFactsFromDebtRecords() {
    if (activeController && typeof activeController.refreshGeneratedExpenseFactsFromDebtRecords === "function") {
      activeController.refreshGeneratedExpenseFactsFromDebtRecords();
    }
  }

  function serializeExpenseRecords() {
    return activeController && typeof activeController.serializeExpenseRecords === "function"
      ? activeController.serializeExpenseRecords()
      : [];
  }

  lensAnalysis.pmiExpenseRecords = {
    initPmiExpenseRecords,
    hydrateExpenseRecords,
    hydrateGeneratedExpenseFacts,
    refreshGeneratedExpenseFactsFromDebtRecords,
    serializeExpenseRecords,
    createExpenseRecordFromLibraryEntry
  };
})(window);
