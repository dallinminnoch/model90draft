(function (global) {
  const LensApp = global.LensApp || (global.LensApp = {});
  const accountSettings = LensApp.accountSettings || (LensApp.accountSettings = {});

  // Owner: admin editor for browser-local account expense inflation defaults.
  // Non-goals: no Analysis Setup seeding, no calculation consumption, no graph/runtime wiring.

  const TEMPORARY_LOCAL_EXPENSE_INFLATION_DEFAULTS_ACCOUNT_ID = "temporary-local-household-expense-policy-account-v1";
  const EDITOR_HOST_SELECTOR = "[data-expense-inflation-account-defaults-editor]";
  const MIN_RATE_PERCENT = 0;
  const MAX_RATE_PERCENT = 10;
  const FIELD_DEFINITIONS = Object.freeze([
    Object.freeze({
      fieldName: "generalInflationRatePercent",
      label: "General inflation",
      helperText: "Default annual increase for ordinary expense items."
    }),
    Object.freeze({
      fieldName: "healthcareInflationRatePercent",
      label: "Healthcare inflation",
      helperText: "Default annual increase for healthcare expense items."
    }),
    Object.freeze({
      fieldName: "longTermCareInflationRatePercent",
      label: "Long-term care inflation",
      helperText: "Default annual increase for long-term care expense items."
    }),
    Object.freeze({
      fieldName: "educationInflationRatePercent",
      label: "Education inflation",
      helperText: "Default annual increase for education expense items."
    }),
    Object.freeze({
      fieldName: "housingOperatingInflationRatePercent",
      label: "Housing operating inflation",
      helperText: "Default annual increase for non-debt housing operating costs."
    }),
    Object.freeze({
      fieldName: "childcareDependentCareInflationRatePercent",
      label: "Childcare / dependent-care inflation",
      helperText: "Default annual increase for childcare and dependent-care expenses."
    }),
    Object.freeze({
      fieldName: "foodInflationRatePercent",
      label: "Food inflation",
      helperText: "Default annual increase for household food expenses."
    }),
    Object.freeze({
      fieldName: "transportationOperatingInflationRatePercent",
      label: "Transportation operating inflation",
      helperText: "Default annual increase for transportation operating expenses."
    }),
    Object.freeze({
      fieldName: "finalExpenseInflationRatePercent",
      label: "Final expense inflation",
      helperText: "Default annual increase for final expense items."
    })
  ]);

  function isPlainObject(value) {
    return Boolean(value && typeof value === "object" && !Array.isArray(value));
  }

  function clonePlainValue(value) {
    if (Array.isArray(value)) {
      return value.map(clonePlainValue);
    }

    if (isPlainObject(value)) {
      const clone = {};
      Object.keys(value).sort().forEach(function (key) {
        const nextValue = clonePlainValue(value[key]);
        if (nextValue !== undefined) {
          clone[key] = nextValue;
        }
      });
      return clone;
    }

    if (typeof value === "number") {
      return Number.isFinite(value) ? value : null;
    }

    if (value === undefined) {
      return undefined;
    }

    return value;
  }

  function escapeHtml(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function formatRateInputValue(value) {
    const numericValue = Number(value);
    return Number.isFinite(numericValue) ? String(Number(numericValue.toFixed(2))) : "";
  }

  function getStorageApi() {
    return global.LensApp?.accountSettings?.expenseInflationAccountDefaultsStorage || null;
  }

  function getResolverApi() {
    return global.LensApp?.accountSettings?.expenseInflationAccountDefaultsResolver || null;
  }

  function getSystemDefaults(storageApi, resolverApi) {
    if (storageApi && typeof storageApi.getExpenseInflationSystemDefaults === "function") {
      return storageApi.getExpenseInflationSystemDefaults();
    }

    if (resolverApi && typeof resolverApi.getExpenseInflationSystemDefaults === "function") {
      return resolverApi.getExpenseInflationSystemDefaults();
    }

    return {
      version: 1,
      generalInflationRatePercent: 3,
      healthcareInflationRatePercent: 5,
      longTermCareInflationRatePercent: 5,
      educationInflationRatePercent: 5,
      housingOperatingInflationRatePercent: 3.5,
      childcareDependentCareInflationRatePercent: 4,
      foodInflationRatePercent: 3.25,
      transportationOperatingInflationRatePercent: 3.5,
      finalExpenseInflationRatePercent: 3.75
    };
  }

  function getStoredDefaults(storageResult) {
    const defaults = storageResult?.accountDefaults?.expenseInflationDefaults;
    return isPlainObject(defaults) ? clonePlainValue(defaults) : null;
  }

  function getStatusModel(storageResult) {
    const status = storageResult?.status || "unavailable";
    const fallbackReason = storageResult?.metadata?.fallbackReason || null;
    if (status === "loaded") {
      return {
        code: "accountDefault",
        label: "Account defaults saved",
        message: "These rates are saved as account-level defaults."
      };
    }

    if (fallbackReason === "missing-expense-inflation-account-defaults") {
      return {
        code: "systemDefault",
        label: "System defaults active",
        message: "No account-level expense inflation defaults are saved for this account."
      };
    }

    if (status === "fallback") {
      return {
        code: "fallback",
        label: "System defaults active",
        message: "Account defaults were unavailable or invalid, so system defaults are shown."
      };
    }

    return {
      code: "unavailable",
      label: "Defaults unavailable",
      message: "Expense inflation defaults could not be loaded."
    };
  }

  function buildExpenseInflationAccountDefaultsEditorModel(input) {
    const options = isPlainObject(input) ? input : {};
    const storageApi = options.storageApi || getStorageApi();
    const resolverApi = options.resolverApi || getResolverApi();
    const storage = options.storage || global.localStorage;
    const accountId = options.accountId || TEMPORARY_LOCAL_EXPENSE_INFLATION_DEFAULTS_ACCOUNT_ID;
    const warnings = [];
    const dataGaps = [];
    let storageResult = null;

    if (storageApi && typeof storageApi.loadExpenseInflationAccountDefaults === "function") {
      storageResult = storageApi.loadExpenseInflationAccountDefaults({
        accountId,
        storage
      });
      if (Array.isArray(storageResult?.warnings)) {
        warnings.push.apply(warnings, storageResult.warnings);
      }
      if (Array.isArray(storageResult?.dataGaps)) {
        dataGaps.push.apply(dataGaps, storageResult.dataGaps);
      }
    } else {
      warnings.push({
        code: "expense-inflation-account-defaults-storage-unavailable",
        message: "Expense inflation account defaults storage is unavailable.",
        details: {}
      });
    }

    const systemDefaults = getSystemDefaults(storageApi, resolverApi);
    const storedDefaults = getStoredDefaults(storageResult);
    const resolvedDefaults = storedDefaults || systemDefaults;

    return clonePlainValue({
      accountId,
      rows: FIELD_DEFINITIONS.map(function (definition) {
        return {
          fieldName: definition.fieldName,
          label: definition.label,
          helperText: definition.helperText,
          value: resolvedDefaults[definition.fieldName],
          systemDefaultValue: systemDefaults[definition.fieldName]
        };
      }),
      status: getStatusModel(storageResult),
      storageStatus: storageResult?.status || "unavailable",
      warnings,
      dataGaps,
      metadata: {
        accountId,
        accountIdSource: "temporary-local-admin-pattern",
        storageAvailable: Boolean(storageApi),
        resolverAvailable: Boolean(resolverApi),
        graphMathChanged: false,
        analysisSetupSeeded: false,
        calculationConsumerActive: false
      }
    });
  }

  function renderExpenseInflationAccountDefaultsEditor(model) {
    const safeModel = isPlainObject(model) ? model : buildExpenseInflationAccountDefaultsEditorModel();
    const rows = Array.isArray(safeModel.rows) ? safeModel.rows : [];
    const status = isPlainObject(safeModel.status) ? safeModel.status : {};

    return `
      <div class="admin-panel-header" data-expense-inflation-defaults-header>
        <div class="section-label">Planning Configuration</div>
        <h2>Expense Inflation Defaults</h2>
        <p class="panel-copy">Set the account-level default annual rates for expense item inflation assumptions.</p>
      </div>
      <div class="admin-tax-bracket-group" data-expense-inflation-defaults-status>
        <div class="admin-tax-bracket-toolbar">
          <div>
            <span class="section-label">${escapeHtml(status.label || "Defaults unavailable")}</span>
            <p class="panel-copy">${escapeHtml(status.message || "")}</p>
            <p class="panel-copy">Account scope: ${escapeHtml(safeModel.accountId || "Not available")}</p>
          </div>
        </div>
      </div>
      <div class="admin-tax-bracket-group" data-expense-inflation-defaults-controls>
        <div class="admin-tax-bracket-toolbar">
          <span class="section-label">Default Rates</span>
          <strong>${rows.length}</strong>
        </div>
        <table class="admin-tax-bracket-table" data-expense-inflation-defaults-table>
          <thead>
            <tr>
              <th>Expense assumption</th>
              <th>Default %</th>
              <th>System default</th>
            </tr>
          </thead>
          <tbody>
            ${rows.map(function (row) {
              return `
                <tr class="admin-tax-bracket-row" data-expense-inflation-default-row="${escapeHtml(row.fieldName)}">
                  <td>
                    <strong>${escapeHtml(row.label)}</strong>
                    <p class="panel-copy">${escapeHtml(row.helperText)}</p>
                  </td>
                  <td>
                    <input
                      class="admin-tax-bracket-input"
                      type="text"
                      inputmode="decimal"
                      value="${escapeHtml(formatRateInputValue(row.value))}"
                      data-expense-inflation-default-field="${escapeHtml(row.fieldName)}"
                      aria-label="${escapeHtml(row.label)} default percent">
                  </td>
                  <td>${escapeHtml(formatRateInputValue(row.systemDefaultValue))}%</td>
                </tr>
              `;
            }).join("")}
          </tbody>
        </table>
        <div class="admin-tax-bracket-actions">
          <button class="admin-action-button" type="button" data-expense-inflation-defaults-save>Save Changes</button>
          <button class="admin-action-button" type="button" data-expense-inflation-defaults-reset>Reset Defaults</button>
        </div>
        <p class="panel-copy admin-tax-bracket-feedback" data-expense-inflation-defaults-feedback></p>
      </div>
    `;
  }

  function setEditorFeedback(host, message) {
    const feedback = host?.querySelector?.("[data-expense-inflation-defaults-feedback]");
    if (feedback) {
      feedback.textContent = message || "";
    }
  }

  function readExpenseInflationDefaultsDraft(host) {
    const fields = Array.from(host?.querySelectorAll?.("[data-expense-inflation-default-field]") || []);
    const defaults = {};
    const errors = [];

    FIELD_DEFINITIONS.forEach(function (definition) {
      const field = fields.find(function (candidate) {
        return candidate.getAttribute?.("data-expense-inflation-default-field") === definition.fieldName;
      });
      const rawValue = String(field?.value || "").trim();
      const numericValue = Number(rawValue);

      if (!rawValue) {
        errors.push(`${definition.label} is required.`);
        return;
      }

      if (!Number.isFinite(numericValue)) {
        errors.push(`${definition.label} must be a numeric percentage.`);
        return;
      }

      if (numericValue < MIN_RATE_PERCENT || numericValue > MAX_RATE_PERCENT) {
        errors.push(`${definition.label} must be between ${MIN_RATE_PERCENT}% and ${MAX_RATE_PERCENT}%.`);
        return;
      }

      defaults[definition.fieldName] = Number(numericValue.toFixed(2));
    });

    if (errors.length) {
      return {
        error: errors[0],
        defaults: null
      };
    }

    return {
      defaults
    };
  }

  function rerenderEditorHost(host, options) {
    const model = buildExpenseInflationAccountDefaultsEditorModel(options || {});
    host.innerHTML = renderExpenseInflationAccountDefaultsEditor(model);
    return model;
  }

  function saveExpenseInflationAccountDefaultsFromHost(host) {
    const storageApi = getStorageApi();
    if (!storageApi || typeof storageApi.saveExpenseInflationAccountDefaults !== "function") {
      setEditorFeedback(host, "Expense inflation account defaults storage is unavailable.");
      return {
        status: "notSaved",
        saved: false,
        warnings: [{ code: "expense-inflation-account-defaults-storage-unavailable" }]
      };
    }

    const draft = readExpenseInflationDefaultsDraft(host);
    if (draft.error) {
      setEditorFeedback(host, draft.error);
      return {
        status: "validationFailed",
        saved: false,
        error: draft.error
      };
    }

    const accountId = host?.getAttribute?.("data-expense-inflation-account-id")
      || TEMPORARY_LOCAL_EXPENSE_INFLATION_DEFAULTS_ACCOUNT_ID;
    const saveResult = storageApi.saveExpenseInflationAccountDefaults({
      accountId,
      defaults: draft.defaults,
      metadata: {
        source: "browserLocalV1",
        updatedAt: new Date().toISOString(),
        updatedBy: "expense-inflation-account-defaults-admin-editor"
      },
      storage: global.localStorage
    });

    rerenderEditorHost(host, {
      accountId,
      storage: global.localStorage
    });
    setEditorFeedback(
      host,
      saveResult?.saved
        ? "Saved expense inflation account defaults."
        : "Expense inflation account defaults were not saved."
    );
    return saveResult;
  }

  function resetExpenseInflationAccountDefaultsFromHost(host) {
    const storageApi = getStorageApi();
    if (!storageApi || typeof storageApi.removeExpenseInflationAccountDefaults !== "function") {
      setEditorFeedback(host, "Expense inflation account defaults storage is unavailable.");
      return {
        status: "notRemoved",
        removed: false,
        warnings: [{ code: "expense-inflation-account-defaults-storage-unavailable" }]
      };
    }

    const accountId = host?.getAttribute?.("data-expense-inflation-account-id")
      || TEMPORARY_LOCAL_EXPENSE_INFLATION_DEFAULTS_ACCOUNT_ID;
    const removeResult = storageApi.removeExpenseInflationAccountDefaults({
      accountId,
      storage: global.localStorage
    });

    rerenderEditorHost(host, {
      accountId,
      storage: global.localStorage
    });
    setEditorFeedback(
      host,
      removeResult?.removed
        ? "Reset expense inflation account defaults to system defaults."
        : "Expense inflation account defaults were not reset."
    );
    return removeResult;
  }

  function handleEditorClick(event) {
    const target = event?.target;
    const host = target?.closest?.(EDITOR_HOST_SELECTOR);
    if (!host) {
      return;
    }

    const saveButton = target.closest?.("[data-expense-inflation-defaults-save]");
    if (saveButton) {
      event.preventDefault();
      saveExpenseInflationAccountDefaultsFromHost(host);
      return;
    }

    const resetButton = target.closest?.("[data-expense-inflation-defaults-reset]");
    if (resetButton) {
      event.preventDefault();
      resetExpenseInflationAccountDefaultsFromHost(host);
    }
  }

  function initializeExpenseInflationAccountDefaultsAdminEditor() {
    const host = global.document?.querySelector?.(EDITOR_HOST_SELECTOR);
    if (!host) {
      return null;
    }

    const accountId = host.getAttribute?.("data-expense-inflation-account-id")
      || TEMPORARY_LOCAL_EXPENSE_INFLATION_DEFAULTS_ACCOUNT_ID;
    if (host.setAttribute) {
      host.setAttribute("data-expense-inflation-account-id", accountId);
    }

    const model = buildExpenseInflationAccountDefaultsEditorModel({ accountId });
    host.innerHTML = renderExpenseInflationAccountDefaultsEditor(model);
    if (host.dataset && host.dataset.expenseInflationDefaultsEditorBound !== "true") {
      host.addEventListener?.("click", handleEditorClick);
      host.dataset.expenseInflationDefaultsEditorBound = "true";
    }
    return model;
  }

  accountSettings.expenseInflationAccountDefaultsAdminEditor = Object.freeze({
    TEMPORARY_LOCAL_EXPENSE_INFLATION_DEFAULTS_ACCOUNT_ID,
    FIELD_DEFINITIONS,
    buildExpenseInflationAccountDefaultsEditorModel,
    renderExpenseInflationAccountDefaultsEditor,
    readExpenseInflationDefaultsDraft,
    saveExpenseInflationAccountDefaultsFromHost,
    resetExpenseInflationAccountDefaultsFromHost,
    initializeExpenseInflationAccountDefaultsAdminEditor
  });

  global.document?.addEventListener?.("DOMContentLoaded", initializeExpenseInflationAccountDefaultsAdminEditor);
})(typeof globalThis !== "undefined" ? globalThis : this);
