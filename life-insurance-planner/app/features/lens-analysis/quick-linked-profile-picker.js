(function () {
  const LensApp = window.LensApp || (window.LensApp = {});
  const lensAnalysis = LensApp.lensAnalysis || (LensApp.lensAnalysis = {});
  const DEFAULT_ALLOWED_QUERY_KEYS = ["caseRef", "profileCaseRef", "linkedCaseRef", "id"];

  function toTrimmedString(value) {
    return String(value || "").trim();
  }

  function getClientRecordsApi() {
    return LensApp.clientRecords || {};
  }

  function normalizeCaseRef(value, clientRecordsApi) {
    if (typeof clientRecordsApi.normalizeCaseRef === "function") {
      return clientRecordsApi.normalizeCaseRef(value);
    }

    return toTrimmedString(value).toUpperCase();
  }

  function getConfiguredElement(rootElement, selector) {
    if (!selector) {
      return null;
    }

    return rootElement.querySelector(selector) || document.querySelector(selector);
  }

  function getConfiguredElements(rootElement, selector) {
    if (!selector) {
      return [];
    }

    const scopedElements = Array.from(rootElement.querySelectorAll(selector));
    const documentElements = Array.from(document.querySelectorAll(selector));
    return Array.from(new Set(scopedElements.concat(documentElements)));
  }

  function getParamValue(params, keys) {
    for (const key of keys) {
      const value = toTrimmedString(params.get(key));
      if (value) {
        return value;
      }
    }

    return "";
  }

  function buildPreservedQueryParams(sourceParams, allowedQueryKeys) {
    const nextParams = new URLSearchParams();

    allowedQueryKeys.forEach(function (key) {
      const value = toTrimmedString(sourceParams.get(key));
      if (value) {
        nextParams.set(key, value);
      }
    });

    return nextParams;
  }

  function getCompletedProtectionModelingPayload(record) {
    if (!record || typeof record !== "object") {
      return null;
    }

    // Kept local until all linked-profile pickers share a validation helper.
    const latestPayload = (function () {
      if (record.protectionModeling && typeof record.protectionModeling === "object") {
        return record.protectionModeling;
      }

      if (Array.isArray(record.protectionModelingEntries) && record.protectionModelingEntries.length) {
        return record.protectionModelingEntries[record.protectionModelingEntries.length - 1];
      }

      return null;
    })();

    if (!latestPayload || typeof latestPayload !== "object") {
      return null;
    }

    if (record.pmiCompleted === true || latestPayload.completed === true) {
      return latestPayload;
    }

    return null;
  }

  function isLinkableIndividualRecord(record, clientRecordsApi) {
    return Boolean(
      record
      && typeof record === "object"
      && String(record.viewType || "").trim() === "individuals"
      && normalizeCaseRef(record.caseRef, clientRecordsApi)
    );
  }

  function getDisplayName(record) {
    return toTrimmedString(record?.displayName)
      || `${toTrimmedString(record?.firstName)} ${toTrimmedString(record?.lastName)}`.trim()
      || "Selected client";
  }

  function setStatus(statusElement, message, tone) {
    if (!statusElement) {
      return;
    }

    statusElement.textContent = message || "";
    statusElement.dataset.quickProfileStatus = tone || "neutral";
    statusElement.classList.toggle("is-error", tone === "error");
    statusElement.classList.toggle("is-success", tone === "success");
  }

  function setContinueLinksEnabled(links, isEnabled) {
    links.forEach(function (link) {
      link.classList.toggle("is-disabled", !isEnabled);
      link.setAttribute("aria-disabled", isEnabled ? "false" : "true");

      if (isEnabled) {
        link.removeAttribute("data-quick-profile-blocked");
        link.removeAttribute("tabindex");
      } else {
        link.setAttribute("data-quick-profile-blocked", "true");
        link.setAttribute("tabindex", "-1");
      }
    });
  }

  function initQuickLinkedProfilePicker(config) {
    const clientRecordsApi = getClientRecordsApi();
    const rootElement = config?.rootElement
      || (config?.rootSelector ? document.querySelector(config.rootSelector) : null)
      || document.querySelector("[data-quick-linked-profile-picker]");

    if (!rootElement || rootElement.dataset.quickLinkedProfilePickerInitialized === "true") {
      return null;
    }

    rootElement.dataset.quickLinkedProfilePickerInitialized = "true";

    const methodLabel = toTrimmedString(config?.methodLabel) || "Quick Analysis";
    const resultPagePath = toTrimmedString(config?.resultPagePath) || "analysis-results.html";
    const allowedQueryKeys = Array.isArray(config?.allowedQueryKeys) && config.allowedQueryKeys.length
      ? config.allowedQueryKeys.map(toTrimmedString).filter(Boolean)
      : DEFAULT_ALLOWED_QUERY_KEYS.slice();
    const sourceParams = new URLSearchParams(window.location.search);

    const searchInput = getConfiguredElement(rootElement, config?.searchInputSelector || "[data-quick-profile-search]");
    const caseRefInput = getConfiguredElement(rootElement, config?.caseRefInputSelector || "[data-quick-profile-case-ref]");
    const resultsElement = getConfiguredElement(rootElement, config?.resultsSelector || "[data-quick-profile-results]");
    const statusElement = getConfiguredElement(rootElement, config?.statusSelector || "[data-quick-profile-status]");
    const selectedCard = getConfiguredElement(rootElement, config?.selectedClientCardSelector || "[data-quick-profile-selected-card]");
    const selectedName = getConfiguredElement(rootElement, config?.selectedNameSelector || "[data-quick-profile-selected-name]");
    const selectedCaseRef = getConfiguredElement(rootElement, config?.selectedCaseRefSelector || "[data-quick-profile-selected-case-ref]");
    const selectedStatus = getConfiguredElement(rootElement, config?.selectedStatusSelector || "[data-quick-profile-selected-status]");
    const clearButtons = getConfiguredElements(rootElement, config?.clearSelector || "[data-quick-profile-clear]");
    const continueLinks = getConfiguredElements(rootElement, config?.continueLinkSelector || "[data-quick-profile-continue]");

    let selectedRecord = null;
    let selectedProtectionModelingPayload = null;

    function buildResultHref(record) {
      const nextParams = buildPreservedQueryParams(sourceParams, allowedQueryKeys);
      const normalizedCaseRef = normalizeCaseRef(record?.caseRef, clientRecordsApi);
      const recordId = toTrimmedString(record?.id);

      if (normalizedCaseRef) {
        if (allowedQueryKeys.includes("caseRef")) {
          nextParams.set("caseRef", normalizedCaseRef);
        }
        if (allowedQueryKeys.includes("linkedCaseRef")) {
          nextParams.set("linkedCaseRef", normalizedCaseRef);
        }
      }

      if (recordId && allowedQueryKeys.includes("id")) {
        nextParams.set("id", recordId);
      }

      const queryString = nextParams.toString();
      return queryString ? `${resultPagePath}?${queryString}` : resultPagePath;
    }

    function syncContinueLinks() {
      const isEnabled = Boolean(selectedRecord && selectedProtectionModelingPayload);
      continueLinks.forEach(function (link) {
        link.setAttribute("href", isEnabled ? buildResultHref(selectedRecord) : resultPagePath);
      });
      setContinueLinksEnabled(continueLinks, isEnabled);
    }

    function renderSelectedCard() {
      if (!selectedCard) {
        return;
      }

      if (!selectedRecord) {
        selectedCard.hidden = true;
        if (selectedName) {
          selectedName.textContent = "Not linked";
        }
        if (selectedCaseRef) {
          selectedCaseRef.textContent = "Pending";
        }
        if (selectedStatus) {
          selectedStatus.textContent = "Pending";
        }
        return;
      }

      selectedCard.hidden = false;
      if (selectedName) {
        selectedName.textContent = getDisplayName(selectedRecord);
      }
      if (selectedCaseRef) {
        selectedCaseRef.textContent = normalizeCaseRef(selectedRecord.caseRef, clientRecordsApi) || "Pending";
      }
      if (selectedStatus) {
        selectedStatus.textContent = toTrimmedString(selectedRecord.statusGroup) || "Pending";
      }
    }

    function clearSelection(message, tone) {
      selectedRecord = null;
      selectedProtectionModelingPayload = null;
      if (typeof clientRecordsApi.setLinkedCaseRef === "function") {
        clientRecordsApi.setLinkedCaseRef("");
      }
      if (typeof clientRecordsApi.setLinkedRecordId === "function") {
        clientRecordsApi.setLinkedRecordId("");
      }
      renderSelectedCard();
      syncContinueLinks();
      setStatus(
        statusElement,
        message || `Select a client with completed Protection Modeling Inputs to continue to ${methodLabel}.`,
        tone || "neutral"
      );
    }

    function selectRecord(record, options) {
      const shouldUpdateCaseRefInput = options?.updateCaseRefInput !== false;
      const nextRecord = isLinkableIndividualRecord(record, clientRecordsApi) ? record : null;

      if (!nextRecord) {
        clearSelection("Select a valid linked client to continue.", "error");
        return false;
      }

      const completedPayload = getCompletedProtectionModelingPayload(nextRecord);
      if (!completedPayload) {
        if (shouldUpdateCaseRefInput && caseRefInput) {
          caseRefInput.value = "";
        }
        clearSelection(
          `${getDisplayName(nextRecord)} needs completed Protection Modeling Inputs before ${methodLabel} can continue.`,
          "error"
        );
        return false;
      }

      selectedRecord = nextRecord;
      selectedProtectionModelingPayload = completedPayload;

      if (shouldUpdateCaseRefInput && caseRefInput) {
        caseRefInput.value = normalizeCaseRef(nextRecord.caseRef, clientRecordsApi);
      }
      if (typeof clientRecordsApi.setLinkedCaseRef === "function") {
        clientRecordsApi.setLinkedCaseRef(nextRecord.caseRef);
      }
      if (typeof clientRecordsApi.setLinkedRecordId === "function") {
        clientRecordsApi.setLinkedRecordId(toTrimmedString(nextRecord.id));
      }

      renderSelectedCard();
      syncContinueLinks();
      setStatus(statusElement, `${getDisplayName(nextRecord)} is linked for ${methodLabel}.`, "success");
      return true;
    }

    function renderSearchResults() {
      if (!resultsElement || typeof clientRecordsApi.getLinkableIndividualClientRecords !== "function") {
        return;
      }

      const query = toTrimmedString(searchInput?.value);
      const records = clientRecordsApi.getLinkableIndividualClientRecords(query).slice(0, 8);
      resultsElement.innerHTML = "";

      if (!records.length) {
        const emptyState = document.createElement("div");
        emptyState.className = "profile-search-results-empty";
        emptyState.textContent = query
          ? "No matching individual client profiles found."
          : "No linkable individual client profiles are available yet.";
        resultsElement.appendChild(emptyState);
        return;
      }

      records.forEach(function (record) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "profile-search-result-button";
        button.textContent = `${getDisplayName(record)} - ${normalizeCaseRef(record.caseRef, clientRecordsApi)}`;
        button.addEventListener("click", function () {
          selectRecord(record);
        });
        resultsElement.appendChild(button);
      });
    }

    function resolveCaseRefInput() {
      if (!caseRefInput || typeof clientRecordsApi.findLinkableIndividualClientByCaseRef !== "function") {
        return;
      }

      caseRefInput.value = normalizeCaseRef(caseRefInput.value, clientRecordsApi);
      const normalizedCaseRef = normalizeCaseRef(caseRefInput.value, clientRecordsApi);
      if (!normalizedCaseRef) {
        clearSelection();
        return;
      }

      const matchedRecord = clientRecordsApi.findLinkableIndividualClientByCaseRef(normalizedCaseRef);
      if (!matchedRecord) {
        clearSelection("No linkable individual client was found for that case reference.", "error");
        return;
      }

      selectRecord(matchedRecord, { updateCaseRefInput: false });
    }

    function getInitialRecord() {
      const urlCaseRef = getParamValue(sourceParams, ["caseRef", "profileCaseRef", "linkedCaseRef"]);
      const urlRecordId = getParamValue(sourceParams, ["id"]);

      if (typeof clientRecordsApi.getClientRecordByReference === "function") {
        const referencedRecord = clientRecordsApi.getClientRecordByReference(urlRecordId, urlCaseRef);
        if (referencedRecord) {
          return referencedRecord;
        }
      }

      if (typeof clientRecordsApi.getCurrentLinkedRecord === "function") {
        return clientRecordsApi.getCurrentLinkedRecord(urlCaseRef, urlRecordId);
      }

      return null;
    }

    continueLinks.forEach(function (link) {
      link.addEventListener("click", function (event) {
        if (selectedRecord && selectedProtectionModelingPayload) {
          return;
        }

        event.preventDefault();
        clearSelection(
          `Select a client with completed Protection Modeling Inputs before continuing to ${methodLabel} results.`,
          "error"
        );
      });
    });

    if (searchInput) {
      searchInput.addEventListener("input", renderSearchResults);
    }

    if (caseRefInput) {
      caseRefInput.addEventListener("input", resolveCaseRefInput);
      caseRefInput.addEventListener("change", resolveCaseRefInput);
    }

    clearButtons.forEach(function (button) {
      button.addEventListener("click", function () {
        if (searchInput) {
          searchInput.value = "";
        }
        if (caseRefInput) {
          caseRefInput.value = "";
        }
        clearSelection();
        renderSearchResults();
      });
    });

    syncContinueLinks();
    renderSearchResults();

    const initialRecord = getInitialRecord();
    if (initialRecord) {
      selectRecord(initialRecord);
    } else {
      clearSelection();
    }

    return {
      refresh: renderSearchResults,
      clear: clearSelection,
      getSelectedRecord: function () {
        return selectedRecord;
      }
    };
  }

  lensAnalysis.initQuickLinkedProfilePicker = initQuickLinkedProfilePicker;
})();
