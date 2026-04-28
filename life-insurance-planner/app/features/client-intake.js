(function () {
  const LensApp = window.LensApp || (window.LensApp = {});
  const { STORAGE_KEYS } = LensApp.config || {};

  function getIntakeHelpers() {
    return LensApp.clientIntakeHelpers || {};
  }

  function getClientRecordsApi() {
    return LensApp.clientRecords || {};
  }

  function getAuthApi() {
    return LensApp.auth || {};
  }

  function initializeClientCreationForm() {
    const { getCurrentSession, getClientRecords } = getClientRecordsApi();
    const { formatDateInputValue } = getIntakeHelpers();
    const { setFormFeedback } = getAuthApi();
    const form = document.getElementById("client-creation-form");
    const feedback = document.getElementById("client-creation-feedback");
    const dateOfBirthField = form?.querySelector("[data-date-of-birth]");
    const ageField = form?.querySelector("[data-age-field]");
    const advisorNameField = form?.querySelector("[data-advisor-name]");
    const householdIdField = form?.querySelector("[data-household-id]");
    const createdDateField = form?.querySelector("[data-created-date]");
    const lastUpdatedDateField = form?.querySelector("[data-last-updated-date]");
    const phoneNumberField = form?.querySelector("#phone-number");
    const assignmentModeField = form?.querySelector("[data-profile-assignment-mode]");
    const assignmentNameField = form?.querySelector("[data-profile-assignment-name]");
    const assignmentTargetIdField = form?.querySelector("[data-profile-assignment-target-id]");
    const assignmentTargetTypeField = form?.querySelector("[data-profile-assignment-target-type]");
    const dependentFields = form?.querySelector("[data-profile-dependent-fields]");
    const searchHouseholdsButton = form?.querySelector("[data-search-households]");
    const searchCompaniesButton = form?.querySelector("[data-search-companies]");
    const searchModal = document.querySelector("[data-profile-search-modal]");
    const searchModalTitle = document.querySelector("[data-profile-search-title]");
    const searchModalInput = document.querySelector("[data-profile-search-input]");
    const searchModalResults = document.querySelector("[data-profile-search-results]");
    const searchModalCloseButtons = document.querySelectorAll("[data-profile-search-close]");
    let activeSearchType = "";

    if (!form) {
      return;
    }

    const currentSession = getCurrentSession();
    const today = formatDateInputValue(new Date());

    if (advisorNameField && !advisorNameField.value) {
      advisorNameField.value = currentSession?.name || "";
    }

    if (createdDateField && !createdDateField.value) {
      createdDateField.value = today;
    }

    if (lastUpdatedDateField && !lastUpdatedDateField.value) {
      lastUpdatedDateField.value = today;
    }

    if (householdIdField && !householdIdField.value) {
      householdIdField.value = "Assigned on save";
    }

    function syncAgeField() {
      if (!ageField) {
        return;
      }

      const birthDateValue = String(dateOfBirthField?.value || "").trim();
      ageField.value = birthDateValue ? String(calculateAgeFromDate(birthDateValue)) : "";
    }

    function syncPhoneNumberField() {
      if (!phoneNumberField) {
        return;
      }

      phoneNumberField.value = formatPhoneNumberInput(phoneNumberField.value);
    }

    function getAssignmentKind(mode) {
      if (mode.endsWith("household")) {
        return "household";
      }
      if (mode.endsWith("company")) {
        return "company";
      }
      return "";
    }

    function getViewTypeForKind(kind) {
      return kind === "company" ? "companies" : "households";
    }

    function getAssignmentRecords(kind) {
      const viewType = getViewTypeForKind(kind);
      return getClientRecords()
        .filter((record) => record.viewType === viewType)
        .sort((first, second) => first.displayName.localeCompare(second.displayName));
    }

    function syncAssignmentNameState() {
      const mode = String(assignmentModeField?.value || "");
      const isCreate = mode.startsWith("create-");
      const isExisting = mode.startsWith("existing-");
      const kind = getAssignmentKind(mode);

      if (!assignmentNameField) {
        return;
      }

      assignmentNameField.disabled = !mode;
      assignmentNameField.readOnly = isExisting || !mode;

      if (!mode) {
        assignmentNameField.value = "";
        assignmentNameField.placeholder = "Please select to continue";
      } else if (isCreate && kind === "household") {
        assignmentNameField.placeholder = "Enter new household name";
      } else if (isCreate && kind === "company") {
        assignmentNameField.placeholder = "Enter new company profile name";
      } else if (isExisting && kind === "household") {
        assignmentNameField.placeholder = "Select an existing household";
      } else if (isExisting && kind === "company") {
        assignmentNameField.placeholder = "Select an existing company profile";
      }
    }

    function hasUnlockedAssignment() {
      const mode = String(assignmentModeField?.value || "");
      if (!mode) {
        return false;
      }

      if (mode.startsWith("existing-")) {
        return Boolean(String(assignmentTargetIdField?.value || "").trim());
      }

      return Boolean(String(assignmentNameField?.value || "").trim());
    }

    function syncDependentFieldset() {
      if (dependentFields) {
        dependentFields.disabled = !hasUnlockedAssignment();
      }
      syncHouseholdIdPreview();
    }

    function syncAssignmentControls() {
      const mode = String(assignmentModeField?.value || "");
      const previousKind = String(assignmentTargetTypeField?.value || "");
      const kind = getAssignmentKind(mode);
      const isExistingHousehold = mode === "existing-household";
      const isExistingCompany = mode === "existing-company";

      if (searchHouseholdsButton) {
        searchHouseholdsButton.disabled = !isExistingHousehold;
      }
      if (searchCompaniesButton) {
        searchCompaniesButton.disabled = !isExistingCompany;
      }

      if (!mode) {
        if (assignmentTargetIdField) {
          assignmentTargetIdField.value = "";
        }
        if (assignmentTargetTypeField) {
          assignmentTargetTypeField.value = "";
        }
        if (assignmentNameField) {
          assignmentNameField.value = "";
        }
      } else if (assignmentTargetTypeField) {
        if (previousKind && previousKind !== kind && assignmentNameField) {
          assignmentNameField.value = "";
        }
        if (previousKind && previousKind !== kind && assignmentTargetIdField) {
          assignmentTargetIdField.value = "";
        }
        assignmentTargetTypeField.value = kind;
      }

      if (mode.startsWith("create-")) {
        if (assignmentTargetIdField) {
          assignmentTargetIdField.value = "";
        }
      } else if (mode.startsWith("existing-")) {
        if (assignmentNameField && assignmentTargetIdField && !assignmentTargetIdField.value) {
          assignmentNameField.value = "";
        }
      }

      syncAssignmentNameState();
      syncDependentFieldset();
    }

    function syncHouseholdIdPreview() {
      if (!householdIdField) {
        return;
      }

      const mode = String(assignmentModeField?.value || "");
      if (mode.startsWith("existing-")) {
        householdIdField.value = String(assignmentTargetIdField?.value || "").trim() || "Select an existing profile";
        return;
      }

      if (mode.startsWith("create-")) {
        householdIdField.value = "Generated on save";
        return;
      }

      householdIdField.value = "Assigned on save";
    }

    function closeSearchModal() {
      if (searchModal) {
        searchModal.hidden = true;
      }
      activeSearchType = "";
      if (searchModalInput) {
        searchModalInput.value = "";
      }
    }

    function renderSearchResults() {
      if (!searchModalResults) {
        return;
      }

      const records = activeSearchType ? getAssignmentRecords(activeSearchType) : [];
      const query = String(searchModalInput?.value || "").trim().toLowerCase();
      const filteredRecords = query
        ? records.filter((record) => String(record.displayName || "").toLowerCase().includes(query))
        : records;

      searchModalResults.innerHTML = "";

      if (!filteredRecords.length) {
        const emptyState = document.createElement("div");
        emptyState.className = "profile-search-results-empty";
          emptyState.textContent = activeSearchType === "company"
            ? "No business profiles found."
            : "No households found.";
        searchModalResults.appendChild(emptyState);
        return;
      }

      filteredRecords.forEach((record) => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "profile-search-result-button";
        button.textContent = record.displayName;
        button.addEventListener("click", () => {
          if (assignmentTargetIdField) {
            assignmentTargetIdField.value = record.id;
          }
          if (assignmentTargetTypeField) {
            assignmentTargetTypeField.value = activeSearchType;
          }
          if (assignmentNameField) {
            assignmentNameField.value = record.displayName;
          }
          closeSearchModal();
          syncDependentFieldset();
          setFormFeedback(feedback, "");
        });
        searchModalResults.appendChild(button);
      });
    }

    function openSearchModal(kind) {
      activeSearchType = kind;
      if (searchModalTitle) {
          searchModalTitle.textContent = kind === "company" ? "Search Business Profiles" : "Search Existing Households";
      }
      if (searchModalInput) {
        searchModalInput.value = "";
      }
      renderSearchResults();
      if (searchModal) {
        searchModal.hidden = false;
      }
      window.setTimeout(() => {
        searchModalInput?.focus();
      }, 20);
    }

    syncAssignmentControls();
    syncAgeField();

    assignmentModeField?.addEventListener("change", () => {
      if (assignmentTargetIdField) {
        assignmentTargetIdField.value = "";
      }
      if (assignmentTargetTypeField) {
        assignmentTargetTypeField.value = "";
      }
      if (assignmentNameField) {
        assignmentNameField.value = "";
      }
      syncAssignmentControls();
      setFormFeedback(feedback, "");
    });
    assignmentNameField?.addEventListener("input", () => {
      if (String(assignmentModeField?.value || "").startsWith("create-")) {
        syncDependentFieldset();
        setFormFeedback(feedback, "");
      }
    });
    searchHouseholdsButton?.addEventListener("click", () => {
      if (!searchHouseholdsButton.disabled) {
        openSearchModal("household");
      }
    });
    searchCompaniesButton?.addEventListener("click", () => {
      if (!searchCompaniesButton.disabled) {
        openSearchModal("company");
      }
    });
    searchModalInput?.addEventListener("input", renderSearchResults);
    searchModalCloseButtons.forEach((button) => {
      button.addEventListener("click", closeSearchModal);
    });
    dateOfBirthField?.addEventListener("input", syncAgeField);
    dateOfBirthField?.addEventListener("change", syncAgeField);
    phoneNumberField?.addEventListener("input", syncPhoneNumberField);
    phoneNumberField?.addEventListener("blur", syncPhoneNumberField);

    form.addEventListener("invalid", (event) => {
      const field = event.target;
      if (!field || !field.id) {
        return;
      }

      const label = form.querySelector(`label[for="${field.id}"]`);
      setFormFeedback(feedback, `Complete ${label?.textContent || "all required fields"} before saving.`);
    }, true);

    form.addEventListener("input", () => {
      setFormFeedback(feedback, "");
    });

    form.addEventListener("change", () => {
      setFormFeedback(feedback, "");
    });

    if (form.dataset.localClientSave !== "true") {
      form.addEventListener("submit", (event) => {
        event.preventDefault();
        saveClientCreationForm(form, feedback);
      });
    }
  }

  function createSharedProfileFormBehavior(elements) {
    const {
      spouseDobField,
      spouseAgeField,
      maritalStatusField,
      interestTypeField,
      dependentFields,
      hasDependentsField,
      dependentsCountField,
      dependentAgesField,
      dependentDetailsField,
      dependentList,
      addDependentButton,
      projectedDependentsField,
      projectedDependentsCountField,
      employmentStatusField,
      employmentDetailFields,
      acquisitionSourceField,
      acquisitionSourceOtherField
    } = elements || {};
    let dependentEntryIdSeed = 0;

    function syncSpouseAge() {
      if (!spouseAgeField) {
        return;
      }

      const spouseBirthDate = String(spouseDobField?.value || "").trim();
      spouseAgeField.value = spouseBirthDate
        ? String(calculateAgeFromDate(spouseBirthDate))
        : "";
    }

    function syncSpouseFields() {
      const applicableStatuses = ["Married", "Domestic Partnership", "Separated"];
      const isApplicable = applicableStatuses.includes(String(maritalStatusField?.value || ""));

      [spouseDobField, spouseAgeField].forEach(function (field) {
        if (!field) {
          return;
        }

        field.disabled = !isApplicable;
        field.closest(".field-group")?.classList.toggle("is-disabled", !isApplicable);
        if (!isApplicable) {
          field.value = "";
        }
      });

      if (isApplicable) {
        syncSpouseAge();
      }
    }

    function syncDependentBuilderDisabledState() {
      const disabled = dependentFields?.disabled || String(hasDependentsField?.value || "No") !== "Yes";
      if (addDependentButton) {
        addDependentButton.disabled = disabled;
      }
      if (!dependentList) {
        return;
      }

      dependentList.querySelectorAll("input, button").forEach(function (element) {
        if (element === addDependentButton) {
          return;
        }
        element.disabled = disabled;
      });
    }

    function syncDependentFieldsetState() {
      const isFamilyInterest = String(interestTypeField?.value || "family") === "family";
      if (!dependentFields) {
        return;
      }

      if (!isFamilyInterest) {
        dependentFields.disabled = true;
        [
          hasDependentsField,
          dependentsCountField,
          dependentAgesField,
          dependentDetailsField,
          projectedDependentsField,
          projectedDependentsCountField
        ].forEach(function (field) {
          if (!field) {
            return;
          }

          if (field.tagName === "SELECT") {
            field.selectedIndex = 0;
          } else {
            field.value = "";
          }
        });
        if (dependentList) {
          dependentList.innerHTML = "";
        }
      }

      syncDependentBuilderDisabledState();
    }

    function syncEmploymentDetailFields() {
      const selectedStatus = String(employmentStatusField?.value || "");
      const disableDetails = ["Retired", "Unemployed", "Student", "Child <18"].includes(selectedStatus);

      Array.from(employmentDetailFields || []).forEach(function (field) {
        field.disabled = disableDetails;
        field.closest(".field-group")?.classList.toggle("is-disabled", disableDetails);
        if (field.id === "occupation") {
          field.required = !disableDetails;
        }
        if (disableDetails) {
          field.value = "";
        }
      });
    }

    function createDependentEntryId() {
      dependentEntryIdSeed += 1;
      return `dep-${Date.now()}-${dependentEntryIdSeed}`;
    }

    function getDependentEntries() {
      if (!dependentList) {
        return [];
      }

      return Array.from(dependentList.querySelectorAll("[data-dependent-entry]"));
    }

    function syncDependentAgeFromBirthDate(entry) {
      const birthDateInput = entry?.querySelector("[data-dependent-date-of-birth-input]");
      const ageField = entry?.querySelector("[data-dependent-age-field]");
      if (!ageField) {
        return;
      }

      const birthDateValue = String(birthDateInput?.value || "").trim();
      ageField.value = birthDateValue ? String(calculateAgeFromDate(birthDateValue)) : "";
    }

    function getDependentDetailFromEntry(entry) {
      const birthDateInput = entry?.querySelector("[data-dependent-date-of-birth-input]");
      const ageField = entry?.querySelector("[data-dependent-age-field]");
      const dateOfBirth = String(birthDateInput?.value || "").trim();
      const ageText = dateOfBirth
        ? String(calculateAgeFromDate(dateOfBirth))
        : String(ageField?.value || "").trim();

      if (dateOfBirth && ageField) {
        ageField.value = ageText;
      }

      return normalizeDependentDetailInput({
        id: entry?.dataset.dependentId || "",
        dateOfBirth,
        age: ageText
      });
    }

    function getDependentDetails() {
      return getDependentEntries().map(getDependentDetailFromEntry);
    }

    function getDependentAgeValues() {
      return getDependentDetails().map(function (detail) {
        return detail.ageText;
      });
    }

    function syncDependentHiddenFields() {
      const dependentDetails = getDependentDetails();
      if (dependentsCountField) {
        dependentsCountField.value = String(dependentDetails.length);
      }
      if (dependentAgesField) {
        dependentAgesField.value = dependentDetails.map(function (detail) {
          return detail.ageText;
        }).join(", ");
      }
      if (dependentDetailsField) {
        dependentDetailsField.value = dependentDetails.length
          ? JSON.stringify(dependentDetails.map(toSavedDependentDetail))
          : "";
      }
    }

    function syncDependentEntryLabels() {
      if (!dependentList) {
        return;
      }

      Array.from(dependentList.querySelectorAll("[data-dependent-entry]")).forEach(function (entry, index) {
        const label = entry.querySelector("[data-dependent-entry-label]");
        if (label) {
          label.textContent = `Dependent ${index + 1}`;
        }
      });
    }

    function removeDependentEntry(entry) {
      entry?.remove();
      syncDependentEntryLabels();
      syncDependentHiddenFields();
      syncDependentBuilderDisabledState();
    }

    if (dependentFields && typeof MutationObserver === "function") {
      new MutationObserver(function () {
        syncDependentBuilderDisabledState();
      }).observe(dependentFields, { attributes: true, attributeFilter: ["disabled"] });
    }

    function createDependentEntry(dependentValue) {
      if (!dependentList) {
        return;
      }

      const dependentDetail = normalizeDependentDetailInput(dependentValue);
      const entry = document.createElement("div");
      entry.className = "profile-dependent-entry";
      entry.setAttribute("data-dependent-entry", "");
      entry.dataset.dependentId = dependentDetail.id || createDependentEntryId();
      entry.innerHTML = `
          <div class="profile-dependent-entry-header">
            <span class="profile-dependent-entry-label" data-dependent-entry-label></span>
            <button class="profile-dependent-entry-remove" type="button">Remove</button>
          </div>
          <div class="profile-dependent-entry-body">
            <label>Date of Birth</label>
            <input class="profile-yes-no-field" data-dependent-date-of-birth-input type="date" value="">
            <label>Age</label>
            <div class="profile-currency-field">
              <input class="profile-yes-no-field profile-age-field" data-dependent-age-input data-dependent-age-field type="number" min="0" step="1" value="" readonly>
              <span class="profile-currency-suffix">Years</span>
            </div>
          </div>
        `;

      const birthDateInput = entry.querySelector("[data-dependent-date-of-birth-input]");
      const ageInput = entry.querySelector("[data-dependent-age-field]");
      const removeButton = entry.querySelector(".profile-dependent-entry-remove");
      if (birthDateInput) {
        birthDateInput.value = dependentDetail.dateOfBirth;
        birthDateInput.addEventListener("input", function () {
          syncDependentAgeFromBirthDate(entry);
          syncDependentHiddenFields();
        });
        birthDateInput.addEventListener("change", function () {
          syncDependentAgeFromBirthDate(entry);
          syncDependentHiddenFields();
        });
      }
      if (ageInput) {
        ageInput.value = dependentDetail.dateOfBirth
          ? String(calculateAgeFromDate(dependentDetail.dateOfBirth))
          : dependentDetail.ageText;
      }
      removeButton?.addEventListener("click", function () {
        removeDependentEntry(entry);
      });

      dependentList.appendChild(entry);
      syncDependentEntryLabels();
      syncDependentHiddenFields();
      syncDependentBuilderDisabledState();
    }

    function rebuildDependentEntriesFromStoredValue() {
      if (!dependentList) {
        return;
      }

      dependentList.innerHTML = "";
      const storedDetails = parseDependentDetailsValue(dependentDetailsField?.value || "");
      if (storedDetails.length) {
        storedDetails.forEach(createDependentEntry);
        return;
      }

      const storedAges = String(dependentAgesField?.value || "")
        .split(",")
        .map(function (value) {
          return String(value || "").trim();
        })
        .filter(Boolean);

      if (storedAges.length) {
        storedAges.forEach(createDependentEntry);
        return;
      }

      const fallbackCount = Number(dependentsCountField?.value || 0);
      for (let index = 0; index < fallbackCount; index += 1) {
        createDependentEntry("");
      }
    }

    function syncDependentsCountField() {
      if (!dependentsCountField && !dependentAgesField && !dependentDetailsField) {
        return;
      }

      const disableCount = String(hasDependentsField?.value || "No") !== "Yes";
      [dependentsCountField, dependentAgesField, dependentDetailsField].forEach(function (field) {
        if (field) {
          field.disabled = disableCount;
        }
      });

      addDependentButton?.closest(".field-group")?.classList.toggle("is-disabled", disableCount);
      if (disableCount && dependentList) {
        dependentList.innerHTML = "";
        syncDependentHiddenFields();
      }
      syncDependentBuilderDisabledState();
    }

    function setProjectedFieldDisabled(field, disabled, preserveValue) {
      if (!field) {
        return;
      }

      field.disabled = disabled;
      field.closest(".field-group")?.classList.toggle("is-disabled", disabled);
      if (disabled && !preserveValue) {
        if (field.tagName === "SELECT") {
          field.selectedIndex = 0;
        } else {
          field.value = "";
        }
      }
    }

    function syncProjectedDependentsFields() {
      const hasProjectedDependents = String(projectedDependentsField?.value || "No") === "Yes";

      if (!hasProjectedDependents) {
        setProjectedFieldDisabled(projectedDependentsCountField, true);
        return;
      }

      setProjectedFieldDisabled(projectedDependentsCountField, false);
    }

    function syncAcquisitionSourceField() {
      const isOther = String(acquisitionSourceField?.value || "") === "Other";
      if (!acquisitionSourceOtherField) {
        return;
      }

      acquisitionSourceOtherField.disabled = !isOther;
      acquisitionSourceOtherField.closest(".field-group")?.classList.toggle("is-disabled", !isOther);
      acquisitionSourceOtherField.required = isOther;
      if (!isOther) {
        acquisitionSourceOtherField.value = "";
      }
    }

    return {
      syncSpouseFields,
      syncDependentFieldsetState,
      syncEmploymentDetailFields,
      getDependentAgeValues,
      getDependentDetails,
      syncDependentHiddenFields,
      syncDependentEntryLabels,
      syncDependentBuilderDisabledState,
      removeDependentEntry,
      createDependentEntry,
      rebuildDependentEntriesFromStoredValue,
      syncDependentsCountField,
      setProjectedFieldDisabled,
      syncProjectedDependentsFields,
      syncAcquisitionSourceField
    };
  }

  function calculateAgeFromDate(value) {
    if (!value) {
      return 0;
    }

    const match = String(value).match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) {
      return 0;
    }

    const birthYear = Number(match[1]);
    const birthMonthIndex = Number(match[2]) - 1;
    const birthDay = Number(match[3]);
    if (!Number.isFinite(birthYear) || !Number.isFinite(birthMonthIndex) || !Number.isFinite(birthDay)) {
      return 0;
    }

    const today = new Date();
    let age = today.getFullYear() - birthYear;
    const monthDelta = today.getMonth() - birthMonthIndex;
    if (monthDelta < 0 || (monthDelta === 0 && today.getDate() < birthDay)) {
      age -= 1;
    }

    return Math.max(age, 0);
  }

  function normalizeDependentAgeText(value) {
    const normalized = String(value ?? "").trim();
    if (!normalized) {
      return "";
    }

    const numericAge = Number(normalized);
    if (!Number.isFinite(numericAge)) {
      return "";
    }

    return String(Math.max(Math.trunc(numericAge), 0));
  }

  function normalizeDependentDetailInput(value) {
    if (value && typeof value === "object") {
      const dateOfBirth = String(value.dateOfBirth || value.birthDate || "").trim();
      const ageText = dateOfBirth
        ? String(calculateAgeFromDate(dateOfBirth))
        : normalizeDependentAgeText(value.age ?? value.calculatedAge ?? value.ageText);

      return {
        id: String(value.id || "").trim(),
        dateOfBirth,
        age: ageText ? Number(ageText) : 0,
        ageText
      };
    }

    const ageText = normalizeDependentAgeText(value);
    return {
      id: "",
      dateOfBirth: "",
      age: ageText ? Number(ageText) : 0,
      ageText
    };
  }

  function toSavedDependentDetail(detail) {
    const normalized = normalizeDependentDetailInput(detail);
    return {
      id: normalized.id,
      dateOfBirth: normalized.dateOfBirth,
      age: normalized.ageText ? normalized.age : null
    };
  }

  function parseDependentDetailsValue(value) {
    const rawValue = String(value || "").trim();
    if (!rawValue) {
      return [];
    }

    try {
      const parsed = JSON.parse(rawValue);
      if (!Array.isArray(parsed)) {
        return [];
      }

      return parsed
        .map(normalizeDependentDetailInput)
        .filter(function (detail) {
          return detail.id || detail.dateOfBirth || detail.ageText;
        });
    } catch (error) {
      return [];
    }
  }

  function buildDependentDetailsFromAges(value) {
    return String(value || "")
      .split(",")
      .map(function (ageValue) {
        return normalizeDependentDetailInput(ageValue);
      })
      .filter(function (detail) {
        return detail.ageText;
      })
      .map(function (detail, index) {
        return {
          ...detail,
          id: detail.id || `dep-legacy-${index + 1}`
        };
      });
  }

  function formatPhoneNumberInput(value) {
    const digits = String(value || "").replace(/\D/g, "").slice(0, 10);
    if (!digits) {
      return "";
    }

    if (digits.length < 4) {
      return `(${digits}`;
    }

    if (digits.length < 7) {
      return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
    }

    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }

  function formatHouseholdDisplayName(value) {
    const trimmed = String(value || "").trim();
    if (!trimmed) {
      return "New Household";
    }

    return /household$/i.test(trimmed) ? trimmed : `${trimmed} Household`;
  }

  function formatCompanyDisplayName(value) {
    const trimmed = String(value || "").trim();
    if (!trimmed) {
      return "New Company Profile";
    }

    return trimmed;
  }

  function saveClientCreationForm(form, feedback) {
    const { getCurrentSession, getClientRecords, writeClientRecords, buildNextCaseRef, setLinkedCaseRef } = getClientRecordsApi();
    const { setFormFeedback } = getAuthApi();
    const { formatDateInputValue, mapClientStageToStatusGroup, deriveStatusLabels, normalizePriority } = getIntakeHelpers();
    const currentSession = getCurrentSession();
    const today = formatDateInputValue(new Date());

    setFormFeedback(feedback, "");

    if (!form.reportValidity()) {
      return false;
    }

    const formData = new FormData(form);
    const records = getClientRecords();
    const clientStage = String(formData.get("clientStatus") || "Prospect");
    const statusGroup = mapClientStageToStatusGroup(clientStage);
    const advisorySource = String(formData.get("acquisitionSource") || "").trim();
    const advisorySourceOther = String(formData.get("acquisitionSourceOther") || "").trim();
    const source = advisorySource === "Other" ? (advisorySourceOther || "Other") : (advisorySource || "Advisor Entered");
    const coverageAmount = 0;
    const coverageGap = 0;
    const priority = normalizePriority(String(formData.get("advisoryPriority") || ""));
    if (!priority) {
      setFormFeedback(feedback, "Select a priority before continuing.");
      return false;
    }
    const firstName = String(formData.get("firstName") || "").trim();
    const preferredName = String(formData.get("preferredName") || "").trim();
    const summary = String(formData.get("clientNotes") || "").trim() || "New client profile";
    const lastName = String(formData.get("lastName") || "").trim();
    const assignmentMode = String(formData.get("profileAssignmentMode") || "").trim();
    const assignmentTargetId = String(formData.get("profileAssignmentTargetId") || "").trim();
    const requestedAssignmentName = String(formData.get("profileAssignmentName") || "").trim();
    const advisorName = String(formData.get("advisorName") || "").trim() || currentSession?.name || "";
    const createdBy = currentSession?.name || "Advisor";
    const dateProfileCreated = String(formData.get("dateProfileCreated") || today);
    const lastUpdatedDate = String(formData.get("lastUpdatedDate") || today);
    const hasCurrentDependents = String(formData.get("hasDependents") || "No") === "Yes";
    const dependentAges = hasCurrentDependents ? String(formData.get("dependentAges") || "").trim() : "";
    const parsedDependentDetails = hasCurrentDependents
      ? parseDependentDetailsValue(formData.get("dependentDetails") || "")
      : [];
    const dependentDetails = (parsedDependentDetails.length
      ? parsedDependentDetails
      : buildDependentDetailsFromAges(dependentAges))
      .map(toSavedDependentDetail);
    const dependentsCount = hasCurrentDependents
      ? (dependentDetails.length || Number(formData.get("dependentsCount") || 0))
      : 0;
    let householdId = "";
    let householdName = "";
    let profileGroupType = "";
    let nextRecords = [...records];

    if (!assignmentMode) {
      setFormFeedback(feedback, "Select how this client should be assigned before continuing.");
      return false;
    }

    if (assignmentMode === "existing-household" || assignmentMode === "existing-company") {
      const expectedType = assignmentMode === "existing-company" ? "companies" : "households";
      const existingProfile = nextRecords.find((record) => record.id === assignmentTargetId && record.viewType === expectedType);
      if (!existingProfile) {
          setFormFeedback(feedback, expectedType === "companies" ? "Select a valid business profile before saving." : "Select a valid household before saving.");
        return false;
      }

      householdId = existingProfile.id;
      householdName = existingProfile.displayName;
      profileGroupType = expectedType === "companies" ? "company" : "household";
      nextRecords = nextRecords.map((record) => {
        if (record.id !== existingProfile.id) {
          return record;
        }

        const currentCount = Number(record.insured || 0);
        const nextCount = Number.isFinite(currentCount) ? currentCount + 1 : 1;
        return {
          ...record,
          insured: String(nextCount),
          lastReview: lastUpdatedDate,
          statusGroup,
          priority,
          source,
          lastUpdatedDate
        };
      });
    } else if (assignmentMode === "create-household" || assignmentMode === "create-company") {
      if (!requestedAssignmentName) {
        setFormFeedback(feedback, assignmentMode === "create-company"
          ? "Enter a company profile name before saving."
          : "Enter a household name before saving.");
        return false;
      }

      const isCompany = assignmentMode === "create-company";
      householdName = isCompany ? formatCompanyDisplayName(requestedAssignmentName) : formatHouseholdDisplayName(requestedAssignmentName || lastName || firstName);
      householdId = `${isCompany ? "co" : "hh"}-${Date.now()}`;
      profileGroupType = isCompany ? "company" : "household";
      const groupRecord = {
        id: householdId,
        viewType: isCompany ? "companies" : "households",
        displayName: householdName,
        lastName,
        summary: isCompany ? "Business profile" : "Household profile",
        caseRef: buildNextCaseRef(nextRecords, isCompany ? "CL" : "HH"),
        lastReview: lastUpdatedDate,
        insured: "1",
        source,
        statusGroup,
        statusLabels: deriveStatusLabels(statusGroup, isCompany ? "company" : "household"),
        priority,
        coverageAmount,
        coverageGap,
        advisorName,
        createdBy,
        dateProfileCreated,
        lastUpdatedDate,
        householdId,
        dataSource: source
      };
      nextRecords.unshift(groupRecord);
    } else {
      setFormFeedback(feedback, "Choose how this client should be assigned before saving.");
      return false;
    }

    const record = {
      id: `cl-${Date.now()}`,
      viewType: "individuals",
      displayName: `${preferredName || firstName} ${lastName}`.trim(),
      firstName,
      middleName: String(formData.get("middleName") || "").trim(),
      lastName,
      preferredName,
      summary,
      caseRef: buildNextCaseRef(nextRecords, "CL"),
      lastReview: lastUpdatedDate,
      insured: "Yes",
      source,
      statusGroup,
      statusLabels: deriveStatusLabels(statusGroup, "individual"),
      priority,
      coverageAmount,
      coverageGap,
      householdId,
      householdName,
      profileGroupType,
      dateOfBirth: String(formData.get("dateOfBirth") || ""),
      age: Number(formData.get("age") || 0),
      insuranceRatingSex: String(formData.get("insuranceRatingSex") || ""),
      maritalStatus: String(formData.get("maritalStatus") || ""),
      spouseDateOfBirth: String(formData.get("spouseDateOfBirth") || ""),
      spouseAge: Number(formData.get("spouseAge") || 0),
      householdRole: String(formData.get("householdRole") || ""),
      businessType: String(formData.get("businessType") || ""),
      businessPlanningFocus: String(formData.get("businessPlanningFocus") || ""),
      ownershipPercent: Number(formData.get("ownershipPercent") || 0),
      businessCoverageRelevance: String(formData.get("businessCoverageRelevance") || ""),
      hasDependents: hasCurrentDependents ? "Yes" : "No",
      projectedDependents: String(formData.get("projectedDependents") || "No"),
      projectedDependentsCount: Number(formData.get("projectedDependentsCount") || 0),
      dependentsCount,
      dependentAges,
      dependentDetails,
      emailAddress: String(formData.get("emailAddress") || "").trim(),
      phoneNumber: String(formData.get("phoneNumber") || "").trim(),
      preferredContactMethod: String(formData.get("preferredContactMethod") || ""),
      streetAddress: String(formData.get("streetAddress") || "").trim(),
      city: String(formData.get("city") || "").trim(),
      state: String(formData.get("state") || "").trim(),
      zipCode: String(formData.get("zipCode") || "").trim(),
      country: String(formData.get("country") || "").trim(),
      occupation: String(formData.get("occupation") || "").trim(),
      employerName: String(formData.get("employerName") || "").trim(),
      employmentStatus: String(formData.get("employmentStatus") || ""),
      advisorName,
      firmName: String(formData.get("firmName") || "").trim(),
      dateProfileCreated,
      lastUpdatedDate,
      createdBy,
      dataSource: source,
      planningPriority: "",
      clientStage,
      clientNotes: String(formData.get("clientNotes") || "").trim()
    };

    nextRecords.unshift(record);
    writeClientRecords(nextRecords);
    sessionStorage.setItem(STORAGE_KEYS.pendingClientRecords, JSON.stringify([record]));
    setLinkedCaseRef(record.caseRef);
    sessionStorage.setItem(STORAGE_KEYS.clientViewIntent, "individuals");
    sessionStorage.setItem(STORAGE_KEYS.clientView, "individuals");
    sessionStorage.setItem(STORAGE_KEYS.clientStatus, "all");
    window.location.href = "clients.html";
    return true;
  }

  LensApp.clientIntake = Object.assign(LensApp.clientIntake || {}, {
    initializeClientCreationForm,
    createSharedProfileFormBehavior,
    saveClientCreationForm,
    calculateAgeFromDate,
    formatPhoneNumberInput,
    formatHouseholdDisplayName,
    formatCompanyDisplayName
  });
})();
