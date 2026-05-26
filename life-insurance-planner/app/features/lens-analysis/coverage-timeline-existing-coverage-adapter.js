(function (global) {
  const root = global.LensApp || (global.LensApp = {});
  const lensAnalysis = root.lensAnalysis || (root.lensAnalysis = {});
  const coverageUtils = root.coverage || {};

  // Owner: Lens analysis pure coverage timeline adapter.
  // Purpose: adapt existing coverage policy records into policy layers that
  // the coverage timeline engine can consume.
  // Non-goals: no UI, storage, graph rendering, manager behavior changes,
  // treatment-helper changes, method formula changes, or wealth projection.
  const ADAPTER_VERSION = "coverage-timeline-existing-coverage-adapter-v1";
  const DAY_MS = 24 * 60 * 60 * 1000;
  const YEAR_DAYS = 365.25;

  function isPlainObject(value) {
    return Boolean(value && typeof value === "object" && !Array.isArray(value));
  }

  function clonePlainValue(value) {
    if (value == null) {
      return value;
    }
    return JSON.parse(JSON.stringify(value));
  }

  function normalizeString(value) {
    return String(value == null ? "" : value).trim();
  }

  function normalizeStatus(value) {
    return normalizeString(value).replace(/[\s_-]+/g, "").toLowerCase();
  }

  function toOptionalNumber(value) {
    if (value == null || value === "") {
      return null;
    }
    if (typeof value === "number") {
      return Number.isFinite(value) ? value : null;
    }
    const normalized = String(value).replace(/[$,%\s,]/g, "").trim();
    if (!normalized) {
      return null;
    }
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : null;
  }

  function roundMoney(value) {
    return Number.isFinite(value) ? Number(value.toFixed(2)) : 0;
  }

  function createIssue(code, message, details) {
    return {
      code,
      message,
      details: isPlainObject(details) ? clonePlainValue(details) : {}
    };
  }

  function normalizeDateOnly(value) {
    const raw = normalizeString(value);
    const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!match) {
      return null;
    }
    const year = Number(match[1]);
    const monthIndex = Number(match[2]) - 1;
    const day = Number(match[3]);
    const date = new Date(Date.UTC(year, monthIndex, day));
    if (
      Number.isNaN(date.getTime())
      || date.getUTCFullYear() !== year
      || date.getUTCMonth() !== monthIndex
      || date.getUTCDate() !== day
    ) {
      return null;
    }
    return {
      date,
      normalizedDate: [
        String(year).padStart(4, "0"),
        String(monthIndex + 1).padStart(2, "0"),
        String(day).padStart(2, "0")
      ].join("-")
    };
  }

  function formatDateOnly(date) {
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
      return "";
    }
    return [
      String(date.getUTCFullYear()).padStart(4, "0"),
      String(date.getUTCMonth() + 1).padStart(2, "0"),
      String(date.getUTCDate()).padStart(2, "0")
    ].join("-");
  }

  function addYears(dateResult, years) {
    if (!dateResult || !(dateResult.date instanceof Date)) {
      return null;
    }
    const target = new Date(dateResult.date.getTime());
    target.setUTCFullYear(target.getUTCFullYear() + years);
    return {
      date: target,
      normalizedDate: formatDateOnly(target)
    };
  }

  function calculateYearDelta(startDateResult, targetDateResult) {
    if (!startDateResult || !targetDateResult) {
      return null;
    }
    const rawYears = (targetDateResult.date.getTime() - startDateResult.date.getTime()) / (DAY_MS * YEAR_DAYS);
    if (!Number.isFinite(rawYears)) {
      return null;
    }
    return Math.max(0, Math.ceil(rawYears));
  }

  function calculateAgeOnDate(dateOfBirthResult, dateResult) {
    if (!dateOfBirthResult || !dateResult) {
      return null;
    }
    let age = dateResult.date.getUTCFullYear() - dateOfBirthResult.date.getUTCFullYear();
    const birthMonth = dateOfBirthResult.date.getUTCMonth();
    const birthDay = dateOfBirthResult.date.getUTCDate();
    const dateMonth = dateResult.date.getUTCMonth();
    const dateDay = dateResult.date.getUTCDate();
    if (dateMonth < birthMonth || (dateMonth === birthMonth && dateDay < birthDay)) {
      age -= 1;
    }
    return age >= 0 ? age : null;
  }

  function createDateFromAge(dateOfBirthResult, age) {
    const normalizedAge = toOptionalNumber(age);
    if (!dateOfBirthResult || normalizedAge == null || normalizedAge < 0) {
      return null;
    }
    const target = new Date(dateOfBirthResult.date.getTime());
    target.setUTCFullYear(dateOfBirthResult.date.getUTCFullYear() + Math.round(normalizedAge));
    return {
      date: target,
      normalizedDate: formatDateOnly(target)
    };
  }

  function getFirstDate(policy, keys) {
    for (const key of keys) {
      const parsed = normalizeDateOnly(policy?.[key]);
      if (parsed) {
        return {
          key,
          ...parsed
        };
      }
    }
    return null;
  }

  function getFirstNumber(policy, keys) {
    for (const key of keys) {
      const parsed = toOptionalNumber(policy?.[key]);
      if (parsed != null) {
        return {
          key,
          value: parsed
        };
      }
    }
    return null;
  }

  function normalizePolicy(policy) {
    if (typeof coverageUtils.normalizeCoveragePolicyRecord === "function") {
      return coverageUtils.normalizeCoveragePolicyRecord(policy);
    }
    return isPlainObject(policy) ? { ...policy } : {};
  }

  function getDeathBenefit(policy) {
    if (typeof coverageUtils.getCoverageDeathBenefitAmount === "function") {
      return coverageUtils.getCoverageDeathBenefitAmount(policy);
    }
    const raw = policy?.faceAmount != null && policy.faceAmount !== ""
      ? policy.faceAmount
      : policy?.deathBenefitAmount;
    const parsed = toOptionalNumber(raw);
    return parsed != null && parsed > 0 ? parsed : 0;
  }

  function classifyPolicy(policy) {
    if (typeof coverageUtils.classifyCoveragePolicy === "function") {
      return normalizeString(coverageUtils.classifyCoveragePolicy(policy));
    }
    const policyType = normalizeString(policy?.policyType).toLowerCase();
    if (/group\s*life/i.test(policyType)) {
      return "groupEmployer";
    }
    return policyType ? "individual" : "unclassified";
  }

  function mapPolicyType(policy, classification) {
    const policyType = normalizeString(policy?.policyType);
    const compactPolicyType = normalizeStatus(policyType);
    const termLength = normalizeStatus(policy?.termLength);
    if (classification === "groupEmployer" || /grouplife/.test(compactPolicyType)) {
      return {
        policyType: "groupLife",
        reason: "coverage-classification-or-policy-type"
      };
    }
    if (/indexeduniversallife|variableuniversallife|universallife|\biul\b|\bvul\b/.test(compactPolicyType)) {
      return {
        policyType: "universalLife",
        reason: "policy-type-universal"
      };
    }
    if (/wholelife|permanent|finalexpense|burial/.test(compactPolicyType) || /permanent/.test(termLength)) {
      return {
        policyType: "wholeLife",
        reason: "policy-type-permanent"
      };
    }
    if (/term/.test(compactPolicyType) || (/^\d+$/.test(termLength) || /year|yr|\d/.test(termLength))) {
      return {
        policyType: "term",
        reason: "policy-type-or-term-length"
      };
    }
    return {
      policyType: "custom",
      reason: "unknown-policy-type"
    };
  }

  function resolveStatus(policy, policyId) {
    const rawStatus = normalizeString(policy?.status);
    const status = normalizeStatus(rawStatus);
    if (!status) {
      return {
        included: true,
        reason: "blank-status-assumed-active",
        warning: createIssue(
          "unknown-policy-status-assumed-active",
          "Policy status was blank; adapter assumed active for timeline layer construction.",
          { policyId }
        )
      };
    }
    if (["active", "inforce", "inforced", "current", "issued"].includes(status)) {
      return {
        included: true,
        reason: "active-status",
        warning: null
      };
    }
    if (["pending", "applied", "application", "proposed"].includes(status)) {
      return {
        included: false,
        reason: "pending-not-guaranteed-active",
        warning: createIssue(
          "pending-policy-excluded",
          "Pending coverage was not counted as guaranteed active coverage.",
          { policyId, status: rawStatus }
        )
      };
    }
    if (["lapsed", "cancelled", "canceled", "terminated", "inactive", "expired", "surrendered"].includes(status)) {
      return {
        included: false,
        reason: "inactive-status",
        warning: createIssue(
          "inactive-policy-excluded",
          "Inactive, lapsed, cancelled, expired, or surrendered coverage was excluded.",
          { policyId, status: rawStatus }
        )
      };
    }
    return {
      included: true,
      reason: "unknown-status-assumed-active",
      warning: createIssue(
        "unknown-policy-status-assumed-active",
        "Policy status was not recognized; adapter assumed active for timeline layer construction.",
        { policyId, status: rawStatus }
      )
    };
  }

  function getTermLengthYears(policy) {
    const direct = getFirstNumber(policy, [
      "termLengthYears",
      "termYears",
      "durationYears"
    ]);
    if (direct) {
      return direct;
    }
    const rawTermLength = normalizeString(policy?.termLength);
    const match = rawTermLength.match(/\d+/);
    if (!match) {
      return null;
    }
    const value = Number(match[0]);
    return Number.isFinite(value) && value >= 0
      ? { key: "termLength", value }
      : null;
  }

  function getRemainingYears(policy) {
    return getFirstNumber(policy, [
      "remainingYears",
      "yearsRemaining",
      "termRemainingYears",
      "individualYearsRemaining",
      "coverageYearsRemaining"
    ]);
  }

  function resolveStartDate(policy, valuationDate, warnings, policyId) {
    const explicitStart = getFirstDate(policy, [
      "startDate",
      "policyStartDate",
      "issueDate",
      "effectiveDate"
    ]);
    if (explicitStart) {
      return {
        date: explicitStart,
        sourceField: explicitStart.key,
        assumed: false
      };
    }
    warnings.push(createIssue(
      "missing-effective-date",
      "Coverage policy start date was missing; valuationDate was used as the active layer start.",
      { policyId }
    ));
    return {
      date: valuationDate,
      sourceField: "valuationDate",
      assumed: true
    };
  }

  function resolveExplicitEndDate(policy) {
    const explicitEnd = getFirstDate(policy, [
      "expirationDate",
      "expiryDate",
      "endDate",
      "policyEndDate",
      "terminationDate"
    ]);
    if (!explicitEnd) {
      return null;
    }
    return {
      date: explicitEnd,
      sourceField: explicitEnd.key,
      source: "explicit-end-date",
      assumed: false
    };
  }

  function resolveTermEndDate(policy, startDateResult, valuationDate) {
    const explicitEnd = resolveExplicitEndDate(policy);
    if (explicitEnd) {
      return explicitEnd;
    }
    const termLength = getTermLengthYears(policy);
    if (termLength && startDateResult?.date) {
      const derivedEnd = addYears(startDateResult.date, termLength.value);
      if (derivedEnd) {
        return {
          date: derivedEnd,
          sourceField: termLength.key,
          source: "effective-date-plus-term-length",
          assumed: false
        };
      }
    }
    const remainingYears = getRemainingYears(policy);
    if (remainingYears) {
      const derivedEnd = addYears(valuationDate, remainingYears.value);
      if (derivedEnd) {
        return {
          date: derivedEnd,
          sourceField: remainingYears.key,
          source: "valuation-date-plus-remaining-years",
          assumed: false
        };
      }
    }
    return null;
  }

  function resolvePermanentEndDate(policy) {
    return resolveExplicitEndDate(policy);
  }

  function resolveGroupEndDate(policy, dateOfBirth, defaultGroupCoverageEndAge) {
    const explicitEnd = resolveExplicitEndDate(policy);
    if (explicitEnd) {
      return explicitEnd;
    }
    const defaultEndAge = toOptionalNumber(defaultGroupCoverageEndAge);
    if (defaultEndAge != null && dateOfBirth) {
      const date = createDateFromAge(dateOfBirth, defaultEndAge);
      if (date) {
        return {
          date,
          sourceField: "defaultGroupCoverageEndAge",
          source: "default-group-end-age",
          assumed: true,
          defaultGroupCoverageEndAge: defaultEndAge
        };
      }
    }
    return null;
  }

  function getCashValueMetadata(policy, warnings, policyId) {
    const fields = [
      "cashValue",
      "currentCashValue",
      "surrenderValue",
      "cashSurrenderValue"
    ];
    const metadata = {};
    fields.forEach(function (field) {
      if (policy?.[field] != null && policy[field] !== "") {
        metadata[field] = policy[field];
      }
    });
    if (!Object.keys(metadata).length) {
      return null;
    }
    warnings.push(createIssue(
      "cash-value-display-only",
      "Cash value metadata was passed through for display trace only; no cash value projection math was applied.",
      { policyId, fields: Object.keys(metadata) }
    ));
    return {
      enabled: true,
      displayOnly: true,
      values: metadata
    };
  }

  function getPremiumMetadata(policy) {
    const amount = toOptionalNumber(policy?.premiumAmount);
    const startingPremium = toOptionalNumber(policy?.startingPremium);
    if (amount == null && startingPremium == null && !normalizeString(policy?.premiumMode)) {
      return null;
    }
    return {
      amount,
      startingPremium,
      mode: normalizeString(policy?.premiumMode),
      scheduleYears: normalizeString(policy?.premiumScheduleYears),
      scheduleMonths: normalizeString(policy?.premiumScheduleMonths),
      scheduleDuration: normalizeString(policy?.premiumScheduleDuration)
    };
  }

  function createLayerFromPolicy(options) {
    const {
      normalizedPolicy,
      policyId,
      policyType,
      classification,
      valuationDate,
      dateOfBirth,
      defaultGroupCoverageEndAge,
      warnings,
      dataGaps
    } = options;
    const statusResult = resolveStatus(normalizedPolicy, policyId);
    if (statusResult.warning) {
      warnings.push(statusResult.warning);
    }

    const deathBenefit = getDeathBenefit(normalizedPolicy);
    if (deathBenefit <= 0) {
      dataGaps.push(createIssue(
        "missing-death-benefit",
        "Coverage policy death benefit was missing or invalid and was not converted into a contributing layer.",
        { policyId }
      ));
      return {
        layer: null,
        skippedPolicy: {
          policyId,
          reason: "missing-death-benefit",
          classification,
          policyType
        }
      };
    }

    const startDateResult = resolveStartDate(normalizedPolicy, valuationDate, warnings, policyId);
    let endDateResult = null;
    let endWarning = null;
    if (policyType === "term") {
      endDateResult = resolveTermEndDate(normalizedPolicy, startDateResult, valuationDate);
      if (!endDateResult) {
        endWarning = createIssue(
          "missing-term-expiration",
          "Term policy expiration could not be determined; layer was marked excluded instead of assuming lifetime coverage.",
          { policyId }
        );
      }
    } else if (policyType === "groupLife") {
      endDateResult = resolveGroupEndDate(normalizedPolicy, dateOfBirth, defaultGroupCoverageEndAge);
      if (!endDateResult) {
        endWarning = createIssue(
          "group-coverage-end-unknown",
          "Group life end date was unknown; layer was marked excluded instead of assuming lifetime coverage.",
          { policyId }
        );
      } else if (endDateResult.assumed) {
        warnings.push(createIssue(
          "group-coverage-end-defaulted",
          "Group life end date used defaultGroupCoverageEndAge.",
          { policyId, defaultGroupCoverageEndAge: endDateResult.defaultGroupCoverageEndAge }
        ));
      }
    } else if (policyType === "wholeLife" || policyType === "universalLife") {
      endDateResult = resolvePermanentEndDate(normalizedPolicy);
    } else {
      warnings.push(createIssue(
        "unknown-policy-type-mapped-custom",
        "Unknown policy type was mapped to a custom existing layer and marked excluded until a schedule exists.",
        { policyId, policyType: normalizeString(normalizedPolicy.policyType) }
      ));
    }
    if (endWarning) {
      dataGaps.push(endWarning);
    }

    const startYearIndex = calculateYearDelta(valuationDate, startDateResult.date);
    const endYearIndex = endDateResult ? calculateYearDelta(valuationDate, endDateResult.date) : null;
    const included = statusResult.included
      && !endWarning
      && policyType !== "custom";
    const cashValue = getCashValueMetadata(normalizedPolicy, warnings, policyId);
    const premium = getPremiumMetadata(normalizedPolicy);
    const layer = {
      id: `existing-${policyId}`,
      source: "existing",
      sourcePolicyId: policyId,
      name: normalizeString(normalizedPolicy.policyCarrier || normalizedPolicy.carrierName || normalizedPolicy.policyType)
        || `Existing coverage ${policyId}`,
      policyType,
      carrierName: normalizeString(normalizedPolicy.policyCarrier || normalizedPolicy.carrierName),
      insuredName: normalizeString(normalizedPolicy.insuredName),
      ownerName: normalizeString(normalizedPolicy.ownerName),
      startDate: startDateResult.date.normalizedDate,
      startAge: calculateAgeOnDate(dateOfBirth, startDateResult.date),
      endDate: endDateResult?.date?.normalizedDate || null,
      endAge: calculateAgeOnDate(dateOfBirth, endDateResult?.date),
      startYearIndex: startYearIndex ?? 0,
      endYearIndex,
      durationYears: endYearIndex == null ? null : Math.max(0, endYearIndex - (startYearIndex ?? 0)),
      deathBenefit: roundMoney(deathBenefit),
      included,
      premium,
      cashValue,
      notes: normalizeString(normalizedPolicy.policyNotes || normalizedPolicy.notes),
      trace: {
        sourcePolicyId: policyId,
        sourceFieldsUsed: {
          policyType: "policyType",
          classification: "coverageUtils.classifyCoveragePolicy",
          deathBenefit: typeof coverageUtils.getCoverageDeathBenefitAmount === "function"
            ? "coverageUtils.getCoverageDeathBenefitAmount"
            : "faceAmount/deathBenefitAmount",
          startDate: startDateResult.sourceField,
          endDate: endDateResult?.sourceField || null,
          status: "status"
        },
        typeMapping: {
          classification,
          rawPolicyType: normalizeString(normalizedPolicy.policyType),
          timelinePolicyType: policyType
        },
        dateAssumptions: {
          startAssumedFromValuationDate: startDateResult.assumed,
          endDateSource: endDateResult?.source || null,
          endAssumed: endDateResult?.assumed === true,
          valuationDate: valuationDate.normalizedDate
        },
        benefitParsing: {
          deathBenefit,
          utility: typeof coverageUtils.getCoverageDeathBenefitAmount === "function"
            ? "coverage-policy-utils"
            : "local-fallback"
        },
        inclusion: {
          included,
          reason: included ? statusResult.reason : (endWarning?.code || statusResult.reason)
        },
        cashValueDisplayOnly: Boolean(cashValue)
      }
    };

    return {
      layer,
      skippedPolicy: null
    };
  }

  function buildExistingCoverageTimelineLayers(input) {
    const safeInput = isPlainObject(input) ? input : {};
    const warnings = [];
    const dataGaps = [];
    const trace = {
      adapterVersion: ADAPTER_VERSION,
      inputPolicyCount: Array.isArray(safeInput.coveragePolicies) ? safeInput.coveragePolicies.length : 0,
      includedLayerCount: 0,
      excludedPolicyCount: 0,
      skippedPolicies: [],
      utilityReuse: {
        coveragePolicyUtils: {
          normalizeCoveragePolicyRecord: typeof coverageUtils.normalizeCoveragePolicyRecord === "function",
          classifyCoveragePolicy: typeof coverageUtils.classifyCoveragePolicy === "function",
          getCoverageDeathBenefitAmount: typeof coverageUtils.getCoverageDeathBenefitAmount === "function"
        },
        existingCoverageTreatmentCalculations: "not-imported-contract-differs",
        householdWealthProjection: "not-imported-coverage-layer-math-owner-is-coverage-timeline"
      }
    };
    const valuationDate = normalizeDateOnly(safeInput.valuationDate);
    const dateOfBirth = normalizeDateOnly(safeInput.clientDateOfBirth);

    if (!valuationDate) {
      dataGaps.push(createIssue(
        "missing-valuation-date",
        "A valid valuationDate is required to derive timeline layer year indexes.",
        { valuationDate: safeInput.valuationDate ?? null }
      ));
    }
    if (!Array.isArray(safeInput.coveragePolicies)) {
      dataGaps.push(createIssue(
        "missing-coverage-policies",
        "coveragePolicies must be supplied as an array.",
        {}
      ));
    }

    const layers = [];
    if (!valuationDate || !Array.isArray(safeInput.coveragePolicies)) {
      trace.warningCount = warnings.length;
      trace.dataGapCount = dataGaps.length;
      return {
        layers,
        warnings,
        dataGaps,
        trace
      };
    }

    safeInput.coveragePolicies.forEach(function (policy, index) {
      if (!isPlainObject(policy)) {
        dataGaps.push(createIssue(
          "invalid-policy-record",
          "Coverage policy record was not an object and was skipped.",
          { index }
        ));
        trace.skippedPolicies.push({
          policyId: `policy-${index}`,
          reason: "invalid-policy-record"
        });
        return;
      }
      const normalizedPolicy = normalizePolicy(policy);
      const policyId = normalizeString(normalizedPolicy.id || policy.id) || `policy-${index}`;
      const classification = classifyPolicy(normalizedPolicy);
      const mappedType = mapPolicyType(normalizedPolicy, classification);
      const result = createLayerFromPolicy({
        normalizedPolicy,
        policyId,
        policyType: mappedType.policyType,
        classification,
        valuationDate,
        dateOfBirth,
        defaultGroupCoverageEndAge: safeInput.defaultGroupCoverageEndAge,
        warnings,
        dataGaps
      });
      if (result.layer) {
        result.layer.trace.typeMapping.reason = mappedType.reason;
        layers.push(result.layer);
      }
      if (result.skippedPolicy) {
        trace.skippedPolicies.push(result.skippedPolicy);
      }
    });

    trace.includedLayerCount = layers.filter((layer) => layer.included !== false).length;
    trace.excludedPolicyCount = trace.inputPolicyCount - trace.includedLayerCount;
    trace.warningCount = warnings.length;
    trace.dataGapCount = dataGaps.length;

    return {
      layers,
      warnings,
      dataGaps,
      trace
    };
  }

  lensAnalysis.COVERAGE_TIMELINE_EXISTING_COVERAGE_ADAPTER_VERSION = ADAPTER_VERSION;
  lensAnalysis.buildExistingCoverageTimelineLayers = buildExistingCoverageTimelineLayers;

  if (typeof module !== "undefined" && module.exports) {
    module.exports = {
      COVERAGE_TIMELINE_EXISTING_COVERAGE_ADAPTER_VERSION: ADAPTER_VERSION,
      buildExistingCoverageTimelineLayers
    };
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
