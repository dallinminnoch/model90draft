(function (globalScope) {
  const root = globalScope || {};
  const documentRef = root.document;
  const LensApp = root.LensApp || (root.LensApp = {});
  const coverageUtils = LensApp.coverage || {};
  const coverageSummaryList = LensApp.coverageSummaryList || {};
  const coverageManager = LensApp.coverageManager || (LensApp.coverageManager = {});

  // Owner: reusable coverage manager widget.
  // Purpose: edit profile-owned coveragePolicies[] through host callbacks.
  // Non-goals: no persistence ownership, no URL navigation, no Lens writes, no
  // policy document uploads, and no recommendation or offset math.

  let activeController = null;

  const COVERAGE_WIDGET_STEPS = [
    { label: "Basics", title: "Policy Basics" },
    { label: "Terms", title: "Terms & Parties" },
    { label: "Documents", title: "Notes & File" }
  ];

  const COVERAGE_WIDGET_STEP_FIELDS = [
    ["premiumMode", "policyCarrier", "policyType", "insuredName", "ownerName", "faceAmount"],
    ["premiumAmount", "termLength", "effectiveDate", "underwritingClass", "beneficiaryName"],
    ["policyNumber", "policyNotes"]
  ];

  const POLICY_TYPE_OPTIONS = [
    "",
    "Term",
    "Term Life",
    "Whole Life",
    "Universal Life",
    "Indexed Universal Life",
    "Variable Universal Life",
    "Final Expense",
    "Group Life",
    "Other"
  ];

  const PREMIUM_MODE_OPTIONS = [
    "Monthly",
    "Quarterly",
    "Semi-Annual",
    "Annual",
    "Single Premium",
    "Flexible Premium",
    "Graded Premium",
    "Modified Premium"
  ];

  const UNDERWRITING_CLASS_OPTIONS = [
    "",
    "Preferred Plus",
    "Preferred",
    "Standard Plus",
    "Standard",
    "Table Rated",
    "Substandard",
    "Simplified Issue",
    "Guaranteed Issue",
    "Other"
  ];

  function toTrimmedString(value) {
    return String(value == null ? "" : value).trim();
  }

  function escapeHtml(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function normalizeCurrencyValue(value) {
    if (typeof coverageUtils.normalizeCoverageCurrencyValue === "function") {
      return coverageUtils.normalizeCoverageCurrencyValue(value);
    }

    const normalized = toTrimmedString(value).replace(/[^0-9.]/g, "");
    const firstDot = normalized.indexOf(".");
    const cleaned = firstDot === -1
      ? normalized
      : `${normalized.slice(0, firstDot + 1)}${normalized.slice(firstDot + 1).replace(/\./g, "")}`;
    const number = Number(cleaned);
    return cleaned && Number.isFinite(number) ? number.toFixed(2) : "";
  }

  function formatCurrencyInput(value) {
    const normalized = normalizeCurrencyValue(value);
    if (!normalized) {
      return "";
    }

    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(Number(normalized));
  }

  function formatCurrencyEditingInput(value) {
    const normalized = toTrimmedString(value).replace(/[^0-9.]/g, "");
    const firstDot = normalized.indexOf(".");
    const cleaned = firstDot === -1
      ? normalized
      : `${normalized.slice(0, firstDot + 1)}${normalized.slice(firstDot + 1).replace(/\./g, "")}`;

    if (!cleaned) {
      return "";
    }

    const hasDecimal = cleaned.includes(".");
    const parts = cleaned.split(".");
    const integerDigits = (parts[0] || "").replace(/^0+(?=\d)/, "") || "0";
    const decimalDigits = hasDecimal ? toTrimmedString(parts[1]).slice(0, 2) : "";
    const formattedInteger = new Intl.NumberFormat("en-US", {
      maximumFractionDigits: 0
    }).format(Number(integerDigits));

    return `$${formattedInteger}${hasDecimal ? `.${decimalDigits}` : ""}`;
  }

  function clonePolicy(policy) {
    return policy && typeof policy === "object" ? { ...policy } : null;
  }

  function clonePolicies(policies) {
    return Array.isArray(policies)
      ? policies.map(clonePolicy).filter(Boolean)
      : [];
  }

  function getPolicyDocumentEntries(policyLike) {
    const normalizedPolicy = typeof coverageUtils.normalizeCoveragePolicyRecord === "function"
      ? coverageUtils.normalizeCoveragePolicyRecord(policyLike)
      : (policyLike && typeof policyLike === "object" ? policyLike : {});
    return Array.isArray(normalizedPolicy.documents)
      ? normalizedPolicy.documents.filter(function (entry) {
        return Boolean(toTrimmedString(entry?.name));
      })
      : [];
  }

  function formatFileSize(bytes) {
    const size = Number(bytes);
    if (!Number.isFinite(size) || size <= 0) {
      return "0 KB";
    }

    if (size < 1024 * 1024) {
      return `${Math.max(1, Math.round(size / 1024))} KB`;
    }

    return `${(size / (1024 * 1024)).toFixed(size >= 10 * 1024 * 1024 ? 0 : 1)} MB`;
  }

  function getPremiumScheduleParts(policy) {
    const source = policy && typeof policy === "object" ? policy : {};
    const rawYears = toTrimmedString(source.premiumScheduleYears).replace(/\D/g, "");
    const rawMonths = toTrimmedString(source.premiumScheduleMonths).replace(/\D/g, "");
    if (rawYears || rawMonths) {
      const years = rawYears ? Math.max(0, Math.round(Number(rawYears || 0))) : 0;
      const months = rawMonths ? Math.min(11, Math.max(0, Math.round(Number(rawMonths || 0)))) : 0;
      const combined = !years && !months ? "" : (years + (months / 12)).toFixed(2).replace(/\.00$/, "");
      return {
        years: rawYears ? String(years) : "",
        months: rawMonths ? String(months) : "",
        combined
      };
    }

    const duration = toTrimmedString(source.premiumScheduleDuration);
    const durationNumber = Number(duration);
    if (!duration || !Number.isFinite(durationNumber)) {
      return { years: "", months: "", combined: "" };
    }

    const wholeYears = Math.max(0, Math.floor(durationNumber));
    const months = Math.min(11, Math.max(0, Math.round((durationNumber - wholeYears) * 12)));
    return {
      years: wholeYears ? String(wholeYears) : "",
      months: months ? String(months) : "",
      combined: duration
    };
  }

  function isSteppedPremiumMode(value) {
    return [
      "Flexible Premium",
      "Graded Premium",
      "Modified Premium"
    ].includes(toTrimmedString(value));
  }

  function isPermanentPolicyType(value) {
    return [
      "Whole Life",
      "Universal Life",
      "Indexed Universal Life",
      "Variable Universal Life",
      "Final Expense"
    ].includes(toTrimmedString(value));
  }

  function getPremiumAmountLabel(premiumMode) {
    const mode = toTrimmedString(premiumMode);
    if (!mode) {
      return "Premium Amount";
    }

    if (mode === "Single Premium") {
      return "Single Premium Amount";
    }

    if (isSteppedPremiumMode(mode)) {
      return "Final Premium Amount";
    }

    return `${mode} Premium Amount`;
  }

  function buildDraftFromPolicy(policy) {
    const normalizedPolicy = typeof coverageUtils.normalizeCoveragePolicyRecord === "function"
      ? coverageUtils.normalizeCoveragePolicyRecord(policy)
      : (policy && typeof policy === "object" ? { ...policy } : {});
    const premiumSchedule = getPremiumScheduleParts(normalizedPolicy);
    const policyType = toTrimmedString(normalizedPolicy.policyType);

    return {
      id: toTrimmedString(normalizedPolicy.id),
      savedAt: toTrimmedString(normalizedPolicy.savedAt),
      policyCarrier: toTrimmedString(normalizedPolicy.policyCarrier || normalizedPolicy.carrierName),
      policyType,
      insuredName: toTrimmedString(normalizedPolicy.insuredName),
      ownerName: toTrimmedString(normalizedPolicy.ownerName),
      faceAmount: normalizeCurrencyValue(normalizedPolicy.faceAmount || normalizedPolicy.deathBenefitAmount),
      startingPremium: normalizeCurrencyValue(normalizedPolicy.startingPremium),
      premiumAmount: normalizeCurrencyValue(normalizedPolicy.premiumAmount),
      premiumMode: toTrimmedString(normalizedPolicy.premiumMode),
      premiumScheduleYears: premiumSchedule.years,
      premiumScheduleMonths: premiumSchedule.months,
      premiumScheduleDuration: premiumSchedule.combined,
      termLength: isPermanentPolicyType(policyType) ? "Permanent Coverage" : toTrimmedString(normalizedPolicy.termLength),
      effectiveDate: toTrimmedString(normalizedPolicy.effectiveDate),
      underwritingClass: toTrimmedString(normalizedPolicy.underwritingClass),
      beneficiaryName: toTrimmedString(normalizedPolicy.beneficiaryName),
      policyNumber: toTrimmedString(normalizedPolicy.policyNumber),
      policyNotes: toTrimmedString(normalizedPolicy.policyNotes || normalizedPolicy.notes),
      documents: getPolicyDocumentEntries(normalizedPolicy)
    };
  }

  function createPolicyFromDraft(draft, existingPolicy) {
    const selectedPremiumMode = toTrimmedString(draft.premiumMode);
    const steppedPremiumMode = isSteppedPremiumMode(selectedPremiumMode);
    const input = {
      id: toTrimmedString(draft.id),
      savedAt: toTrimmedString(draft.savedAt),
      entryMode: "full",
      policyCarrier: toTrimmedString(draft.policyCarrier),
      policyType: toTrimmedString(draft.policyType),
      insuredName: toTrimmedString(draft.insuredName),
      ownerName: toTrimmedString(draft.ownerName),
      faceAmount: normalizeCurrencyValue(draft.faceAmount),
      startingPremium: steppedPremiumMode ? normalizeCurrencyValue(draft.startingPremium) : "",
      premiumAmount: normalizeCurrencyValue(draft.premiumAmount),
      premiumMode: selectedPremiumMode,
      premiumScheduleYears: steppedPremiumMode ? toTrimmedString(draft.premiumScheduleYears).replace(/\D/g, "") : "",
      premiumScheduleMonths: steppedPremiumMode ? toTrimmedString(draft.premiumScheduleMonths).replace(/\D/g, "") : "",
      premiumScheduleDuration: steppedPremiumMode ? toTrimmedString(draft.premiumScheduleDuration) : "",
      termLength: isPermanentPolicyType(draft.policyType) ? "Permanent Coverage" : toTrimmedString(draft.termLength),
      effectiveDate: toTrimmedString(draft.effectiveDate),
      underwritingClass: toTrimmedString(draft.underwritingClass),
      beneficiaryName: toTrimmedString(draft.beneficiaryName),
      policyNumber: toTrimmedString(draft.policyNumber),
      policyNotes: toTrimmedString(draft.policyNotes)
    };

    return typeof coverageUtils.buildFullCoveragePolicy === "function"
      ? coverageUtils.buildFullCoveragePolicy(input, existingPolicy)
      : { ...(existingPolicy || {}), ...input };
  }

  function renderOptions(options, selectedValue, fallbackLabel) {
    const selected = toTrimmedString(selectedValue);
    return options.map(function (option, index) {
      const value = toTrimmedString(option);
      const label = value || fallbackLabel || "Select";
      return `<option value="${escapeHtml(value)}"${value === selected ? " selected" : ""}>${escapeHtml(index === 0 && !value ? label : label)}</option>`;
    }).join("");
  }

  function renderCoverageTypeOptions(selectedValue) {
    return renderOptions(POLICY_TYPE_OPTIONS, selectedValue, "Select policy type");
  }

  function renderUnderwritingClassOptions(selectedValue) {
    return renderOptions(UNDERWRITING_CLASS_OPTIONS, selectedValue, "Select underwriting class");
  }

  function renderCoverageModeButtons(selectedValue) {
    const selected = toTrimmedString(selectedValue);
    return PREMIUM_MODE_OPTIONS.map(function (mode) {
      return `
        <button
          type="button"
          class="coverage-mode-button${mode === selected ? " is-active" : ""}"
          data-coverage-manager-mode="${escapeHtml(mode)}"
        >${escapeHtml(mode)}</button>
      `;
    }).join("");
  }

  function buildModalMarkup(options) {
    const title = toTrimmedString(options?.title) || "Manage Existing Coverage";
    const contextLabel = toTrimmedString(options?.contextLabel);
    return `
      <div class="coverage-policy-manager-modal" role="dialog" aria-modal="true" aria-labelledby="coverage-policy-manager-title">
        <div class="coverage-policy-manager-backdrop" data-coverage-manager-close></div>
        <section class="coverage-policy-manager-panel">
          <header class="coverage-policy-manager-header">
            <div>
              <h2 id="coverage-policy-manager-title">${escapeHtml(title)}</h2>
              <p>${escapeHtml(contextLabel || "Add or update saved coverage policies for this linked profile.")}</p>
            </div>
            <button class="coverage-policy-manager-close" type="button" data-coverage-manager-close aria-label="Close coverage manager">x</button>
          </header>
          <div class="coverage-policy-manager-feedback" data-coverage-manager-feedback aria-live="polite"></div>
          <div class="coverage-policy-manager-totals" data-coverage-manager-totals></div>
          <div class="coverage-policy-manager-list" data-coverage-manager-list></div>
          <div class="coverage-policy-manager-toolbar">
            <button class="btn btn-secondary existing-coverage-add-button" type="button" data-coverage-manager-add>Add Existing Coverage</button>
          </div>
          <form class="client-detail-card client-activity-widget client-coverage-widget coverage-policy-manager-editor" data-coverage-manager-editor hidden novalidate>
            <div class="client-activity-widget-heading existing-coverage-wizard-heading">
              <h3 data-coverage-manager-editor-title>Add Coverage</h3>
              <p data-coverage-manager-editor-copy>Save a face amount now and add policy details when available.</p>
            </div>
            <div class="client-coverage-widget-progress" data-coverage-manager-progress></div>
            <div class="client-activity-widget-body client-coverage-widget-body" data-coverage-manager-body></div>
            <div class="client-activity-widget-actions client-coverage-widget-actions existing-coverage-widget-actions">
              <button type="button" class="client-activity-widget-back" data-coverage-manager-back hidden>Back</button>
              <button type="button" class="client-activity-widget-cancel existing-coverage-widget-cancel" data-coverage-manager-cancel-edit>Cancel</button>
              <button type="submit" class="client-activity-widget-save" data-coverage-manager-save>Next</button>
            </div>
          </form>
        </section>
      </div>
    `;
  }

  function openCoveragePolicyManager(options) {
    if (!documentRef?.body) {
      return null;
    }

    if (activeController) {
      activeController.close();
    }

    const modalShell = documentRef.createElement("div");
    modalShell.innerHTML = buildModalMarkup(options);
    const modal = modalShell.firstElementChild;
    documentRef.body.appendChild(modal);

    const totalsContainer = modal.querySelector("[data-coverage-manager-totals]");
    const listContainer = modal.querySelector("[data-coverage-manager-list]");
    const feedback = modal.querySelector("[data-coverage-manager-feedback]");
    const editor = modal.querySelector("[data-coverage-manager-editor]");
    const editorTitle = modal.querySelector("[data-coverage-manager-editor-title]");
    const editorCopy = modal.querySelector("[data-coverage-manager-editor-copy]");
    const editorProgress = modal.querySelector("[data-coverage-manager-progress]");
    const editorBody = modal.querySelector("[data-coverage-manager-body]");
    const backButton = modal.querySelector("[data-coverage-manager-back]");
    const saveButton = modal.querySelector("[data-coverage-manager-save]");
    const addButton = modal.querySelector("[data-coverage-manager-add]");
    const allowDelete = options?.allowDelete === true;
    const policyLimit = Math.max(0, Math.round(Number(options?.policyLimit || 0)));
    let policies = clonePolicies(options?.coveragePolicies || options?.profileRecord?.coveragePolicies);
    let activeIndex = -1;
    let activeStep = 0;
    let activeDraft = null;

    function showFeedback(message) {
      if (feedback) {
        feedback.textContent = toTrimmedString(message);
        feedback.hidden = !toTrimmedString(message);
      }
    }

    function canAddPolicy(nextPolicies) {
      const policySource = Array.isArray(nextPolicies) ? nextPolicies : policies;
      return !policyLimit || policySource.length < policyLimit;
    }

    function getInsuredNameSuggestion() {
      const profileRecord = options?.profileRecord || {};
      const fallbackName = [
        toTrimmedString(profileRecord.preferredName || profileRecord.firstName),
        toTrimmedString(profileRecord.lastName)
      ].filter(Boolean).join(" ");
      const rawSuggestion = toTrimmedString(
        profileRecord.displayName
        || fallbackName
        || ""
      ).replace(/\s+Household$/i, "");

      return rawSuggestion
        ? rawSuggestion.toLowerCase().replace(/\b\w/g, function (character) { return character.toUpperCase(); })
        : "";
    }

    function renderInsuredGhostMarkup(currentValue) {
      const suggestion = getInsuredNameSuggestion();
      const typedValue = toTrimmedString(currentValue);
      if (!suggestion) {
        return "";
      }

      const normalizedSuggestion = suggestion.toLowerCase();
      const normalizedTyped = typedValue.toLowerCase();
      if (typedValue && !normalizedSuggestion.startsWith(normalizedTyped)) {
        return "";
      }

      if (typedValue.length >= suggestion.length) {
        return "";
      }

      return `${typedValue ? `<span class="client-coverage-suggest-match">${escapeHtml(suggestion.slice(0, typedValue.length))}</span>` : ""}<span>${escapeHtml(suggestion.slice(typedValue.length))}</span>`;
    }

    function refreshInsuredSuggestion() {
      if (!editor) {
        return;
      }

      const insuredInput = editor.querySelector("[data-coverage-manager-insured-input]");
      const insuredGhost = editor.querySelector("[data-coverage-manager-insured-ghost]");
      if (!(insuredInput instanceof HTMLInputElement) || !insuredGhost) {
        return;
      }

      const ghostMarkup = renderInsuredGhostMarkup(insuredInput.value);
      insuredGhost.innerHTML = ghostMarkup;
      insuredGhost.classList.toggle("is-hidden", !ghostMarkup);
    }

    function acceptInsuredSuggestion() {
      const insuredInput = editor?.querySelector("[data-coverage-manager-insured-input]");
      if (!(insuredInput instanceof HTMLInputElement)) {
        return false;
      }

      const suggestion = getInsuredNameSuggestion();
      const ghostMarkup = renderInsuredGhostMarkup(insuredInput.value);
      if (!suggestion || !ghostMarkup) {
        return false;
      }

      insuredInput.value = suggestion;
      syncDraftFromField(insuredInput);
      refreshInsuredSuggestion();
      refreshProgress();
      return true;
    }

    function getStepCompletion(stepIndex) {
      const stepFields = Array.isArray(COVERAGE_WIDGET_STEP_FIELDS[stepIndex])
        ? COVERAGE_WIDGET_STEP_FIELDS[stepIndex]
        : [];
      if (!stepFields.length || !activeDraft) {
        return 0;
      }

      const completedCount = stepFields.filter(function (fieldName) {
        return Boolean(toTrimmedString(activeDraft[fieldName]));
      }).length;

      return completedCount / stepFields.length;
    }

    function renderStepTrack() {
      const segmentCount = Math.max(COVERAGE_WIDGET_STEPS.length - 1, 1);
      const completionWithinStep = activeStep < segmentCount ? getStepCompletion(activeStep) : 1;
      const ratio = Math.min(1, (activeStep + Math.max(0, Math.min(completionWithinStep, 1))) / segmentCount);

      return `
        <div class="step-track client-coverage-step-track" style="--step-count:${COVERAGE_WIDGET_STEPS.length};--progress-ratio:${ratio.toFixed(4)};">
          ${COVERAGE_WIDGET_STEPS.map(function (step, index) {
            let stateClass = "";
            if (index < activeStep) {
              stateClass = "is-complete";
            } else if (index === activeStep) {
              stateClass = "is-current";
            }

            return `
              <button
                type="button"
                class="step-item client-coverage-step-item ${stateClass}"
                data-coverage-manager-step-target="${index}"
                aria-current="${index === activeStep ? "step" : "false"}"
              >
                <span class="step-number">${index + 1}</span>
                <span class="step-title">${escapeHtml(step.label)}</span>
              </button>
            `;
          }).join("")}
        </div>
      `;
    }

    function renderDocumentShell(currentPolicy) {
      const savedDocuments = getPolicyDocumentEntries(currentPolicy);
      const documentName = toTrimmedString(savedDocuments[0]?.name);
      const totalSavedSize = savedDocuments.reduce(function (sum, entry) {
        return sum + Number(entry?.size || 0);
      }, 0);
      const title = documentName
        ? (savedDocuments.length > 1 ? `${savedDocuments.length} files attached` : documentName)
        : "Policy file upload is not available here.";
      const meta = documentName
        ? (totalSavedSize ? `${formatFileSize(totalSavedSize)} saved` : "Saved policy documents remain on this policy.")
        : "Use the full Existing Coverage page to add or manage policy files.";

      return `
        <label class="client-activity-field client-coverage-widget-field-full">
          <span>Policy File</span>
          <div class="client-coverage-document-shell is-disabled">
            <div class="client-coverage-document-current${documentName ? "" : " is-empty"}" data-coverage-document-current>
              <strong data-coverage-document-title>${escapeHtml(title)}</strong>
              <span data-coverage-document-meta>${escapeHtml(meta)}</span>
            </div>
            <p class="client-coverage-document-help">Documents are not changed from the PMI coverage manager.</p>
          </div>
        </label>
      `;
    }

    function renderStepFields(currentPolicy) {
      const current = currentPolicy || {};
      const selectedPremiumMode = toTrimmedString(current.premiumMode);
      const selectedPolicyType = toTrimmedString(current.policyType);
      const termPolicyType = selectedPolicyType === "Term";
      const permanentPolicyType = isPermanentPolicyType(selectedPolicyType);
      const steppedPremiumMode = isSteppedPremiumMode(selectedPremiumMode);
      const premiumSchedule = getPremiumScheduleParts(current);
      const premiumAmountDisabled = !selectedPremiumMode;
      const currentStep = COVERAGE_WIDGET_STEPS[activeStep] || COVERAGE_WIDGET_STEPS[0];
      const renderedTermLength = permanentPolicyType
        ? "Permanent Coverage"
        : toTrimmedString(current.termLength);
      const sharedPremiumModeField = `
        <label class="client-activity-field client-coverage-widget-field-full">
          <span>Premium Mode</span>
          <input type="hidden" name="premiumMode" value="${escapeHtml(selectedPremiumMode)}">
          <div class="coverage-mode-shell" data-coverage-mode-shell>
            <div class="coverage-mode-buttons" role="group" aria-label="Premium Mode">
              ${renderCoverageModeButtons(selectedPremiumMode)}
            </div>
          </div>
        </label>
      `;

      let stepFields = "";
      if (activeStep === 0) {
        stepFields = `
          ${sharedPremiumModeField}
          <label class="client-activity-field">
            <span>Policy Carrier</span>
            <input class="client-activity-input" type="text" name="policyCarrier" value="${escapeHtml(toTrimmedString(current.policyCarrier))}" maxlength="140">
          </label>
          <label class="client-activity-field">
            <span>Policy Type</span>
            <select class="client-activity-select" name="policyType">
              ${renderCoverageTypeOptions(current.policyType)}
            </select>
          </label>
          <label class="client-activity-field">
            <span>Insured Name</span>
            <div class="client-coverage-suggest-shell">
              <div class="client-coverage-suggest-ghost${renderInsuredGhostMarkup(current.insuredName) ? "" : " is-hidden"}" data-coverage-manager-insured-ghost aria-hidden="true">${renderInsuredGhostMarkup(current.insuredName)}</div>
              <input class="client-activity-input client-coverage-suggest-input" type="text" name="insuredName" value="${escapeHtml(toTrimmedString(current.insuredName))}" maxlength="160" data-coverage-manager-insured-input>
            </div>
          </label>
          <label class="client-activity-field">
            <span>Policy Owner</span>
            <input class="client-activity-input" type="text" name="ownerName" value="${escapeHtml(toTrimmedString(current.ownerName))}" maxlength="160">
          </label>
          <label class="client-activity-field client-coverage-widget-field-full">
            <span>Face Amount <span class="existing-coverage-required-note">required</span></span>
            <input class="client-activity-input" type="text" name="faceAmount" value="${escapeHtml(formatCurrencyInput(current.faceAmount))}" inputmode="decimal">
          </label>
        `;
      } else if (activeStep === 1) {
        stepFields = `
          <label class="client-activity-field">
            <span>Premium Mode</span>
            <input class="client-activity-input client-coverage-readonly-input" type="text" value="${escapeHtml(selectedPremiumMode || "Not selected")}" readonly tabindex="-1" aria-readonly="true">
          </label>
          <label class="client-activity-field${premiumAmountDisabled ? " is-disabled" : ""}" data-premium-amount-group>
            <span>${escapeHtml(getPremiumAmountLabel(selectedPremiumMode))}</span>
            <input class="client-activity-input" type="text" name="premiumAmount" value="${escapeHtml(formatCurrencyInput(current.premiumAmount))}" inputmode="decimal"${premiumAmountDisabled ? " disabled" : ""}>
          </label>
          ${steppedPremiumMode ? `
            <label class="client-activity-field">
              <span>Starting Premium (Optional)</span>
              <input class="client-activity-input" type="text" name="startingPremium" value="${escapeHtml(formatCurrencyInput(current.startingPremium))}" inputmode="decimal" placeholder="Optional">
            </label>
          ` : ""}
          ${steppedPremiumMode ? `
            <div class="client-activity-field client-coverage-duration-group">
              <span>Time to Final Premium (Optional)</span>
              <div class="client-coverage-duration-row">
                <div class="client-coverage-inline-duration">
                  <div class="client-coverage-inline-unit-field">
                    <input class="client-activity-input client-coverage-inline-unit-input" type="text" name="premiumScheduleYears" value="${escapeHtml(premiumSchedule.years)}" inputmode="numeric" maxlength="3" placeholder="0">
                    <span class="client-coverage-inline-unit">Years</span>
                  </div>
                  <div class="client-coverage-inline-unit-field">
                    <input class="client-activity-input client-coverage-inline-unit-input" type="text" name="premiumScheduleMonths" value="${escapeHtml(premiumSchedule.months)}" inputmode="numeric" maxlength="2" placeholder="0">
                    <span class="client-coverage-inline-unit">Months</span>
                  </div>
                  <input type="hidden" name="premiumScheduleDuration" value="${escapeHtml(premiumSchedule.combined)}">
                </div>
              </div>
            </div>
          ` : ""}
          ${termPolicyType ? `
            <label class="client-activity-field">
              <span>Term Length</span>
              <div class="client-coverage-duration-row">
                <div class="client-coverage-inline-unit-field">
                  <input class="client-activity-input client-coverage-inline-unit-input" type="text" name="termLength" value="${escapeHtml(renderedTermLength)}" inputmode="numeric" maxlength="3" placeholder="0">
                  <span class="client-coverage-inline-unit">Years</span>
                </div>
              </div>
            </label>
          ` : `
            <label class="client-activity-field">
              <span>Term Length</span>
              <input
                class="client-activity-input${permanentPolicyType ? " client-coverage-readonly-input" : ""}"
                type="text"
                name="termLength"
                value="${escapeHtml(renderedTermLength)}"
                ${permanentPolicyType ? 'readonly tabindex="-1" aria-readonly="true"' : 'inputmode="numeric"'}
              >
            </label>
          `}
          <label class="client-activity-field">
            <span>Effective Date</span>
            <input class="client-activity-input" type="date" name="effectiveDate" value="${escapeHtml(toTrimmedString(current.effectiveDate))}">
          </label>
          <label class="client-activity-field">
            <span>Underwriting Class</span>
            <select class="client-activity-select" name="underwritingClass">
              ${renderUnderwritingClassOptions(current.underwritingClass)}
            </select>
          </label>
          <label class="client-activity-field">
            <span>Primary Beneficiary</span>
            <input class="client-activity-input" type="text" name="beneficiaryName" value="${escapeHtml(toTrimmedString(current.beneficiaryName))}" maxlength="160">
          </label>
        `;
      } else {
        stepFields = `
          <label class="client-activity-field">
            <span>Policy Number</span>
            <input class="client-activity-input" type="text" name="policyNumber" value="${escapeHtml(toTrimmedString(current.policyNumber))}" maxlength="120">
          </label>
          <label class="client-activity-field client-coverage-widget-field-full">
            <span>Policy Notes</span>
            <textarea class="client-activity-textarea" name="policyNotes" rows="4" placeholder="Add any policy notes.">${escapeHtml(toTrimmedString(current.policyNotes))}</textarea>
          </label>
          ${renderDocumentShell(current)}
        `;
      }

      return `
        <div class="client-coverage-widget-step-shell" data-coverage-step-shell>
          <div class="client-coverage-widget-step-copy">
            <span>Step ${activeStep + 1} of ${COVERAGE_WIDGET_STEPS.length}</span>
            <h3>${escapeHtml(currentStep.title)}</h3>
          </div>
          <div class="client-coverage-widget-grid">
            ${stepFields}
          </div>
        </div>
      `;
    }

    function refreshActions() {
      if (backButton) {
        backButton.hidden = activeStep === 0;
      }

      if (saveButton) {
        saveButton.textContent = activeStep >= COVERAGE_WIDGET_STEPS.length - 1 ? "Save Coverage" : "Next";
      }
    }

    function refreshProgress() {
      if (!editorProgress) {
        return;
      }

      const track = editorProgress.querySelector(".step-track");
      if (!track) {
        return;
      }

      const segmentCount = Math.max(COVERAGE_WIDGET_STEPS.length - 1, 1);
      const completionWithinStep = activeStep < segmentCount ? getStepCompletion(activeStep) : 1;
      const ratio = Math.min(1, (Math.max(0, activeStep) + Math.max(0, Math.min(completionWithinStep, 1))) / segmentCount);
      track.style.setProperty("--progress-ratio", ratio.toFixed(4));
    }

    function syncPremiumScheduleDraft() {
      if (!activeDraft || !editor) {
        return;
      }

      const yearsInput = editor.querySelector('input[name="premiumScheduleYears"]');
      const monthsInput = editor.querySelector('input[name="premiumScheduleMonths"]');
      const durationInput = editor.querySelector('input[name="premiumScheduleDuration"]');
      const rawYears = toTrimmedString(yearsInput instanceof HTMLInputElement ? yearsInput.value : activeDraft.premiumScheduleYears).replace(/\D/g, "");
      const rawMonths = toTrimmedString(monthsInput instanceof HTMLInputElement ? monthsInput.value : activeDraft.premiumScheduleMonths).replace(/\D/g, "");
      const years = Math.max(0, Math.round(Number(rawYears || 0)));
      const months = Math.min(11, Math.max(0, Math.round(Number(rawMonths || 0))));
      const nextYears = rawYears === "" && !years ? "" : String(years);
      const nextMonths = rawMonths === "" && !months ? "" : String(months);
      const combined = !years && !months ? "" : (years + (months / 12)).toFixed(2).replace(/\.00$/, "");

      activeDraft.premiumScheduleYears = nextYears;
      activeDraft.premiumScheduleMonths = nextMonths;
      activeDraft.premiumScheduleDuration = combined;

      if (yearsInput instanceof HTMLInputElement) {
        yearsInput.value = nextYears;
      }
      if (monthsInput instanceof HTMLInputElement) {
        monthsInput.value = nextMonths;
      }
      if (durationInput instanceof HTMLInputElement) {
        durationInput.value = combined;
      }
    }

    function syncTermLengthForPolicyType(nextPolicyType) {
      if (!activeDraft || !editor) {
        return;
      }

      const normalizedPolicyType = toTrimmedString(nextPolicyType);
      const nextTermLength = isPermanentPolicyType(normalizedPolicyType)
        ? "Permanent Coverage"
        : (toTrimmedString(activeDraft.termLength) === "Permanent Coverage"
          ? ""
          : toTrimmedString(activeDraft.termLength));

      activeDraft.termLength = nextTermLength;
      const termLengthField = editor.querySelector('input[name="termLength"]');
      if (termLengthField instanceof HTMLInputElement) {
        termLengthField.value = nextTermLength;
      }
    }

    function setPremiumMode(nextValue) {
      if (!editor || !activeDraft) {
        return;
      }

      const normalized = toTrimmedString(nextValue);
      const steppedPremiumMode = isSteppedPremiumMode(normalized);
      const premiumModeField = editor.querySelector('input[name="premiumMode"]');
      const premiumModeButtons = editor.querySelectorAll("[data-coverage-manager-mode]");
      const premiumAmountField = editor.querySelector('input[name="premiumAmount"]');
      const premiumAmountGroup = editor.querySelector("[data-premium-amount-group]");

      if (premiumModeField) {
        premiumModeField.value = normalized;
      }

      activeDraft.premiumMode = normalized;
      if (!steppedPremiumMode) {
        activeDraft.startingPremium = "";
        activeDraft.premiumScheduleYears = "";
        activeDraft.premiumScheduleMonths = "";
        activeDraft.premiumScheduleDuration = "";
      }

      if (premiumAmountField instanceof HTMLInputElement) {
        premiumAmountField.disabled = !normalized;
        premiumAmountGroup?.classList.toggle("is-disabled", !normalized);
        if (!normalized) {
          premiumAmountField.value = "";
          activeDraft.premiumAmount = "";
        }
      }

      premiumModeButtons.forEach(function (button) {
        button.classList.toggle("is-active", toTrimmedString(button.getAttribute("data-coverage-manager-mode")) === normalized);
      });
    }

    function syncDraftFromField(field) {
      if (!activeDraft || !field) {
        return;
      }

      const fieldName = toTrimmedString(field.name);
      if (!fieldName) {
        return;
      }

      let nextValue = toTrimmedString(field.value);
      if (field instanceof HTMLInputElement && field.inputMode === "decimal") {
        nextValue = normalizeCurrencyValue(nextValue);
      }

      if (field instanceof HTMLInputElement && field.inputMode === "numeric") {
        nextValue = nextValue.replace(/\D/g, "");
      }

      activeDraft[fieldName] = nextValue;
      if (fieldName === "policyType") {
        syncTermLengthForPolicyType(nextValue);
      }
      if (fieldName === "premiumScheduleYears" || fieldName === "premiumScheduleMonths") {
        syncPremiumScheduleDraft();
      }
    }

    function syncDraftFromForm() {
      if (!editor) {
        return;
      }

      editor.querySelectorAll("input[name], select[name], textarea[name]").forEach(function (field) {
        if (field instanceof HTMLInputElement || field instanceof HTMLSelectElement || field instanceof HTMLTextAreaElement) {
          syncDraftFromField(field);
        }
      });
    }

    function renderEditorStep() {
      if (!editorBody || !editorProgress || !activeDraft) {
        return;
      }

      syncTermLengthForPolicyType(activeDraft.policyType);
      editorProgress.innerHTML = renderStepTrack();
      editorBody.innerHTML = renderStepFields(activeDraft);
      setPremiumMode(toTrimmedString(activeDraft.premiumMode));
      refreshInsuredSuggestion();
      refreshProgress();
      refreshActions();
    }

    function goToStep(nextStep) {
      activeStep = Math.max(0, Math.min(COVERAGE_WIDGET_STEPS.length - 1, Number(nextStep) || 0));
      renderEditorStep();
    }

    function render() {
      if (typeof coverageSummaryList.renderCoverageTotals === "function") {
        coverageSummaryList.renderCoverageTotals(totalsContainer, policies);
      }

      if (typeof coverageSummaryList.renderCoveragePolicyList === "function") {
        coverageSummaryList.renderCoveragePolicyList(listContainer, policies, {
          itemClass: "existing-coverage-saved-card",
          copyClass: "existing-coverage-saved-card-copy",
          actionsClass: "existing-coverage-saved-card-actions",
          emptyClass: "existing-coverage-empty",
          emptyTitle: "No existing coverage records found.",
          emptyCopy: "Add coverage to save policy records to this linked profile.",
          indexAttribute: "data-coverage-manager-policy-index",
          renderActions: function (summary, index) {
            return `
              <button class="existing-coverage-saved-action" type="button" data-coverage-manager-edit="${escapeHtml(index)}">Edit</button>
              ${allowDelete ? `<button class="existing-coverage-saved-delete" type="button" data-coverage-manager-delete="${escapeHtml(index)}">Remove</button>` : ""}
            `;
          }
        });
      }

      if (addButton instanceof HTMLButtonElement) {
        const canAdd = canAddPolicy();
        addButton.disabled = !canAdd;
        addButton.textContent = canAdd ? "Add Existing Coverage" : "Policy Limit Reached";
      }
    }

    function openEditor(policyIndex) {
      activeIndex = Number.isInteger(policyIndex) ? policyIndex : -1;
      const currentPolicy = activeIndex >= 0 ? policies[activeIndex] : null;
      activeStep = 0;
      activeDraft = buildDraftFromPolicy(currentPolicy);
      if (editorTitle) {
        editorTitle.textContent = currentPolicy ? "Edit Coverage" : "Add Existing Coverage";
      }
      if (editorCopy) {
        editorCopy.textContent = currentPolicy
          ? "Update the policy details and save them back to this profile."
          : "Save a face amount now and add policy details when available.";
      }
      editor.hidden = false;
      showFeedback("");
      renderEditorStep();
      const faceAmountField = editor.querySelector('[name="faceAmount"]');
      if (faceAmountField instanceof HTMLElement && !currentPolicy) {
        faceAmountField.focus();
      }
    }

    function closeEditor() {
      activeIndex = -1;
      activeStep = 0;
      activeDraft = null;
      if (editor) {
        editor.hidden = true;
      }
      showFeedback("");
    }

    async function persistPolicies(nextPolicies) {
      if (typeof options?.onSavePolicies !== "function") {
        showFeedback("Unable to save coverage policies from this page.");
        return false;
      }

      let result = null;
      try {
        result = await options.onSavePolicies(clonePolicies(nextPolicies));
      } catch (error) {
        showFeedback("Unable to save coverage policies right now.");
        return false;
      }

      if (!result) {
        showFeedback("Unable to save coverage policies right now.");
        return false;
      }

      const savedPolicies = Array.isArray(result?.coveragePolicies)
        ? result.coveragePolicies
        : Array.isArray(result)
          ? result
          : nextPolicies;
      policies = clonePolicies(savedPolicies);
      render();
      if (typeof options?.onPoliciesChange === "function") {
        options.onPoliciesChange(clonePolicies(policies), result);
      }
      return true;
    }

    function close() {
      modal.remove();
      if (activeController === controller) {
        activeController = null;
      }
      if (typeof options?.onClose === "function") {
        options.onClose();
      }
    }

    const controller = {
      close,
      getPolicies: function () {
        return clonePolicies(policies);
      }
    };

    modal.addEventListener("click", async function (event) {
      const closeTrigger = event.target.closest("[data-coverage-manager-close]");
      if (closeTrigger) {
        close();
        return;
      }

      if (event.target.closest("[data-coverage-manager-add]")) {
        if (!canAddPolicy()) {
          showFeedback(`A maximum of ${policyLimit} policies can be saved to one profile.`);
          return;
        }
        openEditor(-1);
        return;
      }

      if (event.target.closest("[data-coverage-manager-cancel-edit]")) {
        closeEditor();
        return;
      }

      const stepButton = event.target.closest("[data-coverage-manager-step-target]");
      if (stepButton) {
        syncDraftFromForm();
        goToStep(Number(stepButton.getAttribute("data-coverage-manager-step-target") || "0"));
        return;
      }

      const modeButton = event.target.closest("[data-coverage-manager-mode]");
      if (modeButton) {
        setPremiumMode(modeButton.getAttribute("data-coverage-manager-mode"));
        refreshActions();
        refreshProgress();
        return;
      }

      const editButton = event.target.closest("[data-coverage-manager-edit]");
      if (editButton) {
        openEditor(Number(editButton.getAttribute("data-coverage-manager-edit") || "-1"));
        return;
      }

      const deleteButton = event.target.closest("[data-coverage-manager-delete]");
      if (deleteButton) {
        const policyIndex = Number(deleteButton.getAttribute("data-coverage-manager-delete") || "-1");
        if (policyIndex < 0 || policyIndex >= policies.length) {
          return;
        }
        if (!root.confirm("Remove this policy from the linked profile?")) {
          return;
        }
        const nextPolicies = policies.slice();
        nextPolicies.splice(policyIndex, 1);
        const saved = await persistPolicies(nextPolicies);
        if (saved) {
          closeEditor();
        }
      }
    });

    modal.addEventListener("beforeinput", function (event) {
      const input = event.target;
      if (!(input instanceof HTMLInputElement) || !event.data) {
        return;
      }

      if (input.inputMode === "numeric" && !/^[0-9]$/.test(event.data)) {
        event.preventDefault();
        return;
      }

      if (input.inputMode === "decimal" && !/^[0-9.]$/.test(event.data)) {
        event.preventDefault();
      }
    });

    modal.addEventListener("keydown", function (event) {
      const input = event.target;
      if (input instanceof HTMLInputElement && input.name === "insuredName" && event.key === "Tab" && !event.shiftKey && !event.altKey && !event.ctrlKey && !event.metaKey) {
        if (acceptInsuredSuggestion()) {
          event.preventDefault();
          root.requestAnimationFrame(function () {
            const ownerField = editor?.querySelector('[name="ownerName"]');
            if (ownerField instanceof HTMLElement) {
              ownerField.focus();
            }
          });
        }
        return;
      }

      if (event.key === "Escape") {
        close();
      }
    });

    modal.addEventListener("input", function (event) {
      const target = event.target;
      if (!(target instanceof HTMLInputElement)) {
        if (target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) {
          syncDraftFromField(target);
          refreshInsuredSuggestion();
          refreshProgress();
        }
        return;
      }

      if (target.inputMode === "decimal") {
        const rawValue = target.value;
        syncDraftFromField(target);
        target.value = formatCurrencyEditingInput(rawValue);
        refreshInsuredSuggestion();
        refreshProgress();
        return;
      }

      if (target.inputMode === "numeric") {
        target.value = toTrimmedString(target.value).replace(/\D/g, "");
      }

      syncDraftFromField(target);
      if (target.name === "premiumScheduleYears" || target.name === "premiumScheduleMonths") {
        syncPremiumScheduleDraft();
      }
      refreshInsuredSuggestion();
      refreshProgress();
    });

    modal.addEventListener("focusout", function (event) {
      const input = event.target;
      if (!(input instanceof HTMLInputElement) || input.inputMode !== "decimal") {
        return;
      }

      syncDraftFromField(input);
      input.value = formatCurrencyInput(input.value);
    });

    modal.addEventListener("change", function (event) {
      const target = event.target;
      if (!(target instanceof HTMLInputElement) && !(target instanceof HTMLSelectElement)) {
        return;
      }

      syncDraftFromField(target);
      if (target.name === "premiumScheduleYears" || target.name === "premiumScheduleMonths") {
        syncPremiumScheduleDraft();
      }

      refreshInsuredSuggestion();
      refreshProgress();
    });

    modal.addEventListener("submit", async function (event) {
      event.preventDefault();
      if (!activeDraft) {
        return;
      }

      syncDraftFromForm();
      if (activeStep < COVERAGE_WIDGET_STEPS.length - 1) {
        goToStep(activeStep + 1);
        return;
      }

      if (!normalizeCurrencyValue(activeDraft.faceAmount)) {
        showFeedback("Face amount is required before saving.");
        goToStep(0);
        root.requestAnimationFrame(function () {
          const faceAmountField = editor?.querySelector('[name="faceAmount"]');
          if (faceAmountField instanceof HTMLElement) {
            faceAmountField.focus();
          }
        });
        return;
      }

      const nextPolicies = policies.slice();
      const existingPolicy = activeIndex >= 0 ? nextPolicies[activeIndex] : null;
      if (!existingPolicy && !canAddPolicy(nextPolicies)) {
        showFeedback(`A maximum of ${policyLimit} policies can be saved to one profile.`);
        return;
      }
      const nextPolicy = createPolicyFromDraft(activeDraft, existingPolicy);
      if (activeIndex >= 0 && activeIndex < nextPolicies.length) {
        nextPolicies[activeIndex] = nextPolicy;
      } else {
        nextPolicies.push(nextPolicy);
      }

      const saved = await persistPolicies(nextPolicies);
      if (saved) {
        closeEditor();
      }
    });

    if (feedback) {
      feedback.hidden = true;
    }
    render();
    activeController = controller;
    const initialPolicyIndex = Number(options?.initialPolicyIndex);
    const initialAction = toTrimmedString(options?.initialAction);
    if (Number.isInteger(initialPolicyIndex) && initialPolicyIndex >= 0 && initialPolicyIndex < policies.length) {
      openEditor(initialPolicyIndex);
    } else if (initialAction === "add" && canAddPolicy()) {
      openEditor(-1);
    }
    root.requestAnimationFrame(function () {
      modal.classList.add("is-open");
    });

    if (addButton instanceof HTMLElement && !policies.length) {
      addButton.focus();
    }

    return controller;
  }

  Object.assign(coverageManager, {
    openCoveragePolicyManager
  });
})(typeof window !== "undefined" ? window : globalThis);
