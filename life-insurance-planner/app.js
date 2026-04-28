(function () {
  const LensApp = window.LensApp || (window.LensApp = {});
  const LensConfig = LensApp.config || {};
  const LensStorage = LensApp.storage || {};
  const LensI18n = LensApp.i18n || {};
  const LensAuth = LensApp.auth || {};
  const LensClientRecords = LensApp.clientRecords || {};
  const LensClientIntake = LensApp.clientIntake || {};
  const LensClientDirectory = LensApp.clientDirectory || {};

  const {
    STORAGE_KEYS,
    DEFAULT_SINGLE_FEDERAL_TAX_BRACKETS,
    FEDERAL_TAX_BRACKET_FILINGS,
    ADMIN_CREDENTIALS,
    DEFAULT_CLIENT_RECORDS,
    allSteps
  } = LensConfig;
  const { loadJson, loadJsonSession } = LensStorage;
  const {
    initializeLanguageSelector,
    applyTranslations,
    getPathPrefix,
    setText
  } = LensI18n;
  const {
    initializeAuthPage,
    initializeAdminPortal,
    initializeAccountProfile,
    setFormFeedback,
    performSignOut
  } = LensAuth;
  const {
    ensureClientRecords,
    getClientRecords,
    mergePendingClientRecords,
    writeClientRecords,
    normalizeClientRecords,
    getClientRecordsStorageKey,
    getStorageIdentity,
    getCurrentSession,
    buildNextCaseRef,
    normalizeCaseRef,
    normalizeRecordCaseRef,
    setLinkedCaseRef,
    getLinkedCaseRef,
    setLinkedRecordId,
    getLinkedRecordId,
    getClientRecordByReference,
    updateClientRecordByCaseRef
  } = LensClientRecords;
  const {
    initializeClientCreationForm,
    saveClientCreationForm,
    calculateAgeFromDate,
    formatPhoneNumberInput,
    formatHouseholdDisplayName,
    formatCompanyDisplayName
  } = LensClientIntake;
  const {
    initializeClientDirectory,
    buildStatusCounts,
    getLastInitial,
    renderClientRow,
    exportClientRecords,
    printClientRecords,
    shareClientRecords,
    buildClientShareSummary,
    copyTextToClipboard,
    updateClientPriority,
    getInitials,
    getAvatarAge,
    interpolateNumber,
    getAvatarHue,
    getAvatarPresentation,
    getDependentsDisplay
  } = LensClientDirectory;

  LensApp.clientRecordHelpers = Object.assign(LensApp.clientRecordHelpers || {}, {
    normalizeLifecycleStatusGroup,
    parseMoneyValue,
    normalizePriority,
    formatDateInputValue
  });
  LensApp.clientIntakeHelpers = Object.assign(LensApp.clientIntakeHelpers || {}, {
    formatDateInputValue,
    mapClientStageToStatusGroup,
    deriveStatusLabels,
    normalizePriority
  });
  LensApp.clientDirectoryHelpers = Object.assign(LensApp.clientDirectoryHelpers || {}, {
    normalizePriority,
    getClientLifecycleStatus,
    getPriorityDisplay,
    getClientStatusDisplay,
    escapeHtml,
    formatDateForDirectory,
    getDirectoryCreatedDate,
    getDirectoryStageDayThresholds,
    formatCurrencyCompact,
    getPoliciesDisplay
  });

  document.addEventListener("DOMContentLoaded", () => {
    function safeInitialize(label, initializer) {
      try {
        initializer();
      } catch (error) {
        if (label === "client-directory") {
          window.LensApp = window.LensApp || {};
          window.LensApp.clientDirectoryInitDebug = {
            failed: true,
            message: String(error?.message || error || "Unknown error"),
            stack: String(error?.stack || "")
          };
        }
        console.error(`[LENS init] ${label} failed`, error);
      }
    }

    if (document.body?.dataset?.step) {
      document.body.classList.remove("is-modal-open");
      document.body.style.overflowY = "auto";
    }

    safeInitialize("homepage", initializeHomepage);
    safeInitialize("auth-page", initializeAuthPage);
    safeInitialize("admin-portal", initializeAdminPortal);
    safeInitialize("workflow-nav", initializeWorkflowNav);
    safeInitialize("language-selector", initializeLanguageSelector);
    safeInitialize("translations", applyTranslations);
    safeInitialize("account-profile", initializeAccountProfile);
    safeInitialize("profile-form", initializeProfileForm);
    safeInitialize("recommendation-selection", initializeRecommendationSelection);
    safeInitialize("strategy-selection", initializeStrategySelection);
    safeInitialize("summary-page", initializeSummaryPage);
    safeInitialize("notes-sync", initializeNotesSync);
    safeInitialize("client-creation-form", initializeClientCreationForm);
    safeInitialize("survivorship-adjustments", initializeSurvivorshipAdjustments);
    safeInitialize("client-directory", initializeClientDirectory);
  });

  function initializeHomepage() {
    const startPlanningButton = document.getElementById("start-planning");

    if (!startPlanningButton) {
      return;
    }

    startPlanningButton.addEventListener("click", () => {
      sessionStorage.removeItem(STORAGE_KEYS.includeDetailed);
    });
  }

  function normalizeFederalTaxBracketRow(row) {
    if (typeof row === "string") {
      const rate = String(row || "").trim();
      return rate ? { rate, minIncome: "", maxIncome: "" } : null;
    }

    if (!row || typeof row !== "object") {
      return null;
    }

    const rate = String(row.rate || row.percentage || "").trim();
    const minIncome = String(row.minIncome || row.rangeStart || "").trim();
    const maxIncome = String(row.maxIncome || row.rangeEnd || "").trim();

    if (!rate) {
      return null;
    }

    return { rate, minIncome, maxIncome };
  }

  function buildDefaultFederalTaxBracketConfig() {
    return {
      "Single": DEFAULT_SINGLE_FEDERAL_TAX_BRACKETS.map((row) => ({ ...row })),
      "Married Filing Jointly": DEFAULT_SINGLE_FEDERAL_TAX_BRACKETS.map((row) => ({ ...row })),
      "Married Filing Separately": DEFAULT_SINGLE_FEDERAL_TAX_BRACKETS.map((row) => ({ ...row })),
      "Head of Household": DEFAULT_SINGLE_FEDERAL_TAX_BRACKETS.map((row) => ({ ...row })),
      "Qualifying Surviving Spouse": DEFAULT_SINGLE_FEDERAL_TAX_BRACKETS.map((row) => ({ ...row }))
    };
  }

  function getFederalTaxBracketConfig() {
    const stored = loadJson(STORAGE_KEYS.federalTaxBrackets);
    const defaults = buildDefaultFederalTaxBracketConfig();

    if (Array.isArray(stored)) {
      const normalizedRows = stored.map(normalizeFederalTaxBracketRow).filter(Boolean);
      defaults.Single = normalizedRows.length ? normalizedRows : defaults.Single;
      return defaults;
    }

    if (!stored || typeof stored !== "object") {
      return defaults;
    }

    FEDERAL_TAX_BRACKET_FILINGS.forEach((filingStatus) => {
      const rows = Array.isArray(stored[filingStatus]) ? stored[filingStatus] : [];
      const normalizedRows = rows.map(normalizeFederalTaxBracketRow).filter(Boolean);
      if (normalizedRows.length) {
        defaults[filingStatus] = normalizedRows;
      }
    });

    return defaults;
  }

  function getFederalTaxBracketOptions(filingStatus) {
    const config = getFederalTaxBracketConfig();
    const normalizedStatus = String(filingStatus || "").trim();

    return (config[normalizedStatus] || config.Single || [])
      .map(normalizeFederalTaxBracketRow)
      .filter(Boolean);
  }


  function initializeWorkflowNav() {
    const navHost = document.getElementById("workflow-nav");
    const currentStep = document.body.dataset.step;

    if (!navHost || !currentStep) {
      return;
    }

    if (currentStep === "detail") {
      sessionStorage.setItem(STORAGE_KEYS.includeDetailed, "true");
    }

    const steps = getActiveSteps(currentStep);
    const currentIndex = steps.findIndex((step) => step.id === currentStep);
    const currentNumber = currentIndex >= 0 ? currentIndex + 1 : 1;

    navHost.className = "workflow-nav";
    navHost.innerHTML = `
      <header class="workflow-header">
        <div class="step-track" style="--step-count:${steps.length}">
          ${steps.map((step, index) => renderStep(step, index, currentIndex)).join("")}
        </div>
      </header>
    `;

  }

  function renderStep(step, index, currentIndex) {
    let stateClass = "";

    if (index < currentIndex) {
      stateClass = "is-complete";
    } else if (index === currentIndex) {
      stateClass = "is-current";
    }

    return `
      <a class="step-item ${stateClass}" href="${step.path}">
        <span class="step-number">${index + 1}</span>
        <span class="step-title">${step.label}</span>
      </a>
    `;
  }

  function getActiveSteps(currentStep) {
    return allSteps;
  }

  function initializeProfileForm() {
    const form = document.getElementById("client-profile-form");

    if (!form) {
      return;
    }

    populateForm(form, loadJson(STORAGE_KEYS.profile));

    form.addEventListener("submit", (event) => {
      event.preventDefault();
      const formData = new FormData(form);
      const existingProfile = loadJson(STORAGE_KEYS.profile) || {};
      const profile = { ...existingProfile, ...Object.fromEntries(formData.entries()) };
      localStorage.setItem(STORAGE_KEYS.profile, JSON.stringify(profile));

      const nextPage = form.dataset.nextPage || "analysis-estimate.html";
      window.location.href = nextPage;
    });
  }

  function initializeRecommendationSelection() {
    const cards = document.querySelectorAll("[data-recommendation]");

    if (!cards.length) {
      return;
    }

    const savedRecommendation = localStorage.getItem(STORAGE_KEYS.recommendation) || "Balanced Protection";
    localStorage.setItem(STORAGE_KEYS.recommendation, savedRecommendation);
    setSelectedCard(cards, savedRecommendation, "recommendation");

    cards.forEach((card) => {
      card.addEventListener("click", () => {
        const value = card.dataset.recommendation;
        localStorage.setItem(STORAGE_KEYS.recommendation, value);
        setSelectedCard(cards, value, "recommendation");
      });
    });

    const continueButton = document.getElementById("to-policy-planner");
    if (continueButton) {
      continueButton.addEventListener("click", () => {
        window.location.href = "planner.html";
      });
    }
  }

  function initializeStrategySelection() {
    const cards = document.querySelectorAll("[data-strategy]");

    if (!cards.length) {
      return;
    }

    const savedStrategy = localStorage.getItem(STORAGE_KEYS.strategy) || "Hybrid Strategy";
    localStorage.setItem(STORAGE_KEYS.strategy, savedStrategy);
    setSelectedCard(cards, savedStrategy, "strategy");

    cards.forEach((card) => {
      card.addEventListener("click", () => {
        const value = card.dataset.strategy;
        localStorage.setItem(STORAGE_KEYS.strategy, value);
        setSelectedCard(cards, value, "strategy");
      });
    });

    const continueButton = document.getElementById("to-summary");
    if (continueButton) {
      continueButton.addEventListener("click", () => {
        const notesField = document.getElementById("advisor-notes");
        if (notesField) {
          localStorage.setItem(STORAGE_KEYS.notes, notesField.value);
        }
        window.location.href = "summary.html";
      });
    }
  }

  function setSelectedCard(cards, selectedValue, type) {
    cards.forEach((card) => {
      const cardValue = type === "recommendation" ? card.dataset.recommendation : card.dataset.strategy;
      card.classList.toggle("is-selected", cardValue === selectedValue);
    });
  }

  function initializeSummaryPage() {
    const summaryPage = document.getElementById("summary-page");

    if (!summaryPage) {
      return;
    }

    const profile = loadJson(STORAGE_KEYS.profile);
    const recommendation = localStorage.getItem(STORAGE_KEYS.recommendation) || "Balanced Protection";
    const strategy = localStorage.getItem(STORAGE_KEYS.strategy) || "Hybrid Strategy";
    const notes = localStorage.getItem(STORAGE_KEYS.notes) || "Advisor notes will appear here.";
    const includeDetailed = sessionStorage.getItem(STORAGE_KEYS.includeDetailed) !== "false";

    setText("summary-client-name", profile?.clientName || "Client name pending");
    setText("summary-age-gender", buildInlineValue(profile?.age, profile?.gender));
    setText("summary-income", formatCurrency(profile?.annualIncome));
    setText("summary-family", buildFamilySummary(profile || {}));
    setText("summary-balanced-need", window.PlannerCalculations.getBalancedEstimate());
    setText("summary-detailed-analysis", includeDetailed ? "DIME, Needs Analysis, and Human Life Value placeholders included." : "Detailed Analysis step was skipped in this planning path.");
    setText("summary-recommendation", recommendation);
    setText("summary-strategy", strategy);
    setText("summary-notes", notes);
  }

  function initializeNotesSync() {
    const notesField = document.getElementById("advisor-notes");

    if (!notesField) {
      return;
    }

    notesField.value = localStorage.getItem(STORAGE_KEYS.notes) || "";
    notesField.addEventListener("input", () => {
      localStorage.setItem(STORAGE_KEYS.notes, notesField.value);
    });
  }

  function initializeSurvivorshipAdjustments() {
    const survivorWorkingSelects = document.querySelectorAll("select[name='survivorContinuesWorking']");

    survivorWorkingSelects.forEach((select) => {
      const section = select.closest(".profile-form-section");
      if (!section) {
        return;
      }

      const dependentFields = [
        section.querySelector("[name='survivorIncome']"),
        section.querySelector("[name='incomeReplacementDuration']"),
        section.querySelector("[name='survivorNetAnnualIncome']"),
        section.querySelector("[name='expenseReductionAtDeath']"),
        section.querySelector("[name='childDependencyDuration']")
      ].filter(Boolean);

      const syncDependentState = () => {
        const shouldEnable = String(select.value || "").trim().toLowerCase() === "yes";

        dependentFields.forEach((field) => {
          const fieldGroup = field.closest(".field-group");
          field.disabled = !shouldEnable;

          if (!shouldEnable) {
            field.value = "";
          }

          if (fieldGroup) {
            fieldGroup.classList.toggle("is-disabled", !shouldEnable);
          }
        });
      };

      select.addEventListener("change", syncDependentState);
      select.addEventListener("input", syncDependentState);
      syncDependentState();
    });
  }


  function serializeFormSnapshot(form) {
    const formData = new FormData(form);
    const snapshot = {};

    for (const [key, value] of formData.entries()) {
      const normalizedValue = typeof value === "string" ? value.trim() : value;

      if (Object.prototype.hasOwnProperty.call(snapshot, key)) {
        if (Array.isArray(snapshot[key])) {
          snapshot[key].push(normalizedValue);
        } else {
          snapshot[key] = [snapshot[key], normalizedValue];
        }
        continue;
      }

      snapshot[key] = normalizedValue;
    }

    return snapshot;
  }

  function loadSessionJson(key) {
    try {
      return JSON.parse(sessionStorage.getItem(key) || "null");
    } catch (_error) {
      return null;
    }
  }

  function saveSessionJson(key, value) {
    sessionStorage.setItem(key, JSON.stringify(value));
    return value;
  }

  function parseMoneyValue(value) {
    const normalized = Number(String(value || "").replace(/[^0-9.-]/g, ""));
    return Number.isFinite(normalized) ? normalized : 0;
  }

  function clampPercentValue(value) {
    return Math.max(0, Math.min(100, parseMoneyValue(value)));
  }

  function getTruthyYes(value) {
    return ["yes", "true", "1", "included"].includes(String(value || "").trim().toLowerCase());
  }

  function getTemporaryAnalysisSession() {
    const session = loadSessionJson(STORAGE_KEYS.temporaryAnalysisSession);
    return session && typeof session === "object" ? session : null;
  }

  function clearTemporaryAnalysisSession() {
    sessionStorage.removeItem(STORAGE_KEYS.temporaryAnalysisSession);
  }

  function markAnalysisInternalNavigation() {
    sessionStorage.setItem(STORAGE_KEYS.analysisInternalNavigation, "true");
  }

  function consumeAnalysisInternalNavigation() {
    const flagged = sessionStorage.getItem(STORAGE_KEYS.analysisInternalNavigation) === "true";
    sessionStorage.removeItem(STORAGE_KEYS.analysisInternalNavigation);
    return flagged;
  }

  function saveTemporaryAnalysisSession(payload) {
    if (!payload || typeof payload !== "object") {
      clearTemporaryAnalysisSession();
      return null;
    }

    const nextSession = {
      hasData: true,
      savedAt: new Date().toISOString(),
      variant: String(payload.variant || "").trim(),
      sourcePage: String(payload.sourcePage || "").trim(),
      data: payload.data && typeof payload.data === "object" ? payload.data : {},
      meta: payload.meta && typeof payload.meta === "object" ? payload.meta : {}
    };

    return saveSessionJson(STORAGE_KEYS.temporaryAnalysisSession, nextSession);
  }

  function hasTemporaryAnalysisData() {
    return Boolean(getTemporaryAnalysisSession()?.hasData);
  }

  function applySnapshotToForm(form, snapshot) {
    if (!form || !snapshot || typeof snapshot !== "object") {
      return;
    }

    Object.entries(snapshot).forEach(([name, value]) => {
      const control = form.elements.namedItem(name);

      if (!control || value == null || value === "") {
        return;
      }

      if (control instanceof RadioNodeList) {
        Array.from(control).forEach((input) => {
          input.checked = String(input.value) === String(value);
        });
        return;
      }

      if (control.type === "checkbox") {
        control.checked = Boolean(value);
        return;
      }

      control.value = value;
      control.dispatchEvent?.(new Event("input", { bubbles: true }));
      control.dispatchEvent?.(new Event("change", { bubbles: true }));
    });
  }

  function restoreTemporaryAnalysisForm(form, variant) {
    const session = getTemporaryAnalysisSession();
    if (!session || !session.hasData || String(session.variant || "").trim() !== String(variant || "").trim()) {
      return null;
    }

    applySnapshotToForm(form, session.data || {});
    return session;
  }

  function getLatestProtectionModelingPayload(record) {
    if (!record || typeof record !== "object") {
      return null;
    }

    if (record.protectionModeling && typeof record.protectionModeling === "object") {
      return record.protectionModeling;
    }

    if (Array.isArray(record.protectionModelingEntries) && record.protectionModelingEntries.length) {
      return record.protectionModelingEntries[record.protectionModelingEntries.length - 1];
    }

    return null;
  }

  function hasEnteredMoneyValue(value) {
    return String(value ?? "").trim() !== "";
  }

  function buildAnalysisBucketsFromData(rawData, meta) {
    const data = rawData && typeof rawData === "object" ? rawData : {};
    const context = meta && typeof meta === "object" ? meta : {};
    const hasExplicitAssetTotal = hasEnteredMoneyValue(data.availableAssetsTotal);
    const hasExplicitAssetBuckets = [
      data.liquidAssetsAvailable,
      data.retirementAssetsAvailable,
      data.businessValueAvailable,
      data.otherAssetsAvailable
    ].some(hasEnteredMoneyValue);
    const educationFundingTotal = parseMoneyValue(data.educationFundingTotal)
      || ((
        (parseMoneyValue(data.estimatedCostPerChild) * Math.max(0, parseMoneyValue(data.childrenNeedingFunding)))
        + (parseMoneyValue(data.projectedEducationFundingPerDependent) * Math.max(0, parseMoneyValue(data.projectedDependentsCount)))
      ) * (clampPercentValue(data.costToFundPercent || 100) / 100));
    const finalExpensesTotal = parseMoneyValue(data.finalExpensesTotal)
      || parseMoneyValue(data.funeralBurialEstimate)
      + parseMoneyValue(data.medicalEndOfLifeCosts)
      + parseMoneyValue(data.estateSettlementCosts);
    const debtPayoffTotal = parseMoneyValue(data.debtPayoffTotal)
      || parseMoneyValue(data.mortgageBalance)
      + parseMoneyValue(data.otherPersonalDebtTotal)
      + parseMoneyValue(data.otherRealEstateLoans)
      + parseMoneyValue(data.autoLoans)
      + parseMoneyValue(data.creditCardDebt)
      + parseMoneyValue(data.studentLoans)
      + parseMoneyValue(data.personalLoans)
      + parseMoneyValue(data.businessDebt);
    const availableAssetsTotal = hasExplicitAssetTotal
      ? parseMoneyValue(data.availableAssetsTotal)
      : hasExplicitAssetBuckets
        ? (
          parseMoneyValue(data.liquidAssetsAvailable)
          + parseMoneyValue(data.retirementAssetsAvailable)
          + parseMoneyValue(data.businessValueAvailable)
          + parseMoneyValue(data.otherAssetsAvailable)
        )
        : (
          parseMoneyValue(data.cashSavings)
          + parseMoneyValue(data.emergencyFund)
          + parseMoneyValue(data.brokerageAccounts)
          + parseMoneyValue(data.liquidAssetsAvailable)
          + (getTruthyYes(data.retirementAssetsIncludeInOffset) || !data.retirementAssetsIncludeInOffset
            ? parseMoneyValue(data.retirementAssetsAvailable) || (parseMoneyValue(data.retirementAssets) * (clampPercentValue(data.retirementAssetsPercentAvailable || 100) / 100))
            : 0)
          + (getTruthyYes(data.businessValueIncludeInOffset) || !data.businessValueIncludeInOffset
            ? parseMoneyValue(data.businessValueAvailable) || (parseMoneyValue(data.businessValue) * (clampPercentValue(data.businessValuePercentAvailable || 100) / 100))
            : 0)
          + parseMoneyValue(data.otherAssetsAvailable)
        );
    const existingCoverageTotal = parseMoneyValue(data.existingCoverageTotal)
      || parseMoneyValue(data.individualDeathBenefit)
      + parseMoneyValue(data.groupLifeCoverage)
      + parseMoneyValue(data.currentCoverageAmount)
      + parseMoneyValue(data.currentLifeInsuranceCoverage);
    const survivorNetAnnualIncome = parseMoneyValue(data.survivorNetAnnualIncome)
      || parseMoneyValue(data.spouseNetAnnualIncome)
      || parseMoneyValue(data.survivorIncome)
      || parseMoneyValue(data.spouseIncome);
    const baseNetIncome = parseMoneyValue(data.netAnnualIncome) || parseMoneyValue(data.grossAnnualIncome);
    const replacementPercent = clampPercentValue(
      hasEnteredMoneyValue(data.targetIncomeReplacementPercentage)
        ? data.targetIncomeReplacementPercentage
        : (hasEnteredMoneyValue(data.householdIncomeUsePercent) ? data.householdIncomeUsePercent : 100)
    ) / 100;
    const annualIncomeToReplace = parseMoneyValue(data.annualIncomeToReplace) || Math.max((baseNetIncome * replacementPercent) - survivorNetAnnualIncome, 0);
    const yearsUntilRetirement = Math.max(
      0,
      Math.round(
        Math.max(
          parseMoneyValue(data.yearsUntilRetirement),
          parseMoneyValue(data.spouseYearsUntilRetirement)
        )
      )
    );
    const yearsUntilDeath = Math.max(0, Math.round(parseMoneyValue(context.yearsUntilDeath)));
    const supportDuration = Math.max(
      1,
      Math.round(parseMoneyValue(data.incomeReplacementDuration) || Math.max(yearsUntilRetirement - yearsUntilDeath, 0) || 12)
    );
    const currentAge = Math.max(
      0,
      Math.round(parseMoneyValue(context.currentAge) || parseMoneyValue(data.currentAge) || parseMoneyValue(data.age))
    );

    return {
      currentAge,
      yearsUntilRetirement,
      annualIncomeToReplace,
      survivorNetAnnualIncome,
      supportDuration,
      immediateLiquidityBuffer: parseMoneyValue(data.immediateLiquidityBuffer),
      debtPayoffTotal,
      finalExpensesTotal,
      educationFundingTotal,
      specialOneTimeGoals: parseMoneyValue(data.specialOneTimeGoals),
      emergencyReserveGoal: parseMoneyValue(data.emergencyReserveGoal),
      otherSurvivorLumpSumNeed: parseMoneyValue(data.otherSurvivorLumpSumNeed),
      availableAssetsTotal,
      existingCoverageTotal,
      incomeGrowthRate: clampPercentValue(data.incomeGrowthRate),
      employerBenefitsValue: parseMoneyValue(data.employerBenefitsValue),
      variant: String(context.variant || "").trim()
    };
  }

  function getActiveAnalysisSource() {
    const temporarySession = getTemporaryAnalysisSession();
    if (temporarySession?.hasData) {
      return {
        sourceType: "temporary",
        session: temporarySession,
        record: null,
        buckets: buildAnalysisBucketsFromData(temporarySession.data || {}, {
          ...(temporarySession.meta || {}),
          variant: temporarySession.variant
        })
      };
    }

    const linkedRecord = getClientRecordByReference(getLinkedRecordId(), getLinkedCaseRef());
    const modelingPayload = getLatestProtectionModelingPayload(linkedRecord);
    const linkedData = modelingPayload?.data || {};
    const linkedCoverageFallback = parseMoneyValue(linkedRecord?.currentCoverage) || parseMoneyValue(linkedRecord?.coverageAmount);
    const hasExplicitModeledCoverage = hasEnteredMoneyValue(linkedData.existingCoverageTotal)
      || hasEnteredMoneyValue(linkedData.individualDeathBenefit)
      || hasEnteredMoneyValue(linkedData.groupLifeCoverage)
      || hasEnteredMoneyValue(linkedData.currentCoverageAmount)
      || hasEnteredMoneyValue(linkedData.currentLifeInsuranceCoverage);
    const linkedAnalysisData = !hasExplicitModeledCoverage && linkedCoverageFallback > 0
      ? {
          ...linkedData,
          existingCoverageTotal: String(linkedCoverageFallback)
        }
      : linkedData;

    return {
      sourceType: "linked",
      session: null,
      record: linkedRecord,
      buckets: buildAnalysisBucketsFromData(linkedAnalysisData, {
        currentAge: parseMoneyValue(linkedRecord?.age) || calculateAgeFromDate(linkedRecord?.dateOfBirth),
        variant: String(modelingPayload?.variant || "").trim()
      }),
      modelingPayload
    };
  }

  function applyLinkedWorkflowSectionToRecord(record, sectionName, sectionPayload) {
    const nextRecord = {
      ...record,
      lastUpdatedDate: sectionPayload.savedAt,
      lastReview: sectionPayload.savedAt
    };

    if (sectionName === "preliminaryUnderwriting") {
      nextRecord.preliminaryUnderwriting = sectionPayload;
      nextRecord.preliminaryUnderwritingCompleted = true;
    }

    if (sectionName === "protectionModeling") {
      const existingEntries = Array.isArray(nextRecord.protectionModelingEntries)
        ? nextRecord.protectionModelingEntries.slice()
        : [];
      nextRecord.protectionModelingEntries = [...existingEntries, sectionPayload];
      nextRecord.protectionModeling = sectionPayload;
      delete nextRecord.modeledNeedSource;
      nextRecord.pmiCompleted = true;
    }

    return nextRecord;
  }

  function saveLinkedWorkflowSection(caseRef, sectionName, payload, meta) {
    const normalizedCaseRef = setLinkedCaseRef(caseRef);
    if (!normalizedCaseRef || !sectionName) {
      return null;
    }

    const today = formatDateInputValue(new Date());
    const sectionPayload = {
      completed: true,
      linkedCaseRef: normalizedCaseRef,
      savedAt: today,
      ...(meta && typeof meta === "object" ? meta : {}),
      data: payload && typeof payload === "object" ? payload : {}
    };

    return updateClientRecordByCaseRef(normalizedCaseRef, (record) => {
      return applyLinkedWorkflowSectionToRecord(record, sectionName, sectionPayload);
    });
  }

  function saveLinkedWorkflowSectionWithFallback(caseRef, sectionName, payload, meta) {
    const savedRecord = saveLinkedWorkflowSection(caseRef, sectionName, payload, meta);
    if (savedRecord) {
      return savedRecord;
    }

    const normalizedCaseRef = normalizeCaseRef(caseRef);
    if (!normalizedCaseRef || !sectionName) {
      return null;
    }

    const today = formatDateInputValue(new Date());
    const sectionPayload = {
      completed: true,
      linkedCaseRef: normalizedCaseRef,
      savedAt: today,
      ...(meta && typeof meta === "object" ? meta : {}),
      data: payload && typeof payload === "object" ? payload : {}
    };

    const storageKey = getClientRecordsStorageKey();

    try {
      const records = loadJson(storageKey);
      if (!Array.isArray(records)) {
        return null;
      }

      const recordIndex = records.findIndex((record) => normalizeCaseRef(record?.caseRef) === normalizedCaseRef);
      if (recordIndex < 0) {
        return null;
      }

      const nextRecords = records.slice();
      nextRecords[recordIndex] = applyLinkedWorkflowSectionToRecord(records[recordIndex] || {}, sectionName, sectionPayload);
      localStorage.setItem(storageKey, JSON.stringify(nextRecords));
      return nextRecords[recordIndex];
    } catch (_error) {
    }

    return null;
  }

  function saveCurrentLinkedWorkflowSection(sectionName, payload, meta) {
    const linkedCaseRef = getLinkedCaseRef();
    if (!linkedCaseRef) {
      return null;
    }

    return saveLinkedWorkflowSectionWithFallback(linkedCaseRef, sectionName, payload, meta);
  }

  function formatDateInputValue(value) {
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) {
      return "";
    }

    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  // CODE NOTE: Shared lifecycle status labels translate legacy stored groups into the advisor-facing status set.
  function normalizeLifecycleStatusGroup(value) {
    const normalized = String(value || "").trim().toLowerCase();
    return [
      "prospects",
      "in-review",
      "coverage-placed",
      "closed",
      "prospecting",
      "in-progress",
      "underwriting",
      "placed"
    ].includes(normalized)
      ? normalized
      : "prospects";
  }

  function getClientLifecycleStatus(recordOrStatusGroup) {
    const isRecordObject = recordOrStatusGroup && typeof recordOrStatusGroup === "object";
    const normalizedStatusGroup = normalizeLifecycleStatusGroup(
      isRecordObject ? recordOrStatusGroup.statusGroup : recordOrStatusGroup
    );

    if (normalizedStatusGroup === "closed") {
      return "closed";
    }

    if (
      normalizedStatusGroup === "coverage-placed"
      || normalizedStatusGroup === "placed"
      || (isRecordObject
        && Array.isArray(recordOrStatusGroup.coveragePolicies)
        && recordOrStatusGroup.coveragePolicies.length > 0)
    ) {
      return "placed";
    }

    if (normalizedStatusGroup === "in-review" || normalizedStatusGroup === "underwriting") {
      return "underwriting";
    }

    if (normalizedStatusGroup === "in-progress") {
      return "in-progress";
    }

    if (isRecordObject) {
      const hasActiveWorkflowProgress = Boolean(recordOrStatusGroup.preliminaryUnderwritingCompleted)
        || Boolean(recordOrStatusGroup.pmiCompleted)
        || Boolean(recordOrStatusGroup.analysisCompleted);
      if (hasActiveWorkflowProgress) {
        return "in-progress";
      }
    }

    return "prospecting";
  }

  function mapClientStageToStatusGroup(value) {
    const normalized = String(value || "").trim().toLowerCase();
    if (normalized === "active client" || normalized === "coverage placed" || normalized === "placed") {
      return "coverage-placed";
    }

    if (normalized === "review client" || normalized === "in review" || normalized === "underwriting") {
      return "in-review";
    }

    if (normalized === "in progress" || normalized === "in-progress") {
      return "prospects";
    }

    if (normalized === "closed") {
      return "closed";
    }

    return "prospects";
  }

  function deriveStatusLabels(statusGroup, clientType) {
    const statusMap = {
      prospects: clientType === "household" ? ["Discovery", "Household"] : ["Discovery", "Individual"],
      "in-review": clientType === "household" ? ["Review", "Needs"] : ["Review", "Income"],
      "coverage-placed": clientType === "household" ? ["Placed", "Review"] : ["Placed", "Policy"],
      closed: clientType === "household" ? ["Closed", "Archive"] : ["Closed", "Archive"]
    };

    if (clientType === "company") {
      const companyStatusMap = {
        prospects: ["Discovery", "Company"],
        "in-review": ["Review", "Business"],
        "coverage-placed": ["Placed", "Business"],
        closed: ["Closed", "Archive"]
      };

      return companyStatusMap[statusGroup] || ["Review"];
    }

    return statusMap[statusGroup] || ["Review"];
  }

  function normalizePriority(value) {
    const normalized = String(value || "").trim().toLowerCase();
    if (normalized === "low" || normalized === "medium" || normalized === "high") {
      return normalized;
    }

    return "";
  }

  function getPriorityDisplay(priority) {
    const normalized = normalizePriority(priority);
    const displayMap = {
      low: "Low",
      medium: "Medium",
      high: "High"
    };

    return displayMap[normalized] || "Set Priority";
  }

  function getClientStatusDisplay(statusSource) {
    const lifecycleStatus = getClientLifecycleStatus(statusSource);
    const statusMap = {
      prospecting: "Prospecting",
      "in-progress": "In Progress",
      underwriting: "Underwriting",
      placed: "Placed",
      closed: "Closed"
    };

    return statusMap[lifecycleStatus] || "Prospecting";
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function formatDateForDirectory(value) {
    if (!value) {
      return "--";
    }

    const date = new Date(`${value}T00:00:00`);
    if (Number.isNaN(date.getTime())) {
      return value;
    }

    return `${String(date.getMonth() + 1).padStart(2, "0")}/${String(date.getDate()).padStart(2, "0")}/${date.getFullYear()}`;
  }

  function getDirectoryCreatedDate(record) {
    return String(record?.dateProfileCreated || record?.lastReview || "").trim();
  }

  function getDirectoryStageDayThresholds() {
    return {
      warning: 7,
      danger: 14
    };
  }

  function formatCurrencyCompact(value) {
    const amount = Number(value || 0);
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      notation: amount >= 1000000 ? "compact" : "standard",
      maximumFractionDigits: amount >= 1000000 ? 2 : 0
    }).format(amount);
  }

  function getPoliciesDisplay(record) {
    const count = Number(record?.policyCount || 0);
    return Number.isFinite(count) && count > 0 ? String(count) : "0";
  }

  function populateForm(form, values) {
    if (!values) {
      return;
    }

    Object.entries(values).forEach(([key, value]) => {
      const field = form.elements.namedItem(key);
      if (field) {
        field.value = value;
      }
    });
  }



  window.performLensSignOut = performSignOut;

  function buildInlineValue(first, second) {
    const parts = [first, second].filter(Boolean);
    return parts.length ? parts.join(" | ") : "Pending profile inputs";
  }

  function buildFamilySummary(profile) {
    const parts = [];

    if (profile.maritalStatus) {
      parts.push(profile.maritalStatus);
    }

    if (profile.dependents) {
      parts.push(`${profile.dependents} dependents`);
    }

    if (profile.youngestChildAge) {
      parts.push(`Youngest child age ${profile.youngestChildAge}`);
    }

    return parts.length ? parts.join(" | ") : "Family profile pending";
  }

  const ANALYSIS_TOOL_PATHS = new Set([
    "analysis-setup.html",
    "profile.html",
    "manual-protection-modeling-inputs.html",
    "manual-minimum-inputs.html",
    "income-loss-impact.html",
    "analysis-estimate.html",
    "analysis-detail.html",
    "recommendations.html",
    "planner.html",
    "summary.html"
  ]);

  function getPathBasename(value) {
    const normalized = String(value || "").trim();
    if (!normalized) {
      return "";
    }

    const withoutQuery = normalized.split("#")[0].split("?")[0];
    const parts = withoutQuery.split("/").filter(Boolean);
    return parts.length ? parts[parts.length - 1].toLowerCase() : "";
  }

  function isAnalysisToolPath(value) {
    return ANALYSIS_TOOL_PATHS.has(getPathBasename(value));
  }

  function ensureTemporaryAnalysisLeaveModal() {
    let modal = document.querySelector("[data-analysis-leave-modal]");
    if (modal) {
      return modal;
    }

    modal = document.createElement("div");
    modal.className = "lens-leave-modal";
    modal.setAttribute("data-analysis-leave-modal", "");
    modal.hidden = true;
    modal.innerHTML = `
      <div class="lens-leave-modal-backdrop" data-analysis-leave-stay></div>
      <div class="lens-leave-modal-panel" role="dialog" aria-modal="true" aria-labelledby="analysis-leave-title">
        <h2 id="analysis-leave-title">Leave LENS Analysis?</h2>
        <p>If you leave the analysis tool, temporary manual input data will be lost.</p>
        <div class="lens-leave-modal-actions">
          <button class="btn btn-secondary" type="button" data-analysis-leave-stay>Stay</button>
          <button class="btn btn-primary" type="button" data-analysis-leave-confirm>Leave</button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);
    return modal;
  }

  function promptTemporaryAnalysisLeave(onLeave) {
    if (!hasTemporaryAnalysisData()) {
      onLeave?.();
      return false;
    }

    const modal = ensureTemporaryAnalysisLeaveModal();
    const stayButtons = Array.from(modal.querySelectorAll("[data-analysis-leave-stay]"));
    const leaveButton = modal.querySelector("[data-analysis-leave-confirm]");

    function closeModal() {
      modal.hidden = true;
      document.body.classList.remove("is-modal-open");
    }

    modal.hidden = false;
    document.body.classList.add("is-modal-open");

    const handleLeave = () => {
      clearTemporaryAnalysisSession();
      closeModal();
      onLeave?.();
    };

    leaveButton.onclick = handleLeave;
    stayButtons.forEach((button) => {
      button.onclick = closeModal;
    });

    return true;
  }

  function initializeTemporaryAnalysisLeaveGuard() {
    if (!isAnalysisToolPath(window.location.pathname)) {
      return;
    }

    if (document.body.dataset.analysisLeaveGuardInitialized === "true") {
      return;
    }
    document.body.dataset.analysisLeaveGuardInitialized = "true";

    let allowUnload = consumeAnalysisInternalNavigation();
    if (!history.state || history.state.analysisLeaveGuard !== true) {
      try {
        history.pushState({ ...(history.state || {}), analysisLeaveGuard: true }, "", window.location.href);
      } catch (_error) {
      }
    }

    window.addEventListener("beforeunload", (event) => {
      if (allowUnload || !hasTemporaryAnalysisData()) {
        return;
      }

      event.preventDefault();
      event.returnValue = "";
    });

    document.addEventListener("click", (event) => {
      const anchor = event.target.closest("a[href]");
      if (!anchor || anchor.target === "_blank" || anchor.hasAttribute("download")) {
      } else {
        const nextUrl = new URL(anchor.getAttribute("href"), window.location.href);
        if (!hasTemporaryAnalysisData() || nextUrl.href === window.location.href) {
          return;
        }

        if (isAnalysisToolPath(nextUrl.pathname)) {
          allowUnload = true;
          markAnalysisInternalNavigation();
          return;
        }

        event.preventDefault();
        promptTemporaryAnalysisLeave(() => {
          allowUnload = true;
          window.location.href = nextUrl.href;
        });
        return;
      }

      const signOutButton = event.target.closest("[data-site-header-sign-out]");
      if (!signOutButton || !hasTemporaryAnalysisData()) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      promptTemporaryAnalysisLeave(() => {
        allowUnload = true;
        localStorage.removeItem(STORAGE_KEYS.authSession);
        const isNestedPage = window.location.pathname.includes("/pages/");
        window.location.href = isNestedPage ? "../index.html" : "index.html";
      });
    }, true);

    window.addEventListener("popstate", () => {
      if (allowUnload || !hasTemporaryAnalysisData()) {
        return;
      }

      try {
        history.pushState({ ...(history.state || {}), analysisLeaveGuard: true }, "", window.location.href);
      } catch (_error) {
      }

      promptTemporaryAnalysisLeave(() => {
        allowUnload = true;
        history.back();
      });
    });
  }

  window.saveLensClientCreationForm = saveClientCreationForm;
  window.getLensLinkedCaseRef = getLinkedCaseRef;
  window.setLensLinkedCaseRef = setLinkedCaseRef;
  window.getLensLinkedRecordId = getLinkedRecordId;
  window.setLensLinkedRecordId = setLinkedRecordId;
  window.getLensTemporaryAnalysisSession = getTemporaryAnalysisSession;
  window.hasLensTemporaryAnalysisSession = hasTemporaryAnalysisData;
  window.promptLensAnalysisExit = promptTemporaryAnalysisLeave;
  window.saveLensTemporaryAnalysisSession = saveTemporaryAnalysisSession;
  window.clearLensTemporaryAnalysisSession = clearTemporaryAnalysisSession;
  window.restoreLensTemporaryAnalysisForm = restoreTemporaryAnalysisForm;
  window.getLensAnalysisSource = getActiveAnalysisSource;
  window.buildLensAnalysisBucketsFromData = buildAnalysisBucketsFromData;
  window.beginLensAnalysisInternalNavigation = markAnalysisInternalNavigation;
  window.getLensFederalTaxBrackets = getFederalTaxBracketOptions;
  window.serializeLensFormSnapshot = serializeFormSnapshot;
  window.saveLensLinkedWorkflowSection = saveLinkedWorkflowSection;
  window.saveLensLinkedWorkflowSectionWithFallback = saveLinkedWorkflowSectionWithFallback;
  window.saveLensCurrentLinkedWorkflowSection = saveCurrentLinkedWorkflowSection;
  document.addEventListener("DOMContentLoaded", () => {
    if (isAnalysisToolPath(window.location.pathname)) {
      initializeTemporaryAnalysisLeaveGuard();
      return;
    }

    if (getTemporaryAnalysisSession()?.hasData) {
      clearTemporaryAnalysisSession();
    }
  });

  function formatCurrency(value) {
    const number = Number(value);
    if (!number) {
      return "Value pending";
    }

    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 0
    }).format(number);
  }

  function formatClientDetailValue(value) {
    if (value === null || value === undefined) {
      return "Not provided";
    }

    if (typeof value === "number") {
      return value ? String(value) : "Not provided";
    }

    const normalized = String(value).trim();
    return normalized || "Not provided";
  }
})();

