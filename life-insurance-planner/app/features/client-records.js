(function () {
  const LensApp = window.LensApp || (window.LensApp = {});
  const { STORAGE_KEYS, DEFAULT_CLIENT_RECORDS } = LensApp.config || {};
  const { loadJson, loadJsonSession } = LensApp.storage || {};

  function getRecordHelpers() {
    return LensApp.clientRecordHelpers || {};
  }

  function ensureClientRecords() {
    const storageKey = getClientRecordsStorageKey();
    if (!localStorage.getItem(storageKey)) {
      const legacyRecords = loadJson(STORAGE_KEYS.clientRecords);
      const initialRecords = Array.isArray(legacyRecords)
        ? legacyRecords
        : (getStorageIdentity() === "guest" ? DEFAULT_CLIENT_RECORDS : []);
      writeClientRecords(initialRecords);

      if (Array.isArray(legacyRecords)) {
        localStorage.removeItem(STORAGE_KEYS.clientRecords);
      }
      return;
    }

    const records = loadJson(storageKey);
    if (!Array.isArray(records)) {
      writeClientRecords(getStorageIdentity() === "guest" ? DEFAULT_CLIENT_RECORDS : []);
      return;
    }

    const normalizedRecords = normalizeClientRecords(records);

    if (JSON.stringify(records) !== JSON.stringify(normalizedRecords)) {
      writeClientRecords(normalizedRecords);
    }
  }

  function getClientRecords() {
    ensureClientRecords();
    return loadJson(getClientRecordsStorageKey()) || [];
  }

  function mergePendingClientRecords() {
    const pendingRecords = loadJsonSession(STORAGE_KEYS.pendingClientRecords);
    if (!Array.isArray(pendingRecords) || !pendingRecords.length) {
      return;
    }

    const existingRecords = getClientRecords();
    const existingIds = new Set(existingRecords.map((record) => record.id));
    const mergedRecords = [
      ...pendingRecords.filter((record) => record && !existingIds.has(record.id)),
      ...existingRecords
    ];

    writeClientRecords(mergedRecords);
    sessionStorage.removeItem(STORAGE_KEYS.pendingClientRecords);
  }

  function writeClientRecords(records) {
    localStorage.setItem(getClientRecordsStorageKey(), JSON.stringify(normalizeClientRecords(records)));
  }

  function normalizeDependentCountValue(value) {
    const numericValue = Number(value);
    if (!Number.isFinite(numericValue)) {
      return 0;
    }

    return Math.max(0, Math.round(numericValue));
  }

  function getStructuredDependentCount(value) {
    if (Array.isArray(value)) {
      return {
        hasStructuredDetails: true,
        count: value.length
      };
    }

    if (typeof value !== "string") {
      return {
        hasStructuredDetails: false,
        count: 0
      };
    }

    const normalizedValue = value.trim();
    if (!normalizedValue) {
      return {
        hasStructuredDetails: false,
        count: 0
      };
    }

    try {
      const parsedValue = JSON.parse(normalizedValue);
      if (!Array.isArray(parsedValue)) {
        return {
          hasStructuredDetails: false,
          count: 0
        };
      }

      return {
        hasStructuredDetails: true,
        count: parsedValue.length
      };
    } catch (_error) {
      return {
        hasStructuredDetails: false,
        count: 0
      };
    }
  }

  function getCurrentDependentCount(record) {
    const structuredCount = getStructuredDependentCount(record?.dependentDetails);
    if (structuredCount.hasStructuredDetails) {
      return normalizeDependentCountValue(structuredCount.count);
    }

    return normalizeDependentCountValue(record?.dependentsCount);
  }

  function normalizeClientRecords(records) {
    const {
      normalizeLifecycleStatusGroup,
      parseMoneyValue,
      normalizePriority,
      formatDateInputValue
    } = getRecordHelpers();

    return records
      .filter((record) => record && typeof record === "object")
      .map((record, index) => {
        const nextRecord = { ...record };
        delete nextRecord.isFlagged;
        const preferredName = String(record.preferredName || "").trim();
        const firstName = String(record.firstName || "").trim();
        const lastName = String(record.lastName || "").trim();
        const displayName = String(record.displayName || "").trim()
          || `${preferredName || firstName} ${lastName}`.trim()
          || `Client ${index + 1}`;
        const viewType = ["individuals", "households", "companies"].includes(String(record.viewType || ""))
          ? String(record.viewType)
          : "individuals";
        const normalizedStatusGroup = normalizeLifecycleStatusGroup(record.statusGroup);
        const statusGroup = normalizedStatusGroup === "placed"
          ? "coverage-placed"
          : normalizedStatusGroup === "underwriting"
            ? "in-review"
            : normalizedStatusGroup === "prospecting" || normalizedStatusGroup === "in-progress"
              ? "prospects"
              : ["prospects", "in-review", "coverage-placed", "closed"].includes(normalizedStatusGroup)
                ? normalizedStatusGroup
                : "prospects";
        const currentCoverage = Math.max(
          0,
          parseMoneyValue(record.currentCoverage),
          parseMoneyValue(record.coverageAmount)
        );
        const modeledNeed = Math.max(
          0,
          parseMoneyValue(record.modeledNeed),
          parseMoneyValue(record.coverageGap)
        );
        const hasExplicitCoverageFields = Object.prototype.hasOwnProperty.call(record, "currentCoverage")
          || Object.prototype.hasOwnProperty.call(record, "modeledNeed");
        const uncoveredGap = hasExplicitCoverageFields
          ? Math.max(0, modeledNeed - currentCoverage)
          : Math.max(
            0,
            parseMoneyValue(record.uncoveredGap),
            modeledNeed - currentCoverage
          );

        return {
          ...nextRecord,
          id: String(record.id || `cl-normalized-${index}`),
          viewType,
          displayName,
          firstName,
          lastName,
          summary: String(record.summary || record.clientNotes || "New client profile"),
          caseRef: normalizeRecordCaseRef(viewType, record.caseRef, index),
          lastReview: String(record.lastReview || record.lastUpdatedDate || record.dateProfileCreated || formatDateInputValue(new Date())),
          dateProfileCreated: String(record.dateProfileCreated || record.lastReview || record.lastUpdatedDate || formatDateInputValue(new Date())),
          insured: String(record.insured || (viewType === "individuals" ? "Yes" : "1")),
          source: String(record.source || record.dataSource || "Advisor Entered"),
          statusGroup,
          priority: normalizePriority(record.priority),
          currentCoverage,
          modeledNeed,
          uncoveredGap,
          coverageAmount: currentCoverage,
          coverageGap: modeledNeed,
          policyCount: Number(record.policyCount || 0)
        };
      });
  }

  function getClientRecordsStorageKey() {
    return `${STORAGE_KEYS.clientRecords}:${getStorageIdentity()}`;
  }

  function getStorageIdentity() {
    const session = getCurrentSession();
    return session?.email ? String(session.email).trim().toLowerCase() : "guest";
  }

  function getCurrentSession() {
    return loadJson(STORAGE_KEYS.authSession);
  }

  function buildNextCaseRef(records, prefix) {
    const normalizedPrefix = String(prefix || "CL").trim().toUpperCase();
    const highestNumber = records.reduce((highest, record) => {
      const match = String(record.caseRef || "").match(new RegExp(`${normalizedPrefix}/(\\d+)`));
      return match ? Math.max(highest, Number(match[1])) : highest;
    }, 80400);

    return `${normalizedPrefix}/${highestNumber + 1}`;
  }

  function normalizeCaseRef(value) {
    return String(value || "").trim().toUpperCase();
  }

  function normalizeRecordCaseRef(viewType, caseRef, index) {
    const normalizedViewType = String(viewType || "").trim();
    const normalizedCaseRef = normalizeCaseRef(caseRef);

    if (normalizedViewType === "households") {
      const householdMatch = normalizedCaseRef.match(/(?:HH|CL)\/(\d+)/);
      if (householdMatch) {
        return `HH/${householdMatch[1]}`;
      }
      return `HH/${80401 + index}`;
    }

    if (!normalizedCaseRef) {
      return `CL/${80401 + index}`;
    }

    return normalizedCaseRef;
  }

  function setLinkedCaseRef(caseRef) {
    const normalized = normalizeCaseRef(caseRef);
    if (!normalized) {
      sessionStorage.removeItem(STORAGE_KEYS.linkedCaseRef);
      return "";
    }

    sessionStorage.setItem(STORAGE_KEYS.linkedCaseRef, normalized);
    return normalized;
  }

  function getLinkedCaseRef() {
    return normalizeCaseRef(sessionStorage.getItem(STORAGE_KEYS.linkedCaseRef));
  }

  function setLinkedRecordId(recordId) {
    const normalized = String(recordId || "").trim();
    if (!normalized) {
      sessionStorage.removeItem(STORAGE_KEYS.linkedRecordId);
      return "";
    }

    sessionStorage.setItem(STORAGE_KEYS.linkedRecordId, normalized);
    return normalized;
  }

  function getLinkedRecordId() {
    return String(sessionStorage.getItem(STORAGE_KEYS.linkedRecordId) || "").trim();
  }

  function getClientRecordByReference(recordId, caseRef) {
    const normalizedId = String(recordId || "").trim();
    const normalizedCaseRef = normalizeCaseRef(caseRef);
    const records = getClientRecords();

    if (normalizedId) {
      const matchedById = records.find((record) => String(record?.id || "").trim() === normalizedId);
      if (matchedById) {
        if (!normalizedCaseRef || normalizeCaseRef(matchedById.caseRef) === normalizedCaseRef) {
          return matchedById;
        }
      }
    }

    if (normalizedCaseRef) {
      return records.find((record) => normalizeCaseRef(record?.caseRef) === normalizedCaseRef) || null;
    }

    return null;
  }

  function findLinkableIndividualClientByCaseRef(caseRef) {
    const normalizedCaseRef = normalizeCaseRef(caseRef);
    if (!normalizedCaseRef) {
      return null;
    }

    return getClientRecords().find((record) => (
      String(record?.viewType || "").trim() === "individuals"
      && normalizeCaseRef(record?.caseRef) === normalizedCaseRef
    )) || null;
  }

  function getLinkableIndividualClientRecords(query) {
    const normalizedQuery = String(query || "").trim().toLowerCase();

    return getClientRecords()
      .filter((record) => (
        String(record?.viewType || "").trim() === "individuals"
        && normalizeCaseRef(record?.caseRef)
      ))
      .filter((record) => {
        const displayName = String(record?.displayName || "").toLowerCase();
        const caseRef = String(record?.caseRef || "").toLowerCase();
        const summary = String(record?.summary || "").toLowerCase();
        return !normalizedQuery
          || displayName.includes(normalizedQuery)
          || caseRef.includes(normalizedQuery)
          || summary.includes(normalizedQuery);
      })
      .sort((left, right) => String(left?.displayName || "").localeCompare(String(right?.displayName || "")));
  }

  function getCurrentLinkedRecord(caseRefOverride, recordIdOverride) {
    const resolvedRecordId = String(recordIdOverride || "").trim() || getLinkedRecordId();
    const resolvedCaseRef = normalizeCaseRef(caseRefOverride) || getLinkedCaseRef();
    return getClientRecordByReference(resolvedRecordId, resolvedCaseRef);
  }

  function updateClientRecordByCaseRef(caseRef, updater) {
    const normalizedCaseRef = normalizeCaseRef(caseRef);
    if (!normalizedCaseRef || typeof updater !== "function") {
      return null;
    }

    const records = getClientRecords();
    const recordIndex = records.findIndex((record) => normalizeCaseRef(record.caseRef) === normalizedCaseRef);

    if (recordIndex < 0) {
      return null;
    }

    const currentRecord = records[recordIndex];
    const updatedRecord = updater({
      ...currentRecord
    });

    if (!updatedRecord || typeof updatedRecord !== "object") {
      return null;
    }

    const nextRecords = [...records];
    nextRecords[recordIndex] = updatedRecord;
    writeClientRecords(nextRecords);
    return nextRecords[recordIndex];
  }

  LensApp.clientRecords = Object.assign(LensApp.clientRecords || {}, {
    ensureClientRecords,
    getClientRecords,
    mergePendingClientRecords,
    writeClientRecords,
    normalizeClientRecords,
    getCurrentDependentCount,
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
    findLinkableIndividualClientByCaseRef,
    getLinkableIndividualClientRecords,
    getCurrentLinkedRecord,
    updateClientRecordByCaseRef
  });
})();
