(function (window) {
  const root = window.LensApp = window.LensApp || {};
  const lensAnalysis = root.lensAnalysis = root.lensAnalysis || {};

  const UNAVAILABLE_COPY = "Not available";
  const EMPTY_MESSAGE = "Not available until income and survivor inputs are completed.";
  const DEFAULT_PROJECTION_HORIZON_YEARS = 40;
  const MIN_PROJECTION_HORIZON_YEARS = 5;
  const MAX_PROJECTION_HORIZON_YEARS = 100;
  const MIN_LIFESTYLE_SLIDER_VALUE = -100;
  const MAX_LIFESTYLE_SLIDER_VALUE = 100;
  const LIFESTYLE_COMPARISON_KIND = "lifestyleComparison";
  const LIFESTYLE_COMPARISON_PATH_ID = "lifestyle-post-death-resources";
  const PRE_DEATH_ASSETS_PATH_ID = "preDeathAssets";
  const POST_DEATH_RESOURCES_PATH_ID = "postDeathResources";
  const SELECTED_DEFICIT_AREA_ID = "postDeathDeficitArea--selected";
  const DEATH_CONVERSION_GRADIENT_ID = "income-impact-death-conversion-gradient";
  const GRAPH_HOVER_UNDERLAY_PRE_DEATH_GRADIENT_ID = "income-impact-graph-hover-underlay-pre-death-gradient";
  const GRAPH_HOVER_UNDERLAY_POST_DEATH_GRADIENT_ID = "income-impact-graph-hover-underlay-post-death-gradient";
  const INCOME_IMPACT_STORYLINE_BRIDGE_SOURCE =
    "income-impact-display-financial-storyline-bridge";
  const DEATH_CONVERSION_ARROW_POSITION_RATIOS = Object.freeze([0.36, 0.64]);
  const DEATH_CONVERSION_CIRCLE_POSITION_RATIO_FROM_TOP = 1;
  const GRAPH_HOVER_READOUT_WIDTH = 108;
  const GRAPH_HOVER_GRID_SPACING = 8;
  const LIFESTYLE_COMPARISON_LABEL = "Lifestyle-adjusted projection";
  const AUTO_COMPRESSED_BASELINE_SCENARIO_ID = "income-impact-auto-compressed-baseline";
  const AUTO_COMPRESSED_BASELINE_LABEL = "Auto-compressed survivor lifestyle";
  const INCOME_IMPACT_AUTO_COMPRESSED_BASELINE_SOURCE =
    "income-impact-display-auto-compressed-baseline-bridge";
  const INITIAL_APPLIED_SCENARIO_ID = "income-impact-current-scenario";
  const MAX_APPLIED_SCENARIOS = 2;
  const REEVALUATE_GRAPH_UPDATE_DELAY_MS = 1500;
  const TEMPORARY_LOCAL_HOUSEHOLD_EXPENSE_POLICY_ACCOUNT_ID = "temporary-local-household-expense-policy-account-v1";
  const LIFESTYLE_SLIDER_LABELS = Object.freeze({
    conservative: "Conservative",
    current: "Current",
    elevated: "Elevated"
  });
  const GRAPH_VIEW_BOX = Object.freeze({
    width: 1000,
    height: 430,
    plotLeft: 74,
    plotTop: 36,
    plotWidth: 884,
    plotHeight: 318
  });
  const GRAPH_STORYLINE_EVENT_DOT_LIMIT = 16;
  const GRAPH_STORYLINE_EVENT_READOUT_WIDTH = 176;
  const FINANCIAL_STORYLINE_MAJOR_CARD_LIMIT = 6;
  const GRAPH_DETAIL_VIEW_BOX = Object.freeze({
    width: 1000,
    height: 170,
    plotLeft: 74,
    plotTop: 34,
    plotWidth: 884,
    plotHeight: 86
  });
  const COMPRESSION_DETAIL_MILESTONE_MONTHS = Object.freeze([1, 2, 3, 6, 9, 12, 24]);
  const TREND_PATH_SIMPLIFICATION_TOLERANCE = 3.5;
  const TREND_PATH_STRAIGHT_TOLERANCE = 0.75;
  const STABLE_GRAPH_LAYOUT_FRAME_MODE = "stableRunoutAnchoredFrame";
  const MORTGAGE_TREATMENT_LABELS = Object.freeze({
    followAssumptions: "Follow Assumption Controls",
    payOffMortgage: "Pay off mortgage",
    continueMortgagePayments: "Continue mortgage payments"
  });
  let incomeImpactState = null;

  function isPlainObject(value) {
    return Boolean(value && typeof value === "object" && !Array.isArray(value));
  }

  function clonePlainValue(value) {
    if (value == null) {
      return value;
    }

    try {
      return JSON.parse(JSON.stringify(value));
    } catch (error) {
      return null;
    }
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

  function normalizeString(value) {
    return String(value == null ? "" : value).trim();
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

  function addWholeYears(date, years) {
    const targetYear = date.getFullYear() + years;
    const target = new Date(targetYear, date.getMonth(), 1);
    const lastDayOfTargetMonth = new Date(targetYear, date.getMonth() + 1, 0).getDate();
    target.setDate(Math.min(date.getDate(), lastDayOfTargetMonth));
    return target;
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

  function clampProjectionHorizonYears(value) {
    const number = toOptionalNumber(value);
    const rounded = number == null ? DEFAULT_PROJECTION_HORIZON_YEARS : Math.round(number);
    return Math.max(MIN_PROJECTION_HORIZON_YEARS, Math.min(MAX_PROJECTION_HORIZON_YEARS, rounded));
  }

  function clampLifestyleSliderValue(value) {
    const number = toOptionalNumber(value);
    const rounded = number == null ? 0 : Math.round(number);
    return Math.max(MIN_LIFESTYLE_SLIDER_VALUE, Math.min(MAX_LIFESTYLE_SLIDER_VALUE, rounded));
  }

  function getLifestyleSliderLabel(value) {
    const sliderValue = clampLifestyleSliderValue(value);
    if (sliderValue < 0) {
      return LIFESTYLE_SLIDER_LABELS.conservative;
    }
    if (sliderValue > 0) {
      return LIFESTYLE_SLIDER_LABELS.elevated;
    }
    return LIFESTYLE_SLIDER_LABELS.current;
  }

  function normalizeMortgageTreatmentOverride(value) {
    const normalized = String(value || "").trim();
    return Object.prototype.hasOwnProperty.call(MORTGAGE_TREATMENT_LABELS, normalized)
      ? normalized
      : "followAssumptions";
  }

  function getMortgageTreatmentLabel(value) {
    const normalized = normalizeMortgageTreatmentOverride(value);
    return MORTGAGE_TREATMENT_LABELS[normalized];
  }

  function createRuntimeIssue(code, message, details) {
    return {
      code,
      message,
      details: isPlainObject(details) ? details : {}
    };
  }

  function getWarningList(source) {
    return Array.isArray(source?.warnings) ? source.warnings.filter(isPlainObject) : [];
  }

  function getDataGapList(source) {
    return Array.isArray(source?.dataGaps) ? source.dataGaps.filter(isPlainObject) : [];
  }

  function getDefaultHouseholdExpensePolicyInputs(currentLensAnalysis) {
    const api = isPlainObject(currentLensAnalysis) ? currentLensAnalysis : {};
    const lifestylePolicy = api.householdExpenseLifestyleRangePolicy;
    const compressionPolicy = api.householdExpenseCompressionPolicy;
    const compressionThresholds = api.expenseCompressionThresholds;

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

  function getAccountPolicySource(storageResult, resolutionResult) {
    if (storageResult?.status === "loaded") {
      return "accountOverride";
    }

    if (storageResult?.status === "fallback") {
      return storageResult?.metadata?.fallbackReason === "missing-account-policy"
        ? "defaultSeedPolicy"
        : "fallbackPolicy";
    }

    return resolutionResult?.metadata?.source === "defaultPolicy"
      ? "defaultSeedPolicy"
      : "fallbackPolicy";
  }

  function resolveIncomeImpactHouseholdExpenseAccountPolicy(options) {
    const safeOptions = isPlainObject(options) ? options : {};
    const currentLensAnalysis = isPlainObject(safeOptions.currentLensAnalysis) ? safeOptions.currentLensAnalysis : {};
    const accountId = TEMPORARY_LOCAL_HOUSEHOLD_EXPENSE_POLICY_ACCOUNT_ID;
    const storageApi = safeOptions.accountPolicyStorage;
    const resolver = safeOptions.accountPolicyResolver;
    const warnings = [];
    const dataGaps = [];

    let storageResult = null;
    if (storageApi && typeof storageApi.loadHouseholdExpenseAccountPolicy === "function") {
      storageResult = storageApi.loadHouseholdExpenseAccountPolicy({
        accountId,
        storage: safeOptions.storage
      });
      warnings.push.apply(warnings, getWarningList(storageResult));
      dataGaps.push.apply(dataGaps, getDataGapList(storageResult));
    } else {
      warnings.push(createRuntimeIssue(
        "household-expense-account-policy-storage-unavailable",
        "Household expense account policy storage adapter was unavailable; MODEL90 seed defaults were used."
      ));
    }

    if (typeof resolver !== "function") {
      const issue = createRuntimeIssue(
        "household-expense-account-policy-resolver-unavailable",
        "Household expense account policy resolver was unavailable; helper-level seed defaults were used."
      );
      warnings.push(issue);
      dataGaps.push(issue);
      return {
        accountId,
        policySource: "fallbackPolicy",
        storageResult,
        resolvedPolicy: null,
        resolvedAccountPolicyAvailable: false,
        warnings,
        dataGaps,
        trace: {
          source: "income-impact-display-account-policy-runtime",
          accountId,
          accountIdSource: "temporaryLocalDisplayFallback",
          storageStatus: storageResult?.status || "unavailable",
          policySource: "fallbackPolicy",
          resolverAvailable: false
        }
      };
    }

    const policyInputs = getDefaultHouseholdExpensePolicyInputs(currentLensAnalysis);
    const accountPolicy = storageResult?.status === "loaded" && isPlainObject(storageResult.accountPolicy)
      ? storageResult.accountPolicy
      : null;
    const resolvedPolicy = resolver(Object.assign({}, policyInputs, { accountPolicy }));
    warnings.push.apply(warnings, getWarningList(resolvedPolicy));
    dataGaps.push.apply(dataGaps, getDataGapList(resolvedPolicy));

    const policySource = getAccountPolicySource(storageResult, resolvedPolicy);
    return {
      accountId,
      policySource,
      storageResult,
      resolvedPolicy,
      resolvedAccountPolicyAvailable: policySource === "accountOverride",
      warnings,
      dataGaps,
      trace: {
        source: "income-impact-display-account-policy-runtime",
        accountId,
        accountIdSource: "temporaryLocalDisplayFallback",
        storageStatus: storageResult?.status || "unavailable",
        storageFallbackReason: storageResult?.metadata?.fallbackReason || null,
        policySource,
        resolverAvailable: true,
        accountPolicyLoaded: storageResult?.status === "loaded",
        resolvedLifestyleRangePolicyCount: Array.isArray(resolvedPolicy?.resolvedLifestyleRangePolicies)
          ? resolvedPolicy.resolvedLifestyleRangePolicies.length
          : 0,
        resolvedCompressionPolicyRuleCount: Array.isArray(resolvedPolicy?.resolvedCompressionPolicyRules)
          ? resolvedPolicy.resolvedCompressionPolicyRules.length
          : 0,
        resolvedCompressionThresholdRuleCount: Array.isArray(resolvedPolicy?.resolvedCompressionThresholdRules)
          ? resolvedPolicy.resolvedCompressionThresholdRules.length
          : 0,
        warningCount: warnings.length,
        dataGapCount: dataGaps.length
      }
    };
  }

  function getResolvedAccountPolicyInput(policyContext) {
    if (!isPlainObject(policyContext) || policyContext.resolvedAccountPolicyAvailable !== true || !isPlainObject(policyContext.resolvedPolicy)) {
      return {};
    }

    return {
      accountPolicyResolution: policyContext.resolvedPolicy
    };
  }

  function getLoadedHouseholdExpenseAccountPolicy(policyContext) {
    if (isPlainObject(policyContext?.storageResult?.accountPolicy)) {
      return policyContext.storageResult.accountPolicy;
    }

    if (isPlainObject(policyContext?.accountPolicy)) {
      return policyContext.accountPolicy;
    }

    return null;
  }

  function normalizeHouseholdExpenseStreamPolicyMode(value) {
    const mode = normalizeString(value);
    const normalizedMode = mode.toLowerCase();
    if (normalizedMode === "activegraphadjustments" || normalizedMode === "active-graph-adjustments" || normalizedMode === "active_graph_adjustments") {
      return "activeGraphAdjustments";
    }

    if (normalizedMode === "preview" || normalizedMode === "stream-preview" || normalizedMode === "streampreview") {
      return "preview";
    }

    if (normalizedMode === "legacy") {
      return "legacy";
    }

    return null;
  }

  function getHouseholdExpenseStreamPolicyModeInput(state) {
    const requestedMode = normalizeHouseholdExpenseStreamPolicyMode(
      state?.scenarioState?.householdExpenseStreamPolicyMode
      || state?.householdExpenseStreamPolicyMode
    );

    return requestedMode ? { householdExpenseStreamPolicyMode: requestedMode } : {};
  }

  function buildHouseholdExpenseScenarioContext(scenario, controls) {
    const scenarioFacts = isPlainObject(scenario?.scenario) ? scenario.scenario : {};
    return {
      valuationDate: scenarioFacts.valuationDate || null,
      selectedDeathDate: scenarioFacts.selectedDeathDate || controls?.selectedDeathDate || null,
      selectedDeathAge: scenarioFacts.selectedDeathAge ?? controls?.selectedDeathAge ?? null,
      projectionHorizonMonths: scenarioFacts.projectionHorizonMonths ?? null,
      deceasedInsuredCount: 1,
      deceasedInsuredRole: "client",
      source: "incomeImpactScenario"
    };
  }

  function buildLifestyleScenarioRuntimeInput(state, context, lifestyleSliderValue, resolvedAccountPolicyInput) {
    const safeState = isPlainObject(state) ? state : {};
    const safeContext = isPlainObject(context) ? context : {};
    const lensModel = isPlainObject(safeState.lensModel) ? safeState.lensModel : {};
    const householdExpenseAccountPolicyContext = safeContext.householdExpenseAccountPolicyContext;
    const loadedAccountPolicy = getLoadedHouseholdExpenseAccountPolicy(householdExpenseAccountPolicyContext);
    const input = Object.assign({
      expenseFacts: lensModel.expenseFacts,
      lensModel,
      ongoingSupport: lensModel.ongoingSupport,
      profileRecord: safeState.profileRecord,
      profileFacts: lensModel.profileFacts,
      pmiFacts: lensModel.pmiFacts || lensModel.protectionModeling?.pmiFacts,
      taxContext: lensModel.taxContext,
      assumptions: safeState.analysisSettings,
      valuationDate: safeState.valuationDate,
      scenarioContext: buildHouseholdExpenseScenarioContext(safeContext.scenario, safeContext.controls),
      accountPolicyContext: householdExpenseAccountPolicyContext,
      sliderValue: lifestyleSliderValue,
      basePostDeathSeries: safeContext.scenario?.postDeathSeries,
      options: {
        comparisonPathId: LIFESTYLE_COMPARISON_PATH_ID,
        comparisonLabel: LIFESTYLE_COMPARISON_LABEL
      }
    }, resolvedAccountPolicyInput, getHouseholdExpenseStreamPolicyModeInput(safeState));

    if (loadedAccountPolicy) {
      input.accountPolicy = loadedAccountPolicy;
    }

    return input;
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

    const maxAge = 100;
    return {
      hasDateOfBirth: true,
      currentAge,
      minAge: currentAge,
      maxAge,
      selectedDeathAge: currentAge,
      dateOfBirth: formatDateOnly(dateOfBirth)
    };
  }

  function resolveSelectedDeathDate(valuationDate, deathAgeState) {
    const asOfDate = parseDateOnlyValue(valuationDate);
    const state = isPlainObject(deathAgeState) ? deathAgeState : {};
    if (!asOfDate || !state.hasDateOfBirth) {
      return normalizeDateOnly(valuationDate) || "";
    }

    const selectedDeathAge = clampRoundedAge(state.selectedDeathAge, state.minAge, state.maxAge);
    if (selectedDeathAge <= state.currentAge) {
      return formatDateOnly(asOfDate);
    }

    const dateOfBirth = parseDateOnlyValue(state.dateOfBirth);
    if (!dateOfBirth) {
      return formatDateOnly(asOfDate);
    }

    const selectedDeathDate = addWholeYears(dateOfBirth, selectedDeathAge);
    return selectedDeathDate < asOfDate ? formatDateOnly(asOfDate) : formatDateOnly(selectedDeathDate);
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
    syncResourceOutlookPanel({});
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
      sliderLabels: Array.from(control.querySelectorAll("[data-income-impact-death-age-slider-label]")),
      ageValue: control.querySelector("[data-income-impact-death-age-value]") || document.querySelector("[data-income-impact-death-age-value]"),
      dateValue: control.querySelector("[data-income-impact-death-date-value]") || document.querySelector("[data-income-impact-death-date-value]"),
      warning: control.querySelector("[data-income-impact-death-age-warning]")
    };
  }

  function getScenarioBannerElements() {
    const banner = document.querySelector("[data-income-impact-scenario-banner]");
    if (!banner) {
      return null;
    }

    return {
      banner,
      toggle: banner.querySelector("[data-income-impact-scenario-toggle]"),
      content: banner.querySelector("[data-income-impact-scenario-content]"),
      projectionHorizon: banner.querySelector("[data-income-impact-projection-horizon]"),
      projectionHorizonValue: banner.querySelector("[data-income-impact-projection-horizon-value]"),
      mortgageTreatment: banner.querySelector("[data-income-impact-mortgage-treatment]"),
      mortgageTreatmentOptions: Array.from(banner.querySelectorAll("[data-income-impact-mortgage-treatment-option]")),
      mortgageTreatmentValue: banner.querySelector("[data-income-impact-mortgage-treatment-value]"),
      survivorIncome: banner.querySelector("[data-income-impact-survivor-income]"),
      survivorIncomeOptions: Array.from(banner.querySelectorAll("[data-income-impact-survivor-income-option]")),
      survivorIncomeValue: banner.querySelector("[data-income-impact-survivor-income-value]"),
      lifestyleSlider: banner.querySelector("[data-income-impact-lifestyle-slider]"),
      lifestyleOptions: Array.from(banner.querySelectorAll("[data-income-impact-lifestyle-option]")),
      lifestyleValue: banner.querySelector("[data-income-impact-lifestyle-value]"),
      autoCompressBaseline: banner.querySelector("[data-income-impact-auto-compress-baseline]"),
      reevaluateButton: banner.querySelector("[data-income-impact-reevaluate]"),
      reevaluateControl: banner.querySelector("[data-income-impact-reevaluate-control]"),
      reevaluateAction: banner.querySelector("[data-income-impact-reevaluate-action]"),
      draftStatus: banner.querySelector("[data-income-impact-draft-status]"),
      selectedScenarioChip: banner.querySelector("[data-income-impact-selected-scenario-chip]"),
      selectedScenarioLabel: banner.querySelector("[data-income-impact-selected-scenario-label]"),
      scenarioSummary: banner.querySelector("[data-income-impact-scenario-summary]")
    };
  }

  function getSelectedScenarioDisplayLabel(state) {
    const selectedScenario = getSelectedAppliedScenario(state);
    return normalizeString(selectedScenario?.label) || "Selected scenario";
  }

  function getReevaluateActionLabel(state, hasPendingDraft) {
    if (!hasPendingDraft) {
      return "No pending changes";
    }

    const scenarioCount = Array.isArray(state?.appliedScenarios) ? state.appliedScenarios.length : 0;
    return scenarioCount < 2 ? "Adds scenario to key" : "Updates selected scenario";
  }

  function syncScenarioOptionButtons(options, selectedValue, attributeName) {
    if (!Array.isArray(options)) {
      return;
    }

    const normalizedSelectedValue = normalizeString(selectedValue);
    options.forEach(function (option) {
      if (!option || typeof option.getAttribute !== "function" || typeof option.setAttribute !== "function") {
        return;
      }

      option.setAttribute(
        "aria-pressed",
        normalizeString(option.getAttribute(attributeName)) === normalizedSelectedValue ? "true" : "false"
      );
    });
  }

  function getLifestyleSegmentValue(value) {
    const numericValue = clampLifestyleSliderValue(value);
    if (numericValue <= -50) {
      return "-100";
    }
    if (numericValue >= 50) {
      return "100";
    }
    return "0";
  }

  function getDraftLifestyleMonthlyDeltaLabel(state, lifestyleSliderValue) {
    const safeState = isPlainObject(state) ? state : {};
    const sliderValue = clampLifestyleSliderValue(lifestyleSliderValue);
    const selectedAppliedScenario = getSelectedAppliedScenario(safeState);
    if (
      selectedAppliedScenario?.settings?.lifestyleSliderValue === sliderValue
      && selectedAppliedScenario?.lifestyleAdjustment?.monthlyDelta != null
    ) {
      return formatSignedMonthlyAmount(selectedAppliedScenario.lifestyleAdjustment.monthlyDelta);
    }

    if (sliderValue === 0) {
      return "$0/mo";
    }

    const baseContext = safeState.baseRenderCache?.baseContext;
    if (!isPlainObject(baseContext) || typeof safeState.calculateIncomeImpactLifestyleScenario !== "function") {
      return UNAVAILABLE_COPY;
    }

    const resolvedAccountPolicyInput = getResolvedAccountPolicyInput(baseContext.householdExpenseAccountPolicyContext);
    const lifestyleScenario = safeState.calculateIncomeImpactLifestyleScenario(buildLifestyleScenarioRuntimeInput(
      safeState,
      baseContext,
      sliderValue,
      resolvedAccountPolicyInput
    ));
    const monthlyDelta = toOptionalNumber(
      lifestyleScenario?.monthlyDelta
      ?? lifestyleScenario?.comparisonScenario?.trace?.monthlyDelta
      ?? lifestyleScenario?.comparisonScenario?.trace?.graphMonthlyDelta
    );
    return monthlyDelta == null ? UNAVAILABLE_COPY : formatSignedMonthlyAmount(monthlyDelta);
  }

  function getReevaluateScheduler() {
    if (typeof window.setTimeout === "function") {
      return window.setTimeout.bind(window);
    }
    if (typeof setTimeout === "function") {
      return setTimeout;
    }
    return null;
  }

  function setScenarioReevaluating(isReevaluating) {
    if (!incomeImpactState) {
      return;
    }

    const scenarioState = isPlainObject(incomeImpactState.scenarioState)
      ? incomeImpactState.scenarioState
      : {};
    scenarioState.reevaluating = isReevaluating === true;
    incomeImpactState.scenarioState = scenarioState;
  }

  function updateDeathAgeSliderLabels(labelNodes, minAge, maxAge) {
    if (!Array.isArray(labelNodes) || !labelNodes.length) {
      return;
    }

    if (toOptionalNumber(minAge) == null || toOptionalNumber(maxAge) == null) {
      labelNodes.forEach(function (labelNode) {
        if (labelNode) {
          labelNode.textContent = "";
        }
      });
      return;
    }

    const valuesByKey = {
      min: 0,
      quarter: 25,
      mid: 50,
      "three-quarter": 75,
      max: 100
    };
    labelNodes.forEach(function (labelNode) {
      if (!labelNode || typeof labelNode.getAttribute !== "function") {
        return;
      }

      const key = normalizeString(labelNode.getAttribute("data-income-impact-death-age-slider-label"));
      const value = Object.prototype.hasOwnProperty.call(valuesByKey, key) ? valuesByKey[key] : null;
      labelNode.textContent = value == null ? "" : String(Math.round(value));
    });
  }

  function updateDeathAgeControl(timelineResult, deathAgeState, controls) {
    const elements = getDeathAgeControlElements();
    if (!elements) {
      return;
    }

    const {
      control,
      sliderRow,
      slider,
      sliderLabels,
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
      if (control.style && typeof control.style.setProperty === "function") {
        control.style.setProperty("--income-impact-death-age-progress", "0%");
      }
      updateDeathAgeSliderLabels(sliderLabels, null, null);
      return;
    }

    const selectedDeathAge = clampRoundedAge(
      controls?.selectedDeathAge ?? state.selectedDeathAge,
      state.minAge,
      state.maxAge
    );
    control.setAttribute("data-income-impact-death-age-status", "available");
    if (sliderRow) {
      sliderRow.hidden = false;
    }
    if (slider) {
      slider.disabled = false;
      slider.min = "0";
      slider.max = "100";
      slider.step = "1";
      slider.value = String(selectedDeathAge);
      slider.setAttribute("aria-valuetext", `Age ${selectedDeathAge}`);
      if (control.style && typeof control.style.setProperty === "function") {
        control.style.setProperty("--income-impact-death-age-progress", `${Math.max(0, Math.min(100, selectedDeathAge))}%`);
      }
    }
    updateDeathAgeSliderLabels(sliderLabels, state.minAge, state.maxAge);
    if (ageValue) {
      ageValue.textContent = String(selectedDeathAge);
    }
    if (dateValue) {
      dateValue.textContent = controls?.selectedDeathDate || timelineResult?.selectedDeath?.date || UNAVAILABLE_COPY;
    }
    if (warning) {
      warning.hidden = true;
      warning.textContent = "";
    }
  }

  function updateScenarioControls(timelineResult) {
    const draftControls = getDraftScenarioControlsSnapshot(incomeImpactState);
    updateDeathAgeControl(timelineResult, incomeImpactState?.deathAgeState, draftControls);

    const elements = getScenarioBannerElements();
    if (!elements) {
      return;
    }

    const scenarioState = isPlainObject(incomeImpactState?.scenarioState)
      ? incomeImpactState.scenarioState
      : {};
    const projectionHorizonYears = draftControls.projectionHorizonYears;
    const mortgageTreatmentOverride = draftControls.mortgageTreatmentOverride;
    const includeSurvivorIncome = draftControls.includeSurvivorIncome !== false;
    const lifestyleSliderValue = draftControls.lifestyleSliderValue;
    const autoCompressBaselineEnabled = draftControls.autoCompressBaselineEnabled !== false;
    const collapsed = scenarioState.bannerCollapsed === true;
    const hasPendingDraft = hasDraftScenarioChanges(incomeImpactState);
    const isReevaluating = scenarioState.reevaluating === true;
    const selectedScenarioLabel = getSelectedScenarioDisplayLabel(incomeImpactState);
    const reevaluateActionLabel = getReevaluateActionLabel(incomeImpactState, hasPendingDraft);

    elements.banner.classList.toggle("is-collapsed", collapsed);
    elements.banner.setAttribute("data-income-impact-scenario-state", collapsed ? "collapsed" : "expanded");
    elements.banner.setAttribute("data-income-impact-draft-state", hasPendingDraft ? "dirty" : "applied");
    elements.banner.setAttribute("data-income-impact-selected-scenario-id", normalizeString(incomeImpactState?.selectedScenarioId));
    elements.banner.setAttribute("data-income-impact-reevaluate-action-label", reevaluateActionLabel);

    if (elements.toggle) {
      elements.toggle.setAttribute("aria-expanded", String(!collapsed));
      elements.toggle.textContent = collapsed ? "Show controls" : "Hide controls";
    }

    if (elements.content) {
      elements.content.hidden = collapsed;
    }

    if (elements.projectionHorizon) {
      elements.projectionHorizon.min = String(MIN_PROJECTION_HORIZON_YEARS);
      elements.projectionHorizon.max = String(MAX_PROJECTION_HORIZON_YEARS);
      elements.projectionHorizon.step = "1";
      elements.projectionHorizon.value = String(projectionHorizonYears);
      elements.projectionHorizon.setAttribute("aria-valuetext", `${projectionHorizonYears} years`);
    }

    if (elements.projectionHorizonValue) {
      elements.projectionHorizonValue.textContent = `${projectionHorizonYears} years`;
    }

    if (elements.mortgageTreatment) {
      elements.mortgageTreatment.value = mortgageTreatmentOverride;
    }
    syncScenarioOptionButtons(elements.mortgageTreatmentOptions, mortgageTreatmentOverride, "data-income-impact-mortgage-treatment-option");

    if (elements.mortgageTreatmentValue) {
      elements.mortgageTreatmentValue.textContent = getMortgageTreatmentLabel(mortgageTreatmentOverride);
    }

    if (elements.survivorIncome) {
      elements.survivorIncome.checked = includeSurvivorIncome;
      elements.survivorIncome.setAttribute("aria-checked", String(includeSurvivorIncome));
    }
    syncScenarioOptionButtons(elements.survivorIncomeOptions, String(includeSurvivorIncome), "data-income-impact-survivor-income-option");

    if (elements.survivorIncomeValue) {
      elements.survivorIncomeValue.textContent = includeSurvivorIncome ? "Included" : "Excluded";
    }

    if (elements.lifestyleSlider) {
      elements.lifestyleSlider.min = String(MIN_LIFESTYLE_SLIDER_VALUE);
      elements.lifestyleSlider.max = String(MAX_LIFESTYLE_SLIDER_VALUE);
      elements.lifestyleSlider.step = "1";
      elements.lifestyleSlider.value = String(lifestyleSliderValue);
      elements.lifestyleSlider.setAttribute("aria-valuetext", getLifestyleSliderLabel(lifestyleSliderValue));
    }
    syncScenarioOptionButtons(elements.lifestyleOptions, getLifestyleSegmentValue(lifestyleSliderValue), "data-income-impact-lifestyle-option");

    if (elements.lifestyleValue) {
      elements.lifestyleValue.textContent = getDraftLifestyleMonthlyDeltaLabel(incomeImpactState, lifestyleSliderValue);
    }

    if (elements.autoCompressBaseline) {
      elements.autoCompressBaseline.checked = autoCompressBaselineEnabled;
      elements.autoCompressBaseline.setAttribute("aria-checked", String(autoCompressBaselineEnabled));
    }

    if (elements.reevaluateButton) {
      elements.reevaluateButton.disabled = !hasPendingDraft || isReevaluating;
      elements.reevaluateButton.setAttribute("aria-disabled", String(!hasPendingDraft || isReevaluating));
      elements.reevaluateButton.setAttribute("data-income-impact-reevaluate-state", isReevaluating ? "reevaluating" : hasPendingDraft ? "active" : "idle");
    }

    if (elements.reevaluateControl) {
      elements.reevaluateControl.setAttribute("data-income-impact-reevaluate-state", isReevaluating ? "reevaluating" : hasPendingDraft ? "active" : "idle");
    }

    if (elements.reevaluateAction) {
      elements.reevaluateAction.textContent = isReevaluating ? "Updating graph" : reevaluateActionLabel;
      elements.reevaluateAction.setAttribute("data-income-impact-reevaluate-action-state", isReevaluating ? "reevaluating" : hasPendingDraft ? "active" : "idle");
    }

    if (elements.draftStatus) {
      elements.draftStatus.textContent = isReevaluating ? "Updating" : hasPendingDraft ? "Pending" : "Applied";
      elements.draftStatus.setAttribute("data-income-impact-draft-status-state", isReevaluating ? "reevaluating" : hasPendingDraft ? "dirty" : "applied");
    }

    if (elements.selectedScenarioLabel) {
      elements.selectedScenarioLabel.textContent = selectedScenarioLabel;
    }

    if (elements.selectedScenarioChip) {
      elements.selectedScenarioChip.setAttribute("data-income-impact-applied-scenario-id", normalizeString(incomeImpactState?.selectedScenarioId));
      elements.selectedScenarioChip.setAttribute("data-income-impact-applied-scenario-selected", "true");
    }

    if (elements.scenarioSummary) {
      elements.scenarioSummary.setAttribute("data-income-impact-mortgage-treatment-label", getMortgageTreatmentLabel(mortgageTreatmentOverride));
      elements.scenarioSummary.setAttribute("data-income-impact-survivor-income-label", includeSurvivorIncome ? "Survivor income included" : "Survivor income excluded");
      elements.scenarioSummary.setAttribute("data-income-impact-lifestyle-label", getLifestyleSliderLabel(lifestyleSliderValue));
      elements.scenarioSummary.setAttribute("data-income-impact-selected-scenario-summary-label", selectedScenarioLabel);
    }
  }

  function findSummaryCard(timelineResult, id) {
    const summaryCards = Array.isArray(timelineResult?.summaryCards) ? timelineResult.summaryCards : [];
    return summaryCards.find(function (card) {
      return card?.id === id;
    }) || null;
  }

  function getFinancialRunway(timelineResult) {
    return isPlainObject(timelineResult?.financialRunway) ? timelineResult.financialRunway : {};
  }

  function formatYearsMonthsFromRunway(runway, fallbackValue) {
    const years = toOptionalNumber(runway?.yearsOfSecurity);
    const months = toOptionalNumber(runway?.monthsOfSecurity);
    if (years != null && months != null) {
      return `${years} ${years === 1 ? "year" : "years"} ${months} ${months === 1 ? "month" : "months"}`;
    }
    return fallbackValue || UNAVAILABLE_COPY;
  }

  function normalizeRunwayStatus(status) {
    const normalized = String(status || "").trim();
    if (normalized === "available") {
      return "complete";
    }
    if (normalized === "notAvailable") {
      return "not-available";
    }
    if (normalized === "noShortfall") {
      return "no-shortfall";
    }
    return normalized || "not-available";
  }

  function findRunwayReason(warnings, dataGaps) {
    return (
      warnings.find(function (warning) {
        const code = String(warning?.code || "");
        const message = String(warning?.message || "");
        return code.includes("annual")
          || code.includes("resources")
          || code.includes("partial")
          || message.includes("Years of Financial Security")
          || message.includes("Financial runway");
      })?.message
      || dataGaps[0]?.label
      || "Add annual household need and at least one resource bucket to calculate this preview."
    );
  }

  function renderFinancialSecurityCard(timelineResult) {
    const card = findSummaryCard(timelineResult, "yearsOfFinancialSecurity");
    const runway = getFinancialRunway(timelineResult);
    const status = normalizeRunwayStatus(runway.status || card?.status);
    const computedDisplayValue = formatYearsMonthsFromRunway(runway, card?.displayValue);
    const hasRunwayValue = computedDisplayValue && computedDisplayValue !== "Not available";
    const displayValue = status === "no-shortfall"
      ? "Financial crisis unlikely"
      : (hasRunwayValue ? computedDisplayValue : "Runway estimate unavailable");
    const warnings = Array.isArray(runway.warnings) ? runway.warnings : (Array.isArray(timelineResult?.warnings) ? timelineResult.warnings : []);
    const dataGaps = Array.isArray(runway.dataGaps) ? runway.dataGaps : (Array.isArray(timelineResult?.dataGaps) ? timelineResult.dataGaps : []);
    const unavailableReason = status === "complete" || status === "no-shortfall" || status === "partial-estimate"
      ? ""
      : findRunwayReason(warnings, dataGaps);

    return `
      <article class="income-impact-card income-impact-card--wide" data-income-impact-financial-security-card data-income-impact-summary-card-id="yearsOfFinancialSecurity" data-income-impact-summary-status="${escapeHtml(status)}">
        <div class="income-impact-card-header">
          <h2>Years of Financial Security</h2>
        </div>
        <strong class="income-impact-financial-security-value" data-income-impact-financial-security-value data-income-impact-helper-summary-card="yearsOfFinancialSecurity">${escapeHtml(displayValue)}</strong>
        ${status === "no-shortfall" ? `<p data-income-impact-financial-security-explanation>Available resources are not projected to run out in this scenario.</p>` : ""}
        ${unavailableReason ? `<p data-income-impact-financial-security-reason>${escapeHtml(unavailableReason)}</p>` : ""}
      </article>
    `;
  }

  function renderRunwayMetricCard(id, title, value, description, status) {
    return `
      <article class="income-impact-card" data-income-impact-runway-metric-card="${escapeHtml(id)}" data-income-impact-runway-metric-status="${escapeHtml(status || "notAvailable")}">
        <div class="income-impact-card-header">
          <h3>${escapeHtml(title)}</h3>
          <p>${escapeHtml(description)}</p>
        </div>
        <strong data-income-impact-runway-metric-value="${escapeHtml(id)}">${escapeHtml(formatCurrency(value))}</strong>
      </article>
    `;
  }

  function renderFinancialRunwayCards(timelineResult) {
    const runway = getFinancialRunway(timelineResult);
    return `
      ${renderRunwayMetricCard(
        "immediateResources",
        "Immediate Money Available",
        runway.startingResources,
        "Existing coverage plus available assets at the selected death date.",
        runway.startingResources == null ? "notAvailable" : "available"
      )}
      ${renderRunwayMetricCard(
        "immediateObligations",
        "Immediate Obligations",
        runway.immediateObligations,
        "Final expenses, transition needs, and debt payoff obligations where available.",
        runway.immediateObligations == null ? "notAvailable" : "available"
      )}
      ${renderRunwayMetricCard(
        "annualShortfall",
        "Annual Household Shortfall",
        runway.annualShortfall,
        "Annual household need less survivor income.",
        runway.annualShortfall == null ? "notAvailable" : (runway.annualShortfall <= 0 ? "no-shortfall" : "available")
      )}
    `;
  }

  function getComposerScenario(timelineResult) {
    return isPlainObject(timelineResult?.scenario) ? timelineResult.scenario : {};
  }

  function getTimelineFacts(timelineResult) {
    const scenario = getComposerScenario(timelineResult);
    return isPlainObject(scenario.timelineFacts) ? scenario.timelineFacts : {};
  }

  function formatMonthsCovered(value) {
    const months = toOptionalNumber(value);
    if (months == null) {
      return UNAVAILABLE_COPY;
    }

    const roundedMonths = Math.max(0, Math.round(months));
    const years = Math.floor(roundedMonths / 12);
    const remainder = roundedMonths % 12;
    if (!years) {
      return `${remainder} ${remainder === 1 ? "month" : "months"}`;
    }
    if (!remainder) {
      return `${years} ${years === 1 ? "year" : "years"}`;
    }
    return `${years} ${years === 1 ? "year" : "years"} ${remainder} ${remainder === 1 ? "month" : "months"}`;
  }

  function getPausedTimelineFacts(timelineResult) {
    const facts = getTimelineFacts(timelineResult);
    return [
      {
        id: "assets-before-death",
        label: "Assets before death",
        value: formatCurrency(facts.assetsBeforeDeath)
      },
      {
        id: "treated-assets-at-death",
        label: "Treated assets at death",
        value: formatCurrency(facts.survivorAvailableTreatedAssets)
      },
      {
        id: "coverage-added",
        label: "Coverage added at death",
        value: formatCurrency(facts.coverageAdded)
      },
      {
        id: "resources-after-obligations",
        label: "Resources after obligations",
        value: formatCurrency(facts.resourcesAfterObligations)
      },
      {
        id: "runway-months-covered",
        label: "Runway covered",
        value: formatMonthsCovered(facts.monthsCovered)
      },
      {
        id: "depletion-date",
        label: "Depletion date",
        value: facts.depletionDate || "Not depleted within horizon"
      }
    ];
  }

  function formatGraphCalloutValue(callout) {
    if (!callout) {
      return UNAVAILABLE_COPY;
    }
    if (callout.kind === "currency") {
      return formatCurrency(callout.value);
    }
    if (callout.kind === "months") {
      return formatMonthsCovered(callout.value);
    }
    if (callout.value == null || callout.value === "") {
      return UNAVAILABLE_COPY;
    }
    return String(callout.value);
  }

  function getGraphModel(timelineResult) {
    return isPlainObject(timelineResult?.graphModel) ? timelineResult.graphModel : {};
  }

  function getStableGraphLayoutFrame(graphModel) {
    const layoutFrame = isPlainObject(graphModel?.layoutFrame) ? graphModel.layoutFrame : null;
    return layoutFrame && layoutFrame.mode === STABLE_GRAPH_LAYOUT_FRAME_MODE ? layoutFrame : null;
  }

  function getGraphPlotFrame(graphModel) {
    const layoutFrame = getStableGraphLayoutFrame(graphModel);
    const plotLeft = toOptionalNumber(layoutFrame?.plotLeft) ?? GRAPH_VIEW_BOX.plotLeft;
    const plotRight = toOptionalNumber(layoutFrame?.plotRight);
    const plotTop = toOptionalNumber(layoutFrame?.plotTop) ?? GRAPH_VIEW_BOX.plotTop;
    const plotBottom = toOptionalNumber(layoutFrame?.plotBottom);
    const plotWidth = plotRight == null ? GRAPH_VIEW_BOX.plotWidth : Math.max(1, plotRight - plotLeft);
    const plotHeight = plotBottom == null ? GRAPH_VIEW_BOX.plotHeight : Math.max(1, plotBottom - plotTop);
    return {
      plotLeft,
      plotTop,
      plotWidth,
      plotHeight,
      plotRight: plotLeft + plotWidth,
      plotBottom: plotTop + plotHeight
    };
  }

  function getLayoutFramePointMonth(point) {
    if (!isPlainObject(point)) {
      return null;
    }
    const explicitMonth = toOptionalNumber(
      point.relativeMonthsFromDeath ??
        point.monthOffset ??
        point.monthIndex ??
        point.monthsAfterDeath ??
        point.elapsedMonth ??
        point.month
    );
    if (explicitMonth != null) {
      return explicitMonth;
    }
    const relativeYears = toOptionalNumber(point.relativeYearsFromDeath ?? point.relativeYears);
    return relativeYears == null ? null : relativeYears * 12;
  }

  function getLayoutFrameXRatio(graphModel, xRatio, point = null) {
    const layoutFrame = getStableGraphLayoutFrame(graphModel);
    const rawRatio = toOptionalNumber(xRatio);
    if (!layoutFrame) {
      return rawRatio;
    }

    const deathXRatio = toOptionalNumber(layoutFrame.deathXRatio) ?? rawRatio;
    const graphDeathXRatio = toOptionalNumber(graphModel?.phases?.deathEvent?.xRatio ?? graphModel?.axes?.x?.deathXRatio);
    const pointMonth = getLayoutFramePointMonth(point);
    const pointPhase = normalizeString(point?.phase);
    if (pointPhase === "deathEvent" || pointMonth === 0 || (rawRatio != null && graphDeathXRatio != null && Math.abs(rawRatio - graphDeathXRatio) <= 0.000001)) {
      return deathXRatio;
    }
    if (pointMonth == null || pointMonth < 0) {
      return rawRatio;
    }

    const runoutAnchorXRatio = toOptionalNumber(layoutFrame.runoutAnchorXRatio);
    const anchorMonth = toOptionalNumber(layoutFrame.zeroCrossingAnchorMonth);
    const domainMonths = Math.max(0.000001, toOptionalNumber(layoutFrame.xDomainMonths) ?? pointMonth);
    if (runoutAnchorXRatio != null && anchorMonth != null && anchorMonth > 0) {
      if (pointMonth <= anchorMonth) {
        return clampNumber(deathXRatio + ((pointMonth / anchorMonth) * (runoutAnchorXRatio - deathXRatio)), 0, 1);
      }
      if (domainMonths > anchorMonth) {
        return clampNumber(runoutAnchorXRatio + (((pointMonth - anchorMonth) / (domainMonths - anchorMonth)) * (1 - runoutAnchorXRatio)), 0, 1);
      }
      return clampNumber(runoutAnchorXRatio, 0, 1);
    }

    return clampNumber(deathXRatio + ((pointMonth / domainMonths) * (1 - deathXRatio)), 0, 1);
  }

  function getGraphYDomainBounds(graphModel) {
    const layoutFrame = getStableGraphLayoutFrame(graphModel);
    const yDomain = isPlainObject(layoutFrame?.yDomain) ? layoutFrame.yDomain : {};
    const ticks = Array.isArray(graphModel?.axes?.y?.ticks) ? graphModel.axes.y.ticks : [];
    const tickValues = ticks.map(function (tick) {
      return toOptionalNumber(tick?.value);
    }).filter(function (value) {
      return value != null;
    });
    const maxTick = tickValues.length ? Math.max(...tickValues) : null;
    const minTick = tickValues.length ? Math.min(...tickValues) : null;
    return {
      max: Math.max(toOptionalNumber(yDomain.max) ?? maxTick ?? 1, 1),
      min: Math.min(toOptionalNumber(yDomain.min) ?? minTick ?? -1, -1)
    };
  }

  function getLayoutFrameYRatio(graphModel, yRatio, point = null) {
    const layoutFrame = getStableGraphLayoutFrame(graphModel);
    const rawRatio = toOptionalNumber(yRatio);
    if (!layoutFrame) {
      return rawRatio;
    }
    const zeroYRatio = toOptionalNumber(layoutFrame.zeroYRatio);
    if (zeroYRatio == null) {
      return rawRatio;
    }
    const value = getSeriesPointValue(point);
    if (value == null) {
      const graphZeroYRatio = toOptionalNumber(graphModel?.axes?.y?.zeroYRatio);
      return graphZeroYRatio != null && rawRatio != null && Math.abs(rawRatio - graphZeroYRatio) <= 0.000001
        ? zeroYRatio
        : rawRatio;
    }
    if (Math.abs(value) <= 0.000001) {
      return zeroYRatio;
    }

    const bounds = getGraphYDomainBounds(graphModel);
    if (value > 0) {
      return clampNumber(zeroYRatio - ((value / bounds.max) * zeroYRatio), 0, zeroYRatio);
    }

    const negativeBandRatio = Math.max(0.000001, 1 - zeroYRatio);
    return clampNumber(zeroYRatio + ((Math.abs(value) / Math.abs(bounds.min)) * negativeBandRatio), zeroYRatio, 1);
  }

  function toGraphX(xRatio, graphModel = null, point = null) {
    const ratio = toOptionalNumber(xRatio);
    const frame = getGraphPlotFrame(graphModel);
    const stableRatio = getLayoutFrameXRatio(graphModel, ratio, point);
    return Math.round(frame.plotLeft + ((stableRatio == null ? 0 : stableRatio) * frame.plotWidth));
  }

  function toGraphXRatio(x) {
    const coordinate = toOptionalNumber(x);
    if (coordinate == null || GRAPH_VIEW_BOX.plotWidth <= 0) {
      return 0;
    }
    return clampNumber((coordinate - GRAPH_VIEW_BOX.plotLeft) / GRAPH_VIEW_BOX.plotWidth, 0, 1);
  }

  function toGraphY(yRatio, graphModel = null, point = null) {
    const ratio = toOptionalNumber(yRatio);
    const frame = getGraphPlotFrame(graphModel);
    const stableRatio = getLayoutFrameYRatio(graphModel, ratio, point);
    return Math.round(frame.plotTop + ((stableRatio == null ? 0 : stableRatio) * frame.plotHeight));
  }

  function toPlotX(xRatio, viewBox) {
    const ratio = toOptionalNumber(xRatio);
    return viewBox.plotLeft + ((ratio == null ? 0 : ratio) * viewBox.plotWidth);
  }

  function toPlotY(yRatio, viewBox) {
    const ratio = toOptionalNumber(yRatio);
    return viewBox.plotTop + ((ratio == null ? 0 : ratio) * viewBox.plotHeight);
  }

  function formatSvgCoordinate(value) {
    const number = toOptionalNumber(value);
    if (number == null) {
      return "0";
    }
    const rounded = Math.round(number);
    if (Math.abs(number - rounded) < 0.005) {
      return String(rounded);
    }
    return number.toFixed(2).replace(/\.?0+$/, "");
  }

  function clampNumber(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function makePlotPoints(points, yRatioKey, viewBox, graphModel = null) {
    const key = String(yRatioKey || "yRatio");
    return (Array.isArray(points) ? points : [])
      .filter(function (point) {
        return toOptionalNumber(point?.xRatio) != null && toOptionalNumber(point?.[key]) != null;
      })
      .map(function (point) {
        if (viewBox === GRAPH_VIEW_BOX && getStableGraphLayoutFrame(graphModel)) {
          return {
            x: toGraphX(point.xRatio, graphModel, point),
            y: toGraphY(point[key], graphModel, point)
          };
        }
        return {
          x: toPlotX(point.xRatio, viewBox),
          y: toPlotY(point[key], viewBox)
        };
      });
  }

  function getTrendLineDistance(point, start, end) {
    const numerator = Math.abs(((end.y - start.y) * point.x) - ((end.x - start.x) * point.y) + (end.x * start.y) - (end.y * start.x));
    const denominator = Math.hypot(end.y - start.y, end.x - start.x);
    return denominator > 0 ? numerator / denominator : 0;
  }

  function shouldRenderStraightTrendPath(points) {
    if (!Array.isArray(points) || points.length <= 2) {
      return true;
    }

    const start = points[0];
    const end = points[points.length - 1];
    return points.slice(1, -1).every(function (point) {
      return getTrendLineDistance(point, start, end) <= TREND_PATH_STRAIGHT_TOLERANCE;
    });
  }

  function simplifyTrendPathPoints(points, tolerance = TREND_PATH_SIMPLIFICATION_TOLERANCE) {
    const sourcePoints = Array.isArray(points) ? points : [];
    if (sourcePoints.length <= 2) {
      return sourcePoints;
    }

    const keepIndexes = new Set([0, sourcePoints.length - 1]);
    function simplifyRange(startIndex, endIndex) {
      const start = sourcePoints[startIndex];
      const end = sourcePoints[endIndex];
      let farthestIndex = -1;
      let farthestDistance = 0;

      for (let index = startIndex + 1; index < endIndex; index += 1) {
        const distance = getTrendLineDistance(sourcePoints[index], start, end);
        if (distance > farthestDistance) {
          farthestDistance = distance;
          farthestIndex = index;
        }
      }

      if (farthestIndex >= 0 && farthestDistance > tolerance) {
        keepIndexes.add(farthestIndex);
        simplifyRange(startIndex, farthestIndex);
        simplifyRange(farthestIndex, endIndex);
      }
    }

    simplifyRange(0, sourcePoints.length - 1);
    return sourcePoints.filter(function (_point, index) {
      return keepIndexes.has(index);
    });
  }

  function getTrendSegmentSlope(left, right) {
    const width = right.x - left.x;
    if (!Number.isFinite(width) || Math.abs(width) < 0.000001) {
      return null;
    }
    return (right.y - left.y) / width;
  }

  function buildTrendPathTangents(points) {
    const segmentWidths = [];
    const segmentSlopes = [];
    for (let index = 0; index < points.length - 1; index += 1) {
      const width = points[index + 1].x - points[index].x;
      segmentWidths.push(width);
      segmentSlopes.push(getTrendSegmentSlope(points[index], points[index + 1]));
    }

    return points.map(function (_point, index) {
      if (index === 0) {
        return segmentSlopes[0] ?? 0;
      }
      if (index === points.length - 1) {
        return segmentSlopes[segmentSlopes.length - 1] ?? 0;
      }

      const previousSlope = segmentSlopes[index - 1];
      const nextSlope = segmentSlopes[index];
      if (
        previousSlope == null
        || nextSlope == null
        || previousSlope === 0
        || nextSlope === 0
        || Math.sign(previousSlope) !== Math.sign(nextSlope)
      ) {
        return 0;
      }

      const previousWidth = Math.abs(segmentWidths[index - 1]);
      const nextWidth = Math.abs(segmentWidths[index]);
      const firstWeight = (2 * nextWidth) + previousWidth;
      const secondWeight = nextWidth + (2 * previousWidth);
      const denominator = (firstWeight / previousSlope) + (secondWeight / nextSlope);
      const tangent = denominator === 0 ? 0 : (firstWeight + secondWeight) / denominator;
      return Number.isFinite(tangent) ? tangent : 0;
    });
  }

  function buildTrendSvgPath(plotPoints) {
    const points = Array.isArray(plotPoints) ? plotPoints : [];
    if (points.length < 2) {
      return "";
    }
    const trendPoints = simplifyTrendPathPoints(points);
    if (shouldRenderStraightTrendPath(trendPoints)) {
      return buildLinearSvgPath(trendPoints);
    }

    const tangents = buildTrendPathTangents(trendPoints);
    const commands = [`M${formatSvgCoordinate(trendPoints[0].x)} ${formatSvgCoordinate(trendPoints[0].y)}`];
    for (let index = 0; index < trendPoints.length - 1; index += 1) {
      const current = trendPoints[index];
      const next = trendPoints[index + 1];
      const width = next.x - current.x;
      if (!Number.isFinite(width) || Math.abs(width) < 0.000001) {
        commands.push(`L${formatSvgCoordinate(next.x)} ${formatSvgCoordinate(next.y)}`);
        continue;
      }
      const minX = Math.min(current.x, next.x);
      const maxX = Math.max(current.x, next.x);
      const minY = Math.min(current.y, next.y);
      const maxY = Math.max(current.y, next.y);
      const cp1 = {
        x: clampNumber(current.x + (width / 3), minX, maxX),
        y: clampNumber(current.y + ((tangents[index] * width) / 3), minY, maxY)
      };
      const cp2 = {
        x: clampNumber(next.x - (width / 3), minX, maxX),
        y: clampNumber(next.y - ((tangents[index + 1] * width) / 3), minY, maxY)
      };
      commands.push([
        "C",
        `${formatSvgCoordinate(cp1.x)} ${formatSvgCoordinate(cp1.y)}`,
        `${formatSvgCoordinate(cp2.x)} ${formatSvgCoordinate(cp2.y)}`,
        `${formatSvgCoordinate(next.x)} ${formatSvgCoordinate(next.y)}`
      ].join(" "));
    }
    return commands.join(" ");
  }

  function buildStepSvgPath(plotPoints) {
    const points = Array.isArray(plotPoints) ? plotPoints : [];
    if (points.length < 2) {
      return "";
    }
    const commands = [`M${formatSvgCoordinate(points[0].x)} ${formatSvgCoordinate(points[0].y)}`];
    for (let index = 1; index < points.length; index += 1) {
      const point = points[index];
      commands.push(`H${formatSvgCoordinate(point.x)}`);
      commands.push(`V${formatSvgCoordinate(point.y)}`);
    }
    return commands.join(" ");
  }

  function buildLinearSvgPath(plotPoints) {
    const points = Array.isArray(plotPoints) ? plotPoints : [];
    if (points.length < 2) {
      return "";
    }
    const commands = [`M${formatSvgCoordinate(points[0].x)} ${formatSvgCoordinate(points[0].y)}`];
    for (let index = 1; index < points.length; index += 1) {
      const point = points[index];
      commands.push(`L${formatSvgCoordinate(point.x)} ${formatSvgCoordinate(point.y)}`);
    }
    return commands.join(" ");
  }

  function normalizeGraphPathMode(pathMode) {
    const normalized = String(pathMode || "").trim();
    if (normalized === "step") {
      return "step";
    }
    if (normalized === "linear") {
      return "linear";
    }
    return "smooth";
  }

  function buildSvgPath(points, pathMode = "smooth", graphModel = null) {
    const plotPoints = makePlotPoints(points, "yRatio", GRAPH_VIEW_BOX, graphModel);
    const normalizedPathMode = normalizeGraphPathMode(pathMode);
    if (normalizedPathMode === "step") {
      return buildStepSvgPath(plotPoints);
    }
    if (normalizedPathMode === "linear") {
      return buildLinearSvgPath(plotPoints);
    }
    return buildTrendSvgPath(plotPoints);
  }

  function buildDeficitAreaSvgPath(points, zeroYRatio, graphModel = null) {
    const zeroRatio = getStableGraphLayoutFrame(graphModel)
      ? toOptionalNumber(graphModel?.layoutFrame?.zeroYRatio)
      : toOptionalNumber(zeroYRatio);
    const sourcePoints = Array.isArray(points) ? points : [];
    const firstClippedIndex = sourcePoints.findIndex(function (point) {
      return point?.deficitVisualClipped === true;
    });
    const pathPoints = firstClippedIndex >= 0
      ? sourcePoints.slice(0, firstClippedIndex + 1)
      : sourcePoints;
    const plotPoints = makePlotPoints(pathPoints, "yRatio", GRAPH_VIEW_BOX, graphModel);
    if (zeroRatio == null || plotPoints.length < 2) {
      return "";
    }
    const zeroY = getStableGraphLayoutFrame(graphModel)
      ? toGraphY(zeroRatio, graphModel, { value: 0 })
      : toPlotY(zeroRatio, GRAPH_VIEW_BOX);
    const first = plotPoints[0];
    const last = plotPoints[plotPoints.length - 1];
    const commands = [
      `M${formatSvgCoordinate(first.x)} ${formatSvgCoordinate(zeroY)}`,
      `L${formatSvgCoordinate(first.x)} ${formatSvgCoordinate(first.y)}`
    ];
    plotPoints.slice(1).forEach(function (point) {
      commands.push(`L${formatSvgCoordinate(point.x)} ${formatSvgCoordinate(point.y)}`);
    });
    commands.push(`L${formatSvgCoordinate(last.x)} ${formatSvgCoordinate(zeroY)}`);
    commands.push("Z");
    return commands.join(" ");
  }

  function toDetailX(xRatio) {
    const ratio = toOptionalNumber(xRatio);
    return Math.round(GRAPH_DETAIL_VIEW_BOX.plotLeft + ((ratio == null ? 0 : ratio) * GRAPH_DETAIL_VIEW_BOX.plotWidth));
  }

  function toDetailY(yRatio) {
    const ratio = toOptionalNumber(yRatio);
    return Math.round(GRAPH_DETAIL_VIEW_BOX.plotTop + ((ratio == null ? 0 : ratio) * GRAPH_DETAIL_VIEW_BOX.plotHeight));
  }

  function buildDetailSvgPath(points, yRatioKey, pathMode = "smooth") {
    const plotPoints = makePlotPoints(points, yRatioKey, GRAPH_DETAIL_VIEW_BOX);
    return normalizeGraphPathMode(pathMode) === "step"
      ? buildStepSvgPath(plotPoints)
      : buildTrendSvgPath(plotPoints);
  }

  function roundAxisTickToNearestFiveThousand(value) {
    const number = toOptionalNumber(value);
    if (number == null) {
      return null;
    }
    if (Math.abs(number) < 1e-6) {
      return 0;
    }

    const increment = 5000;
    const sign = number < 0 ? -1 : 1;
    return sign * Math.round(Math.abs(number) / increment) * increment;
  }

  function formatAxisCurrency(value) {
    const number = roundAxisTickToNearestFiveThousand(value);
    if (number == null) {
      return "";
    }
    const absolute = Math.abs(number);
    const prefix = number < 0 ? "-" : "";
    if (absolute >= 1000000) {
      return `${prefix}$${Math.round(absolute / 1000000)}M`;
    }
    if (absolute >= 1000) {
      return `${prefix}$${Math.round(absolute / 1000)}k`;
    }
    return `${prefix}$${Math.round(absolute)}`;
  }

  function getGraphHoverPointValue(point) {
    return toOptionalNumber(
      point?.value
        ?? point?.endingResources
        ?? point?.availableResources
        ?? point?.endingAssets
        ?? point?.projectedValue
    );
  }

  function getGraphHoverPointKey(point) {
    const xRatio = toOptionalNumber(point?.xRatio);
    if (xRatio == null) {
      return "";
    }
    return xRatio.toFixed(6);
  }

  function getSelectedScenarioHoverPoints(graphModel) {
    const selectedSeries = getSelectedAppliedGraphSeries(graphModel, graphModel?.trace?.selectedScenarioId);
    if (!selectedSeries) {
      return [];
    }

    const preDeathPoints = Array.isArray(selectedSeries.preDeathContextPoints) ? selectedSeries.preDeathContextPoints : [];
    const fundedRunwayPoints = Array.isArray(selectedSeries.fundedRunwayPoints) ? selectedSeries.fundedRunwayPoints : [];
    const deficitPoints = Array.isArray(selectedSeries.deficitPoints) ? selectedSeries.deficitPoints : [];
    const fallbackPoints = (!preDeathPoints.length && !fundedRunwayPoints.length && !deficitPoints.length && Array.isArray(selectedSeries.points))
      ? selectedSeries.points
      : [];
    const pointsByX = new Map();
    function addHoverPoints(points, phase, phaseOrder) {
      points.forEach(function (point) {
        if (!hasGraphPosition(point)) {
          return;
        }
        const value = getGraphHoverPointValue(point);
        if (value == null) {
          return;
        }
        const key = getGraphHoverPointKey(point);
        if (!key) {
          return;
        }
        const hoverPoint = Object.assign({}, point, {
          value,
          scenarioId: selectedSeries.scenarioId || "",
          scenarioLabel: normalizeString(selectedSeries.label) || "Selected scenario",
          hoverPhase: phase,
          hoverPhaseOrder: phaseOrder
        });
        if (getStableGraphLayoutFrame(graphModel)) {
          hoverPoint.xRatio = getLayoutFrameXRatio(graphModel, point.xRatio, hoverPoint);
          hoverPoint.yRatio = getLayoutFrameYRatio(graphModel, point.yRatio, hoverPoint);
        }
        pointsByX.set(`${phase}:${key}`, hoverPoint);
      });
    }

    addHoverPoints(preDeathPoints, "preDeath", 0);
    addHoverPoints(fundedRunwayPoints, "postDeath", 1);
    addHoverPoints(deficitPoints, "deficit", 2);
    addHoverPoints(fallbackPoints, "fallback", 1);

    const points = Array.from(pointsByX.values()).sort(function (left, right) {
      const xDelta = toOptionalNumber(left.xRatio) - toOptionalNumber(right.xRatio);
      if (Math.abs(xDelta) > 0.000001) {
        return xDelta;
      }
      return (toOptionalNumber(left.hoverPhaseOrder) || 0) - (toOptionalNumber(right.hoverPhaseOrder) || 0);
    });
    return points;
  }

  function getInterpolatedGraphHoverPointAtXRatio(points, xRatio) {
    if (!Array.isArray(points) || points.length < 1) {
      return null;
    }
    const targetXRatio = toOptionalNumber(xRatio);
    if (targetXRatio == null) {
      return null;
    }
    const firstPoint = points[0];
    const lastPoint = points[points.length - 1];
    if (targetXRatio <= toOptionalNumber(firstPoint?.xRatio)) {
      return firstPoint;
    }
    if (targetXRatio >= toOptionalNumber(lastPoint?.xRatio)) {
      return lastPoint;
    }

    for (let index = 0; index < points.length - 1; index += 1) {
      const startPoint = points[index];
      const endPoint = points[index + 1];
      const startXRatio = toOptionalNumber(startPoint?.xRatio);
      const endXRatio = toOptionalNumber(endPoint?.xRatio);
      if (startXRatio == null || endXRatio == null || endXRatio <= startXRatio) {
        continue;
      }
      if (targetXRatio < startXRatio || targetXRatio >= endXRatio) {
        continue;
      }

      const startYRatio = toOptionalNumber(startPoint?.yRatio);
      const endYRatio = toOptionalNumber(endPoint?.yRatio);
      const startValue = getGraphHoverPointValue(startPoint);
      const endValue = getGraphHoverPointValue(endPoint);
      if (startYRatio == null || endYRatio == null || startValue == null || endValue == null) {
        return null;
      }
      const progress = (targetXRatio - startXRatio) / (endXRatio - startXRatio);
      return {
        xRatio: targetXRatio,
        yRatio: startYRatio + ((endYRatio - startYRatio) * progress),
        value: startValue + ((endValue - startValue) * progress),
        scenarioId: startPoint.scenarioId || endPoint.scenarioId || "",
        scenarioLabel: normalizeString(startPoint.scenarioLabel || endPoint.scenarioLabel) || "Selected scenario",
        hoverPhase: normalizeString(startPoint.hoverPhase || endPoint.hoverPhase),
        date: normalizeString(endPoint.date || startPoint.date)
      };
    }

    return null;
  }

  function getInterpolatedGraphHoverInterval(points, startX, endX) {
    const startCoordinate = toOptionalNumber(startX);
    const endCoordinate = toOptionalNumber(endX);
    if (startCoordinate == null || endCoordinate == null || endCoordinate <= startCoordinate) {
      return null;
    }
    const x = startCoordinate + ((endCoordinate - startCoordinate) / 2);
    const point = getInterpolatedGraphHoverPointAtXRatio(points, toGraphXRatio(x));
    if (!point) {
      return null;
    }
    const y = toGraphY(point.yRatio);
    return Object.assign({}, point, {
      pointY: clampNumber(y, GRAPH_VIEW_BOX.plotTop, GRAPH_VIEW_BOX.plotTop + GRAPH_VIEW_BOX.plotHeight),
      x,
      startX: startCoordinate,
      endX: endCoordinate,
      intervalWidth: endCoordinate - startCoordinate
    });
  }

  function getGraphHoverInspectionIntervals(points) {
    if (!Array.isArray(points) || points.length < 2) {
      return [];
    }
    const firstPoint = points[0];
    const lastPoint = points[points.length - 1];
    const sourceStartX = toGraphX(firstPoint.xRatio);
    const sourceEndX = toGraphX(lastPoint.xRatio);
    if (sourceEndX - sourceStartX < GRAPH_HOVER_GRID_SPACING) {
      return [];
    }

    const gridOffset = sourceStartX - GRAPH_VIEW_BOX.plotLeft;
    const firstBoundaryX = GRAPH_VIEW_BOX.plotLeft + (Math.ceil(gridOffset / GRAPH_HOVER_GRID_SPACING) * GRAPH_HOVER_GRID_SPACING);
    const intervals = [];
    for (
      let startX = firstBoundaryX;
      startX + GRAPH_HOVER_GRID_SPACING <= sourceEndX;
      startX += GRAPH_HOVER_GRID_SPACING
    ) {
      const interval = getInterpolatedGraphHoverInterval(points, startX, startX + GRAPH_HOVER_GRID_SPACING);
      if (interval) {
        intervals.push(interval);
      }
    }
    return intervals;
  }

  function getGraphHoverDividers(intervals, points) {
    if (!Array.isArray(intervals) || !intervals.length) {
      return [];
    }
    const buildDivider = function (x, scenarioId) {
      const point = getInterpolatedGraphHoverPointAtXRatio(points, toGraphXRatio(x));
      const y = toGraphY(point?.yRatio);
      return {
        x,
        pointY: clampNumber(y, GRAPH_VIEW_BOX.plotTop, GRAPH_VIEW_BOX.plotTop + GRAPH_VIEW_BOX.plotHeight),
        scenarioId: scenarioId || point?.scenarioId || "",
        hoverPhase: normalizeString(point?.hoverPhase)
      };
    };
    const dividers = intervals.map(function (interval) {
      return buildDivider(interval.startX, interval.scenarioId);
    });
    const lastInterval = intervals[intervals.length - 1];
    dividers.push(buildDivider(lastInterval.endX, lastInterval.scenarioId));
    return dividers;
  }

  function buildGraphAreaUnderSvgPath(points, pathMode, graphModel, plotBottom) {
    const plotPoints = makePlotPoints(points, "yRatio", GRAPH_VIEW_BOX, graphModel);
    if (plotPoints.length < 2) {
      return "";
    }
    const normalizedPathMode = normalizeGraphPathMode(pathMode);
    const trendlinePath = normalizedPathMode === "step"
      ? buildStepSvgPath(plotPoints)
      : normalizedPathMode === "linear"
        ? buildLinearSvgPath(plotPoints)
      : buildTrendSvgPath(plotPoints);
    if (!trendlinePath) {
      return "";
    }
    const first = plotPoints[0];
    const last = plotPoints[plotPoints.length - 1];
    return [
      trendlinePath,
      `L${formatSvgCoordinate(last.x)} ${formatSvgCoordinate(plotBottom)}`,
      `L${formatSvgCoordinate(first.x)} ${formatSvgCoordinate(plotBottom)}`,
      "Z"
    ].join(" ");
  }

  function getGraphHoverUnderTrendlineTintAreas(graphModel, plotBottom) {
    const selectedSeries = getSelectedAppliedGraphSeries(graphModel, graphModel?.trace?.selectedScenarioId);
    if (!selectedSeries) {
      return [];
    }
    return [
      {
        phase: "preDeath",
        phaseClass: "pre-death",
        scenarioId: selectedSeries.scenarioId || "",
        points: Array.isArray(selectedSeries.preDeathContextPoints) && selectedSeries.preDeathContextPoints.length
          ? selectedSeries.preDeathContextPoints
          : (Array.isArray(graphModel?.series?.preDeathAssets) ? graphModel.series.preDeathAssets : []),
        pathMode: selectedSeries.preDeathPathMode || selectedSeries.pathMode
      },
      {
        phase: "postDeath",
        phaseClass: "post-death",
        scenarioId: selectedSeries.scenarioId || "",
        points: Array.isArray(selectedSeries.fundedRunwayPoints) && selectedSeries.fundedRunwayPoints.length
          ? selectedSeries.fundedRunwayPoints
          : (Array.isArray(selectedSeries.points) ? selectedSeries.points : []),
        pathMode: selectedSeries.pathMode
      }
    ].map(function (area, index) {
      return {
        index,
        phase: area.phase,
        phaseClass: area.phaseClass,
        scenarioId: area.scenarioId,
        d: buildGraphAreaUnderSvgPath(area.points, area.pathMode, graphModel, plotBottom)
      };
    }).filter(function (area) {
      return Boolean(area.d);
    });
  }

  function renderGraphHoverUnderlayGradient() {
    return `
      <defs>
        <linearGradient id="${GRAPH_HOVER_UNDERLAY_PRE_DEATH_GRADIENT_ID}" data-income-impact-graph-hover-underlay-gradient="preDeath" gradientUnits="objectBoundingBox" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#2563ff" stop-opacity="0.16"></stop>
          <stop offset="38%" stop-color="#2563ff" stop-opacity="0.045"></stop>
          <stop offset="72%" stop-color="#2563ff" stop-opacity="0"></stop>
          <stop offset="100%" stop-color="#2563ff" stop-opacity="0"></stop>
        </linearGradient>
        <linearGradient id="${GRAPH_HOVER_UNDERLAY_POST_DEATH_GRADIENT_ID}" data-income-impact-graph-hover-underlay-gradient="postDeath" gradientUnits="objectBoundingBox" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#2563ff" stop-opacity="0.16"></stop>
          <stop offset="38%" stop-color="#2563ff" stop-opacity="0.045"></stop>
          <stop offset="72%" stop-color="#2563ff" stop-opacity="0"></stop>
          <stop offset="100%" stop-color="#2563ff" stop-opacity="0"></stop>
        </linearGradient>
      </defs>
    `;
  }

  function renderGraphHoverLayer(graphModel) {
    const hoverPoints = getSelectedScenarioHoverPoints(graphModel);
    if (hoverPoints.length < 2) {
      return "";
    }

    const plotBottom = GRAPH_VIEW_BOX.plotTop + GRAPH_VIEW_BOX.plotHeight;
    const readoutHalfWidth = GRAPH_HOVER_READOUT_WIDTH / 2;
    const intervals = getGraphHoverInspectionIntervals(hoverPoints);
    if (!intervals.length) {
      return "";
    }
    const dividers = getGraphHoverDividers(intervals, hoverPoints);
    const tintSegments = getGraphHoverUnderTrendlineTintAreas(graphModel, plotBottom);

    return `
      <g class="income-impact-graph-hover-layer" data-income-impact-graph-hover-layer>
        ${tintSegments.length ? `
          <g class="income-impact-graph-hover-underlays" data-income-impact-graph-hover-underlays>
            ${tintSegments.map(function (segment) {
              return `
                <path
                  class="income-impact-graph-hover-underlay income-impact-graph-hover-underlay--${escapeHtml(segment.phaseClass)}"
                  data-income-impact-graph-hover-underlay="selected-trendline"
                  data-income-impact-graph-hover-underlay-phase="${escapeHtml(segment.phase)}"
                  data-income-impact-graph-hover-underlay-index="${segment.index}"
                  data-income-impact-applied-scenario-id="${escapeHtml(segment.scenarioId)}"
                  d="${escapeHtml(segment.d)}"
                ></path>
              `;
            }).join("")}
          </g>
        ` : ""}
        <g class="income-impact-graph-hover-grid" data-income-impact-graph-hover-grid>
          ${dividers.map(function (divider, index) {
          const scenarioId = normalizeString(divider.scenarioId);
          return `
            <line
              class="income-impact-graph-hover-grid-line"
              data-income-impact-graph-hover-grid-line
              data-income-impact-applied-scenario-id="${escapeHtml(scenarioId)}"
              data-income-impact-graph-hover-grid-line-index="${index}"
              data-income-impact-graph-hover-grid-line-y1="${escapeHtml(divider.pointY)}"
              data-income-impact-graph-hover-grid-line-y2="${plotBottom}"
              x1="${formatSvgCoordinate(divider.x)}"
              x2="${formatSvgCoordinate(divider.x)}"
              y1="${formatSvgCoordinate(divider.pointY)}"
              y2="${plotBottom}"
            ></line>
          `;
        }).join("")}
        </g>
        <g class="income-impact-graph-hover-intervals" data-income-impact-graph-hover-intervals>
          ${intervals.map(function (interval, index) {
          const readoutX = clampNumber(
            interval.x,
            GRAPH_VIEW_BOX.plotLeft + readoutHalfWidth,
            GRAPH_VIEW_BOX.plotLeft + GRAPH_VIEW_BOX.plotWidth - readoutHalfWidth
          );
          const readoutY = clampNumber(interval.pointY - 14, GRAPH_VIEW_BOX.plotTop + 18, plotBottom - 10);
          const value = getGraphHoverPointValue(interval);
          const valueLabel = formatCurrency(value);
          const dateLabel = normalizeString(interval.date);
          const scenarioId = normalizeString(interval.scenarioId);
          const ariaLabel = `${interval.scenarioLabel}: ${valueLabel} remaining${dateLabel ? ` near ${dateLabel}` : ""}`;
          return `
            <g
              class="income-impact-graph-hover-interval"
              data-income-impact-graph-hover-interval
              data-income-impact-applied-scenario-id="${escapeHtml(scenarioId)}"
              data-income-impact-graph-hover-index="${index}"
              data-income-impact-graph-hover-value="${escapeHtml(value)}"
              data-income-impact-graph-hover-label="${escapeHtml(valueLabel)}"
              data-income-impact-graph-hover-x-ratio="${escapeHtml(interval.xRatio)}"
              data-income-impact-graph-hover-y-ratio="${escapeHtml(interval.yRatio)}"
              data-income-impact-graph-hover-interval-width="${escapeHtml(interval.intervalWidth)}"
              data-income-impact-graph-hover-point-y="${escapeHtml(interval.pointY)}"
              tabindex="0"
              role="button"
              aria-label="${escapeHtml(ariaLabel)}"
            >
              <rect
                class="income-impact-graph-hover-slot"
                data-income-impact-graph-hover-slot
                x="${formatSvgCoordinate(interval.startX)}"
                y="${GRAPH_VIEW_BOX.plotTop}"
                width="${formatSvgCoordinate(interval.intervalWidth)}"
                height="${GRAPH_VIEW_BOX.plotHeight}"
              ></rect>
              <line
                class="income-impact-graph-hover-active-line"
                data-income-impact-graph-hover-active-line
                x1="${formatSvgCoordinate(interval.x)}"
                x2="${formatSvgCoordinate(interval.x)}"
                y1="${GRAPH_VIEW_BOX.plotTop}"
                y2="${plotBottom}"
              ></line>
              <g
                class="income-impact-graph-hover-readout"
                data-income-impact-graph-hover-readout
                transform="translate(${formatSvgCoordinate(readoutX)} ${formatSvgCoordinate(readoutY)})"
              >
                <rect x="${formatSvgCoordinate(-readoutHalfWidth)}" y="-24" width="${GRAPH_HOVER_READOUT_WIDTH}" height="22" rx="6"></rect>
                <text y="-9" text-anchor="middle">${escapeHtml(valueLabel)}</text>
              </g>
            </g>
          `;
        }).join("")}
        </g>
      </g>
    `;
  }

  function getGraphXAxisSecondaryLabel(tick, xAxisMode) {
    if (xAxisMode === "deathRelativeYears") {
      return normalizeString(tick?.secondaryLabel);
    }
    return normalizeString(tick?.secondaryLabel || tick?.date);
  }

  function renderGraphAxis(graphModel) {
    const yTicks = Array.isArray(graphModel?.axes?.y?.ticks) ? graphModel.axes.y.ticks : [];
    const xTicks = Array.isArray(graphModel?.axes?.x?.ticks) ? graphModel.axes.x.ticks : [];
    const xAxisMode = normalizeString(graphModel?.axes?.x?.xAxisMode || graphModel?.trace?.xAxisMode);
    const zeroYRatio = getStableGraphLayoutFrame(graphModel)
      ? toOptionalNumber(graphModel?.layoutFrame?.zeroYRatio)
      : toOptionalNumber(graphModel?.axes?.y?.zeroYRatio);
    return `
      <g class="income-impact-graph-axis" data-income-impact-graph-axis="y">
        ${yTicks.map(function (tick) {
          const y = toGraphY(tick.yRatio, graphModel, tick);
          return `
            <g data-income-impact-graph-y-tick>
              <line class="income-impact-graph-y-grid-line" data-income-impact-graph-y-grid-line x1="${GRAPH_VIEW_BOX.plotLeft}" y1="${y}" x2="${GRAPH_VIEW_BOX.plotLeft + GRAPH_VIEW_BOX.plotWidth}" y2="${y}"></line>
              <text class="income-impact-graph-y-tick-label" x="${GRAPH_VIEW_BOX.plotLeft - 28}" y="${y + 4}" text-anchor="end">${escapeHtml(formatAxisCurrency(tick.value))}</text>
              <g class="income-impact-graph-y-tick-marker" data-income-impact-graph-y-tick-marker aria-hidden="true">
                <circle cx="${GRAPH_VIEW_BOX.plotLeft - 18}" cy="${y}" r="3.3"></circle>
                <path d="M ${GRAPH_VIEW_BOX.plotLeft - 12} ${y} L ${GRAPH_VIEW_BOX.plotLeft - 2} ${y} M ${GRAPH_VIEW_BOX.plotLeft - 7} ${y - 5} L ${GRAPH_VIEW_BOX.plotLeft - 2} ${y} L ${GRAPH_VIEW_BOX.plotLeft - 7} ${y + 5}"></path>
              </g>
            </g>
          `;
        }).join("")}
        ${zeroYRatio != null ? `
          <line class="income-impact-graph-zero-baseline" data-income-impact-graph-zero-baseline x1="${GRAPH_VIEW_BOX.plotLeft}" y1="${toGraphY(zeroYRatio, graphModel, { value: 0 })}" x2="${GRAPH_VIEW_BOX.plotLeft + GRAPH_VIEW_BOX.plotWidth}" y2="${toGraphY(zeroYRatio, graphModel, { value: 0 })}"></line>
        ` : ""}
      </g>
      <g class="income-impact-graph-axis" data-income-impact-graph-axis="x">
        ${xTicks.map(function (tick) {
          const x = toGraphX(tick.xRatio, graphModel, tick);
          const secondaryLabel = getGraphXAxisSecondaryLabel(tick, xAxisMode);
          return `
            <g
              data-income-impact-graph-x-tick="${escapeHtml(tick.id || "")}"
              data-income-impact-graph-x-tick-label="${escapeHtml(tick.label || "")}"
              data-income-impact-graph-x-tick-date="${escapeHtml(tick.date || "")}"
              data-income-impact-graph-x-tick-relative-years="${escapeHtml(tick.relativeYears == null ? "" : tick.relativeYears)}"
            >
              <line class="income-impact-graph-x-grid-line" data-income-impact-graph-x-grid-line x1="${x}" y1="${GRAPH_VIEW_BOX.plotTop}" x2="${x}" y2="${GRAPH_VIEW_BOX.plotTop + GRAPH_VIEW_BOX.plotHeight}"></line>
              <circle class="income-impact-graph-x-tick-dot" data-income-impact-graph-x-tick-dot cx="${x}" cy="${GRAPH_VIEW_BOX.plotTop + GRAPH_VIEW_BOX.plotHeight + 16}" r="4"></circle>
              <text x="${x}" y="${GRAPH_VIEW_BOX.plotTop + GRAPH_VIEW_BOX.plotHeight + 28}" text-anchor="middle">${escapeHtml(tick.label || "")}</text>
              ${secondaryLabel ? `<text x="${x}" y="${GRAPH_VIEW_BOX.plotTop + GRAPH_VIEW_BOX.plotHeight + 48}" text-anchor="middle">${escapeHtml(secondaryLabel)}</text>` : ""}
            </g>
          `;
        }).join("")}
      </g>
    `;
  }

  function renderGraphPhases(graphModel) {
    const phases = isPlainObject(graphModel?.phases) ? graphModel.phases : {};
    const preDeath = phases.preDeath || {};
    const postDeath = phases.postDeath || {};
    const death = phases.deathEvent || {};
    const preEnd = toOptionalNumber(preDeath.endXRatio);
    const postStart = toOptionalNumber(postDeath.startXRatio);
    const deathX = toOptionalNumber(death.xRatio);
    return `
      <g class="income-impact-graph-phases" data-income-impact-graph-phases>
        ${preEnd != null && preEnd > 0 ? `
          <rect class="income-impact-graph-phase income-impact-graph-phase--pre-death" x="${GRAPH_VIEW_BOX.plotLeft}" y="${GRAPH_VIEW_BOX.plotTop}" width="${Math.max(0, toGraphX(preEnd, graphModel, preDeath) - GRAPH_VIEW_BOX.plotLeft)}" height="${GRAPH_VIEW_BOX.plotHeight}"></rect>
          <text x="${GRAPH_VIEW_BOX.plotLeft + 14}" y="${GRAPH_VIEW_BOX.plotTop + 24}">Before death</text>
        ` : ""}
        ${postStart != null && postStart < 1 ? `
          <rect class="income-impact-graph-phase income-impact-graph-phase--post-death" x="${toGraphX(postStart, graphModel, postDeath)}" y="${GRAPH_VIEW_BOX.plotTop}" width="${Math.max(0, GRAPH_VIEW_BOX.plotLeft + GRAPH_VIEW_BOX.plotWidth - toGraphX(postStart, graphModel, postDeath))}" height="${GRAPH_VIEW_BOX.plotHeight}"></rect>
        ` : ""}
        ${deathX != null ? `
          <line class="income-impact-graph-death-axis" data-income-impact-graph-death-axis x1="${toGraphX(deathX, graphModel, death)}" y1="${GRAPH_VIEW_BOX.plotTop}" x2="${toGraphX(deathX, graphModel, death)}" y2="${GRAPH_VIEW_BOX.plotTop + GRAPH_VIEW_BOX.plotHeight}"></line>
          <text class="income-impact-graph-death-label" x="${toGraphX(deathX, graphModel, death)}" y="${GRAPH_VIEW_BOX.plotTop - 12}" text-anchor="middle">Death event</text>
        ` : ""}
      </g>
    `;
  }

  function getDeathLineAnchorLabelPosition(anchor, index, graphModel = null) {
    const x = toGraphX(anchor.xRatio, graphModel, anchor);
    const label = normalizeString(anchor.label) || "Scenario";
    const width = Math.min(164, Math.max(86, 18 + (label.length * 7)));
    const plotBottom = GRAPH_VIEW_BOX.plotTop + GRAPH_VIEW_BOX.plotHeight;
    const y = GRAPH_VIEW_BOX.plotTop + GRAPH_VIEW_BOX.plotHeight - 26 - (index * 28);
    const labelX = Math.min(
      GRAPH_VIEW_BOX.plotLeft + GRAPH_VIEW_BOX.plotWidth - width - 8,
      Math.max(GRAPH_VIEW_BOX.plotLeft + 6, x + 14 + (index * 178))
    );
    const labelY = clampNumber(
      GRAPH_VIEW_BOX.height - 10,
      plotBottom + 36,
      GRAPH_VIEW_BOX.height - 6
    );
    return {
      x,
      y: plotBottom + 8,
      labelX,
      labelY,
      width,
      height: 20,
      connectorX: labelX,
      connectorY: labelY - 6
    };
  }

  function renderAppliedScenarioDeathLineAnchors(graphModel) {
    const anchors = (Array.isArray(graphModel?.series?.appliedRunwayScenarios)
      ? graphModel.series.appliedRunwayScenarios
      : [])
      .map(function (series) {
        return isPlainObject(series?.deathLineAnchor) ? series.deathLineAnchor : null;
      })
      .filter(function (anchor) {
        return anchor
          && toOptionalNumber(anchor.xRatio) != null
          && toOptionalNumber(anchor.yRatio) != null;
      });
    const selectedAnchor = anchors.find(function (anchor) {
      return anchor.selected === true;
    });
    const visibleAnchors = (selectedAnchor ? [selectedAnchor] : anchors).slice(0, 1);
    if (!visibleAnchors.length) {
      return "";
    }

    return `
      <g class="income-impact-death-line-anchors" data-income-impact-death-line-anchors>
        ${visibleAnchors.map(function (anchor, index) {
          const label = normalizeString(anchor.label) || "Scenario";
          const position = getDeathLineAnchorLabelPosition(anchor, index, graphModel);
          const selected = anchor.selected === true;
          return `
            <g
              class="income-impact-death-line-anchor"
              data-income-impact-death-line-anchor
              data-income-impact-applied-scenario-id="${escapeHtml(anchor.scenarioId || "")}"
              data-income-impact-applied-scenario-label="${escapeHtml(label)}"
              data-income-impact-applied-scenario-selected="${selected ? "true" : "false"}"
              data-income-impact-death-line-anchor-role="${escapeHtml(anchor.scenarioRole || "")}"
              aria-label="${escapeHtml(label)} at the death line"
            >
              <line x1="${position.x}" y1="${position.y}" x2="${position.connectorX}" y2="${position.connectorY}"></line>
              <rect x="${position.labelX}" y="${position.labelY - 18}" width="${position.width}" height="${position.height}" rx="6"></rect>
              <text data-income-impact-death-line-label x="${position.labelX + 9}" y="${position.labelY - 4}">${escapeHtml(label)}</text>
              <title>${escapeHtml(label)} death-line anchor</title>
            </g>
          `;
        }).join("")}
      </g>
    `;
  }

  function shouldRenderGraphMarker(marker) {
    const ruleId = normalizeString(marker?.ruleId || marker?.id);
    const phase = normalizeString(marker?.phase);
    return phase !== "deathEvent"
      && ruleId !== "coverage-added-at-death"
      && ruleId !== "survivor-resources-depleted"
      && ruleId !== "accumulated-unmet-need";
  }

  function renderGraphMarkers(graphModel) {
    const markers = (Array.isArray(graphModel?.markers) ? graphModel.markers : []).filter(function (marker) {
      return shouldRenderGraphMarker(marker)
        && marker?.positionable
        && toOptionalNumber(marker.xRatio) != null
        && toOptionalNumber(marker.yRatio) != null;
    });
    if (!markers.length) {
      return "";
    }
    return `
      <g class="income-impact-graph-markers" data-income-impact-graph-markers>
        ${markers.map(function (marker) {
          const x = toGraphX(marker.xRatio, graphModel, marker);
          const y = toGraphY(marker.yRatio, graphModel, marker);
          const radius = marker.kind === "stable" ? 4 : 5;
          return `
            <g
              data-income-impact-graph-marker
              data-income-impact-graph-marker-kind="${escapeHtml(marker.kind)}"
              data-income-impact-graph-marker-severity="${escapeHtml(marker.severity || "")}"
              data-income-impact-graph-marker-rule-id="${escapeHtml(marker.ruleId || marker.id || "")}"
              transform="translate(${x} ${y})"
            >
              <circle r="${radius}"></circle>
              <title>${escapeHtml(marker.title || marker.markerLabel || "Scenario marker")}</title>
            </g>
          `;
        }).join("")}
      </g>
    `;
  }

  function getComparisonMarkerLabelOffset(markerType, index) {
    if (markerType === "comparisonAction") {
      return { x: 10, y: -18 };
    }
    if (markerType === "comparisonPause") {
      return { x: 10, y: 28 };
    }
    if (markerType === "baseDepletion") {
      return { x: -112, y: -16 };
    }
    if (markerType === "lifestyleDepletion") {
      return { x: 10, y: -34 };
    }
    if (markerType === "shortfallRemains") {
      return { x: 10, y: 42 };
    }
    return { x: 10, y: index % 2 === 0 ? -18 : 28 };
  }

  function shouldRenderComparisonMarkerLabel(markerType) {
    return markerType !== "comparisonAction" && markerType !== "comparisonPause";
  }

  function shouldRenderComparisonMarker(markerType) {
    return markerType !== "shortfallRemains";
  }

  function getComparisonMarkerTitle(marker) {
    const label = normalizeString(marker?.label || "Comparison event");
    const summary = normalizeString(marker?.summary);
    return summary && summary !== label ? `${label}: ${summary}` : label;
  }

  function renderComparisonMarkers(graphModel) {
    const markers = (Array.isArray(graphModel?.comparisonMarkers) ? graphModel.comparisonMarkers : []).filter(function (marker) {
      return shouldRenderComparisonMarker(marker?.markerType)
        && marker?.positionable
        && toOptionalNumber(marker.xRatio) != null
        && toOptionalNumber(marker.yRatio) != null;
    });
    if (!markers.length) {
      return "";
    }
    return `
      <g class="income-impact-comparison-markers" data-income-impact-comparison-markers>
        ${markers.map(function (marker, index) {
          const x = toGraphX(marker.xRatio, graphModel, marker);
          const y = toGraphY(marker.yRatio, graphModel, marker);
          const labelOffset = getComparisonMarkerLabelOffset(marker.markerType, index);
          const labelX = labelOffset.x;
          const labelY = labelOffset.y;
          const renderLabel = shouldRenderComparisonMarkerLabel(marker.markerType);
          return `
            <g
              class="income-impact-comparison-marker income-impact-comparison-marker--${escapeHtml(marker.markerType || "event")}"
              data-income-impact-comparison-marker
              data-income-impact-comparison-marker-type="${escapeHtml(marker.markerType || "")}"
              data-income-impact-comparison-marker-scenario-id="${escapeHtml(marker.scenarioId || "")}"
              transform="translate(${x} ${y})"
            >
              ${renderLabel ? `<line x1="0" y1="0" x2="${labelX}" y2="${labelY}"></line>` : ""}
              <circle r="4"></circle>
              ${renderLabel ? `<text x="${labelX}" y="${labelY}" text-anchor="${labelX < 0 ? "end" : "start"}">${escapeHtml(marker.label || "Comparison event")}</text>` : ""}
              <title>${escapeHtml(getComparisonMarkerTitle(marker))}</title>
            </g>
          `;
        }).join("")}
      </g>
    `;
  }

  function getStorylineCandidateTiming(candidate) {
    return isPlainObject(candidate?.timing) ? candidate.timing : {};
  }

  function getStorylineCandidateAmount(candidate) {
    return isPlainObject(candidate?.amount) ? candidate.amount : {};
  }

  function getGraphStorylineEventDate(candidate) {
    return normalizeDateOnly(getStorylineCandidateTiming(candidate).date || candidate?.date || "");
  }

  function getGraphStorylineEventMonthOffset(candidate, graphModel) {
    const timing = getStorylineCandidateTiming(candidate);
    const explicitMonth = toOptionalNumber(timing.monthOffset ?? candidate?.monthOffset);
    if (explicitMonth != null) {
      return explicitMonth;
    }
    if (candidate?.id === "death-income-stops" || normalizeString(timing.kind) === "death-event") {
      return 0;
    }
    const eventDate = getGraphStorylineEventDate(candidate);
    const deathDate = normalizeDateOnly(graphModel?.phases?.deathEvent?.date || graphModel?.axes?.x?.deathDate || "");
    if (!eventDate || !deathDate) {
      return null;
    }
    return getMonthDifferenceFromDates(deathDate, eventDate);
  }

  function addGraphStorylineTimelineAnchor(anchorsByMonth, monthOffset, xRatio, date) {
    const month = toOptionalNumber(monthOffset);
    const x = toOptionalNumber(xRatio);
    if (month == null || x == null) {
      return;
    }
    const key = String(month);
    if (!anchorsByMonth.has(key)) {
      anchorsByMonth.set(key, {
        monthOffset: month,
        xRatio: clampNumber(x, 0, 1),
        date: normalizeDateOnly(date || "")
      });
    }
  }

  function getGraphStorylineTimelineAnchors(graphModel) {
    const anchorsByMonth = new Map();
    addGraphStorylineTimelineAnchor(
      anchorsByMonth,
      0,
      graphModel?.phases?.deathEvent?.xRatio ?? graphModel?.axes?.x?.deathXRatio,
      graphModel?.phases?.deathEvent?.date ?? graphModel?.axes?.x?.deathDate
    );

    (Array.isArray(graphModel?.axes?.x?.ticks) ? graphModel.axes.x.ticks : []).forEach(function (tick) {
      const relativeMonths = toOptionalNumber(tick?.relativeMonths ?? (
        toOptionalNumber(tick?.relativeYears) == null ? null : toOptionalNumber(tick.relativeYears) * 12
      ));
      addGraphStorylineTimelineAnchor(anchorsByMonth, relativeMonths, tick?.xRatio, tick?.date);
    });

    const seriesBuckets = [
      graphModel?.series?.preDeathAssets,
      graphModel?.series?.postDeathResources,
      graphModel?.series?.currentAnchor ? [graphModel.series.currentAnchor] : [],
      graphModel?.series?.appliedRunwayScenarios?.flatMap(function (series) {
        return []
          .concat(Array.isArray(series?.preDeathContextPoints) ? series.preDeathContextPoints : [])
          .concat(series?.survivorResourcesAtDeathPoint ? [series.survivorResourcesAtDeathPoint] : [])
          .concat(Array.isArray(series?.fundedRunwayPoints) ? series.fundedRunwayPoints : [])
          .concat(Array.isArray(series?.deficitPoints) ? series.deficitPoints : []);
      })
    ];

    seriesBuckets.flat().filter(Boolean).forEach(function (point) {
      const relativeMonths = toOptionalNumber(
        point?.relativeMonthsFromDeath ??
          point?.monthOffset ??
          point?.monthIndex ??
          point?.monthsAfterDeath
      );
      addGraphStorylineTimelineAnchor(anchorsByMonth, relativeMonths, point?.xRatio, point?.date);
    });

    return Array.from(anchorsByMonth.values()).sort(function (left, right) {
      return left.monthOffset - right.monthOffset;
    });
  }

  function getGraphStorylineDotXRatio(candidate, graphModel, anchors) {
    const explicitXRatio = toOptionalNumber(candidate?.xRatio ?? candidate?.timing?.xRatio);
    if (explicitXRatio != null) {
      return clampNumber(explicitXRatio, 0, 1);
    }

    const monthOffset = getGraphStorylineEventMonthOffset(candidate, graphModel);
    if (monthOffset == null) {
      return null;
    }
    if (!Array.isArray(anchors) || !anchors.length) {
      return monthOffset === 0 ? toOptionalNumber(graphModel?.phases?.deathEvent?.xRatio) : null;
    }

    const exactAnchor = anchors.find(function (anchor) {
      return Math.abs(anchor.monthOffset - monthOffset) <= 0.000001;
    });
    if (exactAnchor) {
      return exactAnchor.xRatio;
    }

    if (monthOffset <= anchors[0].monthOffset) {
      return anchors[0].xRatio;
    }
    if (monthOffset >= anchors[anchors.length - 1].monthOffset) {
      return anchors[anchors.length - 1].xRatio;
    }

    for (let index = 0; index < anchors.length - 1; index += 1) {
      const start = anchors[index];
      const end = anchors[index + 1];
      if (monthOffset < start.monthOffset || monthOffset > end.monthOffset || end.monthOffset <= start.monthOffset) {
        continue;
      }
      const progress = (monthOffset - start.monthOffset) / (end.monthOffset - start.monthOffset);
      return start.xRatio + ((end.xRatio - start.xRatio) * progress);
    }
    return null;
  }

  function getGraphStorylineDotTimeLabel(candidate) {
    const timing = getStorylineCandidateTiming(candidate);
    const label = normalizeString(timing.label);
    if (label) {
      return label;
    }
    const monthOffset = toOptionalNumber(timing.monthOffset ?? candidate?.monthOffset);
    if (monthOffset != null) {
      if (monthOffset === 0) {
        return "At death";
      }
      const roundedMonth = Math.max(0, Math.round(monthOffset));
      return `Month ${roundedMonth}`;
    }
    const date = getGraphStorylineEventDate(candidate);
    return date || "Timeline event";
  }

  function getGraphStorylineDotAmountLabel(candidate) {
    const amount = getStorylineCandidateAmount(candidate);
    return normalizeString(amount.label) || (toOptionalNumber(amount.value) == null ? "" : formatCurrency(amount.value));
  }

  function getGraphStorylineDotEvidenceLabel(candidate) {
    const evidence = normalizeString(candidate?.evidenceLevel);
    if (!evidence) {
      return "";
    }
    return evidence
      .replace(/-/g, " ")
      .replace(/\b\w/g, function (letter) { return letter.toUpperCase(); });
  }

  function getGraphStorylineDotTitle(candidate) {
    return normalizeString(candidate?.graphLabel || candidate?.displayLabel || candidate?.cardTitle || candidate?.id) || "Storyline event";
  }

  function getGraphStorylineReadoutSafeLabel(value, maxLength) {
    const label = normalizeString(value);
    const limit = Math.max(12, Number(maxLength) || 34);
    if (label.length <= limit) {
      return label;
    }
    return `${label.slice(0, limit - 1).trim()}...`;
  }

  function getGraphStorylineDotTier(candidate) {
    return normalizeString(candidate?.dotTier) === "major" ? "major" : "micro";
  }

  function isGraphStorylineConnectorEligible(candidate) {
    return getGraphStorylineDotTier(candidate) === "major"
      && candidate?.connectedToMajorCard === true
      && candidate?.eligibleForConnector === true;
  }

  function isDeathStorylineCandidate(candidate) {
    return normalizeString(candidate?.id) === "death-income-stops";
  }

  function isRunOutStorylineCandidate(candidate) {
    return normalizeString(candidate?.id) === "resources-run-out";
  }

  function getLedgerStorylineTrace(candidate) {
    const trace = isPlainObject(candidate?.trace) ? candidate.trace : {};
    if (normalizeString(candidate?.candidateSource) === "asset-depletion-ledger"
      || normalizeString(trace.candidateSource) === "asset-depletion-ledger"
      || normalizeString(trace.ledgerEventType)) {
      return trace;
    }
    return null;
  }

  function getLedgerStorylineEventActionLabel(candidate) {
    const ledgerEventType = normalizeString(getLedgerStorylineTrace(candidate)?.ledgerEventType);
    if (ledgerEventType === "bucket-tapped") {
      return "Bucket tapped";
    }
    if (ledgerEventType === "bucket-depleted") {
      return "Bucket depleted";
    }
    return "";
  }

  function getLedgerStorylineBucketLabel(candidate) {
    const trace = getLedgerStorylineTrace(candidate);
    if (!trace) {
      return "";
    }
    const family = normalizeString(trace.family || candidate?.bucketFamily || candidate?.family);
    const labels = {
      cash: "Cash reserve",
      cashWaterfall: "Cash reserve",
      "cash-waterfall": "Cash reserve",
      emergencyFund: "Emergency fund",
      taxableInvestments: "Taxable assets",
      taxableInvestment: "Taxable assets",
      otherLiquid: "Liquid assets",
      educationSavings: "Education savings",
      "education-waterfall": "Education savings",
      retirementAssets: "Retirement assets",
      "retirement-waterfall": "Retirement assets"
    };
    return labels[family] || getGraphStorylineReadoutSafeLabel(family.replace(/-/g, " "), 26);
  }

  function getLedgerStorylineAmountLabels(candidate) {
    const trace = getLedgerStorylineTrace(candidate);
    if (!trace) {
      return [];
    }
    const action = getLedgerStorylineEventActionLabel(candidate);
    const labels = [];
    const amountAtTap = toOptionalNumber(trace.amountAtTap);
    const amountDepleted = toOptionalNumber(trace.amountDepleted);
    const withdrawalAmount = toOptionalNumber(trace.withdrawalAmount);
    const balanceBeforeWithdrawal = toOptionalNumber(trace.balanceBeforeWithdrawal);
    if (action === "Bucket tapped" && amountAtTap != null) {
      labels.push(`Available at tap: ${formatCurrency(amountAtTap)}`);
    }
    if (action === "Bucket depleted") {
      if (balanceBeforeWithdrawal != null) {
        labels.push(`Balance before: ${formatCurrency(balanceBeforeWithdrawal)}`);
      }
      if (amountDepleted != null) {
        labels.push(`Depleted: ${formatCurrency(amountDepleted)}`);
      }
    }
    if (withdrawalAmount != null) {
      labels.push(`Withdrawal: ${formatCurrency(withdrawalAmount)}`);
    }
    return labels.filter(Boolean).slice(0, 2);
  }

  function getLedgerStorylineSummaryLabel(candidate) {
    const action = getLedgerStorylineEventActionLabel(candidate);
    if (!action) {
      return "";
    }
    const bucketLabel = getLedgerStorylineBucketLabel(candidate);
    const amountLabels = getLedgerStorylineAmountLabels(candidate);
    const amountLabel = amountLabels.length
      ? amountLabels[0].replace(/^Available at tap: /, "").replace(/^Balance before: /, "").replace(/^Depleted: /, "")
      : getGraphStorylineDotAmountLabel(candidate);
    return [action, bucketLabel, amountLabel].filter(Boolean).join(" - ");
  }

  function getGraphStorylineEventGroupKey(dot) {
    const monthKey = dot.monthOffset == null ? normalizeString(dot.date) : String(Math.round(dot.monthOffset * 1000) / 1000);
    return [
      monthKey,
      Math.round(dot.x * 10) / 10,
      Math.round(dot.y * 10) / 10
    ].join("|");
  }

  function getPrimaryGraphStorylineGroupDot(dots) {
    return dots.slice().sort(function (left, right) {
      const tierDelta = (right.dotTier === "major" ? 1 : 0) - (left.dotTier === "major" ? 1 : 0);
      return tierDelta || left.index - right.index;
    })[0];
  }

  function getGraphStorylineEventDotGroups(dots) {
    const groupsByKey = new Map();
    dots.forEach(function (dot) {
      const key = getGraphStorylineEventGroupKey(dot);
      const groupDots = groupsByKey.get(key) || [];
      groupDots.push(dot);
      groupsByKey.set(key, groupDots);
    });
    return Array.from(groupsByKey.values()).map(function (groupDots) {
      const primaryDot = getPrimaryGraphStorylineGroupDot(groupDots);
      const orderedDots = groupDots.slice().sort(function (left, right) {
        const tierDelta = (right.dotTier === "major" ? 1 : 0) - (left.dotTier === "major" ? 1 : 0);
        return tierDelta || left.index - right.index;
      });
      return {
        dots: orderedDots,
        primaryDot,
        count: orderedDots.length,
        grouped: orderedDots.length > 1,
        dotTier: orderedDots.some(function (dot) { return dot.dotTier === "major"; }) ? "major" : "micro"
      };
    }).sort(function (left, right) {
      return left.primaryDot.index - right.primaryDot.index;
    });
  }

  function getGraphStorylineGroupReadoutLines(group) {
    const primaryDot = group.primaryDot;
    if (group.grouped) {
      const monthLabel = primaryDot.timeLabel || "this point";
      return [
        {
          className: "income-impact-storyline-dot-readout-title",
          text: `${group.count} events in ${monthLabel}`
        }
      ].concat(group.dots.flatMap(function (dot) {
        const title = getGraphStorylineReadoutSafeLabel(dot.title, 34);
        const ledgerSummary = getGraphStorylineReadoutSafeLabel(getLedgerStorylineSummaryLabel(dot.candidate), 44);
        return [
          {
            className: "income-impact-storyline-dot-readout-group-item",
            text: title
          },
          {
            className: "income-impact-storyline-dot-readout-group-meta",
            text: ledgerSummary || dot.amountLabel || dot.evidenceLabel || dot.timeLabel
          }
        ].filter(function (line) { return normalizeString(line.text); });
      }));
    }

    const candidate = primaryDot.candidate;
    const action = getLedgerStorylineEventActionLabel(candidate);
    const bucketLabel = getLedgerStorylineBucketLabel(candidate);
    const ledgerAmountLabels = getLedgerStorylineAmountLabels(candidate);
    return [
      {
        className: "income-impact-storyline-dot-readout-title",
        text: getGraphStorylineReadoutSafeLabel(primaryDot.title, 34)
      },
      {
        className: "income-impact-storyline-dot-readout-time",
        text: primaryDot.timeLabel
      },
      {
        className: "income-impact-storyline-dot-readout-action",
        text: [action, bucketLabel].filter(Boolean).join(" - ")
      }
    ].concat(
      ledgerAmountLabels.map(function (label) {
        return {
          className: "income-impact-storyline-dot-readout-amount",
          text: getGraphStorylineReadoutSafeLabel(label, 42)
        };
      }),
      ledgerAmountLabels.length ? [] : [{
        className: "income-impact-storyline-dot-readout-amount",
        text: primaryDot.amountLabel
      }],
      [{
        className: "income-impact-storyline-dot-readout-evidence",
        text: primaryDot.evidenceLabel
      }]
    ).filter(function (line) {
      return normalizeString(line.text);
    });
  }

  function getFinancialStorylineCandidateById(timelineResult, eventId) {
    const normalizedId = normalizeString(eventId);
    if (!normalizedId) {
      return null;
    }
    const storyline = isPlainObject(timelineResult?.financialStoryline)
      ? timelineResult.financialStoryline
      : {};
    const lists = [
      storyline.graphDotCandidates,
      storyline.majorGraphDotCandidates,
      storyline.majorStoryCandidates
    ];
    for (const list of lists) {
      const match = (Array.isArray(list) ? list : []).find(function (candidate) {
        return normalizeString(candidate?.id) === normalizedId;
      });
      if (match) {
        return match;
      }
    }
    return null;
  }

  function getReusableDepletionStorylineTarget(candidate, graphModel) {
    if (!isRunOutStorylineCandidate(candidate)) {
      return null;
    }
    const markers = getAppliedScenarioDepletionMarkers(graphModel, graphModel?.trace?.selectedScenarioId);
    const marker = markers.find(function (candidateMarker) {
      return candidateMarker?.selected === true;
    }) || markers[0] || null;
    if (!marker || toOptionalNumber(marker.xRatio) == null || toOptionalNumber(marker.yRatio) == null) {
      return null;
    }
    return {
      x: toGraphX(marker.xRatio, graphModel, marker),
      y: toGraphY(marker.yRatio, graphModel, marker),
      xRatio: marker.xRatio,
      yRatio: marker.yRatio,
      source: "runway-depletion-marker"
    };
  }

  function getGraphStorylineEventDots(timelineResult, graphModel) {
    const candidates = Array.isArray(timelineResult?.financialStoryline?.graphDotCandidates)
      ? timelineResult.financialStoryline.graphDotCandidates
      : [];
    if (!candidates.length) {
      return [];
    }
    const anchors = getGraphStorylineTimelineAnchors(graphModel);
    return candidates.slice(0, GRAPH_STORYLINE_EVENT_DOT_LIMIT).map(function (candidate, index) {
      if (!isPlainObject(candidate)) {
        return null;
      }
      if (isDeathStorylineCandidate(candidate)) {
        return null;
      }
      if (getReusableDepletionStorylineTarget(candidate, graphModel)) {
        return null;
      }
      const trendlineCoordinate = getGraphStorylineTrendlineCoordinate(candidate, graphModel, anchors);
      if (!trendlineCoordinate || trendlineCoordinate.xRatio == null || trendlineCoordinate.yRatio == null) {
        return null;
      }
      const title = getGraphStorylineDotTitle(candidate);
      const timeLabel = getGraphStorylineDotTimeLabel(candidate);
      const amountLabel = getGraphStorylineDotAmountLabel(candidate);
      const evidenceLabel = getGraphStorylineDotEvidenceLabel(candidate);
      const dotTier = getGraphStorylineDotTier(candidate);
      return {
        candidate,
        index,
        x: toGraphX(trendlineCoordinate.xRatio, graphModel, trendlineCoordinate),
        y: toGraphY(trendlineCoordinate.yRatio, graphModel, trendlineCoordinate),
        dotTier,
        title,
        timeLabel,
        amountLabel,
        evidenceLabel,
        coordinateSource: trendlineCoordinate.source,
        monthOffset: getGraphStorylineEventMonthOffset(candidate, graphModel),
        date: getGraphStorylineEventDate(candidate)
      };
    }).filter(Boolean);
  }

  function getGraphStorylineReadoutPosition(dot) {
    const readoutHalfWidth = GRAPH_STORYLINE_EVENT_READOUT_WIDTH / 2;
    const x = clampNumber(
      dot.x,
      GRAPH_VIEW_BOX.plotLeft + readoutHalfWidth,
      GRAPH_VIEW_BOX.plotLeft + GRAPH_VIEW_BOX.plotWidth - readoutHalfWidth
    );
    const y = clampNumber(dot.y - 22, GRAPH_VIEW_BOX.plotTop + 42, GRAPH_VIEW_BOX.plotTop + GRAPH_VIEW_BOX.plotHeight - 16);
    return { x, y };
  }

  function renderGraphStorylineEventDots(timelineResult, graphModel) {
    const dots = getGraphStorylineEventDots(timelineResult, graphModel);
    if (!dots.length) {
      return "";
    }
    const dotGroups = getGraphStorylineEventDotGroups(dots);
    return `
      <g class="income-impact-storyline-trendline-markers" data-income-impact-storyline-trendline-markers aria-label="Financial storyline graph events">
        ${dotGroups.map(function (group) {
          const dot = group.primaryDot;
          const candidate = dot.candidate;
          const readout = getGraphStorylineReadoutPosition(dot);
          const readoutLines = getGraphStorylineGroupReadoutLines(group);
          const readoutHeight = Math.max(28, 14 + (readoutLines.length * 12));
          const readoutTop = -readoutHeight - 2;
          const readoutLineMarkup = readoutLines.map(function (line, lineIndex) {
            const y = readoutTop + 15 + (lineIndex * 12);
            return `<text class="${escapeHtml(line.className)}" x="0" y="${formatSvgCoordinate(y)}" text-anchor="middle">${escapeHtml(line.text)}</text>`;
          }).join("");
          const eventIds = group.dots.map(function (groupDot) {
            return normalizeString(groupDot?.candidate?.id);
          }).filter(Boolean);
          const groupFamilies = group.dots.map(function (groupDot) {
            return normalizeString(groupDot?.candidate?.family);
          }).filter(Boolean);
          const groupSeverities = group.dots.map(function (groupDot) {
            return normalizeString(groupDot?.candidate?.severity);
          }).filter(Boolean);
          const ariaLabel = [
            group.grouped ? `${group.count} events` : dot.title,
            dot.timeLabel,
            group.grouped
              ? group.dots.map(function (groupDot) { return groupDot.title; }).join("; ")
              : dot.amountLabel
          ].filter(Boolean).join(", ");
          return `
            <g
              class="income-impact-storyline-dot income-impact-storyline-dot--${escapeHtml(group.dotTier)}${group.grouped ? " income-impact-storyline-dot--grouped" : ""} income-impact-storyline-dot--severity-${escapeHtml(normalizeString(candidate.severity) || "info")} income-impact-storyline-dot--family-${escapeHtml(normalizeString(candidate.family) || "event")}"
              data-income-impact-storyline-dot
              data-income-impact-storyline-event-id="${escapeHtml(candidate.id || "")}"
              data-income-impact-storyline-event-ids="${escapeHtml(eventIds.join(" "))}"
              data-income-impact-storyline-dot-tier="${escapeHtml(group.dotTier)}"
              data-income-impact-storyline-grouped="${group.grouped ? "true" : "false"}"
              data-income-impact-storyline-group-count="${escapeHtml(group.count)}"
              data-income-impact-storyline-connected-to-major-card="${candidate.connectedToMajorCard === true ? "true" : "false"}"
              data-income-impact-storyline-eligible-for-connector="${candidate.eligibleForConnector === true ? "true" : "false"}"
              data-income-impact-storyline-family="${escapeHtml(candidate.family || "")}"
              data-income-impact-storyline-group-families="${escapeHtml(groupFamilies.join(" "))}"
              data-income-impact-storyline-severity="${escapeHtml(candidate.severity || "")}"
              data-income-impact-storyline-group-severities="${escapeHtml(groupSeverities.join(" "))}"
              data-income-impact-storyline-evidence-level="${escapeHtml(candidate.evidenceLevel || "")}"
              data-income-impact-storyline-timing-label="${escapeHtml(dot.timeLabel)}"
              data-income-impact-storyline-month-offset="${escapeHtml(dot.monthOffset == null ? "" : dot.monthOffset)}"
              data-income-impact-storyline-date="${escapeHtml(dot.date)}"
              data-income-impact-storyline-coordinate-source="${escapeHtml(dot.coordinateSource || "")}"
              transform="translate(${formatSvgCoordinate(dot.x)} ${formatSvgCoordinate(dot.y)})"
              tabindex="0"
              role="button"
              aria-label="${escapeHtml(ariaLabel)}"
            >
              <circle class="income-impact-storyline-dot-hit" data-income-impact-storyline-dot-hit r="11"></circle>
              ${group.grouped ? `<circle class="income-impact-storyline-dot-group-ring" data-income-impact-storyline-dot-group-ring r="7.2"></circle>` : ""}
              <circle class="income-impact-storyline-dot-core" data-income-impact-storyline-dot-core r="4.6"></circle>
              ${group.grouped ? `<text class="income-impact-storyline-dot-count-badge" data-income-impact-storyline-dot-count-badge x="8.5" y="-6.5" text-anchor="middle">${escapeHtml(group.count)}</text>` : ""}
              <g
                class="income-impact-storyline-dot-readout"
                data-income-impact-storyline-dot-readout
                transform="translate(${formatSvgCoordinate(readout.x - dot.x)} ${formatSvgCoordinate(readout.y - dot.y)})"
              >
                <rect x="${formatSvgCoordinate(-(GRAPH_STORYLINE_EVENT_READOUT_WIDTH / 2))}" y="${formatSvgCoordinate(readoutTop)}" width="${GRAPH_STORYLINE_EVENT_READOUT_WIDTH}" height="${readoutHeight}" rx="6"></rect>
                ${readoutLineMarkup}
              </g>
              <title>${escapeHtml(ariaLabel)}</title>
            </g>
          `;
        }).join("")}
      </g>
    `;
  }

  function getDeathStorylineMarkerTarget(candidate, graphModel) {
    if (!isDeathStorylineCandidate(candidate)) {
      return null;
    }
    const connector = getDeathConversionConnector(graphModel);
    if (!connector || connector.xRatio == null || connector.startYRatio == null || connector.endYRatio == null) {
      return null;
    }
    const x = toGraphX(connector.xRatio, graphModel, { phase: "deathEvent" });
    const y1 = toGraphY(connector.startYRatio, graphModel, { value: connector.startValue });
    const y2 = toGraphY(connector.endYRatio, graphModel, { value: connector.endValue });
    return {
      x,
      y: Math.min(y1, y2),
      source: "death-conversion-diamond"
    };
  }

  function getGraphStorylineConnectorTargets(timelineResult, graphModel) {
    const targetsByEventId = new Map();
    getGraphStorylineEventDots(timelineResult, graphModel).forEach(function (dot) {
      const eventId = normalizeString(dot?.candidate?.id);
      if (eventId && isGraphStorylineConnectorEligible(dot?.candidate) && !targetsByEventId.has(eventId)) {
        targetsByEventId.set(eventId, Object.assign({}, dot, {
          source: dot.coordinateSource || "primary-trendline-marker"
        }));
      }
    });

    const candidates = Array.isArray(timelineResult?.financialStoryline?.graphDotCandidates)
      ? timelineResult.financialStoryline.graphDotCandidates
      : [];
    candidates.forEach(function (candidate) {
      const eventId = normalizeString(candidate?.id);
      if (!eventId || !isGraphStorylineConnectorEligible(candidate) || targetsByEventId.has(eventId)) {
        return;
      }
      const reusableTarget = getDeathStorylineMarkerTarget(candidate, graphModel)
        || getReusableDepletionStorylineTarget(candidate, graphModel);
      if (reusableTarget) {
        targetsByEventId.set(eventId, {
          candidate,
          x: reusableTarget.x,
          y: reusableTarget.y,
          dotTier: getGraphStorylineDotTier(candidate),
          source: reusableTarget.source,
          monthOffset: getGraphStorylineEventMonthOffset(candidate, graphModel),
          date: getGraphStorylineEventDate(candidate)
        });
      }
    });

    return targetsByEventId;
  }

  function getGraphStorylineConnectors(timelineResult, graphModel) {
    const majorStoryCandidates = getFinancialStorylineMajorCandidates(timelineResult);
    if (!majorStoryCandidates.length) {
      return [];
    }
    const targetsByEventId = getGraphStorylineConnectorTargets(timelineResult, graphModel);
    if (!targetsByEventId.size) {
      return [];
    }

    return majorStoryCandidates.map(function (candidate, index) {
      const eventId = normalizeString(candidate?.id);
      const target = eventId ? targetsByEventId.get(eventId) : null;
      if (!target) {
        return null;
      }
      const cardAnchorX = ((index + 0.5) / FINANCIAL_STORYLINE_MAJOR_CARD_LIMIT) * GRAPH_VIEW_BOX.width;
      const startY = GRAPH_VIEW_BOX.plotTop - 8;
      const endY = Math.max(startY + 20, target.y - 12);
      return {
        candidate,
        dot: target,
        eventId,
        family: normalizeString(candidate?.family || target?.candidate?.family) || "event",
        severity: normalizeString(candidate?.severity || target?.candidate?.severity) || "info",
        cardIndex: index,
        targetSource: target.source || "primary-trendline-marker",
        path: [
          `M ${formatSvgCoordinate(cardAnchorX)} ${formatSvgCoordinate(startY)}`,
          `C ${formatSvgCoordinate(cardAnchorX)} ${formatSvgCoordinate(startY + 52)}`,
          `${formatSvgCoordinate(target.x)} ${formatSvgCoordinate(endY - 54)}`,
          `${formatSvgCoordinate(target.x)} ${formatSvgCoordinate(endY)}`
        ].join(" ")
      };
    }).filter(Boolean);
  }

  function renderGraphStorylineConnectors(timelineResult, graphModel) {
    const connectors = getGraphStorylineConnectors(timelineResult, graphModel);
    if (!connectors.length) {
      return "";
    }

    return `
      <g class="income-impact-storyline-connectors" data-income-impact-storyline-connectors aria-hidden="true">
        ${connectors.map(function (connector) {
          return `
            <path
              class="income-impact-storyline-connector income-impact-storyline-connector--severity-${escapeHtml(connector.severity)} income-impact-storyline-connector--family-${escapeHtml(connector.family)}"
              data-income-impact-storyline-connector
              data-income-impact-storyline-connector-event-id="${escapeHtml(connector.eventId)}"
              data-income-impact-storyline-connector-family="${escapeHtml(connector.family)}"
              data-income-impact-storyline-connector-severity="${escapeHtml(connector.severity)}"
              data-income-impact-storyline-connector-card-index="${escapeHtml(connector.cardIndex)}"
              data-income-impact-storyline-connector-target-source="${escapeHtml(connector.targetSource)}"
              d="${connector.path}"
            ></path>
          `;
        }).join("")}
      </g>
    `;
  }

  function renderGraphPathAttributes(attributes) {
    if (!isPlainObject(attributes)) {
      return "";
    }
    return Object.entries(attributes).map(function ([name, value]) {
      if (value == null || value === false) {
        return "";
      }
      return ` ${escapeHtml(name)}="${escapeHtml(value)}"`;
    }).join("");
  }

  function renderGraphPath(pathId, points, label, pathMode = "smooth", attributes = null, graphModel = null) {
    const normalizedPathMode = normalizeGraphPathMode(pathMode);
    const path = buildSvgPath(points, normalizedPathMode, graphModel);
    if (!path) {
      return "";
    }
    return `<path class="income-impact-graph-path income-impact-graph-path--${escapeHtml(pathId)} income-impact-graph-path--${escapeHtml(normalizedPathMode)}" data-income-impact-graph-path="${escapeHtml(pathId)}" data-income-impact-graph-path-mode="${escapeHtml(normalizedPathMode)}"${renderGraphPathAttributes(attributes)} d="${escapeHtml(path)}" aria-label="${escapeHtml(label)}"></path>`;
  }

  function getPrimaryGraphPathLabel(timelineResult, fallbackLabel) {
    const contract = isPlainObject(timelineResult?.baselineContract) ? timelineResult.baselineContract : {};
    if (contract.visibleBaselineMode === "autoCompressed" && contract.autoCompressionApplied === true) {
      return AUTO_COMPRESSED_BASELINE_LABEL;
    }
    if (contract.visibleBaselineMode === "unadjusted" || contract.autoCompressionApplied === false) {
      return "Unadjusted baseline";
    }
    return normalizeString(fallbackLabel) || "Projected path";
  }

  function getSeriesDisplayLabel(series, timelineResult, fallbackLabel) {
    const selectedScenarioId = normalizeString(timelineResult?.graphModel?.trace?.selectedScenarioId);
    const seriesScenarioId = normalizeString(series?.scenarioId);
    const selected = series?.selected === true || (selectedScenarioId && selectedScenarioId === seriesScenarioId);
    if (selected) {
      return getPrimaryGraphPathLabel(timelineResult, fallbackLabel || series?.label);
    }
    return normalizeString(series?.label || fallbackLabel) || "Scenario projection";
  }

  function hasGraphPosition(point) {
    return isPlainObject(point)
      && toOptionalNumber(point.xRatio) != null
      && toOptionalNumber(point.yRatio) != null;
  }

  function getLastPositionedPoint(points) {
    return (Array.isArray(points) ? points : []).slice().reverse().find(hasGraphPosition) || null;
  }

  function getFirstPositionedPoint(points) {
    return (Array.isArray(points) ? points : []).find(hasGraphPosition) || null;
  }

  function getAppliedGraphSeries(graphModel) {
    function selectVisibleSeries(seriesList) {
      const safeSeries = Array.isArray(seriesList) ? seriesList : [];
      const selectedSeries = safeSeries.find(function (series) {
        return series?.selected === true;
      });
      const comparisonSeries = safeSeries.filter(function (series) {
        return series !== selectedSeries;
      });
      return (selectedSeries ? [selectedSeries].concat(comparisonSeries) : safeSeries).slice(0, 2);
    }

    const runwaySeries = Array.isArray(graphModel?.series?.appliedRunwayScenarios)
      ? graphModel.series.appliedRunwayScenarios
      : [];
    if (runwaySeries.length) {
      const preparedSeries = runwaySeries
        .map(function (series, index) {
          return Object.assign({}, series, {
            pathId: normalizeString(series.pathId) || (index === 0
              ? POST_DEATH_RESOURCES_PATH_ID
              : `${POST_DEATH_RESOURCES_PATH_ID}--scenario-${index + 1}`),
            points: Array.isArray(series.runwayLinePoints) && series.runwayLinePoints.length
              ? series.runwayLinePoints
              : Array.isArray(series.fundedRunwayPoints) ? series.fundedRunwayPoints : [],
            pathMode: normalizeGraphPathMode(series.pathMode),
            trace: Object.assign({}, isPlainObject(series.trace) ? series.trace : {}, {
              renderSource: Array.isArray(series.runwayLinePoints) && series.runwayLinePoints.length
                ? "runwayLinePoints"
                : "fundedRunwayPoints"
            })
          });
        })
        .filter(function (series) {
          return isPlainObject(series) && buildSvgPath(series.points, normalizeGraphPathMode(series.pathMode), graphModel);
        });
      return selectVisibleSeries(preparedSeries);
    }

    const appliedSeries = Array.isArray(graphModel?.series?.appliedPostDeathResources)
      ? graphModel.series.appliedPostDeathResources
      : [];
    const candidates = appliedSeries.length
      ? appliedSeries
      : [
          {
            pathId: POST_DEATH_RESOURCES_PATH_ID,
            label: "Survivor resources after death",
            selected: true,
            points: graphModel?.series?.postDeathResources
          }
        ];

    return selectVisibleSeries(candidates.filter(function (series) {
      return isPlainObject(series) && buildSvgPath(series.points, normalizeGraphPathMode(series.pathMode), graphModel);
    }));
  }

  function getAppliedPreDeathGraphSeries(graphModel) {
    const runwaySeries = Array.isArray(graphModel?.series?.appliedRunwayScenarios)
      ? graphModel.series.appliedRunwayScenarios
      : [];
    const preparedSeries = runwaySeries
      .map(function (series, index) {
        return Object.assign({}, series, {
          pathId: normalizeString(series.preDeathPathId) || (index === 0
            ? PRE_DEATH_ASSETS_PATH_ID
            : `${PRE_DEATH_ASSETS_PATH_ID}--scenario-${index + 1}`),
          points: Array.isArray(series.preDeathContextPoints) ? series.preDeathContextPoints : [],
          pathMode: normalizeGraphPathMode(series.preDeathPathMode || "smooth"),
          trace: Object.assign({}, isPlainObject(series.trace) ? series.trace : {}, {
            renderSource: "preDeathContextPoints"
          })
        });
      })
      .filter(function (series) {
        return isPlainObject(series) && buildSvgPath(series.points, normalizeGraphPathMode(series.pathMode), graphModel);
      });
    const selectedSeries = preparedSeries.find(function (series) {
      return series?.selected === true;
    });
    const comparisonSeries = preparedSeries.filter(function (series) {
      return series !== selectedSeries;
    });
    return (selectedSeries ? [selectedSeries].concat(comparisonSeries) : preparedSeries).slice(0, 2);
  }

  function getSelectedAppliedGraphSeries(graphModel, selectedScenarioId = "") {
    const appliedSeries = getAppliedGraphSeries(graphModel);
    const normalizedSelectedScenarioId = normalizeString(selectedScenarioId);
    return (normalizedSelectedScenarioId
      ? appliedSeries.find(function (series) {
        return normalizeString(series?.scenarioId) === normalizedSelectedScenarioId;
      })
      : null) || appliedSeries.find(function (series) {
      return series?.selected === true;
    }) || null;
  }

  function getSelectedDeficitLabelPosition(selectedSeries, zeroYRatio, graphModel = null) {
    const depletionPoint = isPlainObject(selectedSeries?.depletionPoint) ? selectedSeries.depletionPoint : null;
    const firstDeficitPoint = Array.isArray(selectedSeries?.deficitPoints) ? selectedSeries.deficitPoints[0] : null;
    const anchorXRatio = toOptionalNumber(depletionPoint?.xRatio ?? firstDeficitPoint?.xRatio);
    const anchorYRatio = toOptionalNumber(zeroYRatio ?? depletionPoint?.yRatio ?? firstDeficitPoint?.yRatio);
    if (anchorXRatio == null || anchorYRatio == null) {
      return null;
    }

    const minX = GRAPH_VIEW_BOX.plotLeft + 12;
    const maxX = GRAPH_VIEW_BOX.plotLeft + GRAPH_VIEW_BOX.plotWidth - 180;
    const minY = GRAPH_VIEW_BOX.plotTop + 22;
    const maxY = GRAPH_VIEW_BOX.plotTop + GRAPH_VIEW_BOX.plotHeight - 28;
    return {
      x: clampNumber(toGraphX(anchorXRatio, graphModel, depletionPoint || firstDeficitPoint) + 12, minX, maxX),
      y: clampNumber(toGraphY(anchorYRatio, graphModel, depletionPoint || firstDeficitPoint) + 24, minY, maxY)
    };
  }

  function renderSelectedScenarioDeficitArea(graphModel, selectedScenarioId = "") {
    const selectedSeries = getSelectedAppliedGraphSeries(graphModel, selectedScenarioId);
    if (!selectedSeries || !Array.isArray(selectedSeries.deficitPoints) || selectedSeries.deficitPoints.length < 2) {
      return "";
    }

    const areaPath = buildDeficitAreaSvgPath(selectedSeries.deficitPoints, graphModel?.axes?.y?.zeroYRatio, graphModel);
    if (!areaPath) {
      return "";
    }

    const label = "Required support after resources run out";
    const labelPosition = getSelectedDeficitLabelPosition(selectedSeries, graphModel?.axes?.y?.zeroYRatio, graphModel);
    return `
      <g
        class="income-impact-graph-deficit-layer"
        data-income-impact-graph-deficit-layer="${escapeHtml(SELECTED_DEFICIT_AREA_ID)}"
        data-income-impact-applied-scenario-id="${escapeHtml(selectedSeries.scenarioId || "")}"
        data-income-impact-applied-scenario-selected="true"
      >
        <path
          id="${escapeHtml(SELECTED_DEFICIT_AREA_ID)}"
          class="income-impact-graph-deficit-area"
          data-income-impact-graph-deficit-area="${escapeHtml(SELECTED_DEFICIT_AREA_ID)}"
          data-income-impact-graph-deficit-source="deficitPoints"
          data-income-impact-applied-scenario-id="${escapeHtml(selectedSeries.scenarioId || "")}"
          data-income-impact-applied-scenario-selected="true"
          d="${escapeHtml(areaPath)}"
          aria-label="${escapeHtml(label)}"
        ><title>${escapeHtml(label)}</title></path>
        ${labelPosition ? `
          <text
            class="income-impact-graph-deficit-label"
            data-income-impact-graph-deficit-label
            x="${labelPosition.x}"
            y="${labelPosition.y}"
          >Required support</text>
        ` : ""}
      </g>
    `;
  }

  function getAppliedScenarioDepletionMarkers(graphModel, selectedScenarioId = "") {
    const selectedId = normalizeString(selectedScenarioId || graphModel?.trace?.selectedScenarioId);
    const markerSeries = getAppliedGraphSeries(graphModel);
    return markerSeries.map(function (series) {
      const depletionPoint = isPlainObject(series?.depletionPoint) ? series.depletionPoint : null;
      const xRatio = toOptionalNumber(depletionPoint?.xRatio);
      const yRatio = toOptionalNumber(depletionPoint?.yRatio);
      if (!depletionPoint || xRatio == null || yRatio == null) {
        return null;
      }

      const scenarioId = normalizeString(series.scenarioId);
      const label = normalizeString(series.label) || "Applied scenario";
      return {
        scenarioId,
        label,
        pathId: normalizeString(series.pathId),
        xRatio,
        yRatio,
        value: getSeriesPointValue(depletionPoint),
        date: normalizeString(depletionPoint.date),
        selected: selectedId ? scenarioId === selectedId : series.selected === true
      };
    }).filter(Boolean);
  }

  function getDepletionMarkerLabelPosition(marker, index, graphModel = null) {
    const x = toGraphX(marker.xRatio, graphModel, marker);
    const y = toGraphY(marker.yRatio, graphModel, marker);
    const pullLeft = x > GRAPH_VIEW_BOX.plotLeft + GRAPH_VIEW_BOX.plotWidth - 150;
    return {
      x: pullLeft ? -10 : 10,
      y: index % 2 === 0 ? -15 : 22,
      anchor: pullLeft ? "end" : "start"
    };
  }

  function renderAppliedScenarioDepletionMarkers(graphModel, selectedScenarioId = "", timelineResult = null) {
    const markers = getAppliedScenarioDepletionMarkers(graphModel, selectedScenarioId);
    if (!markers.length) {
      return "";
    }
    const runOutStorylineCandidate = getFinancialStorylineCandidateById(timelineResult, "resources-run-out");

    return `
      <g class="income-impact-runway-depletion-markers" data-income-impact-runway-depletion-markers>
        ${markers.map(function (marker, index) {
          const x = toGraphX(marker.xRatio, graphModel, marker);
          const y = toGraphY(marker.yRatio, graphModel, marker);
          const labelPosition = getDepletionMarkerLabelPosition(marker, index, graphModel);
          const displayLabel = marker.selected
            ? getPrimaryGraphPathLabel(timelineResult, marker.label)
            : marker.label;
          const markerLabel = `${displayLabel}: Resources depleted`;
          return `
            <g
              class="income-impact-runway-depletion-marker"
              data-income-impact-runway-depletion-marker
              data-income-impact-applied-scenario-id="${escapeHtml(marker.scenarioId)}"
              data-income-impact-applied-scenario-label="${escapeHtml(displayLabel)}"
              data-income-impact-applied-scenario-selected="${marker.selected ? "true" : "false"}"
              data-income-impact-depletion-marker-path-id="${escapeHtml(marker.pathId)}"
              ${runOutStorylineCandidate && marker.selected ? `
              data-income-impact-storyline-event-id="resources-run-out"
              data-income-impact-storyline-dot-tier="${escapeHtml(getGraphStorylineDotTier(runOutStorylineCandidate))}"
              data-income-impact-storyline-connected-to-major-card="${runOutStorylineCandidate.connectedToMajorCard === true ? "true" : "false"}"
              data-income-impact-storyline-eligible-for-connector="${runOutStorylineCandidate.eligibleForConnector === true ? "true" : "false"}"
              data-income-impact-storyline-marker-source="runway-depletion-marker"` : ""}
              aria-label="${escapeHtml(markerLabel)}"
              transform="translate(${x} ${y})"
            >
              <circle r="${marker.selected ? "5.6" : "4.3"}"></circle>
              ${marker.selected ? `<line x1="0" y1="0" x2="${labelPosition.x}" y2="${labelPosition.y}"></line><text class="income-impact-runway-depletion-label" data-income-impact-runway-depletion-label x="${labelPosition.x}" y="${labelPosition.y}" text-anchor="${labelPosition.anchor}">Runs out</text>` : ""}
              <title>${escapeHtml(markerLabel)}${marker.date ? ` on ${escapeHtml(marker.date)}` : ""}</title>
            </g>
          `;
        }).join("")}
      </g>
    `;
  }

  function renderAppliedScenarioGraphPaths(graphModel, timelineResult = null) {
    const appliedSeries = getAppliedGraphSeries(graphModel);
    if (!appliedSeries.length) {
      return "";
    }
    return appliedSeries.map(function (series, index) {
      const pathId = normalizeString(series.pathId) || (index === 0
        ? POST_DEATH_RESOURCES_PATH_ID
        : `${POST_DEATH_RESOURCES_PATH_ID}--scenario-${index + 1}`);
      const label = getSeriesDisplayLabel(series, timelineResult, "Survivor resources after death");
      return renderGraphPath(
        pathId,
        series.points,
        label,
        normalizeGraphPathMode(series.pathMode),
        {
          "data-income-impact-applied-scenario-id": series.scenarioId || "",
          "data-income-impact-applied-scenario-label": label,
          "data-income-impact-applied-scenario-selected": series.selected === true ? "true" : "false",
          "data-income-impact-runway-source": series.trace?.renderSource || ""
        },
        graphModel
      );
    }).join("");
  }

  function renderAppliedScenarioPreDeathGraphPaths(graphModel) {
    const appliedSeries = getAppliedPreDeathGraphSeries(graphModel);
    if (!appliedSeries.length) {
      return "";
    }
    return appliedSeries.map(function (series, index) {
      const pathId = normalizeString(series.pathId) || (index === 0
        ? PRE_DEATH_ASSETS_PATH_ID
        : `${PRE_DEATH_ASSETS_PATH_ID}--scenario-${index + 1}`);
      const label = normalizeString(series.deathLineLabel || series.label) || "Projected assets before death";
      return renderGraphPath(
        pathId,
        series.points,
        `${label} net worth before death`,
        normalizeGraphPathMode(series.pathMode),
        {
          "data-income-impact-applied-scenario-id": series.scenarioId || "",
          "data-income-impact-applied-scenario-label": label,
          "data-income-impact-applied-scenario-selected": series.selected === true ? "true" : "false",
          "data-income-impact-pre-death-source": series.trace?.renderSource || "preDeathContextPoints",
          "data-income-impact-death-line-label": series.deathLineLabel || label
        },
        graphModel
      );
    }).join("");
  }

  function getSelectedRunwayScenario(graphModel, selectedScenarioId = "") {
    const scenarios = Array.isArray(graphModel?.series?.appliedRunwayScenarios)
      ? graphModel.series.appliedRunwayScenarios
      : [];
    if (!scenarios.length) {
      return null;
    }
    const normalizedSelectedScenarioId = normalizeString(selectedScenarioId);
    return (normalizedSelectedScenarioId
      ? scenarios.find(function (scenario) {
        return normalizeString(scenario?.scenarioId) === normalizedSelectedScenarioId;
      })
      : null) || scenarios.find(function (scenario) {
        return scenario?.selected === true;
      }) || scenarios[0];
  }

  function getDeathConversionConnector(graphModel) {
    const selectedScenarioId = graphModel?.trace?.selectedScenarioId;
    const selectedRunwayScenario = getSelectedRunwayScenario(graphModel, selectedScenarioId);
    const deathXRatio = toOptionalNumber(graphModel?.phases?.deathEvent?.xRatio);
    if (selectedRunwayScenario) {
      const startPoint = hasGraphPosition(selectedRunwayScenario.deathLineAnchor)
        ? selectedRunwayScenario.deathLineAnchor
        : getLastPositionedPoint(selectedRunwayScenario.preDeathContextPoints);
      const endPoint = hasGraphPosition(selectedRunwayScenario.survivorResourcesAtDeathPoint)
        ? selectedRunwayScenario.survivorResourcesAtDeathPoint
        : getFirstPositionedPoint(selectedRunwayScenario.fundedRunwayPoints);
      if (startPoint && endPoint) {
        const xRatio = toOptionalNumber(endPoint.xRatio) ?? toOptionalNumber(startPoint.xRatio) ?? deathXRatio;
        return {
          scenarioId: selectedRunwayScenario.scenarioId || "",
          label: normalizeString(selectedRunwayScenario.deathLineLabel || selectedRunwayScenario.label || "Selected scenario"),
          xRatio,
          startYRatio: toOptionalNumber(startPoint.yRatio),
          endYRatio: toOptionalNumber(endPoint.yRatio),
          startValue: getSeriesPointValue(startPoint),
          endValue: getSeriesPointValue(endPoint),
          source: "selectedAppliedScenario"
        };
      }
    }

    const preDeathPoint = getLastPositionedPoint(graphModel?.series?.preDeathAssets);
    const transitionStages = Array.isArray(graphModel?.series?.deathTransition)
      ? graphModel.series.deathTransition.filter(hasGraphPosition)
      : [];
    const transitionEndPoint = transitionStages.length ? transitionStages[transitionStages.length - 1] : null;
    if (!preDeathPoint || !transitionEndPoint) {
      return null;
    }
    return {
      scenarioId: "",
      label: "Base scenario",
      xRatio: toOptionalNumber(transitionEndPoint.xRatio) ?? toOptionalNumber(preDeathPoint.xRatio) ?? deathXRatio,
      startYRatio: toOptionalNumber(preDeathPoint.yRatio),
      endYRatio: toOptionalNumber(transitionEndPoint.yRatio),
      startValue: getSeriesPointValue(preDeathPoint),
      endValue: getSeriesPointValue(transitionEndPoint),
      source: "baseDeathTransition"
    };
  }

  function renderDeathConversionGradient(connector, x, y1, y2) {
    return `
      <defs>
        <linearGradient id="${DEATH_CONVERSION_GRADIENT_ID}" data-income-impact-death-conversion-gradient gradientUnits="userSpaceOnUse" x1="${x}" y1="${y1}" x2="${x}" y2="${y2}">
          <stop offset="0%" stop-color="#2563eb"></stop>
          <stop offset="48%" stop-color="#3b82f6"></stop>
          <stop offset="100%" stop-color="#3b82f6"></stop>
        </linearGradient>
      </defs>
    `;
  }

  function renderDeathConversionArrows(x, y1, y2) {
    const rotation = y2 >= y1 ? 0 : 180;
    return DEATH_CONVERSION_ARROW_POSITION_RATIOS.map(function (positionRatio) {
      const y = y1 + ((y2 - y1) * positionRatio);
      return `
        <path
          class="income-impact-death-conversion-chevron"
          data-income-impact-death-conversion-chevron
          data-income-impact-death-conversion-chevron-position-ratio="${escapeHtml(positionRatio)}"
          d="M -7 -4 L 0 4 L 7 -4"
          transform="translate(${x} ${formatSvgCoordinate(y)}) rotate(${rotation})"
        ></path>
      `;
    }).join("");
  }

  function renderDeathConversionMarkers(x, topY, bottomY, storylineCandidate = null) {
    const circleY = topY + ((bottomY - topY) * DEATH_CONVERSION_CIRCLE_POSITION_RATIO_FROM_TOP);
    const diamondStorylineAttributes = storylineCandidate ? `
          data-income-impact-storyline-event-id="death-income-stops"
          data-income-impact-storyline-dot-tier="${escapeHtml(getGraphStorylineDotTier(storylineCandidate))}"
          data-income-impact-storyline-connected-to-major-card="${storylineCandidate.connectedToMajorCard === true ? "true" : "false"}"
          data-income-impact-storyline-eligible-for-connector="${storylineCandidate.eligibleForConnector === true ? "true" : "false"}"
          data-income-impact-storyline-marker-source="death-conversion-diamond"` : "";
    return `
      <g class="income-impact-death-conversion-markers" data-income-impact-death-conversion-markers>
        <rect
          class="income-impact-death-conversion-diamond"
          data-income-impact-death-conversion-diamond
          ${diamondStorylineAttributes}
          x="${formatSvgCoordinate(x - 6)}"
          y="${formatSvgCoordinate(topY - 6)}"
          width="12"
          height="12"
          transform="rotate(45 ${formatSvgCoordinate(x)} ${formatSvgCoordinate(topY)})"
        ></rect>
        <circle
          class="income-impact-death-conversion-circle"
          data-income-impact-death-conversion-circle
          data-income-impact-death-conversion-circle-position-ratio="${escapeHtml(DEATH_CONVERSION_CIRCLE_POSITION_RATIO_FROM_TOP)}"
          cx="${x}"
          cy="${formatSvgCoordinate(circleY)}"
          r="6.5"
        ></circle>
      </g>
    `;
  }

  function renderDeathEventConversionConnector(graphModel, timelineResult = null) {
    const connector = getDeathConversionConnector(graphModel);
    if (!connector || connector.xRatio == null || connector.startYRatio == null || connector.endYRatio == null) {
      return "";
    }
    const x = toGraphX(connector.xRatio);
    const y1 = toGraphY(connector.startYRatio);
    const y2 = toGraphY(connector.endYRatio);
    if (y1 === y2) {
      return "";
    }
    const topY = Math.min(y1, y2);
    const bottomY = Math.max(y1, y2);
    const label = `${connector.label || "Selected scenario"} death-event conversion`;
    const deathStorylineCandidate = getFinancialStorylineCandidateById(timelineResult, "death-income-stops");
    return `
      ${renderDeathConversionGradient(connector, x, y1, y2)}
      <g
        class="income-impact-death-conversion"
        data-income-impact-death-conversion
        data-income-impact-death-conversion-source="${escapeHtml(connector.source)}"
        data-income-impact-applied-scenario-id="${escapeHtml(connector.scenarioId)}"
        aria-label="${escapeHtml(label)}"
      >
        <line
          class="income-impact-death-conversion-spine"
          data-income-impact-death-conversion-spine
          x1="${x}"
          y1="${topY}"
          x2="${x}"
          y2="${bottomY}"
        ></line>
        <g class="income-impact-death-conversion-chevrons" data-income-impact-death-conversion-chevrons>
          ${renderDeathConversionArrows(x, y1, y2)}
        </g>
        ${renderDeathConversionMarkers(x, topY, bottomY, deathStorylineCandidate)}
        <title>${escapeHtml(label)}</title>
      </g>
    `;
  }

  function getSurvivorResourcesRenderStartPoint(graphModel, pathId) {
    const selectedSeries = getSelectedAppliedGraphSeries(graphModel, graphModel?.trace?.selectedScenarioId);
    const survivorPoint = isPlainObject(selectedSeries?.survivorResourcesAtDeathPoint)
      ? selectedSeries.survivorResourcesAtDeathPoint
      : null;
    const xRatio = toOptionalNumber(
      survivorPoint?.xRatio
        ?? selectedSeries?.deathXRatio
        ?? graphModel?.phases?.deathEvent?.xRatio
    );
    const yRatio = toOptionalNumber(survivorPoint?.yRatio);
    if (!survivorPoint || xRatio == null || yRatio == null) {
      return null;
    }
    return Object.assign({}, survivorPoint, {
      id: `${pathId || "comparison"}-survivor-resources-at-death`,
      phase: "deathEvent",
      xRatio,
      yRatio,
      relativeMonthsFromDeath: 0,
      relativeYearsFromDeath: 0,
      trace: Object.assign({}, isPlainObject(survivorPoint.trace) ? survivorPoint.trace : {}, {
        visualStartPoint: true,
        interpolationKind: "survivorResourcesAtDeathStart",
        displayRole: "postDeathRunwayStart",
        renderOnly: true,
        rawComparisonPointsPreserved: true
      })
    });
  }

  function getComparisonRenderPoints(graphModel, series) {
    const points = Array.isArray(series?.points) ? series.points : [];
    if (!points.length || toOptionalNumber(points[0]?.relativeMonthsFromDeath) === 0) {
      return points;
    }
    const startPoint = getSurvivorResourcesRenderStartPoint(graphModel, series?.pathId || series?.scenarioId);
    return startPoint ? [startPoint].concat(points) : points;
  }

  function areGraphSeriesPointSetsEquivalent(leftPoints, rightPoints) {
    const left = Array.isArray(leftPoints) ? leftPoints : [];
    const right = Array.isArray(rightPoints) ? rightPoints : [];
    return left.length >= 2
      && left.length === right.length
      && left.every(function (point, index) {
        const otherPoint = right[index];
        const pointValue = getSeriesPointValue(point);
        const otherValue = getSeriesPointValue(otherPoint);
        const pointMonth = getSeriesPointMonthIndex(point);
        const otherMonth = getSeriesPointMonthIndex(otherPoint);
        const pointDate = getSeriesPointDate(point);
        const otherDate = getSeriesPointDate(otherPoint);
        return pointValue != null
          && otherValue != null
          && Math.abs(pointValue - otherValue) <= 0.000001
          && (pointMonth == null || otherMonth == null || pointMonth === otherMonth)
          && (!pointDate || !otherDate || pointDate === otherDate);
      });
  }

  function getSelectedBaseComparisonPoints(graphModel) {
    const selectedSeries = getSelectedAppliedGraphSeries(graphModel, graphModel?.trace?.selectedScenarioId);
    if (Array.isArray(selectedSeries?.rawPoints) && selectedSeries.rawPoints.length) {
      return selectedSeries.rawPoints;
    }
    if (Array.isArray(selectedSeries?.points) && selectedSeries.points.length) {
      return selectedSeries.points;
    }
    return Array.isArray(graphModel?.series?.postDeathResources) ? graphModel.series.postDeathResources : [];
  }

  function isNeutralComparisonGraphSeries(series) {
    const trace = isPlainObject(series?.trace) ? series.trace : {};
    const monthlyDelta = toOptionalNumber(trace.monthlyDelta ?? trace.graphMonthlyDelta);
    return monthlyDelta != null && monthlyDelta === 0;
  }

  function shouldRenderComparisonGraphSeries(graphModel, comparisonSeries) {
    if (!isPlainObject(comparisonSeries)) {
      return false;
    }
    if (isNeutralComparisonGraphSeries(comparisonSeries)) {
      return false;
    }
    if (areGraphSeriesPointSetsEquivalent(comparisonSeries.points, getSelectedBaseComparisonPoints(graphModel))) {
      return false;
    }
    return Boolean(buildSvgPath(
      getComparisonRenderPoints(graphModel, comparisonSeries),
      getComparisonGraphPathMode(comparisonSeries),
      graphModel
    ));
  }

  function getComparisonGraphSeries(graphModel) {
    return (Array.isArray(graphModel?.series?.comparisonPostDeathResources)
      ? graphModel.series.comparisonPostDeathResources
      : []).filter(function (comparisonSeries) {
      return shouldRenderComparisonGraphSeries(graphModel, comparisonSeries);
    }).map(function (comparisonSeries) {
      return Object.assign({}, comparisonSeries, {
        points: getComparisonRenderPoints(graphModel, comparisonSeries),
        trace: Object.assign({}, isPlainObject(comparisonSeries.trace) ? comparisonSeries.trace : {}, {
          renderSource: "comparisonPointsWithSurvivorResourcesAtDeathStart",
          rawComparisonPointsPreserved: true
        })
      });
    }).slice(0, 1);
  }

  function renderComparisonGraphPaths(graphModel) {
    const comparisonSeries = getComparisonGraphSeries(graphModel);
    if (!comparisonSeries.length) {
      return "";
    }
    return comparisonSeries.map(function (series, index) {
      const pathId = getComparisonGraphPathId(series, index);
      return renderGraphPath(
        pathId,
        series.points,
        series.label || getComparisonGraphLabel(pathId),
        getComparisonGraphPathMode(series, pathId),
        null,
        graphModel
      );
    }).join("");
  }

  function getComparisonGraphPathId(series, index) {
    const explicitPathId = normalizeString(series?.pathId || series?.graphPathId);
    if (explicitPathId === LIFESTYLE_COMPARISON_PATH_ID) {
      return explicitPathId;
    }
    return LIFESTYLE_COMPARISON_PATH_ID;
  }

  function getComparisonGraphLabel(pathId) {
    return LIFESTYLE_COMPARISON_LABEL;
  }

  function getComparisonGraphPathMode(series, pathId) {
    const explicitMode = normalizeGraphPathMode(series?.pathMode || series?.renderMode);
    return explicitMode;
  }

  function getComparisonLegendItemKey(pathId) {
    return "lifestyle";
  }

  function getAppliedScenarioLegendItemKey(series, index) {
    return index === 0 ? "base" : `applied-scenario-${index + 1}`;
  }

  function getAppliedScenarioLegendItems(graphModel, timelineResult = null) {
    const keyItems = Array.isArray(graphModel?.series?.appliedScenarioKeyItems)
      ? graphModel.series.appliedScenarioKeyItems
      : [];
    if (keyItems.length) {
      return keyItems.map(function (item, index) {
        const selected = item.selected === true;
        return Object.assign({}, item, {
          scenarioId: normalizeString(item.scenarioId),
          label: selected
            ? getPrimaryGraphPathLabel(timelineResult, item.label)
            : (normalizeString(item.label) || (index === 0 ? "Selected scenario" : `Scenario ${index + 1}`)),
          selected
        });
      }).filter(function (item) {
        return Boolean(item.scenarioId);
      });
    }

    return getAppliedGraphSeries(graphModel).map(function (series, index) {
      const selected = series.selected === true;
      return {
        scenarioId: normalizeString(series.scenarioId),
        label: selected
          ? getPrimaryGraphPathLabel(timelineResult, series.label)
          : (normalizeString(series.label) || (index === 0 ? "Selected scenario" : `Scenario ${index + 1}`)),
        selected
      };
    }).filter(function (item) {
      return Boolean(item.scenarioId);
    });
  }

  function renderGraphLegend(graphModel, timelineResult = null) {
    const appliedItems = getAppliedScenarioLegendItems(graphModel, timelineResult);
    const comparisonSeries = getComparisonGraphSeries(graphModel);
    const fallbackPrimaryLabel = getPrimaryGraphPathLabel(timelineResult, "Projected path");
    if (!appliedItems.length && !comparisonSeries.length) {
      return "";
    }
    return `
      <div class="income-impact-graph-legend" data-income-impact-graph-legend>
        ${appliedItems.length
          ? appliedItems.map(function (item, index) {
            const label = normalizeString(item.label) || (index === 0 ? "Selected scenario" : `Scenario ${index + 1}`);
            return `
              <span
                data-income-impact-graph-legend-item="${escapeHtml(getAppliedScenarioLegendItemKey(item, index))}"
                data-income-impact-scenario-select="${escapeHtml(item.scenarioId || "")}"
                data-income-impact-applied-scenario-id="${escapeHtml(item.scenarioId || "")}"
                data-income-impact-applied-scenario-label="${escapeHtml(label)}"
                data-income-impact-applied-scenario-selected="${item.selected === true ? "true" : "false"}"
                role="button"
                tabindex="0"
                aria-pressed="${item.selected === true ? "true" : "false"}"
                aria-current="${item.selected === true ? "true" : "false"}"><i></i>${escapeHtml(label)}</span>`;
          }).join("")
          : `<span data-income-impact-graph-legend-item="base"><i></i>${escapeHtml(fallbackPrimaryLabel)}</span>`}
        ${comparisonSeries.map(function (series, index) {
          const pathId = getComparisonGraphPathId(series, index);
          const label = series.label || getComparisonGraphLabel(pathId);
          return `<span data-income-impact-graph-legend-item="${escapeHtml(getComparisonLegendItemKey(pathId))}"><i></i>${escapeHtml(label)}</span>`;
        }).join("")}
        ${comparisonSeries.length ? "<p>Manual lifestyle comparison only - primary path unchanged.</p>" : ""}
      </div>
    `;
  }

  function getLifestyleImpactScenario(timelineResult) {
    const reporting = timelineResult && isPlainObject(timelineResult.compressionReporting)
      ? timelineResult.compressionReporting
      : null;
    return reporting && isPlainObject(reporting.lifestyleScenario) ? reporting.lifestyleScenario : null;
  }

  function getLifestyleImpactComparisonScenario(timelineResult) {
    const lifestyleScenario = getLifestyleImpactScenario(timelineResult);
    if (lifestyleScenario && isPlainObject(lifestyleScenario.comparisonScenario)) {
      return lifestyleScenario.comparisonScenario;
    }
    return null;
  }

  function getSeriesPointValue(point) {
    if (!isPlainObject(point)) {
      return null;
    }
    return toOptionalNumber(
      point.value ??
        point.endingResources ??
        point.availableResources ??
        point.resourcesAfterNeed ??
        point.postDeathResources
    );
  }

  function getSeriesPointMonthIndex(point) {
    if (!isPlainObject(point)) {
      return null;
    }
    return toOptionalNumber(point.monthIndex ?? point.elapsedMonth ?? point.month ?? point.monthsAfterDeath);
  }

  function getSeriesPointDate(point) {
    if (!isPlainObject(point)) {
      return "";
    }
    return normalizeDateOnly(point.date ?? point.projectionDate ?? point.periodDate ?? "");
  }

  function getSeriesPoints(seriesLike) {
    if (Array.isArray(seriesLike)) {
      return seriesLike;
    }
    if (isPlainObject(seriesLike) && Array.isArray(seriesLike.points)) {
      return seriesLike.points;
    }
    return [];
  }

  function getGraphBasePostDeathPoints(timelineResult) {
    const graphModel = getGraphModel(timelineResult);
    return getSeriesPoints(graphModel && graphModel.series ? graphModel.series.postDeathResources : null);
  }

  function getGraphLifestylePostDeathPoints(timelineResult) {
    const graphModel = getGraphModel(timelineResult);
    const comparisonSeries = graphModel && graphModel.series && Array.isArray(graphModel.series.comparisonPostDeathResources)
      ? graphModel.series.comparisonPostDeathResources
      : [];
    const lifestyleSeries = comparisonSeries.find((series) => {
      return series && series.pathId === LIFESTYLE_COMPARISON_PATH_ID;
    }) || comparisonSeries[0];
    return getSeriesPoints(lifestyleSeries);
  }

  function normalizeDepletionInfo(depletion, points) {
    if (isPlainObject(depletion)) {
      const explicitlyNotDepleted = depletion.depleted === false ||
        depletion.status === "not-depleted" ||
        depletion.status === "no-depletion";
      if (explicitlyNotDepleted) {
        return {
          depleted: false,
          monthIndex: null,
          date: "",
        };
      }

      const depleted = depletion.depleted === true ||
        depletion.status === "depleted" ||
        depletion.depletionDetected === true ||
        Boolean(depletion.depletionDate || depletion.date);
      const monthIndex = toOptionalNumber(
        depletion.depletionMonthIndex ??
          depletion.monthIndex ??
          (depleted ? (depletion.monthsCovered ?? depletion.monthsUntilDepletion) : null)
      );
      const date = normalizeDateOnly(depletion.depletionDate ?? depletion.date ?? "");

      if (depleted || date || monthIndex !== null) {
        return {
          depleted: true,
          monthIndex,
          date,
        };
      }
    }

    const safePoints = getSeriesPoints(points);
    for (const point of safePoints) {
      const value = getSeriesPointValue(point);
      if (value !== null && value <= 0) {
        return {
          depleted: true,
          monthIndex: getSeriesPointMonthIndex(point),
          date: getSeriesPointDate(point),
        };
      }
    }

    return {
      depleted: false,
      monthIndex: null,
      date: "",
    };
  }

  function getMonthDifferenceFromDates(startDate, endDate) {
    const start = parseDateOnlyValue(startDate);
    const end = parseDateOnlyValue(endDate);
    if (!start || !end) {
      return null;
    }
    const diff = ((end.getUTCFullYear() - start.getUTCFullYear()) * 12) +
      (end.getUTCMonth() - start.getUTCMonth());
    return Number.isFinite(diff) ? diff : null;
  }

  function getLastSeriesPoint(points) {
    const safePoints = getSeriesPoints(points);
    return safePoints.length ? safePoints[safePoints.length - 1] : null;
  }

  function findMatchingSeriesPoint(points, targetPoint) {
    const safePoints = getSeriesPoints(points);
    if (!safePoints.length || !targetPoint) {
      return null;
    }
    const targetMonth = getSeriesPointMonthIndex(targetPoint);
    if (targetMonth !== null) {
      const monthMatch = safePoints.find((point) => getSeriesPointMonthIndex(point) === targetMonth);
      if (monthMatch) {
        return monthMatch;
      }
    }

    const targetDate = getSeriesPointDate(targetPoint);
    if (targetDate) {
      const dateMatch = safePoints.find((point) => getSeriesPointDate(point) === targetDate);
      if (dateMatch) {
        return dateMatch;
      }
    }

    return getLastSeriesPoint(safePoints);
  }

  function getLifestyleResourceDifference(timelineResult) {
    const comparisonPoints = getGraphLifestylePostDeathPoints(timelineResult);
    const basePoints = getGraphBasePostDeathPoints(timelineResult);
    const comparisonPoint = getLastSeriesPoint(comparisonPoints);
    const basePoint = findMatchingSeriesPoint(basePoints, comparisonPoint);
    const comparisonValue = getSeriesPointValue(comparisonPoint);
    const baseValue = getSeriesPointValue(basePoint);

    if (comparisonValue === null || baseValue === null) {
      return null;
    }

    return {
      value: comparisonValue - baseValue,
      monthIndex: comparisonPoint ? getSeriesPointMonthIndex(comparisonPoint) : null,
      date: comparisonPoint ? getSeriesPointDate(comparisonPoint) : "",
    };
  }

  function getLifestyleRunwayShift(timelineResult) {
    const baseScenario = timelineResult && isPlainObject(timelineResult.scenario) ? timelineResult.scenario : {};
    const basePostDeathSeries = isPlainObject(baseScenario.postDeathSeries) ? baseScenario.postDeathSeries : {};
    const comparisonScenario = getLifestyleImpactComparisonScenario(timelineResult);
    const comparisonPostDeathSeries = comparisonScenario && isPlainObject(comparisonScenario.postDeathSeries)
      ? comparisonScenario.postDeathSeries
      : {};
    const basePoints = getGraphBasePostDeathPoints(timelineResult);
    const comparisonPoints = getGraphLifestylePostDeathPoints(timelineResult);
    const baseDepletion = normalizeDepletionInfo(basePostDeathSeries.depletion ?? baseScenario.depletion, basePoints);
    const comparisonDepletion = normalizeDepletionInfo(
      comparisonScenario && comparisonScenario.depletion ? comparisonScenario.depletion : comparisonPostDeathSeries.depletion,
      comparisonPoints
    );

    if (baseDepletion.depleted && comparisonDepletion.depleted) {
      let monthShift = null;
      if (baseDepletion.monthIndex !== null && comparisonDepletion.monthIndex !== null) {
        monthShift = comparisonDepletion.monthIndex - baseDepletion.monthIndex;
      } else if (baseDepletion.date && comparisonDepletion.date) {
        monthShift = getMonthDifferenceFromDates(baseDepletion.date, comparisonDepletion.date);
      }

      if (monthShift !== null) {
        return {
          kind: "monthShift",
          monthShift,
          baseDepletion,
          comparisonDepletion,
        };
      }
    }

    if (baseDepletion.depleted && !comparisonDepletion.depleted) {
      return {
        kind: "extendsBeyondHorizon",
        baseDepletion,
        comparisonDepletion,
      };
    }

    if (!baseDepletion.depleted && comparisonDepletion.depleted) {
      return {
        kind: "shortensIntoHorizon",
        baseDepletion,
        comparisonDepletion,
      };
    }

    if (!baseDepletion.depleted && !comparisonDepletion.depleted) {
      return {
        kind: "noVisibleDepletion",
        baseDepletion,
        comparisonDepletion,
      };
    }

    return {
      kind: "unavailable",
      baseDepletion,
      comparisonDepletion,
    };
  }

  function formatMonthCount(months) {
    const rounded = Math.max(0, Math.round(Math.abs(Number(months) || 0)));
    return `${rounded} ${rounded === 1 ? "month" : "months"}`;
  }

  function formatSignedMonthlyAmount(value) {
    const amount = toOptionalNumber(value);
    if (amount === null || Math.abs(amount) < 0.5) {
      return "$0/mo";
    }
    const prefix = amount > 0 ? "+" : "-";
    return `${prefix}${formatCurrency(Math.abs(amount))}/mo`;
  }

  function formatSignedResourceDifference(value) {
    const amount = toOptionalNumber(value);
    if (amount === null || Math.abs(amount) < 0.5) {
      return "$0";
    }
    const prefix = amount > 0 ? "+" : "-";
    return `${prefix}${formatCurrency(Math.abs(amount))}`;
  }

  function getLifestyleImpactReadoutModel(timelineResult) {
    const lifestyleScenario = getLifestyleImpactScenario(timelineResult);
    const comparisonScenario = getLifestyleImpactComparisonScenario(timelineResult);
    const reportingTrace = timelineResult && timelineResult.compressionReporting && isPlainObject(timelineResult.compressionReporting.trace)
      ? timelineResult.compressionReporting.trace
      : {};
    const comparisonTrace = comparisonScenario && isPlainObject(comparisonScenario.trace) ? comparisonScenario.trace : {};
    const sliderValue = clampLifestyleSliderValue(
      lifestyleScenario && lifestyleScenario.sliderValue !== undefined
        ? lifestyleScenario.sliderValue
        : (comparisonTrace.sliderValue ?? reportingTrace.lifestyleSliderValue ?? 0)
    );
    const monthlyDelta = toOptionalNumber(
      lifestyleScenario && lifestyleScenario.monthlyDelta !== undefined
        ? lifestyleScenario.monthlyDelta
        : (comparisonTrace.monthlyDelta ?? comparisonTrace.graphMonthlyDelta)
    );
    const mode = sliderValue < 0 ? "conservative" : (sliderValue > 0 ? "elevated" : "current");
    const runwayShift = getLifestyleRunwayShift(timelineResult);
    const resourceDifference = getLifestyleResourceDifference(timelineResult);
    const monthlyValue = monthlyDelta === null
      ? UNAVAILABLE_COPY
      : formatSignedMonthlyAmount(monthlyDelta);
    const monthlyCopy = monthlyDelta === null
      ? "Lifestyle spend change unavailable"
      : `Lifestyle spend: ${monthlyValue}`;
    let headline = "Matches baseline";
    let detail = "No depletion shift";
    let shiftValue = "$0";
    let status = "baseline";

    if (mode === "current" || (monthlyDelta !== null && Math.abs(monthlyDelta) < 0.5)) {
      return {
        mode,
        status,
        headline,
        monthlyValue: "$0/mo",
        monthlyCopy: "Lifestyle spend: $0/mo",
        shiftValue: "$0",
        detail,
      };
    }

    if (runwayShift.kind === "monthShift") {
      const monthShift = Math.round(runwayShift.monthShift || 0);
      if (monthShift > 0) {
        headline = `Extends runway by ${formatMonthCount(monthShift)}`;
        detail = `Depletion shift: +${formatMonthCount(monthShift)}`;
        shiftValue = `+${formatMonthCount(monthShift)}`;
        status = "extends";
      } else if (monthShift < 0) {
        headline = `Shortens runway by ${formatMonthCount(monthShift)}`;
        detail = `Depletion shift: -${formatMonthCount(monthShift)}`;
        shiftValue = `-${formatMonthCount(monthShift)}`;
        status = "shortens";
      } else {
        headline = "No depletion shift";
        detail = "Depletion timing is unchanged";
        shiftValue = "$0";
        status = "unchanged";
      }
    } else if (runwayShift.kind === "extendsBeyondHorizon") {
      headline = "Extends runway beyond horizon";
      detail = "Lifestyle line stays above zero in the visible horizon";
      shiftValue = "Beyond horizon";
      status = "extends";
    } else if (runwayShift.kind === "shortensIntoHorizon") {
      headline = "Shortens runway into horizon";
      detail = "Lifestyle line depletes within the visible horizon";
      shiftValue = "Within horizon";
      status = "shortens";
    } else if (runwayShift.kind === "noVisibleDepletion") {
      headline = mode === "conservative" ? "Conservative lifestyle selected" : "Elevated lifestyle selected";
      detail = "No depletion within projection horizon";
      shiftValue = "No depletion";
      status = "noVisibleDepletion";
    } else {
      headline = mode === "conservative" ? "Conservative lifestyle selected" : "Elevated lifestyle selected";
      detail = "Depletion shift unavailable";
      shiftValue = UNAVAILABLE_COPY;
      status = "fallback";
    }

    if ((status === "fallback" || status === "noVisibleDepletion" || status === "unchanged") &&
      resourceDifference &&
      Math.abs(resourceDifference.value) >= 0.5) {
      detail = `Resources difference: ${formatSignedResourceDifference(resourceDifference.value)} at horizon`;
    }

    return {
      mode,
      status,
      headline,
      monthlyValue,
      monthlyCopy,
      shiftValue,
      detail,
    };
  }

  function renderLifestyleImpactReadout(timelineResult) {
    const lifestyleScenario = getLifestyleImpactScenario(timelineResult);
    const hasLifestyleSeries = Boolean(getGraphLifestylePostDeathPoints(timelineResult).length);
    if (!lifestyleScenario && !hasLifestyleSeries) {
      return "";
    }

    const model = getLifestyleImpactReadoutModel(timelineResult);
    return `
      <div class="income-impact-lifestyle-impact-readout"
        data-income-impact-lifestyle-impact-readout
        data-income-impact-lifestyle-impact-mode="${escapeHtml(model.mode)}"
        data-income-impact-lifestyle-impact-status="${escapeHtml(model.status)}">
        <span class="income-impact-lifestyle-impact-readout__eyebrow">Scenario impact</span>
        <span class="income-impact-lifestyle-impact-readout__stat">
          <span>Lifestyle Spend</span>
          <strong data-income-impact-lifestyle-impact-monthly aria-label="${escapeHtml(model.monthlyCopy)}">${escapeHtml(model.monthlyValue)}</strong>
        </span>
        <span class="income-impact-lifestyle-impact-readout__stat">
          <span>Depletion Shift</span>
          <strong data-income-impact-lifestyle-impact-runway aria-label="${escapeHtml(model.detail)}">${escapeHtml(model.shiftValue)}</strong>
        </span>
        <strong class="income-impact-lifestyle-impact-readout__status" data-income-impact-lifestyle-impact-primary>
          <svg aria-hidden="true" width="11" height="11" viewBox="0 0 11 11" fill="none"><path d="M5.5 9.5v-8M2 5.5l3.5-4 3.5 4" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"></path></svg>
          ${escapeHtml(model.headline)}
        </strong>
      </div>
    `;
  }

  function renderGraphDeathAnchor(graphModel) {
    const anchor = graphModel?.series?.currentAnchor;
    if (!anchor || toOptionalNumber(anchor.xRatio) == null || toOptionalNumber(anchor.yRatio) == null) {
      return "";
    }
    return `
      <g class="income-impact-graph-current-anchor" data-income-impact-graph-current-anchor transform="translate(${toGraphX(anchor.xRatio, graphModel, anchor)} ${toGraphY(anchor.yRatio, graphModel, anchor)})">
        <rect x="-4" y="-4" width="8" height="8" rx="1" transform="rotate(45)"></rect>
        <title>Current asset value at selected death date</title>
      </g>
    `;
  }

  function resolveGraphMonthXRatio(graphModel, monthIndex) {
    const month = toOptionalNumber(monthIndex);
    if (month == null) {
      return null;
    }

    if (getStableGraphLayoutFrame(graphModel)) {
      return getLayoutFrameXRatio(graphModel, null, { monthIndex: month });
    }

    const ticks = Array.isArray(graphModel?.axes?.x?.ticks)
      ? graphModel.axes.x.ticks
        .map(function (tick) {
          return {
            month: getLayoutFramePointMonth(tick),
            xRatio: toOptionalNumber(tick?.xRatio)
          };
        })
        .filter(function (tick) {
          return tick.month != null && tick.xRatio != null;
        })
        .sort(function (left, right) {
          return left.month - right.month;
        })
      : [];

    const exactTick = ticks.find(function (tick) {
      return Math.abs(tick.month - month) <= 0.000001;
    });
    if (exactTick) {
      return exactTick.xRatio;
    }

    const lowerTick = ticks.filter(function (tick) {
      return tick.month <= month;
    }).pop();
    const upperTick = ticks.find(function (tick) {
      return tick.month >= month;
    });
    if (lowerTick && upperTick && upperTick.month > lowerTick.month) {
      return clampNumber(
        lowerTick.xRatio + (((month - lowerTick.month) / (upperTick.month - lowerTick.month)) * (upperTick.xRatio - lowerTick.xRatio)),
        0,
        1
      );
    }

    return toOptionalNumber(graphModel?.phases?.deathEvent?.xRatio ?? graphModel?.axes?.x?.deathXRatio);
  }

  function resolveGraphMonthX(graphModel, monthIndex) {
    const month = toOptionalNumber(monthIndex);
    const xRatio = resolveGraphMonthXRatio(graphModel, month);
    return toGraphX(xRatio, graphModel, { monthIndex: month });
  }

  function renderGraphTransitionOutlookAnnotation(timelineResult, graphModel) {
    const outlook = getTransitionOutlook(timelineResult);
    const status = normalizeTransitionOutlookStatus(outlook?.status);
    const statusLabel = getTransitionOutlookCompactLabel(outlook?.status);
    const label = `First 3 Months: ${statusLabel}`;
    const frame = getGraphPlotFrame(graphModel);
    const lineY = frame.plotTop + 20;
    const labelY = lineY + 4;
    const labelWidth = Math.max(152, Math.min(240, (label.length * 7.2) + 24));
    const labelHeight = 24;
    const windowMonths = Math.max(1, toOptionalNumber(outlook?.windowMonths) ?? 3);
    const lineStartX = resolveGraphMonthX(graphModel, 0);
    const lineEndX = Math.max(lineStartX, resolveGraphMonthX(graphModel, windowMonths));
    const labelGap = 8;
    const labelX = clampNumber(
      lineEndX + labelGap + (labelWidth / 2),
      frame.plotLeft + (labelWidth / 2),
      frame.plotRight - (labelWidth / 2)
    );
    return `
      <g class="income-impact-transition-outlook-annotation"
        data-income-impact-transition-outlook-graph-annotation
        data-income-impact-transition-outlook-status="${escapeHtml(status)}"
        data-income-impact-transition-outlook-window-months="${escapeHtml(windowMonths)}"
        aria-label="90-Day Transition Outlook: ${escapeHtml(label)}">
        <line
          class="income-impact-transition-outlook-annotation__line"
          data-income-impact-transition-outlook-annotation-line
          x1="${formatSvgCoordinate(lineStartX)}"
          x2="${formatSvgCoordinate(lineEndX)}"
          y1="${formatSvgCoordinate(lineY)}"
          y2="${formatSvgCoordinate(lineY)}"></line>
        <rect
          class="income-impact-transition-outlook-annotation__label-shell"
          data-income-impact-transition-outlook-annotation-label-shell
          x="${formatSvgCoordinate(labelX - (labelWidth / 2))}"
          y="${formatSvgCoordinate(lineY - (labelHeight / 2))}"
          width="${formatSvgCoordinate(labelWidth)}"
          height="${formatSvgCoordinate(labelHeight)}"
          rx="6"></rect>
        <text
          class="income-impact-transition-outlook-annotation__label"
          data-income-impact-transition-outlook-annotation-label
          x="${formatSvgCoordinate(labelX)}"
          y="${formatSvgCoordinate(labelY)}"
          text-anchor="middle">${escapeHtml(label)}</text>
      </g>
    `;
  }

  function renderGraphSvg(graphModel, timelineResult) {
    const layoutFrame = getStableGraphLayoutFrame(graphModel);
    const appliedPreDeathPaths = renderAppliedScenarioPreDeathGraphPaths(graphModel);
    const preDeathPath = appliedPreDeathPaths
      || renderGraphPath(PRE_DEATH_ASSETS_PATH_ID, graphModel?.series?.preDeathAssets, "Projected assets before death", "smooth", null, graphModel);
    const appliedScenarioPaths = renderAppliedScenarioGraphPaths(graphModel, timelineResult);
    const comparisonPaths = renderComparisonGraphPaths(graphModel);
    const deathLineAnchors = renderAppliedScenarioDeathLineAnchors(graphModel);
    const deathConversionConnector = renderDeathEventConversionConnector(graphModel, timelineResult);
    const hoverLayer = renderGraphHoverLayer(graphModel);
    const storylineConnectors = renderGraphStorylineConnectors(timelineResult, graphModel);
    const storylineEventDots = renderGraphStorylineEventDots(timelineResult, graphModel);
    return `
      <svg
        class="income-impact-graph-svg"
        data-income-impact-graph-svg
        ${layoutFrame ? `
        data-income-impact-layout-frame-mode="${escapeHtml(layoutFrame.mode)}"
        data-income-impact-layout-frame-death-x-ratio="${escapeHtml(layoutFrame.deathXRatio)}"
        data-income-impact-layout-frame-zero-y-ratio="${escapeHtml(layoutFrame.zeroYRatio)}"
        data-income-impact-layout-frame-runout-anchor-x-ratio="${escapeHtml(layoutFrame.runoutAnchorXRatio)}"` : ""}
        viewBox="0 0 ${GRAPH_VIEW_BOX.width} ${GRAPH_VIEW_BOX.height}"
        role="img"
        aria-label="Income Impact timeline graph"
      >
        ${renderGraphHoverUnderlayGradient()}
        ${renderGraphPhases(graphModel)}
        ${renderGraphAxis(graphModel)}
        <g class="income-impact-graph-series" data-income-impact-graph-series>
          ${renderSelectedScenarioDeficitArea(graphModel, graphModel?.trace?.selectedScenarioId)}
          ${hoverLayer}
          ${storylineConnectors}
          ${preDeathPath}
          ${appliedScenarioPaths}
          ${comparisonPaths}
          ${deathConversionConnector}
          ${deathLineAnchors || renderGraphDeathAnchor(graphModel)}
          ${renderAppliedScenarioDepletionMarkers(graphModel, graphModel?.trace?.selectedScenarioId, timelineResult)}
        </g>
        ${renderGraphMarkers(graphModel)}
        ${renderComparisonMarkers(graphModel)}
        ${renderGraphTransitionOutlookAnnotation(timelineResult, graphModel)}
        ${storylineEventDots}
      </svg>
    `;
  }

  function renderGraphCallouts(graphModel) {
    const callouts = Array.isArray(graphModel?.callouts) ? graphModel.callouts : [];
    if (!callouts.length) {
      return "";
    }
    return `
      <div class="income-impact-graph-callouts" data-income-impact-graph-callouts>
        ${callouts.map(function (callout) {
          return `
            <span data-income-impact-graph-callout="${escapeHtml(callout.id || "")}" data-income-impact-graph-callout-phase="${escapeHtml(callout.phase || "")}">
              <b>${escapeHtml(callout.label || "Graph fact")}</b>
              <strong>${escapeHtml(formatGraphCalloutValue(callout))}</strong>
            </span>
          `;
        }).join("")}
      </div>
    `;
  }

  function renderSelectedGraphEvent(graphModel) {
    const selectedEvent = isPlainObject(graphModel?.selectedEvent) ? graphModel.selectedEvent : null;
    if (!selectedEvent) {
      return "";
    }
    return `
      <aside class="income-impact-graph-selected-event" data-income-impact-graph-selected-event>
        <span>${escapeHtml(getRiskSeverityLabel(selectedEvent.severity || selectedEvent.kind))}</span>
        <strong>${escapeHtml(selectedEvent.title || selectedEvent.markerLabel || "Selected event")}</strong>
        <p>${escapeHtml(selectedEvent.summary || "Review this event against the scenario facts.")}</p>
        ${renderPivotalEventMeta(selectedEvent)}
        ${renderPivotalEventEvidence(selectedEvent)}
      </aside>
    `;
  }

  function renderTimelineUnavailableState(timelineResult) {
    const runway = getFinancialRunway(timelineResult);
    const status = normalizeRunwayStatus(runway.status);
    const selectedDeathDate = timelineResult?.selectedDeath?.date || UNAVAILABLE_COPY;
    const selectedDeathAge = timelineResult?.selectedDeath?.age == null ? UNAVAILABLE_COPY : `Age ${timelineResult.selectedDeath.age}`;
    const facts = getPausedTimelineFacts(timelineResult);

    return `
      <div class="income-impact-timeline-paused" data-income-impact-visual-timeline data-income-impact-timeline-paused data-income-impact-runway-status="${escapeHtml(status)}">
        <div class="income-impact-paused-copy">
          <span>Timeline unavailable</span>
          <strong>Timeline graph unavailable with the current profile facts.</strong>
          <p>The scenario facts and risk panel remain available. Add the missing linked-profile data below to render the graph.</p>
        </div>
        <div class="income-impact-paused-facts" aria-label="Paused Income Impact preview facts">
          <span><b>Selected death date</b><strong>${escapeHtml(selectedDeathDate)}</strong></span>
          <span><b>Selected death age</b><strong>${escapeHtml(selectedDeathAge)}</strong></span>
          ${facts.map(function (fact) {
            return `<span data-income-impact-paused-fact="${escapeHtml(fact.id)}"><b>${escapeHtml(fact.label)}</b><strong>${escapeHtml(fact.value)}</strong></span>`;
          }).join("")}
        </div>
      </div>
    `;
  }

  function renderIncomeImpactTimelineGraph(timelineResult) {
    const graphModel = getGraphModel(timelineResult);
    if (!isPlainObject(graphModel) || !graphModel.status || graphModel.status === "unavailable" || !isPlainObject(graphModel.axes)) {
      return renderTimelineUnavailableState(timelineResult);
    }
    const selectedGraphSeries = getSelectedAppliedGraphSeries(graphModel, graphModel?.trace?.selectedScenarioId);
    const eyebrowLabel = getPrimaryGraphPathLabel(timelineResult, selectedGraphSeries?.label || "Selected scenario");
    return `
      <div class="income-impact-graph" data-income-impact-visual-timeline data-income-impact-graph data-income-impact-graph-status="${escapeHtml(graphModel.status || "partial")}">
        <div class="income-impact-graph-header">
          <div>
            <span>${escapeHtml(eyebrowLabel)}</span>
          </div>
          <p>Projected resources and required support after death.</p>
        </div>
          ${renderGraphSvg(graphModel, timelineResult)}
        ${renderGraphLegend(graphModel, timelineResult)}
        ${renderGraphCallouts(graphModel)}
        ${renderSelectedGraphEvent(graphModel)}
      </div>
    `;
  }

  function renderTopSummaryStrip(timelineResult) {
    const lifestyleReadout = renderLifestyleImpactReadout(timelineResult);
    return `
      <section class="income-impact-summary-strip" data-income-impact-summary-strip aria-label="Income Impact summary">
        ${renderFinancialSecurityCard(timelineResult)}
        ${lifestyleReadout}
      </section>
    `;
  }

  function getTransitionOutlook(timelineResult) {
    if (isPlainObject(timelineResult?.transitionOutlook)) {
      return timelineResult.transitionOutlook;
    }
    if (isPlainObject(timelineResult?.scenario?.transitionOutlook)) {
      return timelineResult.scenario.transitionOutlook;
    }
    return null;
  }

  function normalizeTransitionOutlookStatus(value) {
    const normalized = normalizeString(value).toLowerCase().replace(/[^a-z0-9]+/g, "");
    if (normalized === "stable") {
      return "stable";
    }
    if (normalized === "caution") {
      return "caution";
    }
    if (normalized === "atrisk") {
      return "atRisk";
    }
    if (normalized === "likelyfailure") {
      return "likelyFailure";
    }
    return "unavailable";
  }

  function getTransitionOutlookStatusCopy(status) {
    switch (normalizeTransitionOutlookStatus(status)) {
      case "stable":
        return "90-day cash need covered";
      case "caution":
        return "Cash coverage is thin";
      case "atRisk":
        return "Cash shortfall likely";
      case "likelyFailure":
        return "90-day cash gap";
      default:
        return "90-day outlook unavailable";
    }
  }

  function getTransitionOutlookCompactLabel(status) {
    switch (normalizeTransitionOutlookStatus(status)) {
      case "stable":
        return "Stable";
      case "caution":
        return "Caution";
      case "atRisk":
        return "At Risk";
      case "likelyFailure":
        return "Likely Failure";
      default:
        return "Unavailable";
    }
  }

  function formatTransitionOutlookRatio(value) {
    const number = toOptionalNumber(value);
    return number == null ? UNAVAILABLE_COPY : `${number.toFixed(2)}x`;
  }

  function renderTransitionOutlookReadout(timelineResult) {
    const outlook = getTransitionOutlook(timelineResult);
    const status = normalizeTransitionOutlookStatus(outlook?.status);
    const statusCopy = getTransitionOutlookStatusCopy(outlook?.status);
    return `
      <div class="income-impact-resource-outlook__placeholder"
        data-income-impact-transition-outlook
        data-income-impact-transition-outlook-status="${escapeHtml(status)}">
        <span>90-day status</span>
        <strong data-income-impact-transition-outlook-primary>${escapeHtml(statusCopy)}</strong>
        <p>Cash and emergency fund only.</p>
      </div>
      <div class="income-impact-resource-outlook__placeholder" data-income-impact-transition-outlook-metric="fast-access-cash">
        <span>Fast-access cash</span>
        <strong data-income-impact-transition-outlook-fast-access>${escapeHtml(formatCurrency(outlook?.fastAccessResources))}</strong>
        <p>Cash and emergency fund currently counted for the first 90 days.</p>
      </div>
      <div class="income-impact-resource-outlook__placeholder" data-income-impact-transition-outlook-metric="need">
        <span>90-day need</span>
        <strong data-income-impact-transition-outlook-need>${escapeHtml(formatCurrency(outlook?.transitionNeed90Days))}</strong>
        <p>First three post-death months of survivor needs and scheduled obligations.</p>
      </div>
      <div class="income-impact-resource-outlook__placeholder" data-income-impact-transition-outlook-metric="coverage-ratio">
        <span>Coverage ratio</span>
        <strong data-income-impact-transition-outlook-ratio>${escapeHtml(formatTransitionOutlookRatio(outlook?.fastAccessCoverageRatio))}</strong>
        <p>Excludes life insurance proceeds, brokerage, retirement, home equity, business value, and other delayed or illiquid assets.</p>
      </div>
    `;
  }

  function renderPlanningAlertsInbox() {
    return `
      <section class="income-impact-alert-inbox" data-income-impact-alert-inbox aria-label="Planning alerts">
        <div class="income-impact-alert-inbox__header">
          <span>Planning Alerts</span>
          <strong>Inbox</strong>
        </div>
        <div class="income-impact-alert-inbox__empty" data-income-impact-alert-inbox-empty>
          <span>No active alerts</span>
          <p>Warnings and review notes will appear here when assumptions need attention.</p>
        </div>
      </section>
    `;
  }

  function renderResourceOutlookPanel(timelineResult) {
    return `
      ${renderPlanningAlertsInbox()}
      <section class="income-impact-resource-outlook" data-income-impact-resource-outlook>
        <div class="income-impact-resource-outlook__header">
          <span>Resource Outlook</span>
          <strong>90-Day Transition Outlook</strong>
          <p>Can the household cover the first 90 days using cash and emergency fund only?</p>
        </div>
        ${renderTransitionOutlookReadout(timelineResult)}
      </section>
    `;
  }

  function syncResourceOutlookPanel(timelineResult) {
    if (typeof document === "undefined" || typeof document.querySelector !== "function") {
      return;
    }
    const panel = document.querySelector("[data-income-impact-insights-panel]");
    if (!panel) {
      return;
    }
    panel.innerHTML = renderResourceOutlookPanel(isPlainObject(timelineResult) ? timelineResult : {});
  }

  function getFinancialStorylineMajorCandidates(timelineResult) {
    return (Array.isArray(timelineResult?.financialStoryline?.majorStoryCandidates)
      ? timelineResult.financialStoryline.majorStoryCandidates
      : []
    ).filter(isPlainObject).slice(0, FINANCIAL_STORYLINE_MAJOR_CARD_LIMIT);
  }

  function getMajorStoryCardTitle(candidate) {
    return normalizeString(candidate?.cardTitle || candidate?.displayLabel || candidate?.graphLabel || candidate?.id) || "Storyline event";
  }

  function getMajorStoryCardDescription(candidate) {
    return normalizeString(candidate?.description || candidate?.summary || "");
  }

  function renderMajorStoryCard(candidate, index) {
    const title = getMajorStoryCardTitle(candidate);
    const timeLabel = getGraphStorylineDotTimeLabel(candidate);
    const amountLabel = getGraphStorylineDotAmountLabel(candidate);
    const evidenceLabel = getGraphStorylineDotEvidenceLabel(candidate);
    const description = getMajorStoryCardDescription(candidate);
    const sequence = String(index + 1).padStart(2, "0");
    const severity = normalizeString(candidate?.severity) || "info";
    const family = normalizeString(candidate?.family) || "event";
    const metaItems = [timeLabel, evidenceLabel].filter(Boolean);
    const ariaLabel = [
      `Frame ${index + 1}`,
      title,
      timeLabel,
      amountLabel
    ].filter(Boolean).join(", ");

    return `
      <article
        class="income-impact-major-story-card income-impact-major-story-card--severity-${escapeHtml(severity)} income-impact-major-story-card--family-${escapeHtml(family)}"
        data-income-impact-major-story-card
        data-income-impact-major-story-event-id="${escapeHtml(candidate?.id || "")}"
        data-income-impact-major-story-family="${escapeHtml(candidate?.family || "")}"
        data-income-impact-major-story-severity="${escapeHtml(candidate?.severity || "")}"
        aria-label="${escapeHtml(ariaLabel)}"
      >
        <div class="income-impact-major-story-card__eyebrow">
          <span>${escapeHtml(sequence)}</span>
          <small>${escapeHtml(family.replace(/-/g, " "))}</small>
        </div>
        <h4 class="income-impact-major-story-card__title">${escapeHtml(title)}</h4>
        ${metaItems.length ? `<p class="income-impact-major-story-card__meta">${metaItems.map(escapeHtml).join(" &middot; ")}</p>` : ""}
        ${amountLabel ? `<p class="income-impact-major-story-card__amount">${escapeHtml(amountLabel)}</p>` : ""}
        ${description ? `<p class="income-impact-major-story-card__description">${escapeHtml(description)}</p>` : ""}
      </article>
    `;
  }

  function renderFinancialDepletionStoryScaffold(timelineResult) {
    const majorStoryCandidates = getFinancialStorylineMajorCandidates(timelineResult);
    return `
      <section class="income-impact-depletion-story" data-income-impact-depletion-story aria-label="Financial Depletion Story">
        <div class="income-impact-depletion-story-header">
          <h3>
            <svg aria-hidden="true" width="13" height="13" viewBox="0 0 13 13" fill="none"><path d="M1 10.5L3.6 7.5L6.2 9L9.2 4.2L12 5.8" stroke="currentColor" stroke-width="1.45" stroke-linecap="round" stroke-linejoin="round"></path></svg>
            Financial Depletion Story
          </h3>
        </div>
        <div class="income-impact-depletion-story-lane" data-income-impact-depletion-story-lane>
          ${majorStoryCandidates.length ? `
            <div class="income-impact-major-story" data-income-impact-major-story>
              <div class="income-impact-major-story__list" data-income-impact-major-story-list>
                ${majorStoryCandidates.map(renderMajorStoryCard).join("")}
              </div>
            </div>
          ` : `
            <p class="income-impact-depletion-story-empty" data-income-impact-depletion-story-empty>
              Storyline events will appear here once verified timeline drivers are available.
            </p>
          `}
        </div>
      </section>
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

  function getCompressionItems(timelineResult, key) {
    const reporting = isPlainObject(timelineResult?.compressionReporting) ? timelineResult.compressionReporting : {};
    const layer5 = isPlainObject(reporting.layer5) ? reporting.layer5 : {};
    return Array.isArray(layer5[key]) ? layer5[key].filter(isPlainObject) : [];
  }

  function getCompressionDataGaps(timelineResult) {
    const reporting = isPlainObject(timelineResult?.compressionReporting) ? timelineResult.compressionReporting : {};
    const layer5 = isPlainObject(reporting.layer5) ? reporting.layer5 : {};
    const reportingGaps = Array.isArray(layer5.compressionDataGaps)
      ? layer5.compressionDataGaps.filter(isPlainObject)
      : [];
    const scenarioGaps = Array.isArray(layer5.compressionScenarioDataGaps)
      ? layer5.compressionScenarioDataGaps.filter(isPlainObject)
      : [];
    return reportingGaps.concat(scenarioGaps);
  }

  function getCompressionPolicyRules(timelineResult) {
    const reporting = isPlainObject(timelineResult?.compressionReporting) ? timelineResult.compressionReporting : {};
    const prep = isPlainObject(reporting.prep) ? reporting.prep : {};
    return Array.isArray(prep.compressionPolicyRules) ? prep.compressionPolicyRules.filter(isPlainObject) : [];
  }

  function buildCompressionPolicyByType(timelineResult) {
    return getCompressionPolicyRules(timelineResult).reduce(function (next, rule, index) {
      const typeKey = normalizeString(rule.expenseTypeKey);
      if (!typeKey || next[typeKey]) {
        return next;
      }

      next[typeKey] = Object.assign({}, rule, {
        displayOrderIndex: index
      });
      return next;
    }, {});
  }

  function getCompressionItemPolicy(item, policyByType) {
    const typeKey = normalizeString(item?.typeKey || item?.expenseTypeKey);
    return typeKey && policyByType ? policyByType[typeKey] || null : null;
  }

  function sortCompressionItemsByPolicy(items, policyByType) {
    return items.slice().sort(function (left, right) {
      const leftPolicy = getCompressionItemPolicy(left, policyByType);
      const rightPolicy = getCompressionItemPolicy(right, policyByType);
      const leftRank = toOptionalNumber(leftPolicy?.compressionOrderRank) ?? Number.MAX_SAFE_INTEGER;
      const rightRank = toOptionalNumber(rightPolicy?.compressionOrderRank) ?? Number.MAX_SAFE_INTEGER;
      if (leftRank !== rightRank) {
        return leftRank - rightRank;
      }

      const leftIndex = toOptionalNumber(leftPolicy?.displayOrderIndex) ?? Number.MAX_SAFE_INTEGER;
      const rightIndex = toOptionalNumber(rightPolicy?.displayOrderIndex) ?? Number.MAX_SAFE_INTEGER;
      if (leftIndex !== rightIndex) {
        return leftIndex - rightIndex;
      }

      return getCompressionItemLabel(left).localeCompare(getCompressionItemLabel(right));
    });
  }

  function formatMonthlyCompressionAmount(item) {
    const amount = toOptionalNumber(
      item?.possibleMonthlyReduction
        ?? item?.currentMonthlyAmount
        ?? item?.monthlyAmount
        ?? item?.amount
    );
    return amount == null ? "" : `${formatCurrency(amount)}/mo`;
  }

  function getCompressionItemLabel(item) {
    return item?.label || item?.typeKey || item?.expenseTypeKey || "Expense item";
  }

  function isDebtRecordsOwnedCompressionItem(item) {
    const reasonCode = normalizeString(item?.reasonCode);
    const sourceKey = normalizeString(item?.sourceKey);
    const sourcePath = normalizeString(item?.sourcePath);
    return reasonCode === "generated-debt-payment-excluded"
      || sourceKey === "debtRecords"
      || sourcePath.includes("debtRecords");
  }

  function getCompressionItemDetail(item, policy) {
    if (isDebtRecordsOwnedCompressionItem(item)) {
      return "Source-owned by Debt Records";
    }

    const orderRank = toOptionalNumber(policy?.compressionOrderRank);
    if (orderRank != null) {
      return `Review order ${orderRank}`;
    }

    const reason = item?.reason || item?.reasonCode || item?.status || "";
    if (reason) {
      return reason;
    }

    return "";
  }

  function renderCompressionItemList(items, emptyCopy, options) {
    const safeOptions = isPlainObject(options) ? options : {};
    const policyByType = safeOptions.policyByType || {};
    const sortedItems = sortCompressionItemsByPolicy(items, policyByType);

    if (!sortedItems.length) {
      return `<div class="income-impact-empty-inline">${escapeHtml(emptyCopy)}</div>`;
    }

    return `
      <ul class="income-impact-compression-item-list">
        ${sortedItems.slice(0, 4).map(function (item) {
          const policy = getCompressionItemPolicy(item, policyByType);
          const amount = formatMonthlyCompressionAmount(item);
          const detail = getCompressionItemDetail(item, policy);
          const orderRank = toOptionalNumber(policy?.compressionOrderRank);
          return `
            <li${orderRank == null ? "" : ` data-income-impact-compression-order-rank="${escapeHtml(orderRank)}"`}>
              <span class="income-impact-compression-item-main">
                <span>${escapeHtml(getCompressionItemLabel(item))}</span>
                ${detail ? `<small>${escapeHtml(detail)}</small>` : ""}
              </span>
              <strong>${escapeHtml(amount || "Review")}</strong>
            </li>
          `;
        }).join("")}
      </ul>
    `;
  }

  function getCompressionGapTitle(gap) {
    const code = normalizeString(gap?.code);
    if (code === "scalar-household-expenses-not-itemized-for-compression") {
      return "Scalar household itemization limitation";
    }
    if (code === "expense-frequency-review-required") {
      return "Periodic policy limitation";
    }
    return gap?.label || gap?.code || "Compression reporting limitation";
  }

  function renderCompressionDataGapList(dataGaps) {
    if (!dataGaps.length) {
      return `<div class="income-impact-empty-inline">No compression-specific data gaps reported.</div>`;
    }

    return `
      <ul class="income-impact-compression-gap-list">
        ${dataGaps.slice(0, 4).map(function (gap) {
          const title = getCompressionGapTitle(gap);
          const message = gap.message || gap.label || gap.code || "Compression reporting limitation.";
          return `
            <li>
              <strong>${escapeHtml(title)}</strong>
              <span>${escapeHtml(message)}</span>
            </li>
          `;
        }).join("")}
      </ul>
    `;
  }

  function renderPolicyDecisionSummary(summary) {
    const safeSummary = isPlainObject(summary) ? summary : {};
    return `
      <div class="income-impact-compression-policy" data-income-impact-compression-policy-summary>
        <span><b>YES</b>${escapeHtml(safeSummary.YES ?? 0)}</span>
        <span><b>PAUSE</b>${escapeHtml(safeSummary.PAUSE ?? 0)}</span>
        <span><b>NO</b>${escapeHtml(safeSummary.NO ?? 0)}</span>
        <span><b>INTERVENTION</b>${escapeHtml(safeSummary.INTERVENTION ?? 0)}</span>
      </div>
    `;
  }

  function renderLifestyleScenarioStatus(timelineResult) {
    const reporting = isPlainObject(timelineResult?.compressionReporting) ? timelineResult.compressionReporting : {};
    const lifestyleScenario = isPlainObject(reporting.lifestyleScenario) ? reporting.lifestyleScenario : null;
    const trace = isPlainObject(reporting.trace) ? reporting.trace : {};
    const sliderValue = clampLifestyleSliderValue(trace.lifestyleSliderValue);
    const label = lifestyleScenario
      ? `Lifestyle comparison: ${getLifestyleSliderLabel(sliderValue)}`
      : "Lifestyle comparison unavailable";
    const detail = lifestyleScenario
      ? "Controls the single comparison line; fixed and review-only expenses stay unchanged."
      : "Lifestyle helper output is not available for this preview.";
    return `
      <div class="income-impact-empty-inline" data-income-impact-lifestyle-scenario-status="${escapeHtml(lifestyleScenario?.status || "unavailable")}">
        <strong>${escapeHtml(label)}</strong>
        <span>${escapeHtml(detail)}</span>
      </div>
    `;
  }

  function renderCompressionReportingPanel(timelineResult) {
    const reporting = isPlainObject(timelineResult?.compressionReporting) ? timelineResult.compressionReporting : {};
    const layer5 = isPlainObject(reporting.layer5) ? reporting.layer5 : {};
    const opportunities = getCompressionItems(timelineResult, "compressionOpportunities");
    const pauseCandidates = getCompressionItems(timelineResult, "pauseCandidates");
    const protectedItems = getCompressionItems(timelineResult, "protectedExpenseItems");
    const excludedItems = getCompressionItems(timelineResult, "excludedExpenseItems");
    const protectedExcludedItems = protectedItems.concat(excludedItems);
    const dataGaps = getCompressionDataGaps(timelineResult);
    const policyByType = buildCompressionPolicyByType(timelineResult);
    const totalItems = opportunities.length + pauseCandidates.length + protectedExcludedItems.length + dataGaps.length;
    const enabled = layer5?.compressionTrace?.compressionReportingEnabled === true;
    const emptyCopy = enabled
      ? "No compression opportunities, pause candidates, protected items, exclusions, or compression-specific gaps were reported."
      : "Compression reporting is not available for this preview yet.";

    return `
      <article class="income-impact-card income-impact-compression-panel" data-income-impact-compression-panel>
        <div class="income-impact-card-header">
          <h3>Expense Compression Readiness</h3>
          <p data-income-impact-compression-reporting-only>Reporting only - not applied to the projection.</p>
        </div>
        ${renderLifestyleScenarioStatus(timelineResult)}
        ${totalItems ? `
          <div class="income-impact-compression-counts" data-income-impact-compression-counts>
            <span><b>${opportunities.length}</b>Opportunities</span>
            <span><b>${pauseCandidates.length}</b>Pause</span>
            <span><b>${protectedExcludedItems.length}</b>Protected / excluded</span>
            <span><b>${dataGaps.length}</b>Data gaps</span>
          </div>
          <div class="income-impact-compression-groups">
            <section data-income-impact-compression-group="firstReductions">
              <h4>First reductions to review</h4>
              ${renderCompressionItemList(opportunities, "No reduction candidates reported.", { policyByType })}
            </section>
            <section data-income-impact-compression-group="contributionPauses">
              <h4>Contribution pauses</h4>
              ${renderCompressionItemList(pauseCandidates, "No contribution pause candidates reported.", { policyByType })}
            </section>
            <section data-income-impact-compression-group="protectedExcluded">
              <h4>Protected / excluded items</h4>
              ${renderCompressionItemList(protectedExcludedItems, "No protected or excluded items reported.", { policyByType })}
            </section>
            <section data-income-impact-compression-group="dataLimitations">
              <h4>Data limitations</h4>
              ${renderCompressionDataGapList(dataGaps)}
            </section>
            <section data-income-impact-compression-group="policySummary">
              <h4>Policy summary</h4>
              ${renderPolicyDecisionSummary(layer5.policyDecisionSummary)}
            </section>
          </div>
        ` : `
          <div class="income-impact-empty-inline" data-income-impact-compression-empty>${escapeHtml(emptyCopy)}</div>
          ${renderPolicyDecisionSummary(layer5.policyDecisionSummary)}
        `}
      </article>
    `;
  }

  function getPivotalEvents(timelineResult) {
    const riskEvaluation = isPlainObject(timelineResult?.riskEvaluation) ? timelineResult.riskEvaluation : {};
    return {
      risks: (Array.isArray(riskEvaluation.events) ? riskEvaluation.events : []).filter(isPlainObject),
      stable: (Array.isArray(riskEvaluation.stableEvents) ? riskEvaluation.stableEvents : []).filter(isPlainObject)
    };
  }

  function getRiskSeverityLabel(severity) {
    const normalized = String(severity || "").trim();
    if (normalized === "critical") {
      return "Critical";
    }
    if (normalized === "at-risk") {
      return "At Risk";
    }
    if (normalized === "caution") {
      return "Caution";
    }
    if (normalized === "stable") {
      return "Stable";
    }
    return normalized || "Review";
  }

  function formatPivotalEventTiming(event) {
    const pieces = [];
    if (event?.date) {
      pieces.push(event.date);
    }
    if (event?.age != null) {
      pieces.push(`Age ${event.age}`);
    }
    if (!pieces.length && event?.monthIndex != null) {
      const months = toOptionalNumber(event.monthIndex);
      if (months === 0) {
        pieces.push("At death");
      } else if (months != null) {
        pieces.push(`Month ${months}`);
      }
    }
    return pieces.join(" - ");
  }

  function formatEvidenceValue(value) {
    const number = toOptionalNumber(value);
    if (number != null && Math.abs(number) >= 1000) {
      return formatCurrency(number);
    }
    if (Array.isArray(value)) {
      const items = value
        .slice(0, 3)
        .map(formatEvidenceValue)
        .filter(function (item) { return item && item !== UNAVAILABLE_COPY; });
      return items.length ? items.join(", ") : UNAVAILABLE_COPY;
    }
    if (isPlainObject(value)) {
      const entries = Object.keys(value)
        .filter(function (key) {
          const entryValue = value[key];
          return entryValue == null
            || typeof entryValue === "string"
            || typeof entryValue === "number"
            || typeof entryValue === "boolean";
        })
        .slice(0, 4)
        .map(function (key) {
          const label = key
            .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
            .replace(/[_-]+/g, " ")
            .replace(/\b\w/g, function (match) { return match.toUpperCase(); });
          return `${label}: ${formatEvidenceValue(value[key])}`;
        });
      return entries.length ? entries.join("; ") : UNAVAILABLE_COPY;
    }
    if (typeof value === "boolean") {
      return value ? "Yes" : "No";
    }
    if (value == null || value === "") {
      return UNAVAILABLE_COPY;
    }
    return String(value);
  }

  function renderPivotalEventMeta(event) {
    const timing = formatPivotalEventTiming(event);
    const amount = toOptionalNumber(event?.amount);
    const pieces = [];
    if (timing) {
      pieces.push(`<span>${escapeHtml(timing)}</span>`);
    }
    if (amount != null) {
      pieces.push(`<span>${escapeHtml(formatCurrency(amount))}</span>`);
    }
    return pieces.length ? `<div class="income-impact-risk-meta">${pieces.join("")}</div>` : "";
  }

  function renderPivotalEventDataGaps(event) {
    const dataGaps = Array.isArray(event?.dataGaps) ? event.dataGaps : [];
    if (!dataGaps.length) {
      return "";
    }
    return `
      <ul class="income-impact-risk-gaps">
        ${dataGaps.map(function (gap) {
          return `<li>${escapeHtml(gap?.label || gap?.code || "Additional profile information is needed.")}</li>`;
        }).join("")}
      </ul>
    `;
  }

  function renderPivotalEventEvidence(event) {
    const evidence = Array.isArray(event?.evidence) ? event.evidence.filter(isPlainObject).slice(0, 3) : [];
    if (!evidence.length) {
      return "";
    }

    return `
      <dl class="income-impact-risk-evidence" data-income-impact-risk-evidence>
        ${evidence.map(function (item) {
          return `
            <div data-income-impact-risk-evidence-path="${escapeHtml(item.path || "")}">
              <dt>${escapeHtml(item.label || item.path || "Evidence")}</dt>
              <dd>${escapeHtml(formatEvidenceValue(item.value))}</dd>
            </div>
          `;
        }).join("")}
      </dl>
    `;
  }

  function renderRiskEvent(event) {
    const severity = String(event?.severity || "").trim();
    return `
      <article
        class="income-impact-risk-item"
        data-income-impact-risk-event
        data-income-impact-risk-severity="${escapeHtml(severity)}"
        data-income-impact-risk-type="${escapeHtml(event?.category || "")}"
        data-income-impact-risk-rule-id="${escapeHtml(event?.ruleId || event?.id || "")}"
      >
        <div class="income-impact-risk-item-header">
          <span class="income-impact-risk-severity" data-income-impact-risk-severity-label="${escapeHtml(severity)}">${escapeHtml(getRiskSeverityLabel(severity))}</span>
          <strong>${escapeHtml(event?.title || "Risk detected")}</strong>
        </div>
        <p>${escapeHtml(event?.summary || "Review this Income Impact scenario with the available facts.")}</p>
        ${renderPivotalEventMeta(event)}
        ${renderPivotalEventEvidence(event)}
        ${renderPivotalEventDataGaps(event)}
      </article>
    `;
  }

  function renderStableEvent(event) {
    return `
      <li data-income-impact-covered-event data-income-impact-covered-type="${escapeHtml(event?.category || "")}" data-income-impact-covered-rule-id="${escapeHtml(event?.ruleId || event?.id || "")}">
        <div>
          <strong>${escapeHtml(event?.title || "Covered item")}</strong>
          <p>${escapeHtml(event?.summary || "This item is represented in the current preview.")}</p>
        </div>
        ${renderPivotalEventMeta(event)}
        ${renderPivotalEventEvidence(event)}
      </li>
    `;
  }

  function renderPivotalRiskPanel(timelineResult) {
    const events = getPivotalEvents(timelineResult);
    const dataGaps = Array.isArray(timelineResult?.dataGaps) ? timelineResult.dataGaps : [];
    const hasRisks = events.risks.length > 0;
    const stablePanel = events.stable.length
      ? `
        <details class="income-impact-covered-panel" data-income-impact-covered-panel>
          <summary>What is covered</summary>
          <ul>
            ${events.stable.map(renderStableEvent).join("")}
          </ul>
        </details>
      `
      : "";
    const emptyCopy = dataGaps.length
      ? "No risk events are available yet because the preview is missing key facts. Review the data needed below."
      : "No major risks detected from the available facts.";

    return `
      <article class="income-impact-card income-impact-card--wide income-impact-risk-panel" data-income-impact-risk-panel>
        <div class="income-impact-card-header">
          <h3>Key risks detected</h3>
          <p>These events are generated from the available scenario facts for this local preview. This does not change the LENS recommendation.</p>
        </div>
        ${hasRisks ? `
          <div class="income-impact-risk-list" data-income-impact-risk-list>
            ${events.risks.map(renderRiskEvent).join("")}
          </div>
        ` : `
          <div class="income-impact-empty-inline" data-income-impact-risk-empty>${escapeHtml(emptyCopy)}</div>
        `}
        ${stablePanel}
      </article>
    `;
  }

  function renderTimeline(timelineResult) {
    return `
      <section class="income-impact-chart-section" data-income-impact-helper-timeline data-income-impact-chart-section>
        <div class="income-impact-section-header">
          <h3>Remaining Resources Timeline</h3>
        </div>
        <div class="income-impact-timeline" aria-label="Fact-based household impact timeline">
          ${renderIncomeImpactTimelineGraph(timelineResult)}
          ${renderDataGaps(timelineResult)}
          ${renderWarnings(timelineResult)}
        </div>
      </section>
    `;
  }

  function renderIncomeImpact(host, context) {
    const timelineResult = isPlainObject(context?.timelineResult) ? context.timelineResult : {};
    syncResourceOutlookPanel(timelineResult);
    host.innerHTML = `
      <div class="income-impact-layout" data-income-impact-layout>
        ${renderTopSummaryStrip(timelineResult)}
        <section class="income-impact-story-chart-card" data-income-impact-story-chart-card>
          ${renderFinancialDepletionStoryScaffold(timelineResult)}
          <div class="income-impact-layout-main" data-income-impact-layout-main>
            ${renderTimeline(timelineResult)}
          </div>
        </section>
        <aside class="income-impact-layout-aside" data-income-impact-layout-aside aria-label="Income Impact supporting details">
          ${renderPivotalRiskPanel(timelineResult)}
          ${renderCompressionReportingPanel(timelineResult)}
          <div class="income-impact-runway-metric-stack" data-income-impact-runway-metric-stack>
            ${renderFinancialRunwayCards(timelineResult)}
          </div>
        </aside>
      </div>
    `;
  }

  function resolveAnalysisSettings(profileRecord, builderInput) {
    if (isPlainObject(profileRecord?.analysisSettings)) {
      return profileRecord.analysisSettings;
    }
    if (isPlainObject(builderInput?.analysisSettings)) {
      return builderInput.analysisSettings;
    }
    if (isPlainObject(builderInput?.protectionModelingPayload?.analysisSettings)) {
      return builderInput.protectionModelingPayload.analysisSettings;
    }
    return {};
  }

  function resolveAnalysisSettingsSource(profileRecord, protectionModelingPayload, analysisSettings) {
    if (!isPlainObject(analysisSettings)) {
      return "unavailable";
    }

    if (analysisSettings === profileRecord?.analysisSettings) {
      return "profileRecord.analysisSettings";
    }

    if (analysisSettings === protectionModelingPayload?.analysisSettings) {
      return "protectionModelingPayload.analysisSettings";
    }

    return Object.keys(analysisSettings).length ? "resolved-analysisSettings" : "defaults";
  }

  function buildFinancialRunwayFromScenario(scenario, projectionHorizonYears) {
    const facts = isPlainObject(scenario?.timelineFacts) ? scenario.timelineFacts : {};
    const deathEvent = isPlainObject(scenario?.deathEvent) ? scenario.deathEvent : {};
    const postDeathSeries = isPlainObject(scenario?.postDeathSeries) ? scenario.postDeathSeries : {};
    const depletion = isPlainObject(postDeathSeries.depletion) ? postDeathSeries.depletion : {};
    const monthsCovered = toOptionalNumber(facts.monthsCovered);
    const yearsOfSecurity = monthsCovered == null ? null : Math.floor(Math.max(0, monthsCovered) / 12);
    const monthsOfSecurity = monthsCovered == null ? null : Math.round(Math.max(0, monthsCovered) % 12);
    const totalResourcesBeforeObligations = toOptionalNumber(deathEvent?.layer2?.resources?.totalResourcesBeforeObligations);
    return {
      status: scenario?.status === "complete" ? "complete" : "partial-estimate",
      startingResources: totalResourcesBeforeObligations,
      existingCoverage: facts.coverageAdded,
      availableAssets: facts.survivorAvailableTreatedAssets,
      immediateObligations: deathEvent.immediateObligations,
      netAvailableResources: facts.resourcesAfterObligations,
      annualHouseholdNeed: null,
      annualSurvivorIncome: null,
      annualShortfall: null,
      yearsOfSecurity,
      monthsOfSecurity,
      totalMonthsOfSecurity: monthsCovered,
      depletionDate: facts.depletionDate,
      depletionYear: facts.depletionDate ? Number(String(facts.depletionDate).slice(0, 4)) : null,
      projectionYears: projectionHorizonYears,
      projectionPoints: [],
      warnings: Array.isArray(scenario?.warnings) ? scenario.warnings : [],
      dataGaps: Array.isArray(scenario?.dataGaps) ? scenario.dataGaps : [],
      trace: {
        source: "composeIncomeImpactScenario.timelineFacts"
      }
    };
  }

  function buildSummaryCardsFromScenario(scenario) {
    const facts = isPlainObject(scenario?.timelineFacts) ? scenario.timelineFacts : {};
    const depletionDate = facts.depletionDate;
    const monthsCovered = facts.monthsCovered;
    const displayValue = depletionDate ? formatMonthsCovered(monthsCovered) : "Not depleted within horizon";
    return [
      {
        id: "yearsOfFinancialSecurity",
        displayValue,
        status: scenario?.status === "complete" ? "complete" : "partial-estimate"
      }
    ];
  }

  function normalizeBooleanScenarioControl(value, fallbackValue) {
    if (value === true || value === false) {
      return value;
    }
    const normalized = normalizeString(value).toLowerCase();
    if (["true", "on", "yes", "include", "included"].includes(normalized)) {
      return true;
    }
    if (["false", "off", "no", "exclude", "excluded"].includes(normalized)) {
      return false;
    }
    return fallbackValue !== false;
  }

  function getAssumptionSurvivorIncomeEnabled(lensModel) {
    const survivorScenario = isPlainObject(lensModel?.survivorScenario) ? lensModel.survivorScenario : {};
    const derivation = isPlainObject(survivorScenario.survivorIncomeDerivation)
      ? survivorScenario.survivorIncomeDerivation
      : {};
    const source = normalizeString(derivation.survivorIncomeSource);
    if (
      derivation.includeSurvivorIncomeOffset === false
      || source === "suppressed-survivor-income-offset-disabled"
      || survivorScenario.survivorContinuesWorking === false
      || derivation.survivorContinuesWorking === false
      || source === "suppressed-survivor-not-working"
    ) {
      return false;
    }
    return true;
  }

  function getSurvivorIncomeScenarioLabelSuffix(state, settings) {
    const includeSurvivorIncome = normalizeBooleanScenarioControl(settings?.includeSurvivorIncome, true);
    const assumptionDefault = getAssumptionSurvivorIncomeEnabled(state?.lensModel);
    if (includeSurvivorIncome === assumptionDefault) {
      return "";
    }
    return includeSurvivorIncome ? " - survivor income on" : " - no survivor income";
  }

  function normalizeScenarioControlsForState(state, controls) {
    const safeState = isPlainObject(state) ? state : {};
    const sourceControls = isPlainObject(controls) ? controls : {};
    const scenarioState = isPlainObject(safeState.scenarioState) ? safeState.scenarioState : {};
    const deathAgeState = isPlainObject(safeState.deathAgeState) ? safeState.deathAgeState : {};
    const selectedDeathAge = deathAgeState.hasDateOfBirth
      ? clampRoundedAge(sourceControls.selectedDeathAge ?? deathAgeState.selectedDeathAge, deathAgeState.minAge, deathAgeState.maxAge)
      : null;
    const selectedDeathDate = resolveSelectedDeathDate(
      safeState.valuationDate,
      Object.assign({}, deathAgeState, { selectedDeathAge })
    );
    const normalizedControls = {
      selectedDeathAge,
      selectedDeathDate,
      projectionHorizonYears: clampProjectionHorizonYears(sourceControls.projectionHorizonYears ?? scenarioState.projectionHorizonYears),
      mortgageTreatmentOverride: normalizeMortgageTreatmentOverride(sourceControls.mortgageTreatmentOverride ?? scenarioState.mortgageTreatmentOverride),
      includeSurvivorIncome: normalizeBooleanScenarioControl(
        sourceControls.includeSurvivorIncome ?? scenarioState.includeSurvivorIncome,
        getAssumptionSurvivorIncomeEnabled(safeState.lensModel)
      ),
      lifestyleSliderValue: clampLifestyleSliderValue(sourceControls.lifestyleSliderValue ?? scenarioState.lifestyleSliderValue),
      autoCompressBaselineEnabled: (sourceControls.autoCompressBaselineEnabled ?? scenarioState.autoCompressBaselineEnabled) !== false
    };
    const householdExpenseStreamPolicyMode = normalizeString(
      sourceControls.householdExpenseStreamPolicyMode ?? scenarioState.householdExpenseStreamPolicyMode
    );
    if (householdExpenseStreamPolicyMode) {
      normalizedControls.householdExpenseStreamPolicyMode = householdExpenseStreamPolicyMode;
    }

    return normalizedControls;
  }

  function getRuntimeScenarioControlsSnapshot(state) {
    return normalizeScenarioControlsForState(state, null);
  }

  function getDraftScenarioControlsSnapshot(state) {
    const draftControls = isPlainObject(state?.draftScenarioControls) ? state.draftScenarioControls : null;
    return normalizeScenarioControlsForState(state, draftControls);
  }

  function setDraftScenarioControls(state, controls) {
    if (!isPlainObject(state)) {
      return null;
    }

    state.draftScenarioControls = normalizeScenarioControlsForState(state, controls);
    return state.draftScenarioControls;
  }

  function syncDraftScenarioControlsFromState(state) {
    if (!isPlainObject(state)) {
      return null;
    }

    state.draftScenarioControls = getRuntimeScenarioControlsSnapshot(state);
    return state.draftScenarioControls;
  }

  function getSelectedAppliedScenario(state) {
    const scenarios = Array.isArray(state?.appliedScenarios) ? state.appliedScenarios : [];
    if (!scenarios.length) {
      return null;
    }

    return scenarios.find(function (scenario, index) {
      return getAppliedScenarioId(scenario, index) === state?.selectedScenarioId;
    }) || scenarios[0];
  }

  function findAppliedScenarioSelection(state, scenarioId) {
    const normalizedScenarioId = normalizeString(scenarioId);
    const scenarios = Array.isArray(state?.appliedScenarios) ? state.appliedScenarios : [];
    if (!normalizedScenarioId || !scenarios.length) {
      return null;
    }

    for (let index = 0; index < scenarios.length; index += 1) {
      const appliedScenario = scenarios[index];
      const appliedScenarioId = getAppliedScenarioId(appliedScenario, index);
      if (appliedScenarioId === normalizedScenarioId) {
        return {
          scenario: appliedScenario,
          scenarioId: appliedScenarioId,
          index
        };
      }
    }

    return null;
  }

  function selectAppliedScenario(state, scenarioId) {
    if (!isPlainObject(state)) {
      return null;
    }

    const selection = findAppliedScenarioSelection(state, scenarioId);
    if (!selection) {
      return null;
    }

    state.selectedScenarioId = selection.scenarioId;
    state.draftScenarioControls = normalizeScenarioControlsForState(
      state,
      isPlainObject(selection.scenario?.settings) ? selection.scenario.settings : null
    );
    return selection;
  }

  function scenarioControlsAreEqual(left, right) {
    return getScenarioSettingsKey(left) === getScenarioSettingsKey(right);
  }

  function getScenarioSettingsKey(settings) {
    const safeSettings = isPlainObject(settings) ? settings : {};
    return JSON.stringify({
      selectedDeathAge: toOptionalNumber(safeSettings.selectedDeathAge),
      selectedDeathDate: normalizeString(safeSettings.selectedDeathDate) || null,
      projectionHorizonYears: clampProjectionHorizonYears(safeSettings.projectionHorizonYears),
      mortgageTreatmentOverride: normalizeMortgageTreatmentOverride(safeSettings.mortgageTreatmentOverride),
      includeSurvivorIncome: normalizeBooleanScenarioControl(safeSettings.includeSurvivorIncome, true),
      lifestyleSliderValue: clampLifestyleSliderValue(safeSettings.lifestyleSliderValue),
      autoCompressBaselineEnabled: safeSettings.autoCompressBaselineEnabled !== false,
      householdExpenseStreamPolicyMode: normalizeString(safeSettings.householdExpenseStreamPolicyMode) || null
    });
  }

  function getAppliedScenarioSettingsSnapshot(state) {
    const selectedScenario = getSelectedAppliedScenario(state);
    return normalizeScenarioControlsForState(
      state,
      isPlainObject(selectedScenario?.settings) ? selectedScenario.settings : getRuntimeScenarioControlsSnapshot(state)
    );
  }

  function hasDraftScenarioChanges(state) {
    if (!isPlainObject(state)) {
      return false;
    }

    return !scenarioControlsAreEqual(getDraftScenarioControlsSnapshot(state), getAppliedScenarioSettingsSnapshot(state));
  }

  function applyDraftScenarioControlsToRuntimeState(state) {
    if (!isPlainObject(state)) {
      return null;
    }

    const controls = getDraftScenarioControlsSnapshot(state);
    const scenarioState = isPlainObject(state.scenarioState) ? state.scenarioState : {};
    const deathAgeState = isPlainObject(state.deathAgeState) ? state.deathAgeState : {};
    scenarioState.projectionHorizonYears = controls.projectionHorizonYears;
    scenarioState.mortgageTreatmentOverride = controls.mortgageTreatmentOverride;
    scenarioState.includeSurvivorIncome = controls.includeSurvivorIncome !== false;
    scenarioState.lifestyleSliderValue = controls.lifestyleSliderValue;
    scenarioState.autoCompressBaselineEnabled = controls.autoCompressBaselineEnabled !== false;
    if (controls.householdExpenseStreamPolicyMode) {
      scenarioState.householdExpenseStreamPolicyMode = controls.householdExpenseStreamPolicyMode;
    }
    if (deathAgeState.hasDateOfBirth) {
      deathAgeState.selectedDeathAge = controls.selectedDeathAge;
    }
    state.scenarioState = scenarioState;
    state.draftScenarioControls = clonePlainValue(controls);
    return controls;
  }

  function getBaseRenderControlSnapshot(state) {
    const safeState = isPlainObject(state) ? state : {};
    const controls = getRuntimeScenarioControlsSnapshot(safeState);

    return {
      valuationDate: safeState.valuationDate || null,
      projectionHorizonYears: controls.projectionHorizonYears,
      mortgageTreatmentOverride: controls.mortgageTreatmentOverride,
      includeSurvivorIncome: controls.includeSurvivorIncome !== false,
      selectedDeathAge: controls.selectedDeathAge,
      selectedDeathDate: controls.selectedDeathDate
    };
  }

  function getBaseRenderCacheKey(state) {
    return JSON.stringify(getBaseRenderControlSnapshot(state));
  }

  function invalidateIncomeImpactBaseRenderCache() {
    if (!incomeImpactState) {
      return;
    }

    incomeImpactState.baseRenderCache = null;
  }

  function getCachedBaseRenderContext(state) {
    const safeState = isPlainObject(state) ? state : {};
    const cache = isPlainObject(safeState.baseRenderCache) ? safeState.baseRenderCache : null;
    if (!cache || !isPlainObject(cache.baseContext)) {
      return null;
    }

    return cache.key === getBaseRenderCacheKey(safeState)
      ? cache.baseContext
      : null;
  }

  function buildBaseIncomeImpactContextFromState(state) {
    const safeState = isPlainObject(state) ? state : {};
    const controls = getBaseRenderControlSnapshot(safeState);
    const deathAgeState = isPlainObject(safeState.deathAgeState) ? safeState.deathAgeState : {};
    const scenarioOptions = {
      mortgageTreatmentOverride: controls.mortgageTreatmentOverride,
      includeSurvivorIncome: controls.includeSurvivorIncome !== false,
      includeDiscretionaryNeeds: true,
      projectionCadence: "monthly"
    };

    if (deathAgeState.hasDateOfBirth) {
      deathAgeState.selectedDeathAge = controls.selectedDeathAge;
    }

    const scenario = safeState.composeIncomeImpactScenario({
      valuationDate: safeState.valuationDate,
      selectedDeathDate: controls.selectedDeathDate,
      selectedDeathAge: controls.selectedDeathAge,
      projectionHorizonMonths: controls.projectionHorizonYears * 12,
      lensModel: safeState.lensModel,
      analysisSettings: safeState.analysisSettings,
      scenarioOptions
    });
    const riskEvaluation = safeState.evaluateIncomeImpactRiskEvents({
      scenario
    });
    const householdExpenseAccountPolicyContext = isPlainObject(safeState.householdExpenseAccountPolicyContext)
      ? safeState.householdExpenseAccountPolicyContext
      : null;
    const resolvedAccountPolicyInput = getResolvedAccountPolicyInput(householdExpenseAccountPolicyContext);
    const compressionPrep = typeof safeState.prepareIncomeImpactCompressionReportingInputs === "function"
      ? safeState.prepareIncomeImpactCompressionReportingInputs(Object.assign({
        lensModel: safeState.lensModel,
        options: {
          householdContext: "survivor",
          includeAdvisorConfirmed: false,
          includePauseCandidates: true
        }
      }, resolvedAccountPolicyInput))
      : null;
    const compressionScenarioResult = compressionPrep && typeof safeState.calculateIncomeImpactCompressionScenario === "function"
      ? safeState.calculateIncomeImpactCompressionScenario({
        scenario,
        compressionReport: compressionPrep.compressionReport,
        compressionPolicyRules: compressionPrep.compressionPolicyRules,
        options: {
          mode: "alternateScenarioOnly",
          scenarioId: "income-impact-expense-compression-alternate",
          applyPauseCandidates: true,
          requireCompleteItemization: true
        }
      })
      : null;
    const triageInterventions = typeof safeState.calculateIncomeImpactTriageInterventions === "function"
      ? safeState.calculateIncomeImpactTriageInterventions({
        scenario,
        riskEvaluation,
        compressionReport: compressionPrep?.compressionReport,
        compressionPolicyRules: compressionPrep?.compressionPolicyRules,
        compressionScenarioResult
      })
      : null;

    return {
      cacheKey: getBaseRenderCacheKey(safeState),
      controls,
      selectedDeath: {
        date: scenario?.scenario?.selectedDeathDate || controls.selectedDeathDate,
        age: scenario?.scenario?.selectedDeathAge ?? controls.selectedDeathAge
      },
      scenario,
      riskEvaluation,
      compressionPrep,
      compressionScenarioResult,
      triageInterventions,
      householdExpenseAccountPolicyContext
    };
  }

  function normalizeLifestyleGraphComparisonScenario(comparisonScenario) {
    if (!isPlainObject(comparisonScenario)) {
      return null;
    }

    return Object.assign({}, comparisonScenario, {
      kind: LIFESTYLE_COMPARISON_KIND,
      pathId: LIFESTYLE_COMPARISON_PATH_ID,
      graphPathId: LIFESTYLE_COMPARISON_PATH_ID,
      label: normalizeString(comparisonScenario.label) || LIFESTYLE_COMPARISON_LABEL,
      trace: Object.assign({}, isPlainObject(comparisonScenario.trace) ? comparisonScenario.trace : {}, {
        displayComparisonKind: LIFESTYLE_COMPARISON_KIND,
        displayGraphPathId: LIFESTYLE_COMPARISON_PATH_ID
      })
    });
  }

  function getDisplayLensAnalysisHelper(state, helperName) {
    if (typeof state?.[helperName] === "function") {
      return state[helperName];
    }
    if (typeof lensAnalysis?.[helperName] === "function") {
      return lensAnalysis[helperName];
    }
    return null;
  }

  function getGraphStorylinePointMonthOffset(point) {
    return toOptionalNumber(
      point?.relativeMonthsFromDeath ??
        point?.monthOffset ??
        point?.monthIndex ??
        point?.monthsAfterDeath
    );
  }

  function normalizeGraphStorylineTrendlinePoint(point) {
    if (!hasGraphPosition(point)) {
      return null;
    }
    const monthOffset = getGraphStorylinePointMonthOffset(point);
    if (monthOffset == null) {
      return null;
    }
    return {
      monthOffset,
      xRatio: clampNumber(toOptionalNumber(point.xRatio), 0, 1),
      yRatio: clampNumber(toOptionalNumber(point.yRatio), 0, 1),
      date: normalizeDateOnly(point.date || "")
    };
  }

  function getGraphStorylinePrimaryTrendlinePoints(graphModel) {
    const selectedSeries = getSelectedRunwayScenario(graphModel, graphModel?.trace?.selectedScenarioId);
    const selectedRunwayPoints = selectedSeries
      ? []
        .concat(selectedSeries.survivorResourcesAtDeathPoint ? [selectedSeries.survivorResourcesAtDeathPoint] : [])
        .concat(Array.isArray(selectedSeries.fundedRunwayPoints) ? selectedSeries.fundedRunwayPoints : [])
        .concat(Array.isArray(selectedSeries.deficitPoints) ? selectedSeries.deficitPoints : [])
      : [];
    const selectedAppliedSeries = getSelectedAppliedGraphSeries(graphModel, graphModel?.trace?.selectedScenarioId);
    const fallbackPoints = Array.isArray(selectedAppliedSeries?.points) ? selectedAppliedSeries.points : [];
    const points = (selectedRunwayPoints.length ? selectedRunwayPoints : fallbackPoints)
      .map(normalizeGraphStorylineTrendlinePoint)
      .filter(Boolean)
      .sort(function (left, right) {
        const monthDelta = left.monthOffset - right.monthOffset;
        return monthDelta || left.xRatio - right.xRatio;
      });

    return points.reduce(function (unique, point) {
      const duplicate = unique.find(function (candidate) {
        return Math.abs(candidate.monthOffset - point.monthOffset) <= 0.000001;
      });
      if (!duplicate) {
        unique.push(point);
      }
      return unique;
    }, []);
  }

  function getGraphStorylineTrendlineCoordinate(candidate, graphModel, anchors) {
    const monthOffset = getGraphStorylineEventMonthOffset(candidate, graphModel);
    if (monthOffset == null) {
      return null;
    }
    const points = getGraphStorylinePrimaryTrendlinePoints(graphModel);
    if (!points.length) {
      return null;
    }

    const exactPoint = points.find(function (point) {
      return Math.abs(point.monthOffset - monthOffset) <= 0.000001;
    });
    if (exactPoint) {
      return {
        xRatio: exactPoint.xRatio,
        yRatio: exactPoint.yRatio,
        value: getSeriesPointValue(exactPoint),
        source: "primary-trendline-exact",
        monthOffset
      };
    }

    if (monthOffset < points[0].monthOffset || monthOffset > points[points.length - 1].monthOffset) {
      return null;
    }

    for (let index = 0; index < points.length - 1; index += 1) {
      const start = points[index];
      const end = points[index + 1];
      if (monthOffset < start.monthOffset || monthOffset > end.monthOffset || end.monthOffset <= start.monthOffset) {
        continue;
      }
      const progress = (monthOffset - start.monthOffset) / (end.monthOffset - start.monthOffset);
      const fallbackXRatio = getGraphStorylineDotXRatio(candidate, graphModel, anchors);
      return {
        xRatio: fallbackXRatio == null
          ? start.xRatio + ((end.xRatio - start.xRatio) * progress)
          : fallbackXRatio,
        yRatio: start.yRatio + ((end.yRatio - start.yRatio) * progress),
        value: getSeriesPointValue(start) == null || getSeriesPointValue(end) == null
          ? null
          : getSeriesPointValue(start) + ((getSeriesPointValue(end) - getSeriesPointValue(start)) * progress),
        source: "primary-trendline-interpolated",
        monthOffset
      };
    }
    return null;
  }

  function getDisplayStorylineHelper(state, helperName) {
    return getDisplayLensAnalysisHelper(state, helperName);
  }

  function createAutoCompressedBaselineWarning(code, message, details) {
    return createRuntimeIssue(code, message, Object.assign({
      source: INCOME_IMPACT_AUTO_COMPRESSED_BASELINE_SOURCE
    }, isPlainObject(details) ? details : {}));
  }

  function getLifestyleScenarioMonthlyDelta(lifestyleScenario) {
    return toOptionalNumber(
      lifestyleScenario?.monthlyDelta
      ?? lifestyleScenario?.comparisonScenario?.trace?.graphMonthlyDelta
      ?? lifestyleScenario?.comparisonScenario?.trace?.monthlyDelta
    );
  }

  function buildAutoCompressedBaselineCompressionPolicy(rawBaselineScenario, conservativeLifestyleScenario) {
    const postDeathPoints = Array.isArray(rawBaselineScenario?.postDeathSeries?.points)
      ? rawBaselineScenario.postDeathSeries.points
      : [];
    const firstPostDeathPoint = postDeathPoints[0] || {};
    const currentMonthlySurvivorNeed = toOptionalNumber(
      firstPostDeathPoint.survivorNeeds
      ?? firstPostDeathPoint.netUse
      ?? conservativeLifestyleScenario?.totalBaselineMonthlyExpenses
    );
    const monthlyDeltaAtConservative = getLifestyleScenarioMonthlyDelta(conservativeLifestyleScenario);
    const conservativeMonthlySurvivorNeed = currentMonthlySurvivorNeed == null || monthlyDeltaAtConservative == null
      ? null
      : Math.max(0, Number((currentMonthlySurvivorNeed + monthlyDeltaAtConservative).toFixed(2)));

    return {
      source: "income-impact-display-conservative-lifestyle-scenario",
      currentSliderValue: 0,
      conservativeSliderValue: MIN_LIFESTYLE_SLIDER_VALUE,
      monthlyDeltaAtConservative,
      currentMonthlySurvivorNeed,
      conservativeMonthlySurvivorNeed
    };
  }

  function makeBaselineContract(options) {
    const safeOptions = isPlainObject(options) ? options : {};
    return {
      visibleBaselineMode: safeOptions.visibleBaselineMode || "unadjusted",
      autoCompressionEnabled: safeOptions.autoCompressionEnabled === true,
      autoCompressionApplied: safeOptions.autoCompressionApplied === true,
      autoCompressionStatus: safeOptions.autoCompressionStatus || null,
      rawBaselinePreserved: true,
      manualLifestyleComparisonPreserved: true,
      rawBaselineScenarioId: safeOptions.rawBaselineScenarioId || null,
      primaryScenarioId: safeOptions.primaryScenarioId || null,
      autoCompressedBaselineScenarioId: safeOptions.autoCompressedBaselineScenarioId || null,
      warnings: Array.isArray(safeOptions.warnings) ? clonePlainValue(safeOptions.warnings) : [],
      trace: Object.assign({
        source: INCOME_IMPACT_AUTO_COMPRESSED_BASELINE_SOURCE,
        rawBaselineMutated: false,
        helperAvailable: safeOptions.helperAvailable === true,
        conservativePolicyAvailable: safeOptions.conservativePolicyAvailable === true,
        formula: safeOptions.formula || null,
        horizonSource: safeOptions.horizonSource || null
      }, isPlainObject(safeOptions.trace) ? safeOptions.trace : {})
    };
  }

  function buildDisplayAutoCompressedBaselineForPrimaryScenario(state, context, controls, resolvedAccountPolicyInput) {
    const safeState = isPlainObject(state) ? state : {};
    const safeContext = isPlainObject(context) ? context : {};
    const rawBaselineScenario = safeContext.scenario;
    const enabled = controls?.autoCompressBaselineEnabled !== false;
    const builder = getDisplayLensAnalysisHelper(safeState, "buildIncomeImpactAutoCompressedBaseline");
    const baseResult = {
      rawBaselineScenario,
      primaryScenario: rawBaselineScenario,
      autoCompressedBaselineScenario: null,
      autoCompressedBaselineResult: null,
      warnings: [],
      baselineContract: null
    };

    if (!enabled) {
      baseResult.baselineContract = makeBaselineContract({
        visibleBaselineMode: "unadjusted",
        autoCompressionEnabled: false,
        autoCompressionApplied: false,
        autoCompressionStatus: "disabled",
        helperAvailable: typeof builder === "function",
        rawBaselineScenarioId: rawBaselineScenario?.scenarioId || null,
        primaryScenarioId: rawBaselineScenario?.scenarioId || null
      });
      return baseResult;
    }

    if (typeof builder !== "function") {
      const warnings = [
        createAutoCompressedBaselineWarning(
          "auto-compressed-baseline-helper-unavailable",
          "Auto-compressed baseline was not built because the helper is unavailable."
        )
      ];
      baseResult.warnings = warnings;
      baseResult.baselineContract = makeBaselineContract({
        visibleBaselineMode: "unadjusted",
        autoCompressionEnabled: true,
        autoCompressionApplied: false,
        autoCompressionStatus: "helper-unavailable",
        helperAvailable: false,
        rawBaselineScenarioId: rawBaselineScenario?.scenarioId || null,
        primaryScenarioId: rawBaselineScenario?.scenarioId || null,
        warnings
      });
      return baseResult;
    }

    let conservativeLifestyleScenario = null;
    let conservativeWarnings = [];
    if (typeof safeState.calculateIncomeImpactLifestyleScenario === "function") {
      try {
        conservativeLifestyleScenario = safeState.calculateIncomeImpactLifestyleScenario(
          buildLifestyleScenarioRuntimeInput(
            safeState,
            safeContext,
            MIN_LIFESTYLE_SLIDER_VALUE,
            resolvedAccountPolicyInput
          )
        );
      } catch (error) {
        conservativeWarnings = [
          createAutoCompressedBaselineWarning(
            "auto-compressed-baseline-policy-build-failed",
            "Auto-compressed baseline could not prepare the conservative lifestyle policy.",
            { error: error?.message || String(error) }
          )
        ];
      }
    } else {
      conservativeWarnings = [
        createAutoCompressedBaselineWarning(
          "auto-compressed-baseline-policy-helper-unavailable",
          "Auto-compressed baseline could not prepare a conservative lifestyle policy because the lifestyle helper is unavailable."
        )
      ];
    }

    const compressionPolicy = buildAutoCompressedBaselineCompressionPolicy(
      rawBaselineScenario,
      conservativeLifestyleScenario
    );
    let autoCompressedBaselineResult = null;
    let autoCompressedBaselineScenario = null;
    let helperWarnings = [];

    try {
      autoCompressedBaselineResult = builder({
        rawBaselineScenario,
        postDeathSeries: rawBaselineScenario?.postDeathSeries,
        compressionPolicy,
        options: {
          autoCompressionEnabled: true,
          projectionHorizonMonths: controls?.projectionHorizonYears
            ? controls.projectionHorizonYears * 12
            : null,
          scenarioId: AUTO_COMPRESSED_BASELINE_SCENARIO_ID,
          label: AUTO_COMPRESSED_BASELINE_LABEL
        }
      });
      helperWarnings = Array.isArray(autoCompressedBaselineResult?.warnings)
        ? clonePlainValue(autoCompressedBaselineResult.warnings)
        : [];
      if (autoCompressedBaselineResult?.status === "ready" && isPlainObject(autoCompressedBaselineResult.autoCompressedScenario)) {
        autoCompressedBaselineScenario = autoCompressedBaselineResult.autoCompressedScenario;
        baseResult.primaryScenario = autoCompressedBaselineScenario;
        baseResult.autoCompressedBaselineScenario = autoCompressedBaselineScenario;
      }
    } catch (error) {
      helperWarnings = [
        createAutoCompressedBaselineWarning(
          "auto-compressed-baseline-build-failed",
          "Auto-compressed baseline could not be built.",
          { error: error?.message || String(error) }
        )
      ];
    }

    const warnings = conservativeWarnings.concat(helperWarnings);
    const applied = Boolean(autoCompressedBaselineScenario);
    baseResult.autoCompressedBaselineResult = autoCompressedBaselineResult;
    baseResult.warnings = warnings;
    baseResult.baselineContract = makeBaselineContract({
      visibleBaselineMode: applied ? "autoCompressed" : "unadjusted",
      autoCompressionEnabled: true,
      autoCompressionApplied: applied,
      autoCompressionStatus: autoCompressedBaselineResult?.status || "error",
      helperAvailable: true,
      conservativePolicyAvailable: getLifestyleScenarioMonthlyDelta(conservativeLifestyleScenario) != null,
      rawBaselineScenarioId: rawBaselineScenario?.scenarioId || null,
      primaryScenarioId: baseResult.primaryScenario?.scenarioId || null,
      autoCompressedBaselineScenarioId: autoCompressedBaselineScenario?.scenarioId || null,
      warnings,
      formula: autoCompressedBaselineResult?.compressionPath?.formula || autoCompressedBaselineResult?.trace?.formula || null,
      horizonSource: autoCompressedBaselineResult?.compressionHorizon?.source || autoCompressedBaselineResult?.trace?.horizonSource || null,
      trace: {
        status: autoCompressedBaselineResult?.status || "error",
        helperStatus: autoCompressedBaselineResult?.status || "error",
        visibleBaselineReplacement: applied,
        compressionHorizon: clonePlainValue(autoCompressedBaselineResult?.compressionHorizon || null),
        compressionPath: clonePlainValue(autoCompressedBaselineResult?.compressionPath || null),
        monthlyDeltaAtConservative: compressionPolicy.monthlyDeltaAtConservative,
        conservativeLifestyleScenarioStatus: conservativeLifestyleScenario?.status || null
      }
    });
    return baseResult;
  }

  function getTimelineResultDeathDate(timelineResult, controls) {
    return timelineResult?.selectedDeath?.date
      || timelineResult?.scenario?.scenario?.selectedDeathDate
      || controls?.selectedDeathDate
      || null;
  }

  function createFinancialStorylineBridgeWarning(code, message, details) {
    return createRuntimeIssue(code, message, Object.assign({
      source: INCOME_IMPACT_STORYLINE_BRIDGE_SOURCE
    }, isPlainObject(details) ? details : {}));
  }

  function makeFinancialStorylineUnavailableResult(reason, details) {
    return {
      version: "financial-storyline-candidates-v1",
      allCandidates: [],
      safeRenderableEvents: [],
      deferredCandidates: [],
      majorStoryCandidates: [],
      majorGraphDotCandidates: [],
      microGraphDotCandidates: [],
      graphDotCandidates: [],
      suppressedCandidates: [],
      warnings: [
        createFinancialStorylineBridgeWarning(
          "financial-storyline-unavailable",
          "Financial storyline candidates were not built.",
          Object.assign({ reason }, isPlainObject(details) ? details : {})
        )
      ],
      trace: {
        source: INCOME_IMPACT_STORYLINE_BRIDGE_SOURCE,
        generatedAt: null,
        rendered: false,
        resourceWaterfallStatus: "not-built",
        housingRiskStatus: "not-built",
        evidenceSummary: {}
      }
    };
  }

  function normalizeFinancialStorylineArrays(financialStoryline) {
    const source = isPlainObject(financialStoryline) ? financialStoryline : {};
    return Object.assign({}, source, {
      version: source.version || "financial-storyline-candidates-v1",
      allCandidates: Array.isArray(source.allCandidates) ? source.allCandidates : [],
      safeRenderableEvents: Array.isArray(source.safeRenderableEvents) ? source.safeRenderableEvents : [],
      deferredCandidates: Array.isArray(source.deferredCandidates) ? source.deferredCandidates : [],
      majorStoryCandidates: Array.isArray(source.majorStoryCandidates) ? source.majorStoryCandidates : [],
      majorGraphDotCandidates: Array.isArray(source.majorGraphDotCandidates) ? source.majorGraphDotCandidates : [],
      microGraphDotCandidates: Array.isArray(source.microGraphDotCandidates) ? source.microGraphDotCandidates : [],
      graphDotCandidates: Array.isArray(source.graphDotCandidates) ? source.graphDotCandidates : [],
      suppressedCandidates: Array.isArray(source.suppressedCandidates) ? source.suppressedCandidates : [],
      warnings: Array.isArray(source.warnings) ? source.warnings : [],
      trace: isPlainObject(source.trace) ? source.trace : {}
    });
  }

  function makeTimelineStoryEventsUnavailableResult(reason, details) {
    return {
      version: "income-impact-timeline-story-events-v1",
      events: [],
      warnings: [
        createFinancialStorylineBridgeWarning(
          "timeline-story-events-unavailable",
          "Normalized timeline story events were not built.",
          Object.assign({ reason }, isPlainObject(details) ? details : {})
        )
      ],
      trace: {
        source: INCOME_IMPACT_STORYLINE_BRIDGE_SOURCE,
        status: "unavailable",
        rendered: false
      }
    };
  }

  function buildTimelineStoryEventsForTimelineResult(state, timelineResult) {
    const normalizer = getDisplayStorylineHelper(state, "normalizeIncomeImpactTimelineStoryEvents");
    if (typeof normalizer !== "function") {
      return makeTimelineStoryEventsUnavailableResult("normalizer-helper-unavailable");
    }

    try {
      const result = normalizer({
        riskEvents: timelineResult?.riskEvaluation?.events,
        stableEvents: timelineResult?.riskEvaluation?.stableEvents,
        financialStoryline: timelineResult?.financialStoryline,
        transitionOutlook: timelineResult?.transitionOutlook || timelineResult?.scenario?.transitionOutlook,
        graphModel: timelineResult?.graphModel,
        scenario: timelineResult?.scenario,
        options: {
          source: INCOME_IMPACT_STORYLINE_BRIDGE_SOURCE,
          displayBridgeOnly: true
        }
      });
      return Object.assign({}, isPlainObject(result) ? result : {}, {
        version: result?.version || "income-impact-timeline-story-events-v1",
        events: Array.isArray(result?.events) ? result.events : [],
        warnings: Array.isArray(result?.warnings) ? result.warnings : [],
        trace: Object.assign({}, isPlainObject(result?.trace) ? result.trace : {}, {
          source: INCOME_IMPACT_STORYLINE_BRIDGE_SOURCE,
          status: "built",
          rendered: false
        })
      });
    } catch (error) {
      return makeTimelineStoryEventsUnavailableResult("timeline-story-events-build-failed", {
        error: error?.message || String(error)
      });
    }
  }

  function buildDisplayResourceBucketsForStoryline(state) {
    const adapter = getDisplayStorylineHelper(state, "buildIncomeImpactResourceBucketsFromLensModel");
    if (typeof adapter !== "function") {
      return {
        value: null,
        status: "helper-unavailable",
        warnings: [
          createFinancialStorylineBridgeWarning(
            "resource-bucket-adapter-helper-unavailable",
            "Lens asset buckets were not built because the resource bucket adapter is not available."
          )
        ]
      };
    }

    try {
      const result = adapter({
        assetFacts: state?.lensModel?.assetFacts,
        treatedAssetOffsets: state?.lensModel?.treatedAssetOffsets
      });
      return {
        value: result,
        status: "built",
        warnings: Array.isArray(result?.warnings) ? clonePlainValue(result.warnings) : []
      };
    } catch (error) {
      return {
        value: null,
        status: "error",
        warnings: [
          createFinancialStorylineBridgeWarning(
            "resource-bucket-adapter-build-failed",
            "Lens asset buckets could not be built for the resource waterfall.",
            { error: error?.message || String(error) }
          )
        ]
      };
    }
  }

  function buildDisplayResourceWaterfallForStoryline(state, timelineResult, controls) {
    const builder = getDisplayStorylineHelper(state, "buildIncomeImpactResourceWaterfall");
    if (typeof builder !== "function") {
      return {
        value: null,
        status: "helper-unavailable",
        warnings: [
          createFinancialStorylineBridgeWarning(
            "resource-waterfall-helper-unavailable",
            "Resource waterfall inputs were not built because the helper is not available."
          )
        ]
      };
    }

    try {
      const resourceBucketBuild = buildDisplayResourceBucketsForStoryline(state);
      const resourceBuckets = Array.isArray(resourceBucketBuild.value?.resourceBuckets)
        ? resourceBucketBuild.value.resourceBuckets
        : [];
      const adapterWarnings = Array.isArray(resourceBucketBuild.warnings)
        ? resourceBucketBuild.warnings
        : [];
      const value = builder({
        resourceBuckets,
        scenario: timelineResult?.scenario,
        financialRunway: timelineResult?.financialRunway,
        postDeathSeries: timelineResult?.scenario?.postDeathSeries,
        timelineFacts: timelineResult?.scenario?.timelineFacts,
        options: {
          selectedDeathDate: getTimelineResultDeathDate(timelineResult, controls),
          projectionHorizonYears: controls?.projectionHorizonYears
        }
      });
      const waterfallWarnings = Array.isArray(value?.warnings) ? value.warnings : [];
      return {
        value: isPlainObject(value)
          ? Object.assign({}, value, {
            warnings: waterfallWarnings.concat(adapterWarnings),
            trace: Object.assign({}, isPlainObject(value.trace) ? value.trace : {}, {
              resourceBucketAdapterStatus: resourceBucketBuild.status,
              resourceBucketAdapterTrace: isPlainObject(resourceBucketBuild.value?.trace)
                ? clonePlainValue(resourceBucketBuild.value.trace)
                : null
            })
          })
          : value,
        status: "built",
        warnings: adapterWarnings
      };
    } catch (error) {
      return {
        value: null,
        status: "error",
        warnings: [
          createFinancialStorylineBridgeWarning(
            "resource-waterfall-build-failed",
            "Resource waterfall inputs could not be built.",
            { error: error?.message || String(error) }
          )
        ]
      };
    }
  }

  function buildDisplayHousingRiskForStoryline(state, timelineResult, controls, resourceWaterfall) {
    const builder = getDisplayStorylineHelper(state, "buildIncomeImpactHousingRisk");
    if (typeof builder !== "function") {
      return {
        value: null,
        status: "helper-unavailable",
        warnings: [
          createFinancialStorylineBridgeWarning(
            "housing-risk-helper-unavailable",
            "Housing-risk inputs were not built because the helper is not available."
          )
        ]
      };
    }

    try {
      return {
        value: builder({
          scenario: timelineResult?.scenario,
          financialRunway: timelineResult?.financialRunway,
          postDeathSeries: timelineResult?.scenario?.postDeathSeries,
          mortgageTreatment: controls?.mortgageTreatmentOverride
            || timelineResult?.scenario?.scenario?.mortgageTreatmentOverride
            || null,
          resourceWaterfall,
          options: {
            selectedDeathDate: getTimelineResultDeathDate(timelineResult, controls),
            projectionHorizonYears: controls?.projectionHorizonYears
          }
        }),
        status: "built",
        warnings: []
      };
    } catch (error) {
      return {
        value: null,
        status: "error",
        warnings: [
          createFinancialStorylineBridgeWarning(
            "housing-risk-build-failed",
            "Housing-risk inputs could not be built.",
            { error: error?.message || String(error) }
          )
        ]
      };
    }
  }

  function buildFinancialStorylineForTimelineResult(state, timelineResult, context) {
    const safeContext = isPlainObject(context) ? context : {};
    const controls = isPlainObject(safeContext.controls) ? safeContext.controls : {};
    const storylineBuilder = getDisplayStorylineHelper(state, "buildIncomeImpactFinancialStorylineCandidates");
    const resourceWaterfallBuild = buildDisplayResourceWaterfallForStoryline(state, timelineResult, controls);
    const assetDepletionLedger = isPlainObject(timelineResult?.scenario?.trace?.layer3?.assetDepletionLedgerDiagnostic)
      ? timelineResult.scenario.trace.layer3.assetDepletionLedgerDiagnostic
      : null;
    const assetDepletionLedgerStatus = isPlainObject(assetDepletionLedger)
      ? normalizeString(assetDepletionLedger.status) || "unknown"
      : "not-provided";
    const housingRiskBuild = buildDisplayHousingRiskForStoryline(
      state,
      timelineResult,
      controls,
      resourceWaterfallBuild.value
    );
    const bridgeWarnings = []
      .concat(Array.isArray(resourceWaterfallBuild.warnings) ? resourceWaterfallBuild.warnings : [])
      .concat(Array.isArray(housingRiskBuild.warnings) ? housingRiskBuild.warnings : []);

    if (typeof storylineBuilder !== "function") {
      const unavailable = makeFinancialStorylineUnavailableResult("storyline-helper-unavailable", {
        resourceWaterfallStatus: resourceWaterfallBuild.status,
        assetDepletionLedgerStatus,
        housingRiskStatus: housingRiskBuild.status
      });
      unavailable.warnings = unavailable.warnings.concat(bridgeWarnings);
      unavailable.trace.resourceWaterfallStatus = resourceWaterfallBuild.status;
      unavailable.trace.assetDepletionLedgerStatus = assetDepletionLedgerStatus;
      unavailable.trace.housingRiskStatus = housingRiskBuild.status;
      return unavailable;
    }

    try {
      const financialStoryline = normalizeFinancialStorylineArrays(storylineBuilder({
        scenario: timelineResult?.scenario,
        graphModel: timelineResult?.graphModel,
        riskEvaluation: timelineResult?.riskEvaluation,
        comparisonScenarios: Array.isArray(safeContext.comparisonScenarios)
          ? clonePlainValue(safeContext.comparisonScenarios)
          : [],
        appliedScenarios: Array.isArray(safeContext.appliedScenarios)
          ? clonePlainValue(safeContext.appliedScenarios)
          : [],
        selectedScenarioId: safeContext.selectedScenarioId || INITIAL_APPLIED_SCENARIO_ID,
        warnings: Array.isArray(timelineResult?.warnings) ? clonePlainValue(timelineResult.warnings) : [],
        dataGaps: Array.isArray(timelineResult?.dataGaps) ? clonePlainValue(timelineResult.dataGaps) : [],
        assetDepletionLedger: assetDepletionLedger ? clonePlainValue(assetDepletionLedger) : null,
        resourceWaterfall: resourceWaterfallBuild.value,
        housingRisk: housingRiskBuild.value,
        options: {
          selectedDeathDate: getTimelineResultDeathDate(timelineResult, controls),
          projectionHorizonYears: controls?.projectionHorizonYears,
          source: INCOME_IMPACT_STORYLINE_BRIDGE_SOURCE
        }
      }));

      return Object.assign({}, financialStoryline, {
        warnings: financialStoryline.warnings.concat(bridgeWarnings),
        trace: Object.assign({}, financialStoryline.trace, {
          displayBridgeSource: INCOME_IMPACT_STORYLINE_BRIDGE_SOURCE,
          rendered: false,
          resourceWaterfallStatus: resourceWaterfallBuild.status,
          assetDepletionLedgerStatus,
          housingRiskStatus: housingRiskBuild.status
        })
      });
    } catch (error) {
      const unavailable = makeFinancialStorylineUnavailableResult("storyline-build-failed", {
        error: error?.message || String(error),
        resourceWaterfallStatus: resourceWaterfallBuild.status,
        assetDepletionLedgerStatus,
        housingRiskStatus: housingRiskBuild.status
      });
      unavailable.warnings = unavailable.warnings.concat(bridgeWarnings);
      unavailable.trace.resourceWaterfallStatus = resourceWaterfallBuild.status;
      unavailable.trace.assetDepletionLedgerStatus = assetDepletionLedgerStatus;
      unavailable.trace.housingRiskStatus = housingRiskBuild.status;
      return unavailable;
    }
  }

  function buildIncomeImpactResultFromBaseContext(state, baseContext, sliderValueOverride) {
    const safeState = isPlainObject(state) ? state : {};
    const context = isPlainObject(baseContext) ? baseContext : buildBaseIncomeImpactContextFromState(safeState);
    const scenarioState = isPlainObject(safeState.scenarioState) ? safeState.scenarioState : {};
    const controls = getRuntimeScenarioControlsSnapshot(safeState);
    const lifestyleSliderValue = clampLifestyleSliderValue(
      sliderValueOverride == null ? scenarioState.lifestyleSliderValue : sliderValueOverride
    );
    const scenario = context.scenario;
    const riskEvaluation = context.riskEvaluation;
    const compressionPrep = context.compressionPrep;
    const compressionScenarioResult = context.compressionScenarioResult;
    const triageInterventions = context.triageInterventions;
    const householdExpenseAccountPolicyContext = context.householdExpenseAccountPolicyContext;
    const resolvedAccountPolicyInput = getResolvedAccountPolicyInput(householdExpenseAccountPolicyContext);
    const lifestyleScenario = typeof safeState.calculateIncomeImpactLifestyleScenario === "function"
      ? safeState.calculateIncomeImpactLifestyleScenario(buildLifestyleScenarioRuntimeInput(
        safeState,
        context,
        lifestyleSliderValue,
        resolvedAccountPolicyInput
      ))
      : null;
    const lifestyleComparisonScenario = normalizeLifestyleGraphComparisonScenario(lifestyleScenario?.comparisonScenario);
    const comparisonScenarios = lifestyleComparisonScenario ? [lifestyleComparisonScenario] : [];
    const baselineComposition = buildDisplayAutoCompressedBaselineForPrimaryScenario(
      safeState,
      context,
      controls,
      resolvedAccountPolicyInput
    );
    const rawBaselineScenario = baselineComposition.rawBaselineScenario || scenario;
    const primaryScenario = baselineComposition.primaryScenario || scenario;
    const autoCompressedBaselineScenario = baselineComposition.autoCompressedBaselineScenario || null;
    const baselineContract = baselineComposition.baselineContract;
    const appliedScenarioRecord = buildAppliedScenarioRecordFromInputs(safeState, context, {
      scenario: primaryScenario,
      rawBaselineScenario,
      primaryScenario,
      autoCompressedBaselineScenario,
      baselineContract,
      riskEvaluation,
      comparisonScenarios,
      lifestyleScenario
    });
    upsertAppliedScenarioRecord(safeState, appliedScenarioRecord);
    const selectedScenarioId = safeState.selectedScenarioId || INITIAL_APPLIED_SCENARIO_ID;
    const appliedScenariosSnapshot = Array.isArray(safeState.appliedScenarios)
      ? clonePlainValue(safeState.appliedScenarios)
      : [clonePlainValue(appliedScenarioRecord)];
    const graphModel = safeState.buildIncomeImpactTimelineGraphModel({
      scenario: primaryScenario,
      riskEvaluation,
      comparisonScenarios,
      appliedScenarios: appliedScenariosSnapshot,
      selectedScenarioId,
      options: {
        preserveSignedResources: true,
        currentAgeMode: "death-event-only"
      }
    });
    const dataGaps = []
      .concat(Array.isArray(primaryScenario?.dataGaps) ? primaryScenario.dataGaps : [])
      .concat(Array.isArray(riskEvaluation?.dataGaps) ? riskEvaluation.dataGaps : [])
      .concat(Array.isArray(graphModel?.dataGaps) ? graphModel.dataGaps : []);
    const warnings = []
      .concat(Array.isArray(primaryScenario?.warnings) ? primaryScenario.warnings : [])
      .concat(Array.isArray(riskEvaluation?.warnings) ? riskEvaluation.warnings : [])
      .concat(Array.isArray(graphModel?.warnings) ? graphModel.warnings : [])
      .concat(Array.isArray(baselineComposition.warnings) ? baselineComposition.warnings : []);

    const timelineResult = {
      selectedDeath: {
        date: context.selectedDeath?.date || primaryScenario?.scenario?.selectedDeathDate || controls.selectedDeathDate || null,
        age: context.selectedDeath?.age ?? primaryScenario?.scenario?.selectedDeathAge ?? controls.selectedDeathAge ?? null
      },
      scenario: primaryScenario,
      rawBaselineScenario,
      primaryScenario,
      autoCompressedBaselineScenario,
      baselineContract,
      riskEvaluation,
      triageInterventions,
      compressionReporting: {
        prep: compressionPrep,
        scenario: compressionScenarioResult,
        lifestyleScenario,
        accountPolicy: householdExpenseAccountPolicyContext,
        layer5: triageInterventions,
        trace: {
          reportingOnly: true,
          displayWired: Boolean(compressionPrep && triageInterventions),
          accountPolicySource: householdExpenseAccountPolicyContext?.policySource || null,
          accountPolicyStorageStatus: householdExpenseAccountPolicyContext?.storageResult?.status || null,
          accountPolicyStorageFallbackReason: householdExpenseAccountPolicyContext?.storageResult?.metadata?.fallbackReason || null,
          accountPolicyResolved: Boolean(householdExpenseAccountPolicyContext?.resolvedPolicy),
          accountPolicyAccountIdSource: householdExpenseAccountPolicyContext?.trace?.accountIdSource || null,
          alternateScenarioPrepared: Boolean(compressionScenarioResult),
          alternateScenarioStatus: compressionScenarioResult?.status || null,
          lifestyleScenarioPrepared: Boolean(lifestyleScenario),
          lifestyleScenarioStatus: lifestyleScenario?.status || null,
          lifestyleSliderValue,
          baselineContract: clonePlainValue(baselineContract),
          autoCompressionApplied: baselineContract?.autoCompressionApplied === true,
          visibleBaselineMode: baselineContract?.visibleBaselineMode || "unadjusted",
          timelineMarkersCreated: false,
          graphPathChanged: Boolean(lifestyleComparisonScenario),
          reductionsApplied: false
        }
      },
      graphModel,
      financialRunway: buildFinancialRunwayFromScenario(primaryScenario, controls.projectionHorizonYears),
      summaryCards: buildSummaryCardsFromScenario(primaryScenario),
      dataGaps,
      warnings,
      trace: {
        source: "income-impact-display-composer-risk-bridge",
        composerStatus: primaryScenario?.status || null,
        riskEvaluatorStatus: riskEvaluation?.status || null,
        baselineContract: clonePlainValue(baselineContract),
        retiredTimelineChartRendered: false
      }
    };
    timelineResult.financialStoryline = buildFinancialStorylineForTimelineResult(safeState, timelineResult, {
      comparisonScenarios,
      appliedScenarios: appliedScenariosSnapshot,
      selectedScenarioId,
      controls
    });
    timelineResult.timelineStoryEvents = buildTimelineStoryEventsForTimelineResult(safeState, timelineResult);
    return timelineResult;
  }

  function buildIncomeImpactResultFromState(state) {
    const baseContext = buildBaseIncomeImpactContextFromState(state);
    return buildIncomeImpactResultFromBaseContext(state, baseContext);
  }

  function buildIncomeImpactResultFromSelectedAppliedScenario(state) {
    const safeState = isPlainObject(state) ? state : {};
    const selectedScenario = getSelectedAppliedScenario(safeState);
    if (!isPlainObject(selectedScenario?.scenario)) {
      return isPlainObject(safeState.latestTimelineResult) ? safeState.latestTimelineResult : null;
    }

    const scenario = selectedScenario.scenario;
    const rawBaselineScenario = isPlainObject(selectedScenario.rawBaselineScenario)
      ? selectedScenario.rawBaselineScenario
      : scenario;
    const primaryScenario = isPlainObject(selectedScenario.primaryScenario)
      ? selectedScenario.primaryScenario
      : scenario;
    const autoCompressedBaselineScenario = isPlainObject(selectedScenario.autoCompressedBaselineScenario)
      ? selectedScenario.autoCompressedBaselineScenario
      : null;
    const settings = normalizeScenarioControlsForState(
      safeState,
      isPlainObject(selectedScenario.settings) ? selectedScenario.settings : null
    );
    const baselineContract = isPlainObject(selectedScenario.baselineContract)
      ? selectedScenario.baselineContract
      : makeBaselineContract({
          visibleBaselineMode: "unadjusted",
          autoCompressionEnabled: settings?.autoCompressBaselineEnabled !== false,
          autoCompressionApplied: false,
          autoCompressionStatus: "selected-scenario-unadjusted",
          rawBaselineScenarioId: rawBaselineScenario?.scenarioId || null,
          primaryScenarioId: primaryScenario?.scenarioId || null
        });
    const riskEvaluation = isPlainObject(selectedScenario.riskEvaluation) ? selectedScenario.riskEvaluation : {};
    const comparisonScenarios = Array.isArray(selectedScenario.comparisonScenarios)
      ? clonePlainValue(selectedScenario.comparisonScenarios)
      : [];
    const lifestyleScenario = isPlainObject(selectedScenario.lifestyleScenario)
      ? clonePlainValue(selectedScenario.lifestyleScenario)
      : null;
    const selectedScenarioId = safeState.selectedScenarioId || getAppliedScenarioId(selectedScenario, 0);
    const appliedScenariosSnapshot = Array.isArray(safeState.appliedScenarios)
      ? clonePlainValue(safeState.appliedScenarios)
      : [clonePlainValue(selectedScenario)];
    const graphModel = safeState.buildIncomeImpactTimelineGraphModel({
      scenario: primaryScenario,
      riskEvaluation,
      comparisonScenarios,
      appliedScenarios: appliedScenariosSnapshot,
      selectedScenarioId,
      options: {
        preserveSignedResources: true,
        currentAgeMode: "death-event-only"
      }
    });
    const dataGaps = []
      .concat(Array.isArray(scenario?.dataGaps) ? scenario.dataGaps : [])
      .concat(Array.isArray(riskEvaluation?.dataGaps) ? riskEvaluation.dataGaps : [])
      .concat(Array.isArray(graphModel?.dataGaps) ? graphModel.dataGaps : []);
    const warnings = []
      .concat(Array.isArray(scenario?.warnings) ? scenario.warnings : [])
      .concat(Array.isArray(riskEvaluation?.warnings) ? riskEvaluation.warnings : [])
      .concat(Array.isArray(graphModel?.warnings) ? graphModel.warnings : []);

    const timelineResult = {
      selectedDeath: {
        date: primaryScenario?.scenario?.selectedDeathDate || settings.selectedDeathDate || null,
        age: primaryScenario?.scenario?.selectedDeathAge ?? settings.selectedDeathAge ?? null
      },
      scenario: primaryScenario,
      rawBaselineScenario,
      primaryScenario,
      autoCompressedBaselineScenario,
      baselineContract,
      riskEvaluation,
      triageInterventions: null,
      compressionReporting: {
        prep: null,
        scenario: null,
        lifestyleScenario,
        accountPolicy: safeState.householdExpenseAccountPolicyContext || null,
        layer5: null,
        trace: Object.assign({}, isPlainObject(selectedScenario.comparisonTrace) ? selectedScenario.comparisonTrace : {}, {
          reportingOnly: true,
          selectedAppliedScenarioRender: true,
          lifestyleSliderValue: settings.lifestyleSliderValue,
          baselineContract: clonePlainValue(baselineContract),
          autoCompressionApplied: baselineContract?.autoCompressionApplied === true,
          visibleBaselineMode: baselineContract?.visibleBaselineMode || "unadjusted",
          graphPathChanged: comparisonScenarios.length > 0,
          reductionsApplied: false
        })
      },
      graphModel,
      financialRunway: buildFinancialRunwayFromScenario(primaryScenario, settings.projectionHorizonYears),
      summaryCards: buildSummaryCardsFromScenario(primaryScenario),
      dataGaps,
      warnings,
      trace: {
        source: "income-impact-display-selected-applied-scenario",
        composerStatus: primaryScenario?.status || null,
        riskEvaluatorStatus: riskEvaluation?.status || null,
        selectedScenarioId: safeState.selectedScenarioId || null,
        baselineContract: clonePlainValue(baselineContract),
        retiredTimelineChartRendered: false
      }
    };
    timelineResult.financialStoryline = buildFinancialStorylineForTimelineResult(safeState, timelineResult, {
      comparisonScenarios,
      appliedScenarios: appliedScenariosSnapshot,
      selectedScenarioId,
      controls: settings
    });
    timelineResult.timelineStoryEvents = buildTimelineStoryEventsForTimelineResult(safeState, timelineResult);
    return timelineResult;
  }

  function getAppliedScenarioId(appliedScenario, index) {
    return normalizeString(appliedScenario?.scenarioId) || `income-impact-scenario-${index + 1}`;
  }

  function getAppliedScenarioSettingsKey(appliedScenario) {
    return normalizeString(appliedScenario?.trace?.settingsKey) || getScenarioSettingsKey(appliedScenario?.settings);
  }

  function findAppliedScenarioIndexBySettings(appliedScenarios, settingsKey) {
    return (Array.isArray(appliedScenarios) ? appliedScenarios : []).findIndex(function (appliedScenario) {
      return getAppliedScenarioSettingsKey(appliedScenario) === settingsKey;
    });
  }

  function findAppliedScenarioBySettings(appliedScenarios, settings) {
    const settingsKey = getScenarioSettingsKey(settings);
    const index = findAppliedScenarioIndexBySettings(appliedScenarios, settingsKey);
    return index >= 0 ? appliedScenarios[index] : null;
  }

  function createAppliedScenarioId(settings, existingScenarios) {
    const safeSettings = isPlainObject(settings) ? settings : {};
    const selectedDeathAge = toOptionalNumber(safeSettings.selectedDeathAge);
    const selectedDeathDate = normalizeString(safeSettings.selectedDeathDate).replace(/[^0-9]/g, "");
    const agePart = selectedDeathAge == null ? (selectedDeathDate || "custom") : `age-${selectedDeathAge}`;
    const baseId = [
      "income-impact-scenario",
      agePart,
      `horizon-${clampProjectionHorizonYears(safeSettings.projectionHorizonYears)}`,
      normalizeMortgageTreatmentOverride(safeSettings.mortgageTreatmentOverride),
      `survivor-income-${safeSettings.includeSurvivorIncome === false ? "off" : "on"}`,
      `lifestyle-${clampLifestyleSliderValue(safeSettings.lifestyleSliderValue)}`,
      `auto-compress-${safeSettings.autoCompressBaselineEnabled !== false ? "on" : "off"}`
    ].join("-").replace(/[^a-zA-Z0-9-]/g, "-").replace(/-+/g, "-").toLowerCase();
    const existingIds = new Set((Array.isArray(existingScenarios) ? existingScenarios : []).map(getAppliedScenarioId));
    let candidate = baseId;
    let suffix = 2;
    while (existingIds.has(candidate)) {
      candidate = `${baseId}-${suffix}`;
      suffix += 1;
    }
    return candidate;
  }

  function getDaysBetweenDateOnly(startDateValue, endDateValue) {
    const startDate = parseDateOnlyValue(startDateValue);
    const endDate = parseDateOnlyValue(endDateValue);
    if (!startDate || !endDate) {
      return null;
    }

    return Math.round((endDate.getTime() - startDate.getTime()) / 86400000);
  }

  function isNearTermDeathScenario(state, settings) {
    const daysUntilDeath = getDaysBetweenDateOnly(state?.valuationDate, settings?.selectedDeathDate);
    return daysUntilDeath != null && daysUntilDeath >= 0 && daysUntilDeath <= 1;
  }

  function getAppliedScenarioLabel(state, settings) {
    const survivorIncomeSuffix = getSurvivorIncomeScenarioLabelSuffix(state, settings);
    if (isNearTermDeathScenario(state, settings)) {
      return `Death tomorrow${survivorIncomeSuffix}`;
    }

    const selectedDeathAge = toOptionalNumber(settings?.selectedDeathAge);
    const currentAge = toOptionalNumber(state?.deathAgeState?.currentAge);
    if (selectedDeathAge != null && currentAge != null && selectedDeathAge > currentAge) {
      const yearsUntilDeath = Math.max(1, selectedDeathAge - currentAge);
      return `Death in ${yearsUntilDeath} ${yearsUntilDeath === 1 ? "year" : "years"}${survivorIncomeSuffix}`;
    }

    if (selectedDeathAge != null) {
      return `Death at age ${selectedDeathAge}${survivorIncomeSuffix}`;
    }

    return `Current scenario${survivorIncomeSuffix}`;
  }

  function setAppliedScenarioRecordIdentity(record, scenarioId, settingsKey) {
    return Object.assign({}, record, {
      scenarioId,
      trace: Object.assign({}, isPlainObject(record.trace) ? record.trace : {}, {
        settingsKey,
        maxAppliedScenarioCount: MAX_APPLIED_SCENARIOS
      })
    });
  }

  function buildAppliedScenarioRecordFromInputs(state, baseContext, inputs) {
    const safeInputs = isPlainObject(inputs) ? inputs : {};
    const settings = getRuntimeScenarioControlsSnapshot(state);
    const lifestyleScenario = safeInputs.lifestyleScenario;
    const monthlyDelta = toOptionalNumber(lifestyleScenario?.monthlyDelta);
    return {
      scenarioId: INITIAL_APPLIED_SCENARIO_ID,
      label: getAppliedScenarioLabel(state, settings),
      settings: clonePlainValue(settings),
      scenario: clonePlainValue(safeInputs.scenario || baseContext?.scenario || null),
      rawBaselineScenario: clonePlainValue(safeInputs.rawBaselineScenario || baseContext?.scenario || null),
      primaryScenario: clonePlainValue(safeInputs.primaryScenario || safeInputs.scenario || baseContext?.scenario || null),
      autoCompressedBaselineScenario: clonePlainValue(safeInputs.autoCompressedBaselineScenario || null),
      baselineContract: clonePlainValue(safeInputs.baselineContract || null),
      riskEvaluation: clonePlainValue(safeInputs.riskEvaluation || baseContext?.riskEvaluation || null),
      comparisonScenarios: Array.isArray(safeInputs.comparisonScenarios)
        ? clonePlainValue(safeInputs.comparisonScenarios)
        : [],
      lifestyleAdjustment: {
        sliderValue: settings.lifestyleSliderValue,
        label: getLifestyleSliderLabel(settings.lifestyleSliderValue),
        status: lifestyleScenario?.status || null,
        monthlyDelta
      },
      lifestyleScenario: clonePlainValue(lifestyleScenario || null),
      comparisonTrace: clonePlainValue(
        lifestyleScenario?.comparisonScenario?.trace
        || safeInputs.comparisonTrace
        || {}
      ),
      trace: {
        source: "income-impact-display-scenario-state",
        liveBehaviorPreserved: true,
        visibleBaselineMode: safeInputs.baselineContract?.visibleBaselineMode || "unadjusted",
        autoCompressionApplied: safeInputs.baselineContract?.autoCompressionApplied === true,
        rawBaselinePreserved: safeInputs.baselineContract?.rawBaselinePreserved === true,
        settingsKey: getScenarioSettingsKey(settings),
        maxAppliedScenarioCount: MAX_APPLIED_SCENARIOS
      }
    };
  }

  function buildAppliedScenarioRecord(state, baseContext, timelineResult) {
    const settings = getRuntimeScenarioControlsSnapshot(state);
    const existingScenario = Array.isArray(state?.appliedScenarios)
      ? findAppliedScenarioBySettings(state.appliedScenarios, settings)
      : null;
    return buildAppliedScenarioRecordFromInputs(state, baseContext, {
      scenario: timelineResult?.scenario,
      rawBaselineScenario: timelineResult?.rawBaselineScenario,
      primaryScenario: timelineResult?.primaryScenario,
      autoCompressedBaselineScenario: timelineResult?.autoCompressedBaselineScenario,
      baselineContract: timelineResult?.baselineContract,
      riskEvaluation: timelineResult?.riskEvaluation,
      lifestyleScenario: timelineResult?.compressionReporting?.lifestyleScenario,
      comparisonTrace: timelineResult?.compressionReporting?.trace,
      comparisonScenarios: Array.isArray(existingScenario?.comparisonScenarios)
        ? existingScenario.comparisonScenarios
        : []
    });
  }

  function upsertAppliedScenarioRecord(state, record) {
    if (!isPlainObject(state) || !isPlainObject(record)) {
      return null;
    }

    state.appliedScenarios = Array.isArray(state.appliedScenarios) ? state.appliedScenarios : [];
    const settingsKey = getScenarioSettingsKey(record.settings);
    const matchingSettingsIndex = findAppliedScenarioIndexBySettings(state.appliedScenarios, settingsKey);
    if (matchingSettingsIndex >= 0) {
      const scenarioId = getAppliedScenarioId(state.appliedScenarios[matchingSettingsIndex], matchingSettingsIndex);
      const nextRecord = setAppliedScenarioRecordIdentity(record, scenarioId, settingsKey);
      state.appliedScenarios[matchingSettingsIndex] = nextRecord;
      state.selectedScenarioId = scenarioId;
      return nextRecord;
    }

    if (!state.appliedScenarios.length) {
      const nextRecord = setAppliedScenarioRecordIdentity(record, INITIAL_APPLIED_SCENARIO_ID, settingsKey);
      state.appliedScenarios.push(nextRecord);
      state.selectedScenarioId = nextRecord.scenarioId;
      return nextRecord;
    }

    if (state.appliedScenarios.length < MAX_APPLIED_SCENARIOS) {
      const scenarioId = createAppliedScenarioId(record.settings, state.appliedScenarios);
      const nextRecord = setAppliedScenarioRecordIdentity(record, scenarioId, settingsKey);
      state.appliedScenarios.push(nextRecord);
      state.selectedScenarioId = scenarioId;
      return nextRecord;
    }

    const selectedIndex = state.appliedScenarios.findIndex(function (scenario, index) {
      return getAppliedScenarioId(scenario, index) === state.selectedScenarioId;
    });
    const replacementIndex = selectedIndex >= 0 ? selectedIndex : state.appliedScenarios.length - 1;
    const replacementScenarioId = getAppliedScenarioId(state.appliedScenarios[replacementIndex], replacementIndex);
    const nextRecord = setAppliedScenarioRecordIdentity(record, replacementScenarioId, settingsKey);
    state.appliedScenarios[replacementIndex] = nextRecord;
    state.selectedScenarioId = replacementScenarioId;
    return nextRecord;
  }

  function upsertInitialAppliedScenarioFromTimelineResult(state, baseContext, timelineResult) {
    if (!isPlainObject(state) || !isPlainObject(timelineResult)) {
      return null;
    }

    return upsertAppliedScenarioRecord(state, buildAppliedScenarioRecord(state, baseContext, timelineResult));
  }

  function cloneVisibleScenarioControlSnapshot(value) {
    return clonePlainValue(value);
  }

  function mapSurvivorDiagnosticPoint(point) {
    return {
      monthIndex: toOptionalNumber(point?.monthIndex),
      survivorIncome: toOptionalNumber(point?.survivorIncome),
      survivorNeeds: toOptionalNumber(point?.survivorNeeds),
      scheduledObligations: toOptionalNumber(point?.scheduledObligations),
      netUse: toOptionalNumber(point?.netUse),
      endingResources: toOptionalNumber(point?.endingResources)
    };
  }

  function getSurvivorDiagnosticScenarioPoints(scenario) {
    return Array.isArray(scenario?.postDeathSeries?.points) ? scenario.postDeathSeries.points : [];
  }

  function pickSurvivorDiagnosticPoints(scenario, limit) {
    return getSurvivorDiagnosticScenarioPoints(scenario)
      .slice(0, Math.max(toOptionalNumber(limit) || 8, 0))
      .map(mapSurvivorDiagnosticPoint);
  }

  function pickSurvivorDiagnosticPointWindow(scenario, centerMonth, monthsBefore, monthsAfter) {
    const center = toOptionalNumber(centerMonth);
    if (center == null) {
      return [];
    }
    const startMonth = Math.max(1, center - (toOptionalNumber(monthsBefore) ?? 0));
    const endMonth = center + (toOptionalNumber(monthsAfter) ?? 0);
    return getSurvivorDiagnosticScenarioPoints(scenario)
      .filter(function (point, index) {
        const monthIndex = toOptionalNumber(point?.monthIndex) ?? index + 1;
        return monthIndex >= startMonth && monthIndex <= endMonth;
      })
      .map(mapSurvivorDiagnosticPoint);
  }

  function getSurvivorDiagnosticPointCount(scenario) {
    return getSurvivorDiagnosticScenarioPoints(scenario).length;
  }

  function getScenarioDepletionMonth(scenario) {
    return toOptionalNumber(
      scenario?.postDeathSeries?.depletion?.depletionMonthIndex
      ?? scenario?.postDeathSeries?.depletion?.monthsCovered
      ?? scenario?.timelineFacts?.monthsCovered
    );
  }

  function getGraphPointValue(point) {
    return toOptionalNumber(point?.value ?? point?.endingResources ?? point?.availableResources);
  }

  function mapSurvivorDiagnosticGraphPoint(point) {
    return {
      monthIndex: toOptionalNumber(point?.monthIndex),
      value: getGraphPointValue(point),
      endingResources: toOptionalNumber(point?.endingResources),
      availableResources: toOptionalNumber(point?.availableResources)
    };
  }

  function pickSurvivorDiagnosticGraphPoints(points, limit) {
    return (Array.isArray(points) ? points : [])
      .slice(0, Math.max(toOptionalNumber(limit) || 24, 0))
      .map(mapSurvivorDiagnosticGraphPoint);
  }

  function pickSurvivorDiagnosticGraphPointWindow(points, centerMonth, monthsBefore, monthsAfter) {
    const center = toOptionalNumber(centerMonth);
    if (center == null) {
      return [];
    }
    const startMonth = Math.max(1, center - (toOptionalNumber(monthsBefore) ?? 0));
    const endMonth = center + (toOptionalNumber(monthsAfter) ?? 0);
    return (Array.isArray(points) ? points : [])
      .filter(function (point, index) {
        const monthIndex = toOptionalNumber(point?.monthIndex) ?? index + 1;
        return monthIndex >= startMonth && monthIndex <= endMonth;
      })
      .map(mapSurvivorDiagnosticGraphPoint);
  }

  function summarizeSurvivorDiagnosticComparisonGraphSeries(series, primaryFirstValue, primaryLastValue, delayMonths) {
    const points = Array.isArray(series?.points) ? series.points : [];
    const firstPoint = points[0] || null;
    const lastPoint = points.length ? points[points.length - 1] : null;
    const firstPointValue = getGraphPointValue(firstPoint);
    const lastPointValue = getGraphPointValue(lastPoint);
    return {
      scenarioId: series?.scenarioId || null,
      pathId: series?.pathId || null,
      label: series?.label || null,
      pointCount: points.length,
      pointsSample: pickSurvivorDiagnosticGraphPoints(points, 24),
      pointsAroundDelay: pickSurvivorDiagnosticGraphPointWindow(points, delayMonths, 2, 6),
      firstPointValue,
      lastPointValue,
      lineValuesDifferFromPrimary: firstPointValue !== primaryFirstValue || lastPointValue !== primaryLastValue
    };
  }

  function summarizeSurvivorDiagnosticGraph(graphModel, delayMonths) {
    const series = isPlainObject(graphModel?.series) ? graphModel.series : {};
    const postDeathPoints = Array.isArray(series.postDeathResources) ? series.postDeathResources : [];
    const appliedSeries = Array.isArray(series.appliedPostDeathResources) ? series.appliedPostDeathResources : [];
    const comparisonSeries = Array.isArray(series.comparisonPostDeathResources) ? series.comparisonPostDeathResources : [];
    const selectedApplied = appliedSeries.find(function (row) {
      return row?.selected === true;
    }) || appliedSeries[0] || null;
    const selectedPoints = Array.isArray(selectedApplied?.points) ? selectedApplied.points : [];
    const primaryPoints = selectedPoints.length ? selectedPoints : postDeathPoints;
    const firstPoint = primaryPoints[0] || null;
    const lastPoint = primaryPoints.length ? primaryPoints[primaryPoints.length - 1] : null;

    return {
      status: graphModel?.status || null,
      primaryPointCount: primaryPoints.length,
      firstPointValue: getGraphPointValue(firstPoint),
      lastPointValue: getGraphPointValue(lastPoint),
      selectedAppliedScenarioPathId: graphModel?.trace?.selectedAppliedScenarioPathId || selectedApplied?.pathId || null,
      renderedAppliedScenarioCount: toOptionalNumber(graphModel?.trace?.renderedAppliedScenarioCount),
      appliedScenarioPathsEnabled: graphModel?.trace?.appliedScenarioPathsEnabled === true,
      comparisonScenarioIds: comparisonSeries.map(function (row) {
        return row?.scenarioId || row?.pathId || null;
      }).filter(Boolean),
      comparisonScenarioCount: comparisonSeries.length,
      comparisonScenarios: comparisonSeries.map(function (row) {
        return summarizeSurvivorDiagnosticComparisonGraphSeries(
          row,
          getGraphPointValue(firstPoint),
          getGraphPointValue(lastPoint),
          delayMonths
        );
      })
    };
  }

  function getLastSurvivorDiagnosticPoint(points) {
    return Array.isArray(points) && points.length ? points[points.length - 1] : null;
  }

  function getSurvivorDiagnosticPointEndingResources(point) {
    return toOptionalNumber(point?.endingResources ?? point?.availableResources);
  }

  function summarizeSurvivorDiagnosticComparisonScenario(scenario, delayMonths, primaryScenario) {
    const pointsSample = pickSurvivorDiagnosticPoints(scenario, 24);
    const pointsAroundDelay = pickSurvivorDiagnosticPointWindow(scenario, delayMonths, 2, 6);
    const primaryPointsSample = pickSurvivorDiagnosticPoints(primaryScenario, 24);
    const comparisonLastPoint = getLastSurvivorDiagnosticPoint(pointsSample);
    const primaryLastPoint = getLastSurvivorDiagnosticPoint(primaryPointsSample);
    const comparisonAfterDelayPoint = pointsAroundDelay.find(function (point) {
      const monthIndex = toOptionalNumber(point?.monthIndex);
      const delay = toOptionalNumber(delayMonths);
      return delay == null ? (toOptionalNumber(point?.survivorIncome) || 0) > 0 : monthIndex != null && monthIndex > delay;
    }) || null;
    return {
      scenarioId: scenario?.scenarioId || scenario?.pathId || null,
      type: scenario?.kind || scenario?.type || scenario?.trace?.displayComparisonKind || null,
      label: scenario?.label || null,
      firstPoints: pickSurvivorDiagnosticPoints(scenario, 8),
      pointsSample,
      pointsAroundDelay,
      fullPointCount: getSurvivorDiagnosticPointCount(scenario),
      depletionMonth: getScenarioDepletionMonth(scenario),
      netUseAfterDelay: toOptionalNumber(comparisonAfterDelayPoint?.netUse),
      endingResourcesAfterDelay: getSurvivorDiagnosticPointEndingResources(comparisonAfterDelayPoint),
      hasSurvivorIncomeAfterDelay: hasPositiveSurvivorIncomeAfterDelay({
        rawBaselinePointsAroundDelay: pointsAroundDelay,
        rawBaselinePointsSample: pointsSample
      }, delayMonths),
      lineValuesDifferFromPrimary: getSurvivorDiagnosticPointEndingResources(comparisonLastPoint)
        !== getSurvivorDiagnosticPointEndingResources(primaryLastPoint)
    };
  }

  function getSurvivorDiagnosticComparisonScenarios(timelineResult) {
    const comparisonScenarios = [];
    if (Array.isArray(timelineResult?.comparisonScenarios)) {
      comparisonScenarios.push(...timelineResult.comparisonScenarios);
    }
    const lifestyleComparison = getLifestyleImpactComparisonScenario(timelineResult);
    if (isPlainObject(lifestyleComparison)) {
      const existingId = lifestyleComparison.scenarioId || lifestyleComparison.pathId || null;
      const exists = comparisonScenarios.some(function (scenario) {
        return (scenario?.scenarioId || scenario?.pathId || null) === existingId;
      });
      if (!exists) {
        comparisonScenarios.push(lifestyleComparison);
      }
    }
    return comparisonScenarios;
  }

  function summarizeSurvivorDiagnosticTimelineResult(timelineResult, delayMonths) {
    const scenario = isPlainObject(timelineResult?.scenario) ? timelineResult.scenario : {};
    const rawBaselineScenario = isPlainObject(timelineResult?.rawBaselineScenario)
      ? timelineResult.rawBaselineScenario
      : scenario;
    const baselineContract = isPlainObject(timelineResult?.baselineContract) ? timelineResult.baselineContract : {};
    const scenarioDepletionMonth = getScenarioDepletionMonth(scenario);
    const rawBaselineDepletionMonth = getScenarioDepletionMonth(rawBaselineScenario);
    const comparisonScenarios = getSurvivorDiagnosticComparisonScenarios(timelineResult);
    const lifestyleComparisonScenario = getLifestyleImpactComparisonScenario(timelineResult);
    const lifestyleComparisonSummary = summarizeSurvivorDiagnosticComparisonScenario(
      lifestyleComparisonScenario,
      delayMonths,
      rawBaselineScenario
    );

    return {
      scenarioId: scenario.scenarioId || null,
      rawBaselineScenarioId: rawBaselineScenario.scenarioId || null,
      visibleBaselineMode: baselineContract.visibleBaselineMode || "unadjusted",
      autoCompressionApplied: baselineContract.autoCompressionApplied === true,
      firstPoints: pickSurvivorDiagnosticPoints(scenario, 8),
      rawBaselineFirstPoints: pickSurvivorDiagnosticPoints(rawBaselineScenario, 8),
      pointsSample: pickSurvivorDiagnosticPoints(scenario, 24),
      rawBaselinePointsSample: pickSurvivorDiagnosticPoints(rawBaselineScenario, 24),
      pointsAroundDelay: pickSurvivorDiagnosticPointWindow(scenario, delayMonths, 2, 6),
      rawBaselinePointsAroundDelay: pickSurvivorDiagnosticPointWindow(rawBaselineScenario, delayMonths, 2, 6),
      pointsAroundDepletion: pickSurvivorDiagnosticPointWindow(scenario, scenarioDepletionMonth, 2, 3),
      rawBaselinePointsAroundDepletion: pickSurvivorDiagnosticPointWindow(rawBaselineScenario, rawBaselineDepletionMonth, 2, 3),
      fullPointCount: getSurvivorDiagnosticPointCount(scenario),
      rawBaselineFullPointCount: getSurvivorDiagnosticPointCount(rawBaselineScenario),
      depletionMonth: scenarioDepletionMonth,
      rawBaselineDepletionMonth,
      comparisonScenarioIds: comparisonScenarios.map(function (row) {
        return row?.scenarioId || row?.pathId || null;
      }).filter(Boolean),
      comparisonScenarios: comparisonScenarios.map(function (row) {
        return summarizeSurvivorDiagnosticComparisonScenario(row, delayMonths, rawBaselineScenario);
      }),
      lifestyleComparison: {
        active: isPlainObject(lifestyleComparisonScenario),
        scenarioId: lifestyleComparisonSummary.scenarioId,
        type: lifestyleComparisonSummary.type,
        label: lifestyleComparisonSummary.label,
        pointsAroundDelay: lifestyleComparisonSummary.pointsAroundDelay,
        pointsSample: lifestyleComparisonSummary.pointsSample,
        fullPointCount: lifestyleComparisonSummary.fullPointCount,
        hasSurvivorIncomeAfterDelay: lifestyleComparisonSummary.hasSurvivorIncomeAfterDelay,
        netUseAfterDelay: lifestyleComparisonSummary.netUseAfterDelay,
        endingResourcesAfterDelay: lifestyleComparisonSummary.endingResourcesAfterDelay,
        lineValuesDifferFromPrimary: lifestyleComparisonSummary.lineValuesDifferFromPrimary
      },
      dataGapCodes: (Array.isArray(timelineResult?.dataGaps) ? timelineResult.dataGaps : []).map(function (gap) {
        return gap?.code || null;
      }).filter(Boolean),
      warningCodes: (Array.isArray(timelineResult?.warnings) ? timelineResult.warnings : []).map(function (warning) {
        return warning?.code || null;
      }).filter(Boolean),
      graph: summarizeSurvivorDiagnosticGraph(timelineResult?.graphModel, delayMonths)
    };
  }

  function makeSurvivorDiagnosticState(state, includeSurvivorIncome) {
    const safeState = isPlainObject(state) ? state : {};
    const controls = getRuntimeScenarioControlsSnapshot(safeState);
    return Object.assign({}, safeState, {
      deathAgeState: clonePlainValue(safeState.deathAgeState || {}),
      scenarioState: Object.assign({}, safeState.scenarioState || {}, controls, {
        includeSurvivorIncome: includeSurvivorIncome !== false
      }),
      draftScenarioControls: null,
      appliedScenarios: [],
      selectedScenarioId: INITIAL_APPLIED_SCENARIO_ID,
      baseRenderCache: null
    });
  }

  function buildSurvivorDiagnosticScenarioSummary(state, includeSurvivorIncome) {
    const diagnosticState = makeSurvivorDiagnosticState(state, includeSurvivorIncome);
    const baseContext = buildBaseIncomeImpactContextFromState(diagnosticState);
    const timelineResult = buildIncomeImpactResultFromBaseContext(diagnosticState, baseContext);
    return summarizeSurvivorDiagnosticTimelineResult(timelineResult, diagnosticState.lensModel?.survivorScenario?.survivorIncomeStartDelayMonths);
  }

  function hasPositiveSurvivorIncomeAfterDelay(summary, delayMonths) {
    const delay = toOptionalNumber(delayMonths);
    return []
      .concat(Array.isArray(summary?.rawBaselinePointsAroundDelay) ? summary.rawBaselinePointsAroundDelay : [])
      .concat(Array.isArray(summary?.rawBaselinePointsSample) ? summary.rawBaselinePointsSample : [])
      .concat(Array.isArray(summary?.rawBaselineFirstPoints) ? summary.rawBaselineFirstPoints : [])
      .some(function (point) {
        const monthIndex = toOptionalNumber(point?.monthIndex);
        if (delay != null && monthIndex != null && monthIndex <= delay) {
          return false;
        }
        return (toOptionalNumber(point?.survivorIncome) || 0) > 0;
      });
  }

  function diagnosticPointWindowCoversSurvivorDelay(summary, delayMonths) {
    const delay = toOptionalNumber(delayMonths);
    if (delay == null) {
      return false;
    }
    return []
      .concat(Array.isArray(summary?.rawBaselinePointsAroundDelay) ? summary.rawBaselinePointsAroundDelay : [])
      .concat(Array.isArray(summary?.rawBaselinePointsSample) ? summary.rawBaselinePointsSample : [])
      .some(function (point) {
        const monthIndex = toOptionalNumber(point?.monthIndex);
        return monthIndex != null && monthIndex > delay;
      });
  }

  function scenarioNetUseSignature(summary) {
    return []
      .concat(Array.isArray(summary?.rawBaselinePointsSample) ? summary.rawBaselinePointsSample : [])
      .concat(Array.isArray(summary?.rawBaselineFirstPoints) ? summary.rawBaselineFirstPoints : [])
      .map(function (point) {
        return [
          toOptionalNumber(point?.monthIndex),
          toOptionalNumber(point?.survivorIncome),
          toOptionalNumber(point?.netUse),
          toOptionalNumber(point?.endingResources)
        ].join(":");
      })
      .join("|");
  }

  function getIncomeImpactSurvivorIncomeSnapshot() {
    if (!incomeImpactState) {
      return {
        status: "unavailable",
        reason: "income-impact-state-unavailable"
      };
    }

    const survivorScenario = isPlainObject(incomeImpactState.lensModel?.survivorScenario)
      ? incomeImpactState.lensModel.survivorScenario
      : {};
    const derivation = isPlainObject(survivorScenario.survivorIncomeDerivation)
      ? survivorScenario.survivorIncomeDerivation
      : {};
    const draftControls = getDraftScenarioControlsSnapshot(incomeImpactState);
    const appliedControls = getAppliedScenarioSettingsSnapshot(incomeImpactState);
    const included = buildSurvivorDiagnosticScenarioSummary(incomeImpactState, true);
    const excluded = buildSurvivorDiagnosticScenarioSummary(incomeImpactState, false);
    const delayMonths = toOptionalNumber(survivorScenario.survivorIncomeStartDelayMonths);
    const currentRendered = summarizeSurvivorDiagnosticTimelineResult(incomeImpactState.latestTimelineResult || {}, delayMonths);
    const survivorNetAnnualIncome = toOptionalNumber(survivorScenario.survivorNetAnnualIncome);

    return clonePlainValue({
      status: "ready",
      linkedProfile: {
        id: incomeImpactState.profileRecord?.id || null,
        name: incomeImpactState.profileRecord?.displayName || incomeImpactState.profileRecord?.clientName || null,
        caseRef: incomeImpactState.profileRecord?.caseRef || null
      },
      analysisSettings: {
        source: incomeImpactState.analysisSettingsSource || null
      },
      survivorScenario: {
        survivorNetAnnualIncome,
        survivorIncomeStartDelayMonths: toOptionalNumber(survivorScenario.survivorIncomeStartDelayMonths),
        survivorIncomeDerivation: clonePlainValue(derivation),
        survivorSupportSettingsSource: derivation.survivorSupportSettingsSource || null,
        survivorSupportAssumptionsSourcePath: derivation.survivorSupportAssumptionsSourcePath || null
      },
      scenarioControls: {
        draft: draftControls,
        applied: appliedControls
      },
      included,
      excluded,
      currentRendered,
      lifestyleComparison: clonePlainValue(currentRendered.lifestyleComparison || { active: false }),
      conclusions: {
        survivorNetAnnualIncomePositive: survivorNetAnnualIncome != null && survivorNetAnnualIncome > 0,
        includedScenarioHasSurvivorIncomeAfterDelay: hasPositiveSurvivorIncomeAfterDelay(included, delayMonths),
        excludedScenarioHasSurvivorIncome: hasPositiveSurvivorIncomeAfterDelay(excluded, delayMonths),
        diagnosticPointWindowCoversSurvivorDelay: diagnosticPointWindowCoversSurvivorDelay(included, delayMonths),
        includedExcludedDiffer: scenarioNetUseSignature(included) !== scenarioNetUseSignature(excluded)
          || included.rawBaselineDepletionMonth !== excluded.rawBaselineDepletionMonth,
        graphLineValuesDiffer: included.graph.firstPointValue !== excluded.graph.firstPointValue
          || included.graph.lastPointValue !== excluded.graph.lastPointValue,
        currentRenderedUsesAutoCompressedBaseline: currentRendered.autoCompressionApplied === true,
        lifestyleComparisonActive: currentRendered.lifestyleComparison?.active === true,
        lifestyleComparisonHasSurvivorIncomeAfterDelay: currentRendered.lifestyleComparison?.active === true
          && currentRendered.lifestyleComparison?.hasSurvivorIncomeAfterDelay === true,
        lifestyleComparisonLineDiffersFromPrimary: currentRendered.lifestyleComparison?.active === true
          && currentRendered.lifestyleComparison?.lineValuesDifferFromPrimary === true
      }
    });
  }

  function getScenarioSelectionTarget(event) {
    const target = event?.target;
    if (!target) {
      return null;
    }

    if (typeof target.closest === "function") {
      return target.closest("[data-income-impact-scenario-select]");
    }

    if (
      typeof target.getAttribute === "function"
      && target.getAttribute("data-income-impact-scenario-select") != null
    ) {
      return target;
    }

    return null;
  }

  function getScenarioSelectionTargetId(target) {
    if (!target || typeof target.getAttribute !== "function") {
      return "";
    }

    return normalizeString(
      target.getAttribute("data-income-impact-scenario-select")
      || target.getAttribute("data-income-impact-applied-scenario-id")
    );
  }

  function syncScenarioSelectionDom(host, selectedScenarioId) {
    if (!host || typeof host.querySelectorAll !== "function") {
      return;
    }

    const normalizedSelectedScenarioId = normalizeString(selectedScenarioId);
    Array.from(host.querySelectorAll("[data-income-impact-applied-scenario-id]")).forEach(function (target) {
      if (!target || typeof target.getAttribute !== "function" || typeof target.setAttribute !== "function") {
        return;
      }

      const scenarioId = normalizeString(target.getAttribute("data-income-impact-applied-scenario-id"));
      const selected = Boolean(normalizedSelectedScenarioId && scenarioId === normalizedSelectedScenarioId);
      target.setAttribute("data-income-impact-applied-scenario-selected", selected ? "true" : "false");
      if (target.getAttribute("data-income-impact-scenario-select") != null) {
        target.setAttribute("aria-pressed", selected ? "true" : "false");
      }
    });
  }

  function handleScenarioSelectionEvent(event) {
    const target = getScenarioSelectionTarget(event);
    const scenarioId = getScenarioSelectionTargetId(target);
    if (!scenarioId || !incomeImpactState) {
      return;
    }

    const selection = selectAppliedScenario(incomeImpactState, scenarioId);
    if (!selection) {
      return;
    }

    if (typeof event?.preventDefault === "function") {
      event.preventDefault();
    }

    const timelineResult = buildIncomeImpactResultFromSelectedAppliedScenario(incomeImpactState);
    if (timelineResult) {
      renderIncomeImpactTimelineResult(timelineResult);
    } else {
      syncScenarioSelectionDom(incomeImpactState.host, incomeImpactState.selectedScenarioId);
      updateScenarioControls(incomeImpactState.latestTimelineResult);
    }
  }

  function handleScenarioSelectionKeydown(event) {
    const key = String(event?.key || "");
    if (key !== "Enter" && key !== " ") {
      return;
    }

    handleScenarioSelectionEvent(event);
  }

  function renderIncomeImpactTimelineResult(timelineResult) {
    if (!incomeImpactState?.host || !isPlainObject(timelineResult)) {
      return;
    }

    incomeImpactState.latestTimelineResult = timelineResult;
    renderIncomeImpact(incomeImpactState.host, {
      lensModel: incomeImpactState.lensModel,
      timelineResult,
      builderWarnings: incomeImpactState.builderWarnings
    });
    updateScenarioControls(timelineResult);
    syncScenarioSelectionDom(incomeImpactState.host, incomeImpactState.selectedScenarioId);
  }

  function renderIncomeImpactFromState() {
    if (
      !incomeImpactState?.host
      || typeof incomeImpactState.composeIncomeImpactScenario !== "function"
      || typeof incomeImpactState.evaluateIncomeImpactRiskEvents !== "function"
      || typeof incomeImpactState.buildIncomeImpactTimelineGraphModel !== "function"
    ) {
      return;
    }

    const baseContext = buildBaseIncomeImpactContextFromState(incomeImpactState);
    incomeImpactState.baseRenderCache = {
      key: baseContext.cacheKey,
      baseContext
    };
    const timelineResult = buildIncomeImpactResultFromBaseContext(incomeImpactState, baseContext);
    upsertInitialAppliedScenarioFromTimelineResult(incomeImpactState, baseContext, timelineResult);
    renderIncomeImpactTimelineResult(timelineResult);
  }

  function bindScenarioControls() {
    if (incomeImpactState?.scenarioControlsBound) {
      return;
    }

    const elements = getDeathAgeControlElements();

    function updateSelectedDeathAge(event) {
      const state = incomeImpactState?.deathAgeState;
      if (!state?.hasDateOfBirth) {
        return;
      }

      const controls = getDraftScenarioControlsSnapshot(incomeImpactState);
      controls.selectedDeathAge = clampRoundedAge(event?.target?.value, state.minAge, state.maxAge);
      setDraftScenarioControls(incomeImpactState, controls);
      updateScenarioControls(incomeImpactState.latestTimelineResult);
    }

    if (elements?.slider) {
      elements.slider.addEventListener("input", updateSelectedDeathAge);
      elements.slider.addEventListener("change", updateSelectedDeathAge);
    }

    const scenarioElements = getScenarioBannerElements();
    if (!scenarioElements) {
      return;
    }

    if (scenarioElements.projectionHorizon) {
      const updateProjectionHorizon = function (event) {
        if (!incomeImpactState) {
          return;
        }

        const controls = getDraftScenarioControlsSnapshot(incomeImpactState);
        controls.projectionHorizonYears = clampProjectionHorizonYears(event?.target?.value);
        setDraftScenarioControls(incomeImpactState, controls);
        updateScenarioControls(incomeImpactState.latestTimelineResult);
      };
      scenarioElements.projectionHorizon.addEventListener("input", updateProjectionHorizon);
      scenarioElements.projectionHorizon.addEventListener("change", updateProjectionHorizon);
    }

    if (scenarioElements.mortgageTreatment) {
      scenarioElements.mortgageTreatment.addEventListener("change", function (event) {
        if (!incomeImpactState) {
          return;
        }

        const controls = getDraftScenarioControlsSnapshot(incomeImpactState);
        controls.mortgageTreatmentOverride = normalizeMortgageTreatmentOverride(event?.target?.value);
        setDraftScenarioControls(incomeImpactState, controls);
        updateScenarioControls(incomeImpactState.latestTimelineResult);
      });
    }

    scenarioElements.mortgageTreatmentOptions.forEach(function (option) {
      option.addEventListener("click", function () {
        if (!incomeImpactState) {
          return;
        }

        const controls = getDraftScenarioControlsSnapshot(incomeImpactState);
        controls.mortgageTreatmentOverride = normalizeMortgageTreatmentOverride(option.getAttribute("data-income-impact-mortgage-treatment-option"));
        if (scenarioElements.mortgageTreatment) {
          scenarioElements.mortgageTreatment.value = controls.mortgageTreatmentOverride;
        }
        setDraftScenarioControls(incomeImpactState, controls);
        updateScenarioControls(incomeImpactState.latestTimelineResult);
      });
    });

    if (scenarioElements.survivorIncome) {
      scenarioElements.survivorIncome.addEventListener("change", function (event) {
        if (!incomeImpactState) {
          return;
        }

        const controls = getDraftScenarioControlsSnapshot(incomeImpactState);
        controls.includeSurvivorIncome = event?.target?.checked === true;
        setDraftScenarioControls(incomeImpactState, controls);
        updateScenarioControls(incomeImpactState.latestTimelineResult);
      });
    }

    scenarioElements.survivorIncomeOptions.forEach(function (option) {
      option.addEventListener("click", function () {
        if (!incomeImpactState) {
          return;
        }

        const controls = getDraftScenarioControlsSnapshot(incomeImpactState);
        controls.includeSurvivorIncome = normalizeString(option.getAttribute("data-income-impact-survivor-income-option")) !== "false";
        if (scenarioElements.survivorIncome) {
          scenarioElements.survivorIncome.checked = controls.includeSurvivorIncome;
        }
        setDraftScenarioControls(incomeImpactState, controls);
        updateScenarioControls(incomeImpactState.latestTimelineResult);
      });
    });

    if (scenarioElements.lifestyleSlider) {
      const updateLifestyleSlider = function (event) {
        if (!incomeImpactState) {
          return;
        }

        const controls = getDraftScenarioControlsSnapshot(incomeImpactState);
        controls.lifestyleSliderValue = clampLifestyleSliderValue(event?.target?.value);
        setDraftScenarioControls(incomeImpactState, controls);
        updateScenarioControls(incomeImpactState.latestTimelineResult);
      };
      scenarioElements.lifestyleSlider.addEventListener("input", updateLifestyleSlider);
      scenarioElements.lifestyleSlider.addEventListener("change", updateLifestyleSlider);
    }

    scenarioElements.lifestyleOptions.forEach(function (option) {
      option.addEventListener("click", function () {
        if (!incomeImpactState) {
          return;
        }

        const controls = getDraftScenarioControlsSnapshot(incomeImpactState);
        controls.lifestyleSliderValue = clampLifestyleSliderValue(option.getAttribute("data-income-impact-lifestyle-option"));
        if (scenarioElements.lifestyleSlider) {
          scenarioElements.lifestyleSlider.value = String(controls.lifestyleSliderValue);
        }
        setDraftScenarioControls(incomeImpactState, controls);
        updateScenarioControls(incomeImpactState.latestTimelineResult);
      });
    });

    if (scenarioElements.autoCompressBaseline) {
      scenarioElements.autoCompressBaseline.addEventListener("change", function (event) {
        if (!incomeImpactState) {
          return;
        }

        const controls = getDraftScenarioControlsSnapshot(incomeImpactState);
        controls.autoCompressBaselineEnabled = event?.target?.checked === true;
        setDraftScenarioControls(incomeImpactState, controls);
        updateScenarioControls(incomeImpactState.latestTimelineResult);
      });
    }

    if (scenarioElements.reevaluateButton) {
      scenarioElements.reevaluateButton.addEventListener("click", function () {
        if (!incomeImpactState) {
          return;
        }

        if (incomeImpactState.scenarioState?.reevaluating === true) {
          return;
        }

        if (!hasDraftScenarioChanges(incomeImpactState)) {
          updateScenarioControls(incomeImpactState.latestTimelineResult);
          return;
        }

        setScenarioReevaluating(true);
        updateScenarioControls(incomeImpactState.latestTimelineResult);

        const applyReevaluate = function () {
          if (!incomeImpactState) {
            return;
          }

          setScenarioReevaluating(false);
          applyDraftScenarioControlsToRuntimeState(incomeImpactState);
          invalidateIncomeImpactBaseRenderCache();
          renderIncomeImpactFromState();
        };
        const scheduleReevaluate = getReevaluateScheduler();
        if (scheduleReevaluate) {
          scheduleReevaluate(applyReevaluate, REEVALUATE_GRAPH_UPDATE_DELAY_MS);
        } else {
          applyReevaluate();
        }
      });
    }

    if (scenarioElements.toggle) {
      scenarioElements.toggle.addEventListener("click", function () {
        const scenarioState = incomeImpactState?.scenarioState;
        if (!scenarioState) {
          return;
        }

        scenarioState.bannerCollapsed = !scenarioState.bannerCollapsed;
        updateScenarioControls(incomeImpactState.latestTimelineResult);
      });
    }

    if (incomeImpactState?.host) {
      incomeImpactState.host.addEventListener("click", handleScenarioSelectionEvent);
      incomeImpactState.host.addEventListener("keydown", handleScenarioSelectionKeydown);
    }

    if (incomeImpactState) {
      incomeImpactState.scenarioControlsBound = true;
    }
  }

  function initializeIncomeLossImpactDisplay() {
    const host = document.querySelector("[data-income-impact-display]");
    if (!host) {
      return;
    }
    syncIncomeImpactWorkflowLinks();

    const currentLensAnalysis = window.LensApp?.lensAnalysis || {};
    const buildLensModelFromSavedProtectionModeling = currentLensAnalysis.buildLensModelFromSavedProtectionModeling;
    const composeIncomeImpactScenario = currentLensAnalysis.composeIncomeImpactScenario;
    const evaluateIncomeImpactRiskEvents = currentLensAnalysis.evaluateIncomeImpactRiskEvents;
    const buildIncomeImpactTimelineGraphModel = currentLensAnalysis.buildIncomeImpactTimelineGraphModel;
    const buildIncomeImpactAutoCompressedBaseline = currentLensAnalysis.buildIncomeImpactAutoCompressedBaseline;
    const buildIncomeImpactFinancialStorylineCandidates = currentLensAnalysis.buildIncomeImpactFinancialStorylineCandidates;
    const buildIncomeImpactResourceBucketsFromLensModel = currentLensAnalysis.buildIncomeImpactResourceBucketsFromLensModel;
    const buildIncomeImpactResourceWaterfall = currentLensAnalysis.buildIncomeImpactResourceWaterfall;
    const buildIncomeImpactHousingRisk = currentLensAnalysis.buildIncomeImpactHousingRisk;
    const prepareIncomeImpactCompressionReportingInputs = currentLensAnalysis.prepareIncomeImpactCompressionReportingInputs;
    const calculateIncomeImpactCompressionScenario = currentLensAnalysis.calculateIncomeImpactCompressionScenario;
    const calculateIncomeImpactLifestyleScenario = currentLensAnalysis.incomeImpactLifestyleScenarioCalculations?.calculateIncomeImpactLifestyleScenario;
    const calculateIncomeImpactTriageInterventions = currentLensAnalysis.calculateIncomeImpactTriageInterventions;
    const accountPolicyStorage = root.accountSettings?.householdExpenseAccountPolicyStorage;
    const resolveHouseholdExpenseAccountPolicy = currentLensAnalysis.householdExpenseAccountPolicyResolver?.resolveHouseholdExpenseAccountPolicy;

    if (typeof buildLensModelFromSavedProtectionModeling !== "function") {
      renderEmptyState(host, "Income impact unavailable", "Lens saved-data builder is unavailable.");
      return;
    }

    if (typeof composeIncomeImpactScenario !== "function") {
      renderEmptyState(host, "Income impact unavailable", "Income impact scenario composer is unavailable.");
      return;
    }

    if (typeof evaluateIncomeImpactRiskEvents !== "function") {
      renderEmptyState(host, "Income impact unavailable", "Income impact risk evaluator is unavailable.");
      return;
    }

    if (typeof buildIncomeImpactTimelineGraphModel !== "function") {
      renderEmptyState(host, "Income impact unavailable", "Income impact graph model builder is unavailable.");
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
      const analysisSettings = resolveAnalysisSettings(profileRecord, { protectionModelingPayload });
      const analysisSettingsSource = resolveAnalysisSettingsSource(
        profileRecord,
        protectionModelingPayload,
        analysisSettings
      );
      const builderInput = {
        profileRecord,
        protectionModelingPayload,
        analysisSettings,
        taxConfig: createSavedDataTaxConfig()
      };
      const builderResult = buildLensModelFromSavedProtectionModeling(builderInput);

      if (!builderResult?.lensModel) {
        renderEmptyState(host, "Income impact unavailable", "The saved Lens model could not be built for this profile.");
        return;
      }

      const valuationDate = resolveTimelineValuationDate(profileRecord, builderResult.lensModel);
      const householdExpenseAccountPolicyContext = resolveIncomeImpactHouseholdExpenseAccountPolicy({
        currentLensAnalysis,
        accountPolicyStorage,
        accountPolicyResolver: resolveHouseholdExpenseAccountPolicy,
        storage: window.localStorage
      });
      incomeImpactState = {
        host,
        lensModel: builderResult.lensModel,
        profileRecord,
        protectionModelingPayload,
        analysisSettings,
        analysisSettingsSource,
        valuationDate,
        composeIncomeImpactScenario,
        evaluateIncomeImpactRiskEvents,
        buildIncomeImpactTimelineGraphModel,
        buildIncomeImpactAutoCompressedBaseline,
        buildIncomeImpactFinancialStorylineCandidates,
        buildIncomeImpactResourceBucketsFromLensModel,
        buildIncomeImpactResourceWaterfall,
        buildIncomeImpactHousingRisk,
        prepareIncomeImpactCompressionReportingInputs,
        calculateIncomeImpactCompressionScenario,
        calculateIncomeImpactLifestyleScenario,
        calculateIncomeImpactTriageInterventions,
        householdExpenseAccountPolicyContext,
        deathAgeState: resolveDeathAgeControlState(builderResult.lensModel, valuationDate),
        scenarioState: {
          projectionHorizonYears: DEFAULT_PROJECTION_HORIZON_YEARS,
          mortgageTreatmentOverride: "followAssumptions",
          includeSurvivorIncome: getAssumptionSurvivorIncomeEnabled(builderResult.lensModel),
          lifestyleSliderValue: 0,
          autoCompressBaselineEnabled: true,
          bannerCollapsed: false
        },
        draftScenarioControls: null,
        appliedScenarios: [],
        selectedScenarioId: INITIAL_APPLIED_SCENARIO_ID,
        baseRenderCache: null,
        scenarioControlsBound: false,
        builderWarnings: builderResult.warnings
      };

      syncDraftScenarioControlsFromState(incomeImpactState);
      renderIncomeImpactFromState();
      bindScenarioControls();
    } catch (error) {
      renderEmptyState(host, "Income impact unavailable", "Income Loss Impact could not be prepared from the saved Lens model.");
      console.error("Income Loss Impact display failed", error);
    }
  }

  lensAnalysis.incomeLossImpactDisplay = {
    initializeIncomeLossImpactDisplay,
    getSurvivorIncomeSnapshot: getIncomeImpactSurvivorIncomeSnapshot,
    getScenarioComparisonStateSnapshot: function () {
      if (!incomeImpactState) {
        return {
          draftScenarioControls: null,
          appliedScenarios: [],
          selectedScenarioId: null
        };
      }

      return clonePlainValue({
        draftScenarioControls: cloneVisibleScenarioControlSnapshot(incomeImpactState.draftScenarioControls || null),
        appliedScenarios: cloneVisibleScenarioControlSnapshot(
          Array.isArray(incomeImpactState.appliedScenarios) ? incomeImpactState.appliedScenarios : []
        ),
        selectedScenarioId: incomeImpactState.selectedScenarioId || null,
        hasDraftChanges: hasDraftScenarioChanges(incomeImpactState)
      });
    }
  };

  window.__MODEL90_INCOME_IMPACT_DEBUG__ = Object.assign(
    {},
    isPlainObject(window.__MODEL90_INCOME_IMPACT_DEBUG__) ? window.__MODEL90_INCOME_IMPACT_DEBUG__ : {},
    {
      getSurvivorIncomeSnapshot: getIncomeImpactSurvivorIncomeSnapshot
    }
  );

  document.addEventListener("DOMContentLoaded", initializeIncomeLossImpactDisplay);
})(window);
