(function (global) {
  const LensApp = global.LensApp || (global.LensApp = {});
  const accountSettings = LensApp.accountSettings || (LensApp.accountSettings = {});

  // Owner: admin household expense policy editor shell.
  // Non-goals: no persistence writes, no editable controls, no runtime graph wiring.

  const TEMPORARY_LOCAL_HOUSEHOLD_EXPENSE_POLICY_ACCOUNT_ID = "temporary-local-household-expense-policy-account-v1";
  const POLICY_EDITOR_HOST_SELECTOR = "[data-household-expense-account-policy-editor]";

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

  function formatRatio(value) {
    const numericValue = Number(value);
    return Number.isFinite(numericValue) ? numericValue.toFixed(2) : "n/a";
  }

  function normalizeKey(value) {
    return String(value == null ? "" : value).trim();
  }

  function getWarningList(source) {
    return Array.isArray(source?.warnings) ? source.warnings.filter(isPlainObject) : [];
  }

  function getDataGapList(source) {
    return Array.isArray(source?.dataGaps) ? source.dataGaps.filter(isPlainObject) : [];
  }

  function getPolicyInputs(currentLensAnalysis) {
    const lensAnalysis = isPlainObject(currentLensAnalysis) ? currentLensAnalysis : {};
    const lifestylePolicy = lensAnalysis.householdExpenseLifestyleRangePolicy;
    const compressionPolicy = lensAnalysis.householdExpenseCompressionPolicy;
    const compressionThresholds = lensAnalysis.expenseCompressionThresholds;

    return {
      defaultLifestyleRangePolicies: lifestylePolicy && typeof lifestylePolicy.listLifestyleRangePolicies === "function"
        ? lifestylePolicy.listLifestyleRangePolicies()
        : [],
      defaultCompressionPolicyRules: compressionPolicy && typeof compressionPolicy.getHouseholdExpenseCompressionPolicyRules === "function"
        ? compressionPolicy.getHouseholdExpenseCompressionPolicyRules()
        : [],
      defaultCompressionThresholdRules: compressionThresholds && typeof compressionThresholds.getExpenseCompressionThresholdRules === "function"
        ? compressionThresholds.getExpenseCompressionThresholdRules()
        : []
    };
  }

  function getPolicyStatus(storageResult, resolvedPolicy) {
    if (storageResult?.status === "loaded") {
      return {
        code: "accountOverride",
        label: "Saved account override"
      };
    }

    if (storageResult?.status === "fallback" && storageResult?.metadata?.fallbackReason === "missing-account-policy") {
      return {
        code: "defaultSeedPolicy",
        label: "Default seed policy"
      };
    }

    if (!resolvedPolicy) {
      return {
        code: "fallbackPolicy",
        label: "Fallback policy"
      };
    }

    return {
      code: "fallbackPolicy",
      label: "Fallback policy"
    };
  }

  function getLoadedAccountPolicy(storageResult) {
    return storageResult?.status === "loaded" && isPlainObject(storageResult.accountPolicy)
      ? storageResult.accountPolicy
      : null;
  }

  function getLifestyleOverrideRows(accountPolicy) {
    return Array.isArray(accountPolicy?.lifestyleRangeOverrides)
      ? accountPolicy.lifestyleRangeOverrides.filter(isPlainObject).map(clonePlainValue)
      : [];
  }

  function rowMatchesPolicy(override, policy) {
    const rangePolicyId = normalizeKey(override.rangePolicyId || override.overrideKey);
    const expenseTypeKey = normalizeKey(override.expenseTypeKey || override.typeKey || override.overrideKey);
    const categoryKey = normalizeKey(override.categoryKey);

    return Boolean(
      (rangePolicyId && rangePolicyId === normalizeKey(policy.rangePolicyId))
      || (expenseTypeKey && expenseTypeKey === normalizeKey(policy.expenseTypeKey))
      || (categoryKey && categoryKey === normalizeKey(policy.categoryKey))
    );
  }

  function findResolvedPolicy(resolvedRows, defaultPolicy) {
    return resolvedRows.find(function (candidate) {
      return normalizeKey(candidate.expenseTypeKey) === normalizeKey(defaultPolicy.expenseTypeKey);
    }) || defaultPolicy;
  }

  function getSparseOverridePreview(override) {
    if (!isPlainObject(override)) {
      return null;
    }

    const preview = {};
    [
      "rangePolicyId",
      "expenseTypeKey",
      "conservativeFloorRatio",
      "elevatedCeilingRatio"
    ].forEach(function (field) {
      if (Object.prototype.hasOwnProperty.call(override, field)) {
        preview[field] = clonePlainValue(override[field]);
      }
    });
    return preview;
  }

  function buildLifestyleRangeEditorRows(defaultRows, resolvedRows, overrideRows) {
    const resolvedList = Array.isArray(resolvedRows) ? resolvedRows : [];
    const overrides = Array.isArray(overrideRows) ? overrideRows : [];

    return (Array.isArray(defaultRows) ? defaultRows : [])
      .filter(function (row) {
        return row && row.sliderEligible === true;
      })
      .map(function (defaultPolicy) {
        const resolvedPolicy = findResolvedPolicy(resolvedList, defaultPolicy);
        const override = overrides.find(function (candidate) {
          return rowMatchesPolicy(candidate, defaultPolicy);
        }) || null;

        return {
          rangePolicyId: defaultPolicy.rangePolicyId || null,
          displayName: defaultPolicy.displayName || defaultPolicy.expenseTypeKey || "Unnamed expense",
          expenseTypeKey: defaultPolicy.expenseTypeKey || null,
          categoryKey: defaultPolicy.categoryKey || null,
          rangeBehavior: defaultPolicy.rangeBehavior || null,
          defaultConservativeFloorRatio: defaultPolicy.conservativeFloorRatio,
          defaultElevatedCeilingRatio: defaultPolicy.elevatedCeilingRatio,
          resolvedConservativeFloorRatio: resolvedPolicy.conservativeFloorRatio,
          resolvedElevatedCeilingRatio: resolvedPolicy.elevatedCeilingRatio,
          overrideStatus: override ? "accountOverride" : "defaultSeedPolicy",
          sparseOverridePreview: getSparseOverridePreview(override)
        };
      });
  }

  function buildHouseholdExpensePolicyEditorModel(input) {
    const options = isPlainObject(input) ? input : {};
    const currentLensAnalysis = isPlainObject(options.currentLensAnalysis)
      ? options.currentLensAnalysis
      : (global.LensApp?.lensAnalysis || {});
    const storageApi = options.storageApi || global.LensApp?.accountSettings?.householdExpenseAccountPolicyStorage;
    const resolver = options.resolver || currentLensAnalysis.householdExpenseAccountPolicyResolver?.resolveHouseholdExpenseAccountPolicy;
    const storage = options.storage || global.localStorage;
    const accountId = options.accountId || TEMPORARY_LOCAL_HOUSEHOLD_EXPENSE_POLICY_ACCOUNT_ID;
    const warnings = [];
    const dataGaps = [];

    let storageResult = null;
    if (storageApi && typeof storageApi.loadHouseholdExpenseAccountPolicy === "function") {
      storageResult = storageApi.loadHouseholdExpenseAccountPolicy({
        accountId,
        storage
      });
      warnings.push.apply(warnings, getWarningList(storageResult));
      dataGaps.push.apply(dataGaps, getDataGapList(storageResult));
    } else {
      warnings.push({
        code: "household-expense-policy-storage-unavailable",
        message: "Household expense account policy storage adapter is unavailable."
      });
    }

    const policyInputs = getPolicyInputs(currentLensAnalysis);
    const accountPolicy = getLoadedAccountPolicy(storageResult);
    let resolvedPolicy = null;
    if (typeof resolver === "function") {
      resolvedPolicy = resolver(Object.assign({}, policyInputs, {
        accountPolicy
      }));
      warnings.push.apply(warnings, getWarningList(resolvedPolicy));
      dataGaps.push.apply(dataGaps, getDataGapList(resolvedPolicy));
    } else {
      dataGaps.push({
        code: "household-expense-policy-resolver-unavailable",
        message: "Household expense account policy resolver is unavailable."
      });
    }

    const resolvedRows = Array.isArray(resolvedPolicy?.resolvedLifestyleRangePolicies)
      ? resolvedPolicy.resolvedLifestyleRangePolicies
      : policyInputs.defaultLifestyleRangePolicies;
    const overrideRows = getLifestyleOverrideRows(accountPolicy);
    const rows = buildLifestyleRangeEditorRows(
      policyInputs.defaultLifestyleRangePolicies,
      resolvedRows,
      overrideRows
    );
    const status = getPolicyStatus(storageResult, resolvedPolicy);

    return clonePlainValue({
      accountId,
      accountIdSource: "temporaryLocalAdminFallback",
      status,
      rows,
      counts: {
        previewRows: rows.length,
        lifestyleRangeOverrides: status.code === "accountOverride" ? overrideRows.length : 0,
        rowsWithOverrides: rows.filter(function (row) {
          return row.overrideStatus === "accountOverride";
        }).length,
        warnings: warnings.length,
        dataGaps: dataGaps.length
      },
      warnings,
      dataGaps,
      trace: {
        source: "admin-household-expense-account-policy-editor-shell",
        accountId,
        accountIdSource: "temporaryLocalAdminFallback",
        storageStatus: storageResult?.status || "unavailable",
        storageFallbackReason: storageResult?.metadata?.fallbackReason || null,
        policySource: status.code,
        resolverAvailable: typeof resolver === "function",
        sparseOverridePreviewOnly: true,
        editableControlsRendered: false,
        saveControlsRendered: false,
        storageWrites: false
      }
    });
  }

  function renderOverrideStatus(status) {
    return status === "accountOverride" ? "Account override" : "Default";
  }

  function renderEditorRow(row) {
    return `
      <tr class="admin-tax-bracket-row" data-household-expense-policy-editor-row data-expense-type-key="${escapeHtml(row.expenseTypeKey || "")}" data-override-status="${escapeHtml(row.overrideStatus || "defaultSeedPolicy")}">
        <td>${escapeHtml(row.displayName)}</td>
        <td><code>${escapeHtml(row.expenseTypeKey || "")}</code></td>
        <td>${escapeHtml(row.rangeBehavior || "")}</td>
        <td>${escapeHtml(formatRatio(row.defaultConservativeFloorRatio))}</td>
        <td>${escapeHtml(formatRatio(row.defaultElevatedCeilingRatio))}</td>
        <td>${escapeHtml(formatRatio(row.resolvedConservativeFloorRatio))}</td>
        <td>${escapeHtml(formatRatio(row.resolvedElevatedCeilingRatio))}</td>
        <td>${escapeHtml(renderOverrideStatus(row.overrideStatus))}</td>
      </tr>
    `;
  }

  function renderHouseholdExpensePolicyEditor(model) {
    const safeModel = isPlainObject(model) ? model : buildHouseholdExpensePolicyEditorModel();
    const rows = Array.isArray(safeModel.rows) ? safeModel.rows : [];
    const counts = isPlainObject(safeModel.counts) ? safeModel.counts : {};
    const status = isPlainObject(safeModel.status) ? safeModel.status : {};

    return `
      <div class="admin-household-expense-policy-editor-shell" data-household-expense-account-policy-editor-shell data-policy-status="${escapeHtml(status.code || "unknown")}">
        <section class="admin-tax-bracket-group">
          <div class="admin-tax-bracket-toolbar">
            <div>
              <span class="section-label">Lifestyle Range Overrides</span>
              <h3>Editable Preview</h3>
              <p class="panel-copy">Read-only preview of future account-level lifestyle range controls. Only seed slider-eligible rows are shown here.</p>
              <p class="panel-copy">Policy source: ${escapeHtml(status.label || "Policy unavailable")} · Rows: ${escapeHtml(counts.previewRows || 0)} · Overrides: ${escapeHtml(counts.rowsWithOverrides || 0)} · Warnings: ${escapeHtml(counts.warnings || 0)}</p>
            </div>
          </div>
          <table class="admin-tax-bracket-table" data-household-expense-lifestyle-range-editor-table>
            <thead>
              <tr>
                <th>Expense</th>
                <th>Type Key</th>
                <th>Behavior</th>
                <th>Default Floor</th>
                <th>Default Ceiling</th>
                <th>Resolved Floor</th>
                <th>Resolved Ceiling</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              ${rows.length ? rows.map(renderEditorRow).join("") : `
                <tr class="admin-tax-bracket-row">
                  <td colspan="8">No slider-eligible lifestyle range policy rows are available.</td>
                </tr>
              `}
            </tbody>
          </table>
        </section>
      </div>
    `;
  }

  function initializeHouseholdExpenseAccountPolicyAdminEditor() {
    const host = global.document?.querySelector?.(POLICY_EDITOR_HOST_SELECTOR);
    if (!host) {
      return null;
    }

    const model = buildHouseholdExpensePolicyEditorModel();
    host.innerHTML = renderHouseholdExpensePolicyEditor(model);
    return model;
  }

  accountSettings.householdExpenseAccountPolicyAdminEditor = Object.freeze({
    TEMPORARY_LOCAL_HOUSEHOLD_EXPENSE_POLICY_ACCOUNT_ID,
    buildLifestyleRangeEditorRows,
    buildHouseholdExpensePolicyEditorModel,
    renderHouseholdExpensePolicyEditor,
    initializeHouseholdExpenseAccountPolicyAdminEditor
  });

  global.document?.addEventListener?.("DOMContentLoaded", initializeHouseholdExpenseAccountPolicyAdminEditor);
})(typeof globalThis !== "undefined" ? globalThis : this);
