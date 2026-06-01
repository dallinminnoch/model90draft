(function (global) {
  const LensApp = global.LensApp || (global.LensApp = {});
  const lensAnalysis = LensApp.lensAnalysis || (LensApp.lensAnalysis = {});

  // Owner: PMI housing records controller.
  // Purpose: collect visible repeatable housingRecords[] rows for product review.
  // Non-goals: no normalization, no old scalar sync, no treatment assumptions,
  // no ledger wiring, no graph math, no calculations, and no storage access.

  let generatedHousingRecordCounter = 0;
  let activeController = null;

  const HOUSING_TYPE_OPTIONS = Object.freeze([
    Object.freeze({ value: "primaryResidenceMortgage", label: "Primary Residence - Mortgage" }),
    Object.freeze({ value: "primaryResidenceRent", label: "Primary Residence - Rent" }),
    Object.freeze({ value: "primaryResidenceOwnedFreeAndClear", label: "Primary Residence - Owned Free and Clear" }),
    Object.freeze({ value: "secondMortgageHeloc", label: "Second Mortgage / HELOC" }),
    Object.freeze({ value: "secondHomeVacationProperty", label: "Second Home / Vacation Property" }),
    Object.freeze({ value: "rentalInvestmentProperty", label: "Rental / Investment Property" }),
    Object.freeze({ value: "temporaryHousing", label: "Temporary Housing" }),
    Object.freeze({ value: "housingOperatingCostOnly", label: "Housing Operating Costs Only" }),
    Object.freeze({ value: "otherHousingObligation", label: "Other Housing Obligation" })
  ]);

  const PROPERTY_ROLE_OPTIONS = Object.freeze([
    Object.freeze({ value: "primaryResidence", label: "Primary Residence" }),
    Object.freeze({ value: "secondaryResidence", label: "Secondary Residence" }),
    Object.freeze({ value: "investmentProperty", label: "Investment Property" }),
    Object.freeze({ value: "temporaryHousing", label: "Temporary Housing" }),
    Object.freeze({ value: "other", label: "Other" })
  ]);

  const CONTINUES_AFTER_DEATH_OPTIONS = Object.freeze([
    Object.freeze({ value: "review", label: "Review" }),
    Object.freeze({ value: "yes", label: "Yes" }),
    Object.freeze({ value: "no", label: "No" })
  ]);

  const FIELD_DEFINITIONS = Object.freeze({
    label: Object.freeze({ label: "Record Label", type: "text", placeholder: "Housing record" }),
    typeKey: Object.freeze({ label: "Housing Type", type: "housingType" }),
    propertyRole: Object.freeze({ label: "Property Role", type: "propertyRole" }),
    continuesAfterDeath: Object.freeze({ label: "Continues After Death?", type: "continuesAfterDeath" }),
    propertyValue: Object.freeze({ label: "Property Value", type: "number", step: "1000", suffix: "USD" }),
    currentBalance: Object.freeze({ label: "Current Balance", type: "number", step: "1000", suffix: "USD" }),
    monthlyPayment: Object.freeze({ label: "Monthly Payment", type: "number", step: "50", suffix: "USD" }),
    interestRatePercent: Object.freeze({ label: "Interest Rate", type: "number", step: "0.01", suffix: "%" }),
    remainingTermMonths: Object.freeze({ label: "Remaining Term", type: "number", step: "1", suffix: "Months" }),
    propertyTaxMonthly: Object.freeze({ label: "Property Tax", type: "number", step: "25", suffix: "USD" }),
    homeownersInsuranceMonthly: Object.freeze({ label: "Homeowners Insurance", type: "number", step: "25", suffix: "USD" }),
    hoaMonthly: Object.freeze({ label: "HOA", type: "number", step: "25", suffix: "USD" }),
    maintenanceMonthly: Object.freeze({ label: "Maintenance", type: "number", step: "25", suffix: "USD" }),
    utilitiesMonthly: Object.freeze({ label: "Utilities", type: "number", step: "25", suffix: "USD" }),
    escrowStatus: Object.freeze({
      label: "Escrow Status",
      type: "select",
      options: Object.freeze([
        Object.freeze({ value: "", label: "Select" }),
        Object.freeze({ value: "escrowed", label: "Escrowed" }),
        Object.freeze({ value: "notEscrowed", label: "Not Escrowed" }),
        Object.freeze({ value: "partial", label: "Partial" }),
        Object.freeze({ value: "unknown", label: "Unknown" })
      ])
    }),
    rentMonthly: Object.freeze({ label: "Monthly Rent", type: "number", step: "50", suffix: "USD" }),
    leaseTermMonths: Object.freeze({ label: "Lease Term", type: "number", step: "1", suffix: "Months" }),
    otherHousingCostMonthly: Object.freeze({ label: "Other Housing Costs", type: "number", step: "25", suffix: "USD" }),
    rentersInsuranceMonthly: Object.freeze({ label: "Renters Insurance", type: "number", step: "25", suffix: "USD" }),
    equityAmount: Object.freeze({ label: "Equity", type: "number", step: "1000", suffix: "USD" }),
    debtSubType: Object.freeze({
      label: "Debt Type",
      type: "select",
      options: Object.freeze([
        Object.freeze({ value: "secondMortgage", label: "Second Mortgage" }),
        Object.freeze({ value: "heloc", label: "HELOC" }),
        Object.freeze({ value: "homeEquityLoan", label: "Home Equity Loan" })
      ])
    }),
    rateType: Object.freeze({
      label: "Rate Type",
      type: "select",
      options: Object.freeze([
        Object.freeze({ value: "", label: "Select" }),
        Object.freeze({ value: "fixed", label: "Fixed" }),
        Object.freeze({ value: "variable", label: "Variable" }),
        Object.freeze({ value: "unknown", label: "Unknown" })
      ])
    }),
    paymentType: Object.freeze({
      label: "Payment Type",
      type: "select",
      options: Object.freeze([
        Object.freeze({ value: "", label: "Select" }),
        Object.freeze({ value: "principalAndInterest", label: "Principal + Interest" }),
        Object.freeze({ value: "interestOnly", label: "Interest-Only" }),
        Object.freeze({ value: "minimumPayment", label: "Minimum Payment" }),
        Object.freeze({ value: "unknown", label: "Unknown" })
      ])
    }),
    creditLimit: Object.freeze({ label: "Credit Limit", type: "number", step: "1000", suffix: "USD", showForDebtSubType: "heloc" }),
    drawPeriodEndDate: Object.freeze({ label: "Draw Period End Date", type: "date", showForDebtSubType: "heloc" }),
    interestOnlyDuringDrawPeriod: Object.freeze({
      label: "Interest-Only During Draw Period",
      type: "select",
      showForDebtSubType: "heloc",
      options: Object.freeze([
        Object.freeze({ value: "", label: "Select" }),
        Object.freeze({ value: "yes", label: "Yes" }),
        Object.freeze({ value: "no", label: "No" }),
        Object.freeze({ value: "unknown", label: "Unknown" })
      ])
    }),
    repaymentPeriodMonths: Object.freeze({ label: "Repayment Period", type: "number", step: "1", suffix: "Months", showForDebtSubType: "heloc" }),
    lienPosition: Object.freeze({ label: "Lien Position", type: "number", step: "1" }),
    linkedPropertyLabel: Object.freeze({ label: "Linked Property", type: "text", placeholder: "Property label" }),
    mortgageBalance: Object.freeze({ label: "Mortgage Balance, If Any", type: "number", step: "1000", suffix: "USD" }),
    grossMonthlyRentReceived: Object.freeze({ label: "Gross Monthly Rent Received", type: "number", step: "50", suffix: "USD" }),
    monthlyCost: Object.freeze({ label: "Monthly Cost", type: "number", step: "25", suffix: "USD" }),
    expectedDurationMonths: Object.freeze({ label: "Expected Duration", type: "number", step: "1", suffix: "Months" }),
    reasonLabel: Object.freeze({ label: "Reason / Label", type: "text", placeholder: "Relocation, bridge housing, etc." }),
    notes: Object.freeze({ label: "Notes", type: "textarea" }),
    reviewStatus: Object.freeze({
      label: "Review Status",
      type: "select",
      options: Object.freeze([
        Object.freeze({ value: "", label: "Select" }),
        Object.freeze({ value: "review", label: "Review" }),
        Object.freeze({ value: "confirmed", label: "Confirmed" }),
        Object.freeze({ value: "excluded", label: "Excluded" })
      ])
    })
  });

  const BASE_FIELDS = Object.freeze(["label", "typeKey", "propertyRole", "continuesAfterDeath"]);

  const FIELD_GROUPS_BY_TYPE = Object.freeze({
    primaryResidenceMortgage: Object.freeze([
      "propertyValue",
      "currentBalance",
      "monthlyPayment",
      "interestRatePercent",
      "remainingTermMonths",
      "propertyTaxMonthly",
      "homeownersInsuranceMonthly",
      "hoaMonthly",
      "maintenanceMonthly",
      "utilitiesMonthly",
      "escrowStatus"
    ]),
    primaryResidenceRent: Object.freeze([
      "rentMonthly",
      "leaseTermMonths",
      "otherHousingCostMonthly",
      "utilitiesMonthly",
      "rentersInsuranceMonthly"
    ]),
    primaryResidenceOwnedFreeAndClear: Object.freeze([
      "propertyValue",
      "equityAmount",
      "propertyTaxMonthly",
      "homeownersInsuranceMonthly",
      "hoaMonthly",
      "maintenanceMonthly",
      "utilitiesMonthly"
    ]),
    secondMortgageHeloc: Object.freeze([
      "debtSubType",
      "currentBalance",
      "monthlyPayment",
      "interestRatePercent",
      "rateType",
      "paymentType",
      "remainingTermMonths",
      "creditLimit",
      "drawPeriodEndDate",
      "interestOnlyDuringDrawPeriod",
      "repaymentPeriodMonths",
      "lienPosition",
      "linkedPropertyLabel"
    ]),
    secondHomeVacationProperty: Object.freeze([
      "propertyValue",
      "mortgageBalance",
      "monthlyPayment",
      "propertyTaxMonthly",
      "homeownersInsuranceMonthly",
      "hoaMonthly",
      "maintenanceMonthly",
      "utilitiesMonthly"
    ]),
    rentalInvestmentProperty: Object.freeze([
      "propertyValue",
      "mortgageBalance",
      "monthlyPayment",
      "grossMonthlyRentReceived",
      "propertyTaxMonthly",
      "homeownersInsuranceMonthly",
      "hoaMonthly",
      "maintenanceMonthly",
      "utilitiesMonthly"
    ]),
    temporaryHousing: Object.freeze([
      "monthlyCost",
      "expectedDurationMonths",
      "reasonLabel"
    ]),
    housingOperatingCostOnly: Object.freeze([
      "propertyTaxMonthly",
      "homeownersInsuranceMonthly",
      "hoaMonthly",
      "maintenanceMonthly",
      "utilitiesMonthly",
      "otherHousingCostMonthly"
    ]),
    otherHousingObligation: Object.freeze([
      "monthlyCost",
      "notes",
      "reviewStatus"
    ])
  });

  function normalizeString(value) {
    return String(value == null ? "" : value).trim();
  }

  function escapeHtml(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function getTypeConfig(typeKey) {
    return HOUSING_TYPE_OPTIONS.find((option) => option.value === typeKey) || HOUSING_TYPE_OPTIONS[0];
  }

  function createHousingRecord(partialRecord) {
    const source = partialRecord && typeof partialRecord === "object" ? partialRecord : {};
    const typeKey = getTypeConfig(source.typeKey).value;
    const label = normalizeString(source.label) || getTypeConfig(typeKey).label;
    const housingRecordId = normalizeString(source.housingRecordId)
      || `housing-record-${Date.now().toString(36)}-${++generatedHousingRecordCounter}`;

    return {
      housingRecordId,
      typeKey,
      label,
      propertyRole: normalizeString(source.propertyRole) || "primaryResidence",
      continuesAfterDeath: normalizeString(source.continuesAfterDeath) || "review",
      ...source,
      housingRecordId,
      typeKey,
      label
    };
  }

  function renderOptions(options, selectedValue) {
    return options.map((option) => {
      const selected = option.value === selectedValue ? " selected" : "";
      return `<option value="${escapeHtml(option.value)}"${selected}>${escapeHtml(option.label)}</option>`;
    }).join("");
  }

  function shouldShowField(fieldConfig, record) {
    if (!fieldConfig || !fieldConfig.showForDebtSubType) {
      return true;
    }

    return normalizeString(record.debtSubType) === fieldConfig.showForDebtSubType;
  }

  function renderControl(fieldKey, fieldConfig, record) {
    const value = normalizeString(record[fieldKey]);
    const commonAttributes = `data-pmi-housing-record-input="${escapeHtml(fieldKey)}"`;

    if (fieldConfig.type === "housingType") {
      return `<select ${commonAttributes}>${renderOptions(HOUSING_TYPE_OPTIONS, record.typeKey)}</select>`;
    }

    if (fieldConfig.type === "propertyRole") {
      return `<select ${commonAttributes}>${renderOptions(PROPERTY_ROLE_OPTIONS, record.propertyRole)}</select>`;
    }

    if (fieldConfig.type === "continuesAfterDeath") {
      return `<select ${commonAttributes}>${renderOptions(CONTINUES_AFTER_DEATH_OPTIONS, record.continuesAfterDeath)}</select>`;
    }

    if (fieldConfig.type === "select") {
      return `<select ${commonAttributes}>${renderOptions(fieldConfig.options, value)}</select>`;
    }

    if (fieldConfig.type === "textarea") {
      return `<textarea ${commonAttributes} rows="2">${escapeHtml(value)}</textarea>`;
    }

    const inputType = fieldConfig.type === "date" ? "date" : fieldConfig.type === "number" ? "number" : "text";
    const step = fieldConfig.step ? ` step="${escapeHtml(fieldConfig.step)}"` : "";
    const min = inputType === "number" ? ' min="0"' : "";
    const placeholder = fieldConfig.placeholder ? ` placeholder="${escapeHtml(fieldConfig.placeholder)}"` : "";
    const control = `<input ${commonAttributes} type="${inputType}" value="${escapeHtml(value)}"${min}${step}${placeholder}>`;

    if (!fieldConfig.suffix) {
      return control;
    }

    return `
      <div class="profile-currency-field pmi-housing-record-input-shell">
        ${control}
        <span class="profile-currency-suffix">${escapeHtml(fieldConfig.suffix)}</span>
      </div>
    `;
  }

  function renderField(fieldKey, record, groupName) {
    const fieldConfig = FIELD_DEFINITIONS[fieldKey];
    if (!shouldShowField(fieldConfig, record)) {
      return "";
    }

    return `
      <label class="pmi-housing-record-field" data-housing-record-field-group="${escapeHtml(groupName)}">
        <span>${escapeHtml(fieldConfig.label)}</span>
        ${renderControl(fieldKey, fieldConfig, record)}
      </label>
    `;
  }

  function renderRecord(record, index) {
    const typeFields = FIELD_GROUPS_BY_TYPE[record.typeKey] || FIELD_GROUPS_BY_TYPE.primaryResidenceMortgage;
    const typeLabel = getTypeConfig(record.typeKey).label;

    return `
      <article class="pmi-housing-record-card" data-pmi-housing-record-entry data-housing-record-id="${escapeHtml(record.housingRecordId)}">
        <div class="pmi-housing-record-card-header">
          <div>
            <span class="pmi-housing-record-index">Housing ${index + 1}</span>
            <h3>${escapeHtml(record.label || typeLabel)}</h3>
          </div>
          <button class="pmi-housing-record-remove" type="button" data-pmi-housing-record-remove aria-label="Remove housing record">Remove</button>
        </div>
        <div class="pmi-housing-record-fields pmi-housing-record-fields--base">
          ${BASE_FIELDS.map((fieldKey) => renderField(fieldKey, record, "base")).join("")}
        </div>
        <div class="pmi-housing-record-fields pmi-housing-record-fields--type">
          ${typeFields.map((fieldKey) => renderField(fieldKey, record, record.typeKey)).join("")}
        </div>
      </article>
    `;
  }

  function renderShell(root) {
    if (!root || root.dataset.pmiHousingRecordsInitialized === "true") {
      return;
    }

    root.innerHTML = `
      <div class="pmi-housing-records-shell" data-pmi-housing-records-shell>
        <div class="pmi-housing-records-toolbar">
          <div>
            <span class="pmi-housing-records-kicker">Housing Records</span>
            <h3>Housing Records</h3>
          </div>
          <button class="pmi-housing-records-add-button" type="button" data-pmi-housing-record-add>Add Housing Record</button>
        </div>
        <div class="pmi-housing-records-list" data-pmi-housing-records-list></div>
      </div>
    `;
    root.dataset.pmiHousingRecordsInitialized = "true";
  }

  function initPmiHousingRecords(options) {
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
      records: [],
      addButton: root.querySelector("[data-pmi-housing-record-add]"),
      list: root.querySelector("[data-pmi-housing-records-list]")
    };

    function syncRecordFromRow(row) {
      if (!row) {
        return;
      }

      const recordId = row.getAttribute("data-housing-record-id");
      const record = controller.records.find((entry) => entry.housingRecordId === recordId);
      if (!record) {
        return;
      }

      row.querySelectorAll("[data-pmi-housing-record-input]").forEach((field) => {
        const fieldKey = field.getAttribute("data-pmi-housing-record-input");
        record[fieldKey] = field.value;
      });
      record.typeKey = getTypeConfig(record.typeKey).value;
      record.label = normalizeString(record.label) || getTypeConfig(record.typeKey).label;
    }

    function syncRecordsFromDom() {
      controller.list?.querySelectorAll("[data-pmi-housing-record-entry]").forEach(syncRecordFromRow);
    }

    function notifyChange() {
      root.dispatchEvent(new CustomEvent("pmiHousingRecordsChange", {
        bubbles: true,
        detail: { records: serializeHousingRecords() }
      }));
    }

    function renderRows() {
      if (!controller.list) {
        return;
      }

      controller.list.innerHTML = controller.records.length
        ? controller.records.map(renderRecord).join("")
        : '<p class="pmi-housing-records-empty">Add a housing record to begin.</p>';
    }

    function addHousingRecord(partialRecord) {
      syncRecordsFromDom();
      controller.records.push(createHousingRecord(partialRecord));
      renderRows();
      notifyChange();
    }

    function hydrateHousingRecords(records) {
      controller.records = Array.isArray(records)
        ? records.map(createHousingRecord)
        : [];
      renderRows();
    }

    function serializeHousingRecords() {
      syncRecordsFromDom();
      return controller.records.map((record) => ({ ...record }));
    }

    controller.hydrateHousingRecords = hydrateHousingRecords;
    controller.serializeHousingRecords = serializeHousingRecords;
    controller.addHousingRecord = addHousingRecord;

    controller.addButton?.addEventListener("click", () => addHousingRecord({}));
    controller.list?.addEventListener("click", (event) => {
      const removeButton = event.target.closest("[data-pmi-housing-record-remove]");
      if (!removeButton) {
        return;
      }

      const row = removeButton.closest("[data-pmi-housing-record-entry]");
      const recordId = row?.getAttribute("data-housing-record-id");
      controller.records = controller.records.filter((record) => record.housingRecordId !== recordId);
      renderRows();
      notifyChange();
    });

    controller.list?.addEventListener("input", (event) => {
      const row = event.target.closest("[data-pmi-housing-record-entry]");
      if (!row) {
        return;
      }

      const fieldKey = event.target.getAttribute("data-pmi-housing-record-input");
      const recordId = row.getAttribute("data-housing-record-id");
      const record = controller.records.find((entry) => entry.housingRecordId === recordId);
      const previousTypeKey = record?.typeKey;
      syncRecordFromRow(row);
      if (fieldKey === "typeKey" || fieldKey === "debtSubType") {
        if (fieldKey === "typeKey" && record) {
          const previousTypeLabel = getTypeConfig(previousTypeKey).label;
          const currentLabel = normalizeString(record.label);
          if (!currentLabel || currentLabel === previousTypeLabel) {
            record.label = getTypeConfig(record.typeKey).label;
          }
        }
        renderRows();
      }
      notifyChange();
    });

    hydrateHousingRecords([]);
    activeController = controller;
    return controller;
  }

  function hydrateHousingRecords(records) {
    if (activeController && typeof activeController.hydrateHousingRecords === "function") {
      activeController.hydrateHousingRecords(records);
    }
  }

  function serializeHousingRecords() {
    return activeController && typeof activeController.serializeHousingRecords === "function"
      ? activeController.serializeHousingRecords()
      : [];
  }

  lensAnalysis.pmiHousingRecords = {
    initPmiHousingRecords,
    hydrateHousingRecords,
    serializeHousingRecords,
    createHousingRecord,
    housingTypeOptions: HOUSING_TYPE_OPTIONS,
    fieldGroupsByType: FIELD_GROUPS_BY_TYPE
  };
})(window);
