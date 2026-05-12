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
  const DEATH_CONVERSION_ARROW_POSITION_RATIOS = Object.freeze([0.36, 0.64]);
  const LIFESTYLE_COMPARISON_LABEL = "Lifestyle-adjusted projection";
  const INITIAL_APPLIED_SCENARIO_ID = "income-impact-current-scenario";
  const MAX_APPLIED_SCENARIOS = 2;
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
  const GRAPH_DETAIL_VIEW_BOX = Object.freeze({
    width: 1000,
    height: 170,
    plotLeft: 74,
    plotTop: 34,
    plotWidth: 884,
    plotHeight: 86
  });
  const COMPRESSION_DETAIL_MILESTONE_MONTHS = Object.freeze([1, 2, 3, 6, 9, 12, 24]);
  const GRAPH_PATH_SMOOTHING_TENSION = 0.55;
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

    const maxAge = Math.max(currentAge, Math.min(100, currentAge + 40));
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
      mortgageTreatmentValue: banner.querySelector("[data-income-impact-mortgage-treatment-value]"),
      lifestyleSlider: banner.querySelector("[data-income-impact-lifestyle-slider]"),
      lifestyleValue: banner.querySelector("[data-income-impact-lifestyle-value]"),
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

  function updateDeathAgeControl(timelineResult, deathAgeState, controls) {
    const elements = getDeathAgeControlElements();
    if (!elements) {
      return;
    }

    const {
      control,
      sliderRow,
      slider,
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
      slider.min = String(state.minAge);
      slider.max = String(state.maxAge);
      slider.step = "1";
      slider.value = String(selectedDeathAge);
      slider.setAttribute("aria-valuetext", `Age ${selectedDeathAge}`);
    }
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
    const lifestyleSliderValue = draftControls.lifestyleSliderValue;
    const collapsed = scenarioState.bannerCollapsed === true;
    const hasPendingDraft = hasDraftScenarioChanges(incomeImpactState);
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

    if (elements.mortgageTreatmentValue) {
      elements.mortgageTreatmentValue.textContent = getMortgageTreatmentLabel(mortgageTreatmentOverride);
    }

    if (elements.lifestyleSlider) {
      elements.lifestyleSlider.min = String(MIN_LIFESTYLE_SLIDER_VALUE);
      elements.lifestyleSlider.max = String(MAX_LIFESTYLE_SLIDER_VALUE);
      elements.lifestyleSlider.step = "1";
      elements.lifestyleSlider.value = String(lifestyleSliderValue);
      elements.lifestyleSlider.setAttribute("aria-valuetext", getLifestyleSliderLabel(lifestyleSliderValue));
    }

    if (elements.lifestyleValue) {
      elements.lifestyleValue.textContent = getLifestyleSliderLabel(lifestyleSliderValue);
    }

    if (elements.reevaluateButton) {
      elements.reevaluateButton.disabled = !hasPendingDraft;
      elements.reevaluateButton.setAttribute("aria-disabled", String(!hasPendingDraft));
      elements.reevaluateButton.setAttribute("data-income-impact-reevaluate-state", hasPendingDraft ? "active" : "idle");
    }

    if (elements.reevaluateControl) {
      elements.reevaluateControl.setAttribute("data-income-impact-reevaluate-state", hasPendingDraft ? "active" : "idle");
    }

    if (elements.reevaluateAction) {
      elements.reevaluateAction.textContent = reevaluateActionLabel;
      elements.reevaluateAction.setAttribute("data-income-impact-reevaluate-action-state", hasPendingDraft ? "active" : "idle");
    }

    if (elements.draftStatus) {
      elements.draftStatus.textContent = hasPendingDraft ? "Pending" : "Applied";
      elements.draftStatus.setAttribute("data-income-impact-draft-status-state", hasPendingDraft ? "dirty" : "applied");
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
    const displayValue = status === "no-shortfall"
      ? "No shortfall identified"
      : (status === "partial-estimate"
        ? "Partial runway estimate"
        : (status === "complete" ? computedDisplayValue : "Runway estimate unavailable"));
    const warnings = Array.isArray(runway.warnings) ? runway.warnings : (Array.isArray(timelineResult?.warnings) ? timelineResult.warnings : []);
    const dataGaps = Array.isArray(runway.dataGaps) ? runway.dataGaps : (Array.isArray(timelineResult?.dataGaps) ? timelineResult.dataGaps : []);
    const unavailableReason = status === "complete"
      ? ""
      : (status === "partial-estimate"
        ? `This preview is using the facts currently available. Add the missing items below to improve the estimate. Current estimate: ${computedDisplayValue}.`
        : findRunwayReason(warnings, dataGaps));

    return `
      <article class="income-impact-card income-impact-card--wide" data-income-impact-financial-security-card data-income-impact-summary-card-id="yearsOfFinancialSecurity" data-income-impact-summary-status="${escapeHtml(status)}">
        <div class="income-impact-card-header">
          <h2>Years of Financial Security</h2>
          <p>Fact-based runway estimate from linked profile and Protection Modeling information. It does not change the LENS recommendation.</p>
        </div>
        <strong class="income-impact-financial-security-value" data-income-impact-financial-security-value data-income-impact-helper-summary-card="yearsOfFinancialSecurity">${escapeHtml(displayValue)}</strong>
        <p data-income-impact-financial-security-explanation>Existing coverage + available assets, less immediate obligations, divided by estimated annual household shortfall.</p>
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

  function toGraphX(xRatio) {
    const ratio = toOptionalNumber(xRatio);
    return Math.round(GRAPH_VIEW_BOX.plotLeft + ((ratio == null ? 0 : ratio) * GRAPH_VIEW_BOX.plotWidth));
  }

  function toGraphY(yRatio) {
    const ratio = toOptionalNumber(yRatio);
    return Math.round(GRAPH_VIEW_BOX.plotTop + ((ratio == null ? 0 : ratio) * GRAPH_VIEW_BOX.plotHeight));
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

  function makePlotPoints(points, yRatioKey, viewBox) {
    const key = String(yRatioKey || "yRatio");
    return (Array.isArray(points) ? points : [])
      .filter(function (point) {
        return toOptionalNumber(point?.xRatio) != null && toOptionalNumber(point?.[key]) != null;
      })
      .map(function (point) {
        return {
          x: toPlotX(point.xRatio, viewBox),
          y: toPlotY(point[key], viewBox)
        };
      });
  }

  function buildSmoothedSvgPath(plotPoints) {
    const points = Array.isArray(plotPoints) ? plotPoints : [];
    if (points.length < 2) {
      return "";
    }
    const commands = [`M${formatSvgCoordinate(points[0].x)} ${formatSvgCoordinate(points[0].y)}`];
    if (points.length === 2) {
      commands.push(`L${formatSvgCoordinate(points[1].x)} ${formatSvgCoordinate(points[1].y)}`);
      return commands.join(" ");
    }

    for (let index = 0; index < points.length - 1; index += 1) {
      const previous = points[index - 1] || points[index];
      const current = points[index];
      const next = points[index + 1];
      const afterNext = points[index + 2] || next;
      const minX = Math.min(current.x, next.x);
      const maxX = Math.max(current.x, next.x);
      const minY = Math.min(current.y, next.y);
      const maxY = Math.max(current.y, next.y);
      const cp1 = {
        x: clampNumber(current.x + (((next.x - previous.x) * GRAPH_PATH_SMOOTHING_TENSION) / 6), minX, maxX),
        y: clampNumber(current.y + (((next.y - previous.y) * GRAPH_PATH_SMOOTHING_TENSION) / 6), minY, maxY)
      };
      const cp2 = {
        x: clampNumber(next.x - (((afterNext.x - current.x) * GRAPH_PATH_SMOOTHING_TENSION) / 6), minX, maxX),
        y: clampNumber(next.y - (((afterNext.y - current.y) * GRAPH_PATH_SMOOTHING_TENSION) / 6), minY, maxY)
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

  function buildSvgPath(points, pathMode = "smooth") {
    const plotPoints = makePlotPoints(points, "yRatio", GRAPH_VIEW_BOX);
    const normalizedPathMode = normalizeGraphPathMode(pathMode);
    if (normalizedPathMode === "step") {
      return buildStepSvgPath(plotPoints);
    }
    if (normalizedPathMode === "linear") {
      return buildLinearSvgPath(plotPoints);
    }
    return buildSmoothedSvgPath(plotPoints);
  }

  function buildDeficitAreaSvgPath(points, zeroYRatio) {
    const zeroRatio = toOptionalNumber(zeroYRatio);
    const sourcePoints = Array.isArray(points) ? points : [];
    const firstClippedIndex = sourcePoints.findIndex(function (point) {
      return point?.deficitVisualClipped === true;
    });
    const pathPoints = firstClippedIndex >= 0
      ? sourcePoints.slice(0, firstClippedIndex + 1)
      : sourcePoints;
    const plotPoints = makePlotPoints(pathPoints, "yRatio", GRAPH_VIEW_BOX);
    if (zeroRatio == null || plotPoints.length < 2) {
      return "";
    }
    const zeroY = toPlotY(zeroRatio, GRAPH_VIEW_BOX);
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
      : buildSmoothedSvgPath(plotPoints);
  }

  function formatAxisCurrency(value) {
    const number = toOptionalNumber(value);
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
    const zeroYRatio = toOptionalNumber(graphModel?.axes?.y?.zeroYRatio);
    return `
      <g class="income-impact-graph-axis" data-income-impact-graph-axis="y">
        ${yTicks.map(function (tick) {
          const y = toGraphY(tick.yRatio);
          return `
            <g data-income-impact-graph-y-tick>
              <line x1="${GRAPH_VIEW_BOX.plotLeft}" y1="${y}" x2="${GRAPH_VIEW_BOX.plotLeft + GRAPH_VIEW_BOX.plotWidth}" y2="${y}"></line>
              <text x="${GRAPH_VIEW_BOX.plotLeft - 10}" y="${y + 4}" text-anchor="end">${escapeHtml(formatAxisCurrency(tick.value))}</text>
            </g>
          `;
        }).join("")}
        ${zeroYRatio != null ? `
          <line class="income-impact-graph-zero-baseline" data-income-impact-graph-zero-baseline x1="${GRAPH_VIEW_BOX.plotLeft}" y1="${toGraphY(zeroYRatio)}" x2="${GRAPH_VIEW_BOX.plotLeft + GRAPH_VIEW_BOX.plotWidth}" y2="${toGraphY(zeroYRatio)}"></line>
        ` : ""}
      </g>
      <g class="income-impact-graph-axis" data-income-impact-graph-axis="x">
        ${xTicks.map(function (tick) {
          const x = toGraphX(tick.xRatio);
          const secondaryLabel = getGraphXAxisSecondaryLabel(tick, xAxisMode);
          return `
            <g
              data-income-impact-graph-x-tick="${escapeHtml(tick.id || "")}"
              data-income-impact-graph-x-tick-label="${escapeHtml(tick.label || "")}"
              data-income-impact-graph-x-tick-date="${escapeHtml(tick.date || "")}"
              data-income-impact-graph-x-tick-relative-years="${escapeHtml(tick.relativeYears == null ? "" : tick.relativeYears)}"
            >
              <line x1="${x}" y1="${GRAPH_VIEW_BOX.plotTop + GRAPH_VIEW_BOX.plotHeight}" x2="${x}" y2="${GRAPH_VIEW_BOX.plotTop + GRAPH_VIEW_BOX.plotHeight + 8}"></line>
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
          <rect class="income-impact-graph-phase income-impact-graph-phase--pre-death" x="${GRAPH_VIEW_BOX.plotLeft}" y="${GRAPH_VIEW_BOX.plotTop}" width="${Math.max(0, toGraphX(preEnd) - GRAPH_VIEW_BOX.plotLeft)}" height="${GRAPH_VIEW_BOX.plotHeight}"></rect>
          <text x="${GRAPH_VIEW_BOX.plotLeft + 14}" y="${GRAPH_VIEW_BOX.plotTop + 24}">Before death</text>
        ` : ""}
        ${postStart != null && postStart < 1 ? `
          <rect class="income-impact-graph-phase income-impact-graph-phase--post-death" x="${toGraphX(postStart)}" y="${GRAPH_VIEW_BOX.plotTop}" width="${Math.max(0, GRAPH_VIEW_BOX.plotLeft + GRAPH_VIEW_BOX.plotWidth - toGraphX(postStart))}" height="${GRAPH_VIEW_BOX.plotHeight}"></rect>
        ` : ""}
        ${deathX != null ? `
          <line class="income-impact-graph-death-axis" data-income-impact-graph-death-axis x1="${toGraphX(deathX)}" y1="${GRAPH_VIEW_BOX.plotTop}" x2="${toGraphX(deathX)}" y2="${GRAPH_VIEW_BOX.plotTop + GRAPH_VIEW_BOX.plotHeight}"></line>
          <text class="income-impact-graph-death-label" x="${toGraphX(deathX)}" y="${GRAPH_VIEW_BOX.plotTop - 12}" text-anchor="middle">Death event</text>
        ` : ""}
      </g>
    `;
  }

  function getDeathLineAnchorLabelPosition(anchor, index) {
    const x = toGraphX(anchor.xRatio);
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
          const position = getDeathLineAnchorLabelPosition(anchor, index);
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
          const x = toGraphX(marker.xRatio);
          const y = toGraphY(marker.yRatio);
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
          const x = toGraphX(marker.xRatio);
          const y = toGraphY(marker.yRatio);
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

  function renderGraphPath(pathId, points, label, pathMode = "smooth", attributes = null) {
    const normalizedPathMode = normalizeGraphPathMode(pathMode);
    const path = buildSvgPath(points, normalizedPathMode);
    if (!path) {
      return "";
    }
    return `<path class="income-impact-graph-path income-impact-graph-path--${escapeHtml(pathId)} income-impact-graph-path--${escapeHtml(normalizedPathMode)}" data-income-impact-graph-path="${escapeHtml(pathId)}" data-income-impact-graph-path-mode="${escapeHtml(normalizedPathMode)}"${renderGraphPathAttributes(attributes)} d="${escapeHtml(path)}" aria-label="${escapeHtml(label)}"></path>`;
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
      return (selectedSeries ? [selectedSeries] : safeSeries).slice(0, 1).map(function (series) {
        return Object.assign({}, series, {
          pathId: POST_DEATH_RESOURCES_PATH_ID
        });
      });
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
            points: Array.isArray(series.fundedRunwayPoints) ? series.fundedRunwayPoints : [],
            pathMode: normalizeGraphPathMode(series.pathMode),
            trace: Object.assign({}, isPlainObject(series.trace) ? series.trace : {}, {
              renderSource: "fundedRunwayPoints"
            })
          });
        })
        .filter(function (series) {
          return isPlainObject(series) && buildSvgPath(series.points, normalizeGraphPathMode(series.pathMode));
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
      return isPlainObject(series) && buildSvgPath(series.points, normalizeGraphPathMode(series.pathMode));
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
        return isPlainObject(series) && buildSvgPath(series.points, normalizeGraphPathMode(series.pathMode));
      });
    const selectedSeries = preparedSeries.find(function (series) {
      return series?.selected === true;
    });
    return (selectedSeries ? [selectedSeries] : preparedSeries).slice(0, 1).map(function (series) {
      return Object.assign({}, series, {
        pathId: PRE_DEATH_ASSETS_PATH_ID
      });
    });
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

  function getSelectedDeficitLabelPosition(selectedSeries, zeroYRatio) {
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
      x: clampNumber(toGraphX(anchorXRatio) + 12, minX, maxX),
      y: clampNumber(toGraphY(anchorYRatio) + 24, minY, maxY)
    };
  }

  function renderSelectedScenarioDeficitArea(graphModel, selectedScenarioId = "") {
    const selectedSeries = getSelectedAppliedGraphSeries(graphModel, selectedScenarioId);
    if (!selectedSeries || !Array.isArray(selectedSeries.deficitPoints) || selectedSeries.deficitPoints.length < 2) {
      return "";
    }

    const areaPath = buildDeficitAreaSvgPath(selectedSeries.deficitPoints, graphModel?.axes?.y?.zeroYRatio);
    if (!areaPath) {
      return "";
    }

    const label = "Required support after resources run out";
    const labelPosition = getSelectedDeficitLabelPosition(selectedSeries, graphModel?.axes?.y?.zeroYRatio);
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
        date: normalizeString(depletionPoint.date),
        selected: selectedId ? scenarioId === selectedId : series.selected === true
      };
    }).filter(Boolean);
  }

  function getDepletionMarkerLabelPosition(marker, index) {
    const x = toGraphX(marker.xRatio);
    const y = toGraphY(marker.yRatio);
    const pullLeft = x > GRAPH_VIEW_BOX.plotLeft + GRAPH_VIEW_BOX.plotWidth - 150;
    return {
      x: pullLeft ? -10 : 10,
      y: index % 2 === 0 ? -15 : 22,
      anchor: pullLeft ? "end" : "start"
    };
  }

  function renderAppliedScenarioDepletionMarkers(graphModel, selectedScenarioId = "") {
    const markers = getAppliedScenarioDepletionMarkers(graphModel, selectedScenarioId);
    if (!markers.length) {
      return "";
    }

    return `
      <g class="income-impact-runway-depletion-markers" data-income-impact-runway-depletion-markers>
        ${markers.map(function (marker, index) {
          const x = toGraphX(marker.xRatio);
          const y = toGraphY(marker.yRatio);
          const labelPosition = getDepletionMarkerLabelPosition(marker, index);
          const markerLabel = `${marker.label}: Resources depleted`;
          return `
            <g
              class="income-impact-runway-depletion-marker"
              data-income-impact-runway-depletion-marker
              data-income-impact-applied-scenario-id="${escapeHtml(marker.scenarioId)}"
              data-income-impact-applied-scenario-label="${escapeHtml(marker.label)}"
              data-income-impact-applied-scenario-selected="${marker.selected ? "true" : "false"}"
              data-income-impact-depletion-marker-path-id="${escapeHtml(marker.pathId)}"
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

  function renderAppliedScenarioGraphPaths(graphModel) {
    const appliedSeries = getAppliedGraphSeries(graphModel);
    if (!appliedSeries.length) {
      return "";
    }
    return appliedSeries.map(function (series, index) {
      const pathId = normalizeString(series.pathId) || (index === 0
        ? POST_DEATH_RESOURCES_PATH_ID
        : `${POST_DEATH_RESOURCES_PATH_ID}--scenario-${index + 1}`);
      const label = normalizeString(series.label) || "Survivor resources after death";
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
        }
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
        }
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
      source: "baseDeathTransition"
    };
  }

  function renderDeathConversionGradient(connector, x, y1, y2) {
    return `
      <defs>
        <linearGradient id="${DEATH_CONVERSION_GRADIENT_ID}" data-income-impact-death-conversion-gradient gradientUnits="userSpaceOnUse" x1="${x}" y1="${y1}" x2="${x}" y2="${y2}">
          <stop offset="0%" stop-color="#4054b8"></stop>
          <stop offset="48%" stop-color="#2f8fc7"></stop>
          <stop offset="100%" stop-color="#227455"></stop>
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

  function renderDeathEventConversionConnector(graphModel) {
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
      getComparisonGraphPathMode(comparisonSeries)
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
        getComparisonGraphPathMode(series, pathId)
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

  function getAppliedScenarioLegendItems(graphModel) {
    const keyItems = Array.isArray(graphModel?.series?.appliedScenarioKeyItems)
      ? graphModel.series.appliedScenarioKeyItems
      : [];
    if (keyItems.length) {
      return keyItems.map(function (item, index) {
        return Object.assign({}, item, {
          scenarioId: normalizeString(item.scenarioId),
          label: normalizeString(item.label) || (index === 0 ? "Selected scenario" : `Scenario ${index + 1}`),
          selected: item.selected === true
        });
      }).filter(function (item) {
        return Boolean(item.scenarioId);
      });
    }

    return getAppliedGraphSeries(graphModel).map(function (series, index) {
      return {
        scenarioId: normalizeString(series.scenarioId),
        label: normalizeString(series.label) || (index === 0 ? "Selected scenario" : `Scenario ${index + 1}`),
        selected: series.selected === true
      };
    }).filter(function (item) {
      return Boolean(item.scenarioId);
    });
  }

  function renderGraphLegend(graphModel) {
    const appliedItems = getAppliedScenarioLegendItems(graphModel);
    const comparisonSeries = getComparisonGraphSeries(graphModel);
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
          : `<span data-income-impact-graph-legend-item="base"><i></i>Base projection</span>`}
        ${comparisonSeries.map(function (series, index) {
          const pathId = getComparisonGraphPathId(series, index);
          const label = series.label || getComparisonGraphLabel(pathId);
          return `<span data-income-impact-graph-legend-item="${escapeHtml(getComparisonLegendItemKey(pathId))}"><i></i>${escapeHtml(label)}</span>`;
        }).join("")}
        ${comparisonSeries.length ? "<p>Comparison only - base projection unchanged.</p>" : ""}
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
    const monthlyCopy = monthlyDelta === null
      ? "Lifestyle spend change unavailable"
      : `Lifestyle spend: ${formatSignedMonthlyAmount(monthlyDelta)}`;
    let headline = "Matches baseline";
    let detail = "No depletion shift";
    let status = "baseline";

    if (mode === "current" || (monthlyDelta !== null && Math.abs(monthlyDelta) < 0.5)) {
      return {
        mode,
        status,
        headline,
        monthlyCopy: "Lifestyle spend: $0/mo",
        detail,
      };
    }

    if (runwayShift.kind === "monthShift") {
      const monthShift = Math.round(runwayShift.monthShift || 0);
      if (monthShift > 0) {
        headline = `Extends runway by ${formatMonthCount(monthShift)}`;
        detail = `Depletion shift: +${formatMonthCount(monthShift)}`;
        status = "extends";
      } else if (monthShift < 0) {
        headline = `Shortens runway by ${formatMonthCount(monthShift)}`;
        detail = `Depletion shift: -${formatMonthCount(monthShift)}`;
        status = "shortens";
      } else {
        headline = "No depletion shift";
        detail = "Depletion timing is unchanged";
        status = "unchanged";
      }
    } else if (runwayShift.kind === "extendsBeyondHorizon") {
      headline = "Extends runway beyond horizon";
      detail = "Lifestyle line stays above zero in the visible horizon";
      status = "extends";
    } else if (runwayShift.kind === "shortensIntoHorizon") {
      headline = "Shortens runway into horizon";
      detail = "Lifestyle line depletes within the visible horizon";
      status = "shortens";
    } else if (runwayShift.kind === "noVisibleDepletion") {
      headline = mode === "conservative" ? "Conservative lifestyle selected" : "Elevated lifestyle selected";
      detail = "No depletion within projection horizon";
      status = "noVisibleDepletion";
    } else {
      headline = mode === "conservative" ? "Conservative lifestyle selected" : "Elevated lifestyle selected";
      detail = "Depletion shift unavailable";
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
      monthlyCopy,
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
        <span class="income-impact-lifestyle-impact-readout__eyebrow">Lifestyle impact</span>
        <strong data-income-impact-lifestyle-impact-primary>${escapeHtml(model.headline)}</strong>
        <span data-income-impact-lifestyle-impact-monthly>${escapeHtml(model.monthlyCopy)}</span>
        <span data-income-impact-lifestyle-impact-runway>${escapeHtml(model.detail)}</span>
      </div>
    `;
  }

  function renderGraphDeathAnchor(graphModel) {
    const anchor = graphModel?.series?.currentAnchor;
    if (!anchor || toOptionalNumber(anchor.xRatio) == null || toOptionalNumber(anchor.yRatio) == null) {
      return "";
    }
    return `
      <g class="income-impact-graph-current-anchor" data-income-impact-graph-current-anchor transform="translate(${toGraphX(anchor.xRatio)} ${toGraphY(anchor.yRatio)})">
        <rect x="-4" y="-4" width="8" height="8" rx="1" transform="rotate(45)"></rect>
        <title>Current asset value at selected death date</title>
      </g>
    `;
  }

  function renderGraphSvg(graphModel) {
    const appliedPreDeathPaths = renderAppliedScenarioPreDeathGraphPaths(graphModel);
    const preDeathPath = appliedPreDeathPaths
      || renderGraphPath(PRE_DEATH_ASSETS_PATH_ID, graphModel?.series?.preDeathAssets, "Projected assets before death");
    const appliedScenarioPaths = renderAppliedScenarioGraphPaths(graphModel);
    const comparisonPaths = renderComparisonGraphPaths(graphModel);
    const deathLineAnchors = renderAppliedScenarioDeathLineAnchors(graphModel);
    const deathConversionConnector = renderDeathEventConversionConnector(graphModel);
    return `
      <svg
        class="income-impact-graph-svg"
        data-income-impact-graph-svg
        viewBox="0 0 ${GRAPH_VIEW_BOX.width} ${GRAPH_VIEW_BOX.height}"
        role="img"
        aria-label="Income Impact timeline graph"
      >
        ${renderGraphPhases(graphModel)}
        ${renderGraphAxis(graphModel)}
        <g class="income-impact-graph-series" data-income-impact-graph-series>
          ${renderSelectedScenarioDeficitArea(graphModel, graphModel?.trace?.selectedScenarioId)}
          ${preDeathPath}
          ${deathConversionConnector}
          ${appliedScenarioPaths}
          ${comparisonPaths}
          ${deathLineAnchors || renderGraphDeathAnchor(graphModel)}
          ${renderAppliedScenarioDepletionMarkers(graphModel, graphModel?.trace?.selectedScenarioId)}
        </g>
        ${renderGraphMarkers(graphModel)}
        ${renderComparisonMarkers(graphModel)}
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
    const eyebrowLabel = normalizeString(selectedGraphSeries?.label) || "Selected scenario";
    return `
      <div class="income-impact-graph" data-income-impact-visual-timeline data-income-impact-graph data-income-impact-graph-status="${escapeHtml(graphModel.status || "partial")}">
        <div class="income-impact-graph-header">
          <div>
            <span>${escapeHtml(eyebrowLabel)}</span>
            <strong>Remaining resources timeline</strong>
          </div>
          <p>Projected resources and required support after death.</p>
        </div>
        ${renderLifestyleImpactReadout(timelineResult)}
        ${renderGraphSvg(graphModel)}
        ${renderGraphLegend(graphModel)}
        ${renderGraphCallouts(graphModel)}
        ${renderSelectedGraphEvent(graphModel)}
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
      <article class="income-impact-card income-impact-card--wide" data-income-impact-helper-timeline>
        <div class="income-impact-card-header">
          <h3>Financial Runway if Death Occurs at Selected Age</h3>
          <p>Fact-based runway from linked profile and Protection Modeling information for the selected death age/date.</p>
        </div>
        <div class="income-impact-timeline" aria-label="Fact-based household impact timeline">
          ${renderIncomeImpactTimelineGraph(timelineResult)}
          ${renderDataGaps(timelineResult)}
          ${renderWarnings(timelineResult)}
        </div>
      </article>
    `;
  }

  function renderIncomeImpact(host, context) {
    const timelineResult = isPlainObject(context?.timelineResult) ? context.timelineResult : {};
    host.innerHTML = `
      <div class="income-impact-layout" data-income-impact-layout>
        <div class="income-impact-layout-main" data-income-impact-layout-main>
          ${renderTimeline(timelineResult)}
        </div>
        <aside class="income-impact-layout-aside" data-income-impact-layout-aside aria-label="Income Impact supporting details">
          ${renderPivotalRiskPanel(timelineResult)}
          ${renderCompressionReportingPanel(timelineResult)}
          ${renderFinancialSecurityCard(timelineResult)}
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
      lifestyleSliderValue: clampLifestyleSliderValue(sourceControls.lifestyleSliderValue ?? scenarioState.lifestyleSliderValue)
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
      lifestyleSliderValue: clampLifestyleSliderValue(safeSettings.lifestyleSliderValue),
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
    scenarioState.lifestyleSliderValue = controls.lifestyleSliderValue;
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

  function buildIncomeImpactResultFromBaseContext(state, baseContext, sliderValueOverride) {
    const safeState = isPlainObject(state) ? state : {};
    const context = isPlainObject(baseContext) ? baseContext : buildBaseIncomeImpactContextFromState(safeState);
    const scenarioState = isPlainObject(safeState.scenarioState) ? safeState.scenarioState : {};
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
    const appliedScenarioRecord = buildAppliedScenarioRecordFromInputs(safeState, context, {
      scenario,
      riskEvaluation,
      comparisonScenarios,
      lifestyleScenario
    });
    upsertAppliedScenarioRecord(safeState, appliedScenarioRecord);
    const graphModel = safeState.buildIncomeImpactTimelineGraphModel({
      scenario,
      riskEvaluation,
      comparisonScenarios,
      appliedScenarios: Array.isArray(safeState.appliedScenarios)
        ? clonePlainValue(safeState.appliedScenarios)
        : [clonePlainValue(appliedScenarioRecord)],
      selectedScenarioId: safeState.selectedScenarioId || INITIAL_APPLIED_SCENARIO_ID,
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

    return {
      selectedDeath: {
        date: context.selectedDeath?.date || scenario?.scenario?.selectedDeathDate || context.controls?.selectedDeathDate || null,
        age: context.selectedDeath?.age ?? scenario?.scenario?.selectedDeathAge ?? context.controls?.selectedDeathAge ?? null
      },
      scenario,
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
          timelineMarkersCreated: false,
          graphPathChanged: Boolean(lifestyleComparisonScenario),
          reductionsApplied: false
        }
      },
      graphModel,
      financialRunway: buildFinancialRunwayFromScenario(scenario, context.controls?.projectionHorizonYears),
      summaryCards: buildSummaryCardsFromScenario(scenario),
      dataGaps,
      warnings,
      trace: {
        source: "income-impact-display-composer-risk-bridge",
        composerStatus: scenario?.status || null,
        riskEvaluatorStatus: riskEvaluation?.status || null,
        retiredTimelineChartRendered: false
      }
    };
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
    const riskEvaluation = isPlainObject(selectedScenario.riskEvaluation) ? selectedScenario.riskEvaluation : {};
    const comparisonScenarios = Array.isArray(selectedScenario.comparisonScenarios)
      ? clonePlainValue(selectedScenario.comparisonScenarios)
      : [];
    const lifestyleScenario = isPlainObject(selectedScenario.lifestyleScenario)
      ? clonePlainValue(selectedScenario.lifestyleScenario)
      : null;
    const settings = normalizeScenarioControlsForState(
      safeState,
      isPlainObject(selectedScenario.settings) ? selectedScenario.settings : null
    );
    const graphModel = safeState.buildIncomeImpactTimelineGraphModel({
      scenario,
      riskEvaluation,
      comparisonScenarios,
      appliedScenarios: Array.isArray(safeState.appliedScenarios)
        ? clonePlainValue(safeState.appliedScenarios)
        : [clonePlainValue(selectedScenario)],
      selectedScenarioId: safeState.selectedScenarioId || getAppliedScenarioId(selectedScenario, 0),
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

    return {
      selectedDeath: {
        date: scenario?.scenario?.selectedDeathDate || settings.selectedDeathDate || null,
        age: scenario?.scenario?.selectedDeathAge ?? settings.selectedDeathAge ?? null
      },
      scenario,
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
          graphPathChanged: comparisonScenarios.length > 0,
          reductionsApplied: false
        })
      },
      graphModel,
      financialRunway: buildFinancialRunwayFromScenario(scenario, settings.projectionHorizonYears),
      summaryCards: buildSummaryCardsFromScenario(scenario),
      dataGaps,
      warnings,
      trace: {
        source: "income-impact-display-selected-applied-scenario",
        composerStatus: scenario?.status || null,
        riskEvaluatorStatus: riskEvaluation?.status || null,
        selectedScenarioId: safeState.selectedScenarioId || null,
        retiredTimelineChartRendered: false
      }
    };
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
      `lifestyle-${clampLifestyleSliderValue(safeSettings.lifestyleSliderValue)}`
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
    if (isNearTermDeathScenario(state, settings)) {
      return "Death tomorrow";
    }

    const selectedDeathAge = toOptionalNumber(settings?.selectedDeathAge);
    const currentAge = toOptionalNumber(state?.deathAgeState?.currentAge);
    if (selectedDeathAge != null && currentAge != null && selectedDeathAge > currentAge) {
      const yearsUntilDeath = Math.max(1, selectedDeathAge - currentAge);
      return `Death in ${yearsUntilDeath} ${yearsUntilDeath === 1 ? "year" : "years"}`;
    }

    if (selectedDeathAge != null) {
      return `Death at age ${selectedDeathAge}`;
    }

    return "Current scenario";
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

    if (scenarioElements.reevaluateButton) {
      scenarioElements.reevaluateButton.addEventListener("click", function () {
        if (!incomeImpactState) {
          return;
        }

        if (!hasDraftScenarioChanges(incomeImpactState)) {
          updateScenarioControls(incomeImpactState.latestTimelineResult);
          return;
        }

        applyDraftScenarioControlsToRuntimeState(incomeImpactState);
        invalidateIncomeImpactBaseRenderCache();
        renderIncomeImpactFromState();
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
      const builderInput = {
        profileRecord,
        protectionModelingPayload,
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
        analysisSettings: resolveAnalysisSettings(profileRecord, builderInput),
        valuationDate,
        composeIncomeImpactScenario,
        evaluateIncomeImpactRiskEvents,
        buildIncomeImpactTimelineGraphModel,
        prepareIncomeImpactCompressionReportingInputs,
        calculateIncomeImpactCompressionScenario,
        calculateIncomeImpactLifestyleScenario,
        calculateIncomeImpactTriageInterventions,
        householdExpenseAccountPolicyContext,
        deathAgeState: resolveDeathAgeControlState(builderResult.lensModel, valuationDate),
        scenarioState: {
          projectionHorizonYears: DEFAULT_PROJECTION_HORIZON_YEARS,
          mortgageTreatmentOverride: "followAssumptions",
          lifestyleSliderValue: 0,
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
    getScenarioComparisonStateSnapshot: function () {
      if (!incomeImpactState) {
        return {
          draftScenarioControls: null,
          appliedScenarios: [],
          selectedScenarioId: null
        };
      }

      return clonePlainValue({
        draftScenarioControls: incomeImpactState.draftScenarioControls || null,
        appliedScenarios: Array.isArray(incomeImpactState.appliedScenarios) ? incomeImpactState.appliedScenarios : [],
        selectedScenarioId: incomeImpactState.selectedScenarioId || null,
        hasDraftChanges: hasDraftScenarioChanges(incomeImpactState)
      });
    }
  };

  document.addEventListener("DOMContentLoaded", initializeIncomeLossImpactDisplay);
})(window);
