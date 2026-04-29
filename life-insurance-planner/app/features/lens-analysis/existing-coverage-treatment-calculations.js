(function (globalScope) {
  const root = globalScope || {};
  const LensApp = root.LensApp || (root.LensApp = {});
  const lensAnalysis = LensApp.lensAnalysis || (LensApp.lensAnalysis = {});
  const coverageUtils = LensApp.coverage || {};

  // Owner: Lens analysis existing coverage treatment helper.
  // Purpose: calculate treated coverage offset values from profile-owned
  // coveragePolicies[] and Analysis Setup assumptions.
  // Non-goals: no DOM access, no storage access, no method wiring, no Step 3
  // rendering, and no mutation of profile policy records.

  const CALCULATION_VERSION = 1;
  const TREATMENT_KINDS = Object.freeze(["group", "term", "permanent", "pending", "unknown"]);
  const PENDING_PATTERN = /pending|proposed|proposal|application|applied|underwriting|quoted/i;
  const PERMANENT_PATTERN = /whole|universal|indexed|variable|iul|vul|permanent|final\s*expense|burial/i;
  const TERM_PATTERN = /term/i;
  const YEAR_PATTERN = /year|yr|\d/i;

  const RAW_EQUIVALENT_TREATMENT_ASSUMPTIONS = Object.freeze({
    includeExistingCoverage: true,
    groupCoverageTreatment: Object.freeze({
      include: true,
      reliabilityDiscountPercent: 0,
      portabilityRequired: false
    }),
    individualTermTreatment: Object.freeze({
      include: true,
      reliabilityDiscountPercent: 0,
      excludeIfExpiresWithinYears: null
    }),
    permanentCoverageTreatment: Object.freeze({
      include: true,
      reliabilityDiscountPercent: 0
    }),
    pendingCoverageTreatment: Object.freeze({
      include: true,
      reliabilityDiscountPercent: 0
    }),
    unknownCoverageTreatment: Object.freeze({
      include: true,
      reliabilityDiscountPercent: 0
    }),
    source: "existing-coverage-treatment-helper-defaults"
  });

  function isPlainObject(value) {
    return Boolean(value && typeof value === "object" && !Array.isArray(value));
  }

  function toTrimmedString(value) {
    return String(value == null ? "" : value).trim();
  }

  function roundMoney(value) {
    const number = Number(value);
    return Number.isFinite(number) ? Math.max(0, Math.round(number * 100) / 100) : 0;
  }

  function normalizePercent(value, fallback) {
    if (value == null || value === "") {
      return fallback;
    }

    const number = Number(value);
    if (!Number.isFinite(number)) {
      return fallback;
    }

    return Math.max(0, Math.min(100, number));
  }

  function normalizeOptionalGuardrailYears(value, fallback) {
    if (value == null || value === "") {
      return fallback == null ? null : fallback;
    }

    const number = Number(value);
    if (!Number.isFinite(number) || number < 0) {
      return fallback == null ? null : fallback;
    }

    return number;
  }

  function createWarning(code, message, details) {
    return {
      code,
      message,
      severity: "warning",
      details: isPlainObject(details) ? details : {}
    };
  }

  function cloneTreatment(source, fallback) {
    const safeSource = isPlainObject(source) ? source : {};
    const safeFallback = isPlainObject(fallback) ? fallback : {};
    return {
      include: typeof safeSource.include === "boolean"
        ? safeSource.include
        : safeFallback.include !== false,
      reliabilityDiscountPercent: normalizePercent(
        safeSource.reliabilityDiscountPercent,
        normalizePercent(safeFallback.reliabilityDiscountPercent, 0)
      ),
      ...(Object.prototype.hasOwnProperty.call(safeFallback, "portabilityRequired") || Object.prototype.hasOwnProperty.call(safeSource, "portabilityRequired")
        ? {
            portabilityRequired: typeof safeSource.portabilityRequired === "boolean"
              ? safeSource.portabilityRequired
              : Boolean(safeFallback.portabilityRequired)
          }
        : {}),
      ...(Object.prototype.hasOwnProperty.call(safeFallback, "excludeIfExpiresWithinYears") || Object.prototype.hasOwnProperty.call(safeSource, "excludeIfExpiresWithinYears")
        ? {
            excludeIfExpiresWithinYears: normalizeOptionalGuardrailYears(
              safeSource.excludeIfExpiresWithinYears,
              safeFallback.excludeIfExpiresWithinYears
            )
          }
        : {})
    };
  }

  function normalizeExistingCoverageTreatmentAssumptions(assumptions) {
    const source = isPlainObject(assumptions) ? assumptions : {};
    const defaults = RAW_EQUIVALENT_TREATMENT_ASSUMPTIONS;
    return {
      includeExistingCoverage: typeof source.includeExistingCoverage === "boolean"
        ? source.includeExistingCoverage
        : defaults.includeExistingCoverage,
      groupCoverageTreatment: cloneTreatment(
        source.groupCoverageTreatment,
        defaults.groupCoverageTreatment
      ),
      individualTermTreatment: cloneTreatment(
        source.individualTermTreatment,
        defaults.individualTermTreatment
      ),
      permanentCoverageTreatment: cloneTreatment(
        source.permanentCoverageTreatment,
        defaults.permanentCoverageTreatment
      ),
      pendingCoverageTreatment: cloneTreatment(
        source.pendingCoverageTreatment,
        defaults.pendingCoverageTreatment
      ),
      unknownCoverageTreatment: cloneTreatment(
        source.unknownCoverageTreatment,
        defaults.unknownCoverageTreatment
      ),
      source: toTrimmedString(source.source) || defaults.source
    };
  }

  function normalizePolicyForTreatment(policy) {
    const source = isPlainObject(policy) ? policy : {};
    if (typeof coverageUtils.normalizeCoveragePolicyRecord === "function") {
      return coverageUtils.normalizeCoveragePolicyRecord(source);
    }

    return { ...source };
  }

  function getRawAmountValue(policy) {
    if (!isPlainObject(policy)) {
      return null;
    }

    if (policy.faceAmount != null && policy.faceAmount !== "") {
      return policy.faceAmount;
    }

    if (policy.deathBenefitAmount != null && policy.deathBenefitAmount !== "") {
      return policy.deathBenefitAmount;
    }

    return null;
  }

  function isNegativeCoverageAmountString(value) {
    const raw = toTrimmedString(value);
    if (!raw) {
      return false;
    }

    const compact = raw.replace(/\s+/g, "");
    return compact.includes("-") || (/^\(.+\)$/.test(compact) && /\d/.test(compact));
  }

  function parseCoverageAmount(policy, index, policyId) {
    const rawValue = getRawAmountValue(policy);
    const details = { policyIndex: index, policyId };
    if (rawValue == null || rawValue === "") {
      return {
        amount: 0,
        warning: createWarning(
          "missing-face-amount",
          "Coverage policy had no face amount and was treated as 0.",
          details
        )
      };
    }

    if (typeof rawValue === "number" && rawValue < 0) {
      return {
        amount: 0,
        warning: createWarning(
          "negative-face-amount",
          "Coverage policy had a negative face amount and was treated as 0.",
          { ...details, rawValue }
        )
      };
    }

    const rawString = toTrimmedString(rawValue);
    if (isNegativeCoverageAmountString(rawString)) {
      return {
        amount: 0,
        warning: createWarning(
          "negative-face-amount",
          "Coverage policy had a negative face amount and was treated as 0.",
          { ...details, rawValue }
        )
      };
    }

    const normalized = rawString.replace(/[^0-9.]/g, "");
    const firstDot = normalized.indexOf(".");
    const cleaned = firstDot === -1
      ? normalized
      : `${normalized.slice(0, firstDot + 1)}${normalized.slice(firstDot + 1).replace(/\./g, "")}`;
    const number = Number(cleaned);
    if (!cleaned || !Number.isFinite(number) || number <= 0) {
      return {
        amount: 0,
        warning: createWarning(
          "invalid-face-amount",
          "Coverage policy had an invalid face amount and was treated as 0.",
          { ...details, rawValue }
        )
      };
    }

    return { amount: roundMoney(number), warning: null };
  }

  function classifyCoveragePolicy(policy) {
    if (typeof coverageUtils.classifyCoveragePolicy === "function") {
      return toTrimmedString(coverageUtils.classifyCoveragePolicy(policy)) || "unclassified";
    }

    const coverageSource = toTrimmedString(policy?.coverageSource);
    const policyType = toTrimmedString(policy?.policyType).toLowerCase();
    if (coverageSource === "groupEmployer" || /group\s*life/i.test(policyType)) {
      return "groupEmployer";
    }

    if (coverageSource === "individual" || policyType) {
      return "individual";
    }

    return "unclassified";
  }

  function isPendingCoveragePolicy(policy) {
    const status = toTrimmedString(policy?.status);
    const notes = toTrimmedString(policy?.policyNotes || policy?.notes);
    if (PENDING_PATTERN.test(status)) {
      return {
        pending: true,
        source: "status",
        warning: createWarning(
          "pending-coverage-detected-from-status",
          "Pending coverage was inferred from the policy status field; confirm before using as firm in-force coverage.",
          { status }
        )
      };
    }

    if (PENDING_PATTERN.test(notes)) {
      return {
        pending: true,
        source: "notes",
        warning: createWarning(
          "pending-coverage-detected-from-notes",
          "Pending coverage was inferred from policy notes; confirm before using as firm in-force coverage.",
          { notes }
        )
      };
    }

    return {
      pending: false,
      source: "",
      warning: null
    };
  }

  function isPermanentCoveragePolicy(policy) {
    const policyType = toTrimmedString(policy?.policyType);
    const termLength = toTrimmedString(policy?.termLength);
    return PERMANENT_PATTERN.test(policyType) || /permanent/i.test(termLength);
  }

  function isTermCoveragePolicy(policy) {
    const policyType = toTrimmedString(policy?.policyType);
    const termLength = toTrimmedString(policy?.termLength);
    return TERM_PATTERN.test(policyType) || (YEAR_PATTERN.test(termLength) && !isPermanentCoveragePolicy(policy));
  }

  function getPolicyTermLengthYears(policy) {
    const termLength = toTrimmedString(policy?.termLength);
    const match = termLength.match(/\d+/);
    if (!match) {
      return null;
    }

    const years = Number(match[0]);
    return Number.isFinite(years) && years >= 0 ? years : null;
  }

  function parseDateOnly(value) {
    const raw = toTrimmedString(value);
    const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!match) {
      return null;
    }

    const year = Number(match[1]);
    const monthIndex = Number(match[2]) - 1;
    const day = Number(match[3]);
    const time = Date.UTC(year, monthIndex, day);
    if (!Number.isFinite(time)) {
      return null;
    }

    const date = new Date(time);
    if (
      date.getUTCFullYear() !== year
      || date.getUTCMonth() !== monthIndex
      || date.getUTCDate() !== day
    ) {
      return null;
    }

    return date;
  }

  function getPolicyTermRemainingYears(policy, valuationDate) {
    const termYears = getPolicyTermLengthYears(policy);
    const effectiveDate = parseDateOnly(policy?.effectiveDate);
    if (termYears === null) {
      return {
        yearsRemaining: null,
        warning: createWarning(
          "missing-term-length",
          "Term guardrail could not be applied because term length is missing or invalid.",
          {
            policyId: toTrimmedString(policy?.id)
          }
        )
      };
    }

    if (!effectiveDate) {
      return {
        yearsRemaining: null,
        warning: createWarning(
          "missing-effective-date",
          "Term guardrail could not be applied because effective date is missing or invalid.",
          {
            policyId: toTrimmedString(policy?.id),
            termLength: policy?.termLength
          }
        )
      };
    }

    if (!(valuationDate instanceof Date)) {
      return {
        yearsRemaining: null,
        warning: createWarning(
          "missing-valuation-date",
          "Term guardrail could not be applied because no valid valuation date was provided.",
          {
            policyId: toTrimmedString(policy?.id)
          }
        )
      };
    }

    const endDate = new Date(effectiveDate.getTime());
    endDate.setUTCFullYear(endDate.getUTCFullYear() + termYears);
    return {
      yearsRemaining: Math.max(0, (endDate.getTime() - valuationDate.getTime()) / (1000 * 60 * 60 * 24 * 365.25)),
      warning: null
    };
  }

  function classifyExistingCoverageTreatmentPolicy(policy) {
    const pendingResult = isPendingCoveragePolicy(policy);
    if (pendingResult.pending) {
      return {
        classification: classifyCoveragePolicy(policy),
        treatmentKind: "pending",
        pendingWarning: pendingResult.warning
      };
    }

    const classification = classifyCoveragePolicy(policy);
    if (classification === "groupEmployer") {
      return {
        classification,
        treatmentKind: "group",
        pendingWarning: null
      };
    }

    if (isPermanentCoveragePolicy(policy)) {
      return {
        classification,
        treatmentKind: "permanent",
        pendingWarning: null
      };
    }

    if (isTermCoveragePolicy(policy)) {
      return {
        classification,
        treatmentKind: "term",
        pendingWarning: null
      };
    }

    return {
      classification,
      treatmentKind: "unknown",
      pendingWarning: null
    };
  }

  function getTreatmentForKind(kind, assumptions) {
    if (kind === "group") {
      return assumptions.groupCoverageTreatment;
    }

    if (kind === "term") {
      return assumptions.individualTermTreatment;
    }

    if (kind === "permanent") {
      return assumptions.permanentCoverageTreatment;
    }

    if (kind === "pending") {
      return assumptions.pendingCoverageTreatment;
    }

    return assumptions.unknownCoverageTreatment;
  }

  function createEmptyTotalsByTreatmentKind() {
    return TREATMENT_KINDS.reduce(function (totals, kind) {
      totals[kind] = {
        policyCount: 0,
        includedPolicyCount: 0,
        excludedPolicyCount: 0,
        rawAmount: 0,
        includedRawAmount: 0,
        treatedAmount: 0,
        excludedAmount: 0
      };
      return totals;
    }, {});
  }

  function applyPolicyToKindTotals(totalsByTreatmentKind, policyResult) {
    const kindTotals = totalsByTreatmentKind[policyResult.treatmentKind] || totalsByTreatmentKind.unknown;
    kindTotals.policyCount += 1;
    kindTotals.rawAmount = roundMoney(kindTotals.rawAmount + policyResult.rawAmount);
    if (policyResult.included) {
      kindTotals.includedPolicyCount += 1;
      kindTotals.includedRawAmount = roundMoney(kindTotals.includedRawAmount + policyResult.rawAmount);
      kindTotals.treatedAmount = roundMoney(kindTotals.treatedAmount + policyResult.treatedAmount);
    } else {
      kindTotals.excludedPolicyCount += 1;
      kindTotals.excludedAmount = roundMoney(kindTotals.excludedAmount + policyResult.rawAmount);
    }
  }

  function calculatePolicyTreatment(policy, index, assumptions, valuationDate) {
    const normalizedPolicy = normalizePolicyForTreatment(policy);
    const policyId = toTrimmedString(normalizedPolicy.id || policy?.id || `policy-${index}`);
    const warnings = [];
    const amountResult = parseCoverageAmount(policy, index, policyId);
    if (amountResult.warning) {
      warnings.push(amountResult.warning);
    }

    const classificationResult = classifyExistingCoverageTreatmentPolicy(normalizedPolicy);
    if (classificationResult.pendingWarning) {
      warnings.push(classificationResult.pendingWarning);
    }

    const treatment = getTreatmentForKind(classificationResult.treatmentKind, assumptions);
    let included = Boolean(assumptions.includeExistingCoverage)
      && amountResult.amount > 0
      && treatment.include !== false;
    let exclusionReason = "";
    if (!assumptions.includeExistingCoverage) {
      exclusionReason = "existing-coverage-disabled";
    } else if (amountResult.amount <= 0) {
      exclusionReason = amountResult.warning?.code || "no-positive-face-amount";
    } else if (treatment.include === false) {
      exclusionReason = `${classificationResult.treatmentKind}-excluded-by-assumption`;
    }

    if (
      included
      && classificationResult.treatmentKind === "term"
      && treatment.excludeIfExpiresWithinYears !== null
      && treatment.excludeIfExpiresWithinYears !== undefined
    ) {
      const termRemainingResult = getPolicyTermRemainingYears(normalizedPolicy, valuationDate);
      if (termRemainingResult.warning) {
        warnings.push(termRemainingResult.warning);
      } else if (termRemainingResult.yearsRemaining <= treatment.excludeIfExpiresWithinYears) {
        included = false;
        exclusionReason = "term-expiring-within-guardrail";
      }
    }

    const reliabilityDiscountPercent = normalizePercent(treatment.reliabilityDiscountPercent, 0);
    const treatedAmount = included
      ? roundMoney(amountResult.amount * (1 - (reliabilityDiscountPercent / 100)))
      : 0;

    return {
      policyId,
      classification: classificationResult.classification,
      treatmentKind: classificationResult.treatmentKind,
      rawAmount: amountResult.amount,
      included,
      treatedAmount,
      exclusionReason,
      warnings
    };
  }

  function calculateExistingCoverageTreatment(input) {
    const safeInput = isPlainObject(input) ? input : {};
    const sourcePolicies = Array.isArray(safeInput.coveragePolicies)
      ? safeInput.coveragePolicies.filter(function (policy) {
          return policy && typeof policy === "object";
        })
      : [];
    const assumptions = normalizeExistingCoverageTreatmentAssumptions(
      safeInput.existingCoverageAssumptions
    );
    const options = isPlainObject(safeInput.options) ? safeInput.options : {};
    const valuationDate = parseDateOnly(options.valuationDate);
    const warnings = [];
    const trace = [];

    if (!Array.isArray(safeInput.coveragePolicies)) {
      warnings.push(createWarning(
        "missing-coverage-policies",
        "coveragePolicies was missing or not an array; treated coverage offset was calculated as 0."
      ));
    }

    const policies = sourcePolicies.map(function (policy, index) {
      const result = calculatePolicyTreatment(policy, index, assumptions, valuationDate);
      warnings.push(...result.warnings);
      trace.push({
        policyId: result.policyId,
        classification: result.classification,
        treatmentKind: result.treatmentKind,
        rawAmount: result.rawAmount,
        included: result.included,
        treatedAmount: result.treatedAmount,
        exclusionReason: result.exclusionReason
      });
      return result;
    });

    const totalsByTreatmentKind = createEmptyTotalsByTreatmentKind();
    const totals = policies.reduce(function (summary, policyResult) {
      applyPolicyToKindTotals(totalsByTreatmentKind, policyResult);
      summary.totalRawCoverage += policyResult.rawAmount;
      if (policyResult.included) {
        summary.totalIncludedRawCoverage += policyResult.rawAmount;
        summary.totalTreatedCoverageOffset += policyResult.treatedAmount;
      } else {
        summary.excludedCoverageValue += policyResult.rawAmount;
      }
      return summary;
    }, {
      totalRawCoverage: 0,
      totalIncludedRawCoverage: 0,
      totalTreatedCoverageOffset: 0,
      excludedCoverageValue: 0
    });

    return {
      policies,
      totalRawCoverage: roundMoney(totals.totalRawCoverage),
      totalIncludedRawCoverage: roundMoney(totals.totalIncludedRawCoverage),
      totalTreatedCoverageOffset: roundMoney(totals.totalTreatedCoverageOffset),
      excludedCoverageValue: roundMoney(totals.excludedCoverageValue),
      totalsByTreatmentKind,
      warnings,
      trace,
      metadata: {
        source: toTrimmedString(options.source) || "existing-coverage-treatment-calculations",
        calculationSource: "existing-coverage-treatment-calculations",
        calculationVersion: CALCULATION_VERSION,
        assumptionsSource: assumptions.source,
        includeExistingCoverage: assumptions.includeExistingCoverage,
        coveragePolicyCount: sourcePolicies.length,
        valuationDate: valuationDate ? valuationDate.toISOString().slice(0, 10) : null,
        consumedByMethods: options.consumedByMethods === true
      }
    };
  }

  lensAnalysis.RAW_EQUIVALENT_EXISTING_COVERAGE_TREATMENT_ASSUMPTIONS = RAW_EQUIVALENT_TREATMENT_ASSUMPTIONS;
  lensAnalysis.normalizeExistingCoverageTreatmentAssumptions = normalizeExistingCoverageTreatmentAssumptions;
  lensAnalysis.classifyExistingCoverageTreatmentPolicy = classifyExistingCoverageTreatmentPolicy;
  lensAnalysis.calculateExistingCoverageTreatment = calculateExistingCoverageTreatment;
})(typeof window !== "undefined" ? window : globalThis);
