(function (global) {
  const LensApp = global.LensApp || (global.LensApp = {});
  const accountSettings = LensApp.accountSettings || (LensApp.accountSettings = {});

  // Owner: admin read-only household expense account policy display.
  // Non-goals: no editing, no saving, no policy calculations, no runtime graph wiring.

  const TEMPORARY_LOCAL_HOUSEHOLD_EXPENSE_POLICY_ACCOUNT_ID = "temporary-local-household-expense-policy-account-v1";
  const POLICY_DISPLAY_HOST_SELECTOR = "[data-household-expense-account-policy-status]";

  const PROTECTED_CATEGORY_SUMMARY = Object.freeze([
    { label: "Housing", status: "Locked / protected" },
    { label: "Debt obligations", status: "Locked / protected" },
    { label: "Tax and legal", status: "Locked / protected" },
    { label: "Healthcare", status: "Locked / protected" },
    { label: "Childcare / dependent care", status: "Locked / protected" },
    { label: "Insurance / protection", status: "Locked / protected" },
    { label: "Giving / remittances", status: "Review-only / values-sensitive" }
  ]);

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

  function countNamespaceRows(accountPolicy, namespace) {
    return Array.isArray(accountPolicy?.[namespace]) ? accountPolicy[namespace].length : 0;
  }

  function getPolicyStatus(storageResult, resolvedPolicy) {
    if (storageResult?.status === "loaded") {
      return {
        code: "accountOverride",
        label: "Saved account override",
        message: "A saved browser-local account policy override is being resolved against MODEL90 seed defaults."
      };
    }

    if (storageResult?.status === "fallback" && storageResult?.metadata?.fallbackReason === "missing-account-policy") {
      return {
        code: "defaultSeedPolicy",
        label: "Default seed policy only",
        message: "No saved browser-local account override was found. MODEL90 seed policies are active."
      };
    }

    if (!resolvedPolicy) {
      return {
        code: "fallbackPolicy",
        label: "Fallback policy",
        message: "Policy resolution could not complete. Runtime helpers will rely on their safe seed fallbacks."
      };
    }

    return {
      code: "fallbackPolicy",
      label: "Fallback policy",
      message: "Saved policy could not be used safely. MODEL90 seed policies are active with warning trace."
    };
  }

  function buildHouseholdExpensePolicyDisplayModel(input) {
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
    const accountPolicy = storageResult?.status === "loaded" && isPlainObject(storageResult.accountPolicy)
      ? storageResult.accountPolicy
      : null;
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

    const activePolicy = isPlainObject(resolvedPolicy) ? resolvedPolicy : {};
    const loadedPolicy = isPlainObject(storageResult?.accountPolicy) ? storageResult.accountPolicy : {};
    const status = getPolicyStatus(storageResult, resolvedPolicy);

    return {
      accountId,
      accountIdSource: "temporaryLocalAdminFallback",
      status,
      counts: {
        lifestyleRangePolicyRows: Array.isArray(activePolicy.resolvedLifestyleRangePolicies)
          ? activePolicy.resolvedLifestyleRangePolicies.length
          : policyInputs.defaultLifestyleRangePolicies.length,
        compressionPolicyRows: Array.isArray(activePolicy.resolvedCompressionPolicyRules)
          ? activePolicy.resolvedCompressionPolicyRules.length
          : policyInputs.defaultCompressionPolicyRules.length,
        compressionThresholdRows: Array.isArray(activePolicy.resolvedCompressionThresholdRules)
          ? activePolicy.resolvedCompressionThresholdRules.length
          : policyInputs.defaultCompressionThresholdRules.length,
        lifestyleRangeOverrides: status.code === "accountOverride" ? countNamespaceRows(loadedPolicy, "lifestyleRangeOverrides") : 0,
        compressionPolicyOverrides: status.code === "accountOverride" ? countNamespaceRows(loadedPolicy, "compressionPolicyOverrides") : 0,
        compressionThresholdOverrides: status.code === "accountOverride" ? countNamespaceRows(loadedPolicy, "compressionThresholdOverrides") : 0,
        warnings: warnings.length,
        dataGaps: dataGaps.length
      },
      protectedCategories: PROTECTED_CATEGORY_SUMMARY.map(function (row) {
        return Object.assign({}, row);
      }),
      warnings,
      dataGaps,
      trace: {
        source: "admin-household-expense-account-policy-read-only-display",
        accountId,
        accountIdSource: "temporaryLocalAdminFallback",
        storageStatus: storageResult?.status || "unavailable",
        storageFallbackReason: storageResult?.metadata?.fallbackReason || null,
        policySource: status.code,
        resolverAvailable: typeof resolver === "function",
        readOnly: true,
        editableControlsRendered: false,
        saveControlsRendered: false
      }
    };
  }

  function renderCountCard(label, value) {
    return `
      <article class="admin-summary-card">
        <span class="section-label">${escapeHtml(label)}</span>
        <strong>${escapeHtml(value)}</strong>
      </article>
    `;
  }

  function renderHouseholdExpensePolicyDisplay(model) {
    const safeModel = isPlainObject(model) ? model : buildHouseholdExpensePolicyDisplayModel();
    const counts = isPlainObject(safeModel.counts) ? safeModel.counts : {};
    const status = isPlainObject(safeModel.status) ? safeModel.status : {};
    const protectedRows = Array.isArray(safeModel.protectedCategories) ? safeModel.protectedCategories : [];

    return `
      <div class="admin-household-expense-policy-readonly" data-household-expense-account-policy-readonly data-policy-status="${escapeHtml(status.code || "unknown")}">
        <div class="admin-tax-bracket-group">
          <div class="admin-tax-bracket-toolbar">
            <div>
              <span class="section-label">Policy Source</span>
              <h3>${escapeHtml(status.label || "Policy unavailable")}</h3>
              <p class="panel-copy">${escapeHtml(status.message || "Household expense policy status is unavailable.")}</p>
              <p class="panel-copy">Account scope: ${escapeHtml(safeModel.accountId || "Not available")} (${escapeHtml(safeModel.accountIdSource || "unknown")})</p>
            </div>
          </div>
          <div class="admin-summary-grid" data-household-expense-policy-counts>
            ${renderCountCard("Lifestyle range rows", counts.lifestyleRangePolicyRows || 0)}
            ${renderCountCard("Compression policy rows", counts.compressionPolicyRows || 0)}
            ${renderCountCard("Compression threshold rows", counts.compressionThresholdRows || 0)}
            ${renderCountCard("Lifestyle overrides", counts.lifestyleRangeOverrides || 0)}
            ${renderCountCard("Compression overrides", counts.compressionPolicyOverrides || 0)}
            ${renderCountCard("Threshold overrides", counts.compressionThresholdOverrides || 0)}
            ${renderCountCard("Warnings", counts.warnings || 0)}
            ${renderCountCard("Data gaps", counts.dataGaps || 0)}
          </div>
        </div>
        <div class="admin-tax-bracket-group" data-household-expense-policy-protected-summary>
          <div class="admin-tax-bracket-toolbar">
            <span class="section-label">Protected Categories</span>
          </div>
          <ul class="admin-tax-bracket-list">
            ${protectedRows.map(function (row) {
              return `<li><strong>${escapeHtml(row.label)}</strong><span>${escapeHtml(row.status)}</span></li>`;
            }).join("")}
          </ul>
        </div>
      </div>
    `;
  }

  function initializeHouseholdExpenseAccountPolicyAdminDisplay() {
    const host = global.document?.querySelector?.(POLICY_DISPLAY_HOST_SELECTOR);
    if (!host) {
      return null;
    }

    const model = buildHouseholdExpensePolicyDisplayModel();
    host.innerHTML = renderHouseholdExpensePolicyDisplay(model);
    return model;
  }

  accountSettings.householdExpenseAccountPolicyAdminDisplay = Object.freeze({
    TEMPORARY_LOCAL_HOUSEHOLD_EXPENSE_POLICY_ACCOUNT_ID,
    PROTECTED_CATEGORY_SUMMARY,
    buildHouseholdExpensePolicyDisplayModel,
    renderHouseholdExpensePolicyDisplay,
    initializeHouseholdExpenseAccountPolicyAdminDisplay
  });

  global.document?.addEventListener?.("DOMContentLoaded", initializeHouseholdExpenseAccountPolicyAdminDisplay);
})(typeof globalThis !== "undefined" ? globalThis : this);
