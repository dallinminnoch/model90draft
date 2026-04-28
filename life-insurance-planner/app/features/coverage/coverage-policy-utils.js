(function (globalScope) {
  const root = globalScope || {};
  const LensApp = root.LensApp || (root.LensApp = {});
  const coverage = LensApp.coverage || (LensApp.coverage = {});

  // Owner: coverage feature utilities.
  // Purpose: normalize and summarize profile coverage policy records without
  // depending on a specific page, DOM, modal, profile shell, or save flow.
  // Non-goals: no UI rendering, no persistence, no document storage, no PMI or
  // Lens normalization wiring.

  const COVERAGE_SOURCE_INDIVIDUAL = "individual";
  const COVERAGE_SOURCE_GROUP_EMPLOYER = "groupEmployer";
  const COVERAGE_SOURCE_OTHER_UNKNOWN = "otherUnknown";
  const COVERAGE_CLASSIFICATION_UNCLASSIFIED = "unclassified";

  function toTrimmedString(value) {
    return String(value == null ? "" : value).trim();
  }

  function normalizeCoverageCurrencyValue(value) {
    const normalized = toTrimmedString(value).replace(/[^0-9.]/g, "");
    const firstDot = normalized.indexOf(".");
    const cleaned = firstDot === -1
      ? normalized
      : `${normalized.slice(0, firstDot + 1)}${normalized.slice(firstDot + 1).replace(/\./g, "")}`;

    if (!cleaned) {
      return "";
    }

    const numericValue = Number(cleaned);
    return Number.isFinite(numericValue) ? numericValue.toFixed(2) : "";
  }

  function parseCoverageCurrencyNumber(value) {
    const normalized = normalizeCoverageCurrencyValue(value);
    return normalized ? Number(normalized) : 0;
  }

  function normalizeCoverageSource(value) {
    const normalized = toTrimmedString(value)
      .replace(/[\s_-]+/g, "")
      .toLowerCase();

    if (!normalized) {
      return "";
    }

    if (normalized === "individual" || normalized === "individualpolicy") {
      return COVERAGE_SOURCE_INDIVIDUAL;
    }

    if (
      normalized === "group"
      || normalized === "grouplife"
      || normalized === "groupemployer"
      || normalized === "employer"
      || normalized === "employerprovided"
    ) {
      return COVERAGE_SOURCE_GROUP_EMPLOYER;
    }

    if (
      normalized === "other"
      || normalized === "unknown"
      || normalized === "otherunknown"
      || normalized === "unclassified"
    ) {
      return COVERAGE_SOURCE_OTHER_UNKNOWN;
    }

    return "";
  }

  function hasOwnValue(source, key) {
    return Boolean(source && typeof source === "object" && Object.prototype.hasOwnProperty.call(source, key));
  }

  function pickPolicyValue(input, existingPolicy, key, fallbackKey) {
    if (hasOwnValue(input, key)) {
      return input[key];
    }

    if (fallbackKey && hasOwnValue(input, fallbackKey)) {
      return input[fallbackKey];
    }

    if (hasOwnValue(existingPolicy, key)) {
      return existingPolicy[key];
    }

    if (fallbackKey && hasOwnValue(existingPolicy, fallbackKey)) {
      return existingPolicy[fallbackKey];
    }

    return "";
  }

  function getCoverageDeathBenefitAmount(policy) {
    const source = policy && typeof policy === "object" ? policy : {};
    const amount = parseCoverageCurrencyNumber(
      source.faceAmount != null && source.faceAmount !== ""
        ? source.faceAmount
        : source.deathBenefitAmount
    );
    return amount > 0 ? amount : 0;
  }

  function isGroupPolicyType(policyType) {
    return /group\s*life/i.test(toTrimmedString(policyType));
  }

  function classifyCoveragePolicy(policy) {
    const source = policy && typeof policy === "object" ? policy : {};
    const explicitSource = normalizeCoverageSource(source.coverageSource);
    const policyType = toTrimmedString(source.policyType);
    const entryMode = toTrimmedString(source.entryMode).toLowerCase();

    if (explicitSource === COVERAGE_SOURCE_INDIVIDUAL) {
      return COVERAGE_SOURCE_INDIVIDUAL;
    }

    if (explicitSource === COVERAGE_SOURCE_GROUP_EMPLOYER) {
      return COVERAGE_SOURCE_GROUP_EMPLOYER;
    }

    if (explicitSource === COVERAGE_SOURCE_OTHER_UNKNOWN) {
      return COVERAGE_CLASSIFICATION_UNCLASSIFIED;
    }

    if (isGroupPolicyType(policyType)) {
      return COVERAGE_SOURCE_GROUP_EMPLOYER;
    }

    if (entryMode === "simple" || !policyType) {
      return COVERAGE_CLASSIFICATION_UNCLASSIFIED;
    }

    return COVERAGE_SOURCE_INDIVIDUAL;
  }

  function getCoverageSourceForPolicy(policy) {
    const classification = classifyCoveragePolicy(policy);
    if (classification === COVERAGE_CLASSIFICATION_UNCLASSIFIED) {
      return COVERAGE_SOURCE_OTHER_UNKNOWN;
    }
    return classification;
  }

  function normalizeDocumentEntries(policy) {
    const source = policy && typeof policy === "object" ? policy : {};
    if (Array.isArray(source.documents)) {
      return source.documents
        .filter(function (documentEntry) {
          return documentEntry && typeof documentEntry === "object";
        })
        .map(function (documentEntry) {
          return {
            ...documentEntry,
            name: toTrimmedString(documentEntry.name),
            type: toTrimmedString(documentEntry.type),
            size: Number(documentEntry.size || 0),
            savedAt: toTrimmedString(documentEntry.savedAt)
          };
        });
    }

    const documentName = toTrimmedString(source.documentName);
    if (!documentName) {
      return [];
    }

    return [{
      name: documentName,
      type: toTrimmedString(source.documentType),
      size: Number(source.documentSize || 0),
      savedAt: toTrimmedString(source.documentSavedAt)
    }];
  }

  function normalizeCoveragePolicyRecord(policy) {
    const source = policy && typeof policy === "object" ? policy : {};
    const documents = normalizeDocumentEntries(source);
    const policyType = toTrimmedString(source.policyType);
    const coverageSource = normalizeCoverageSource(source.coverageSource) || getCoverageSourceForPolicy(source);

    return {
      ...source,
      id: toTrimmedString(source.id),
      entryMode: toTrimmedString(source.entryMode) === "simple" ? "simple" : "full",
      coverageSource,
      policyCarrier: toTrimmedString(source.policyCarrier || source.carrierName),
      policyType,
      employerOrPlanSponsor: toTrimmedString(source.employerOrPlanSponsor),
      insuredName: toTrimmedString(source.insuredName),
      ownerName: toTrimmedString(source.ownerName),
      faceAmount: normalizeCoverageCurrencyValue(
        source.faceAmount != null && source.faceAmount !== ""
          ? source.faceAmount
          : source.deathBenefitAmount
      ),
      premiumAmount: normalizeCoverageCurrencyValue(source.premiumAmount),
      premiumMode: toTrimmedString(source.premiumMode),
      startingPremium: normalizeCoverageCurrencyValue(source.startingPremium),
      premiumScheduleYears: toTrimmedString(source.premiumScheduleYears),
      premiumScheduleMonths: toTrimmedString(source.premiumScheduleMonths),
      premiumScheduleDuration: toTrimmedString(source.premiumScheduleDuration),
      termLength: toTrimmedString(source.termLength),
      policyNumber: toTrimmedString(source.policyNumber),
      effectiveDate: toTrimmedString(source.effectiveDate),
      underwritingClass: toTrimmedString(source.underwritingClass),
      beneficiaryName: toTrimmedString(source.beneficiaryName),
      policyNotes: toTrimmedString(source.policyNotes),
      conversionAvailable: toTrimmedString(source.conversionAvailable),
      portabilityAvailable: toTrimmedString(source.portabilityAvailable),
      premiumPayer: toTrimmedString(source.premiumPayer),
      status: toTrimmedString(source.status),
      savedAt: toTrimmedString(source.savedAt),
      documents,
      documentName: toTrimmedString(documents[0]?.name),
      documentType: toTrimmedString(documents[0]?.type),
      documentSize: Number(documents[0]?.size || 0),
      documentSavedAt: toTrimmedString(documents[0]?.savedAt)
    };
  }

  function summarizeCoveragePolicies(policies) {
    const summary = {
      individualCoverageTotal: 0,
      groupCoverageTotal: 0,
      unclassifiedCoverageTotal: 0,
      totalCoverage: 0,
      policyCount: 0
    };

    if (!Array.isArray(policies)) {
      return summary;
    }

    policies.forEach(function (policy) {
      if (!policy || typeof policy !== "object") {
        return;
      }

      const amount = getCoverageDeathBenefitAmount(policy);
      if (amount <= 0) {
        return;
      }

      const classification = classifyCoveragePolicy(policy);
      if (classification === COVERAGE_SOURCE_INDIVIDUAL) {
        summary.individualCoverageTotal += amount;
      } else if (classification === COVERAGE_SOURCE_GROUP_EMPLOYER) {
        summary.groupCoverageTotal += amount;
      } else {
        summary.unclassifiedCoverageTotal += amount;
      }

      summary.totalCoverage += amount;
      summary.policyCount += 1;
    });

    return summary;
  }

  function createPolicyId(existingPolicy, input) {
    return toTrimmedString(existingPolicy?.id || input?.id || `policy-${Date.now()}`);
  }

  function createPolicySavedAt(existingPolicy, input) {
    const today = new Date().toISOString().slice(0, 10);
    return toTrimmedString(existingPolicy?.savedAt || input?.savedAt || today);
  }

  function buildSimpleCoveragePolicy(input, existingPolicy) {
    const source = input && typeof input === "object" ? input : {};
    const base = existingPolicy && typeof existingPolicy === "object" ? existingPolicy : {};
    const coverageSource = normalizeCoverageSource(source.coverageSource || base.coverageSource);

    return normalizeCoveragePolicyRecord({
      ...base,
      id: createPolicyId(base, source),
      entryMode: "simple",
      coverageSource,
      savedAt: createPolicySavedAt(base, source),
      policyCarrier: toTrimmedString(source.policyCarrier || source.carrierName || source.employerOrPlanSponsor || ""),
      policyType: toTrimmedString(source.policyType || ""),
      employerOrPlanSponsor: toTrimmedString(source.employerOrPlanSponsor || ""),
      insuredName: toTrimmedString(source.insuredName || ""),
      ownerName: toTrimmedString(source.ownerName || ""),
      faceAmount: normalizeCoverageCurrencyValue(
        source.faceAmount != null && source.faceAmount !== ""
          ? source.faceAmount
          : source.deathBenefitAmount
      ),
      startingPremium: "",
      premiumAmount: normalizeCoverageCurrencyValue(source.premiumAmount),
      premiumMode: toTrimmedString(source.premiumMode),
      premiumScheduleYears: "",
      premiumScheduleMonths: "",
      premiumScheduleDuration: "",
      termLength: "",
      policyNumber: "",
      effectiveDate: "",
      underwritingClass: "",
      beneficiaryName: "",
      policyNotes: toTrimmedString(source.policyNotes || source.notes || ""),
      documents: []
    });
  }

  function buildFullCoveragePolicy(input, existingPolicy) {
    const source = input && typeof input === "object" ? input : {};
    const base = existingPolicy && typeof existingPolicy === "object" ? existingPolicy : {};
    const documents = Array.isArray(source.documents) ? source.documents : normalizeDocumentEntries(base);
    const faceAmountValue = hasOwnValue(source, "faceAmount")
      ? source.faceAmount
      : pickPolicyValue(source, base, "deathBenefitAmount", "faceAmount");

    return normalizeCoveragePolicyRecord({
      ...base,
      id: createPolicyId(base, source),
      entryMode: "full",
      coverageSource: normalizeCoverageSource(pickPolicyValue(source, base, "coverageSource")),
      savedAt: createPolicySavedAt(base, source),
      policyCarrier: toTrimmedString(pickPolicyValue(source, base, "policyCarrier", "carrierName")),
      policyType: toTrimmedString(pickPolicyValue(source, base, "policyType")),
      employerOrPlanSponsor: toTrimmedString(pickPolicyValue(source, base, "employerOrPlanSponsor")),
      insuredName: toTrimmedString(pickPolicyValue(source, base, "insuredName")),
      ownerName: toTrimmedString(pickPolicyValue(source, base, "ownerName")),
      faceAmount: normalizeCoverageCurrencyValue(faceAmountValue),
      startingPremium: normalizeCoverageCurrencyValue(pickPolicyValue(source, base, "startingPremium")),
      premiumAmount: normalizeCoverageCurrencyValue(pickPolicyValue(source, base, "premiumAmount")),
      premiumMode: toTrimmedString(pickPolicyValue(source, base, "premiumMode")),
      premiumScheduleYears: toTrimmedString(pickPolicyValue(source, base, "premiumScheduleYears")),
      premiumScheduleMonths: toTrimmedString(pickPolicyValue(source, base, "premiumScheduleMonths")),
      premiumScheduleDuration: toTrimmedString(pickPolicyValue(source, base, "premiumScheduleDuration")),
      termLength: toTrimmedString(pickPolicyValue(source, base, "termLength")),
      policyNumber: toTrimmedString(pickPolicyValue(source, base, "policyNumber")),
      effectiveDate: toTrimmedString(pickPolicyValue(source, base, "effectiveDate")),
      underwritingClass: toTrimmedString(pickPolicyValue(source, base, "underwritingClass")),
      beneficiaryName: toTrimmedString(pickPolicyValue(source, base, "beneficiaryName")),
      policyNotes: toTrimmedString(pickPolicyValue(source, base, "policyNotes", "notes")),
      conversionAvailable: toTrimmedString(pickPolicyValue(source, base, "conversionAvailable")),
      portabilityAvailable: toTrimmedString(pickPolicyValue(source, base, "portabilityAvailable")),
      premiumPayer: toTrimmedString(pickPolicyValue(source, base, "premiumPayer")),
      status: toTrimmedString(pickPolicyValue(source, base, "status")),
      documents
    });
  }

  const api = {
    COVERAGE_SOURCE_INDIVIDUAL,
    COVERAGE_SOURCE_GROUP_EMPLOYER,
    COVERAGE_SOURCE_OTHER_UNKNOWN,
    COVERAGE_CLASSIFICATION_UNCLASSIFIED,
    normalizeCoverageCurrencyValue,
    parseCoverageCurrencyNumber,
    normalizeCoverageSource,
    normalizeCoveragePolicyRecord,
    classifyCoveragePolicy,
    getCoverageDeathBenefitAmount,
    summarizeCoveragePolicies,
    buildSimpleCoveragePolicy,
    buildFullCoveragePolicy
  };

  Object.assign(coverage, api);

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})(typeof window !== "undefined" ? window : globalThis);
