(function (global) {
  const LensApp = global.LensApp || (global.LensApp = {});
  const lensAnalysis = LensApp.lensAnalysis || (LensApp.lensAnalysis = {});

  const HOUSEHOLD_EXPENSE_ACCOUNT_POLICY_RESOLVER_VERSION = 1;

  const TRACE_SOURCES = Object.freeze({
    DEFAULT_POLICY: "defaultPolicy",
    ACCOUNT_OVERRIDE: "accountOverride",
    CLAMPED_ACCOUNT_OVERRIDE: "clampedAccountOverride",
    IGNORED_ACCOUNT_OVERRIDE: "ignoredAccountOverride",
    FALLBACK_GUARDRAIL: "fallbackGuardrail"
  });

  const LIFESTYLE_RANGE_BEHAVIORS = Object.freeze({
    FIXED: "fixed",
    COMPRESSIBLE: "compressible",
    PAUSEABLE: "pauseable",
    EXPANDABLE: "expandable",
    REVIEW_ONLY: "reviewOnly"
  });

  const COMPRESSION_DECISIONS = Object.freeze({
    YES: "YES",
    NO: "NO",
    PAUSE: "PAUSE",
    INTERVENTION: "INTERVENTION"
  });

  const TIER_KEYS = Object.freeze(["minimum", "conservative", "average", "comfortable"]);
  const LIFESTYLE_TIER_KEYS = Object.freeze(["minimum", "conservative", "average", "comfortable", "notApplicable"]);
  const PROTECTED_FLOOR_POLICIES = Object.freeze([
    "preserveCurrent",
    "thresholdFloorIfPresent",
    "useThresholdProtectedFloor",
    "allowZero",
    "allowPauseToZero",
    "allowLowNonzero",
    "allowModerateReduction",
    "notApplicable"
  ]);
  const ZERO_FLOOR_POLICIES = Object.freeze(["allowZero", "allowPauseToZero"]);

  const DEFAULT_HARD_GUARDRAILS = Object.freeze({
    minConservativeFloorRatio: 0,
    minNonZeroConservativeFloorRatio: 0.1,
    maxElevatedCeilingRatio: 2,
    maxCeilingTierMultiplier: 2,
    minThresholdTierValue: 0,
    maxThresholdTierValue: 50000,
    protectedCategoryKeys: Object.freeze([
      "housingExpense",
      "housingProtected",
      "debtObligations",
      "taxes",
      "taxesAndLegal",
      "taxLegalObligation",
      "healthcare",
      "healthcareProtected",
      "insuranceProtection",
      "protectionInsurance",
      "childcareDependentCare",
      "childcareAndDependentSupport",
      "education",
      "givingCommunity",
      "valuesSensitiveGiving"
    ]),
    protectedExpenseTypeKeys: Object.freeze([
      "rentOrMortgagePayment",
      "propertyTaxes",
      "homeRentersInsurance",
      "hoaAssessments",
      "mortgageInsurancePmi",
      "autoLoanPayment",
      "autoLeasePayment",
      "creditCardMinimumPayment",
      "studentLoanPayment",
      "personalLoanPayment",
      "medicalDebtPayment",
      "businessDebtPayment",
      "otherDebtPayment",
      "taxDebtIrsPaymentPlan",
      "federalStateLocalIncomeTaxPayments",
      "quarterlyEstimatedTaxes",
      "selfEmploymentTax",
      "taxPreparationFees",
      "healthInsurancePremiums",
      "lifeInsurancePremiums",
      "termLifePremiums",
      "permanentLifePremiums",
      "disabilityInsurancePremiums",
      "longTermCareInsurance",
      "copaysCoinsurance",
      "prescriptionsMedicalSupplies",
      "mentalHealthCare",
      "dentalVisionOrthodontics",
      "daycareChildcare",
      "nannyInHomeChildcare",
      "afterSchoolCare",
      "privateSchoolTuition",
      "collegeTuition",
      "specialEducationServices",
      "charitableGiving",
      "tithingReligiousGiving",
      "remittancesFamilyAssistance"
    ])
  });

  function isPlainObject(value) {
    return Object.prototype.toString.call(value) === "[object Object]";
  }

  function normalizeKey(value) {
    return String(value == null ? "" : value).trim();
  }

  function asFiniteNumber(value) {
    const numberValue = Number(value);
    return Number.isFinite(numberValue) ? numberValue : null;
  }

  function cloneSerializable(value) {
    if (Array.isArray(value)) {
      return value.map(cloneSerializable);
    }

    if (isPlainObject(value)) {
      const clone = {};
      Object.keys(value).sort().forEach(function (key) {
        const nextValue = cloneSerializable(value[key]);
        if (nextValue !== undefined) {
          clone[key] = nextValue;
        }
      });
      return clone;
    }

    if (typeof value === "number") {
      return Number.isFinite(value) ? value : null;
    }

    if (value === undefined) {
      return undefined;
    }

    return value;
  }

  function clonePolicyRow(row) {
    return cloneSerializable(row || {});
  }

  function normalizePolicyList(list) {
    return Array.isArray(list) ? list.map(clonePolicyRow) : [];
  }

  function makeTrace() {
    return {
      calculationMethod: "household-expense-account-policy-resolver-v1",
      resolverVersion: HOUSEHOLD_EXPENSE_ACCOUNT_POLICY_RESOLVER_VERSION,
      source: "explicit-input",
      namespaces: Object.freeze(["lifestyleRangeOverrides", "compressionThresholdOverrides", "compressionPolicyOverrides", "guardrails"]),
      entries: [],
      summary: {
        defaultPolicy: 0,
        accountOverride: 0,
        clampedAccountOverride: 0,
        ignoredAccountOverride: 0,
        fallbackGuardrail: 0
      }
    };
  }

  function recordTrace(trace, namespace, id, field, source, value, reason) {
    const traceValue = cloneSerializable(value);
    trace.entries.push({
      namespace,
      id: id || null,
      field,
      source,
      value: traceValue === undefined ? null : traceValue,
      reason: reason || null
    });
    if (Object.prototype.hasOwnProperty.call(trace.summary, source)) {
      trace.summary[source] += 1;
    }
  }

  function addWarning(warnings, code, message, details) {
    warnings.push({
      code,
      message,
      details: cloneSerializable(details || {})
    });
  }

  function clampNumber(value, minValue, maxValue) {
    return Math.min(Math.max(value, minValue), maxValue);
  }

  function includesKey(list, value) {
    const normalizedValue = normalizeKey(value);
    return Array.isArray(list) && list.some(function (item) {
      return normalizeKey(item) === normalizedValue;
    });
  }

  function mergeHardGuardrails(hardGuardrails, accountGuardrails, warnings, trace) {
    const merged = cloneSerializable(DEFAULT_HARD_GUARDRAILS);
    const explicit = isPlainObject(hardGuardrails) ? hardGuardrails : {};

    [
      "minConservativeFloorRatio",
      "minNonZeroConservativeFloorRatio",
      "maxElevatedCeilingRatio",
      "maxCeilingTierMultiplier",
      "minThresholdTierValue",
      "maxThresholdTierValue"
    ].forEach(function (field) {
      const value = asFiniteNumber(explicit[field]);
      if (value !== null) {
        merged[field] = value;
      }
    });

    ["protectedCategoryKeys", "protectedExpenseTypeKeys"].forEach(function (field) {
      if (Array.isArray(explicit[field])) {
        merged[field] = explicit[field].map(normalizeKey).filter(Boolean).sort();
      }
    });

    if (!isPlainObject(accountGuardrails)) {
      return merged;
    }

    const tighteningRules = {
      minConservativeFloorRatio: "raiseMinimum",
      minNonZeroConservativeFloorRatio: "raiseMinimum",
      maxElevatedCeilingRatio: "lowerMaximum",
      maxCeilingTierMultiplier: "lowerMaximum",
      minThresholdTierValue: "raiseMinimum",
      maxThresholdTierValue: "lowerMaximum"
    };

    Object.keys(accountGuardrails).sort().forEach(function (field) {
      const mode = tighteningRules[field];
      if (!mode) {
        recordTrace(trace, "guardrails", "accountPolicy.guardrails", field, TRACE_SOURCES.IGNORED_ACCOUNT_OVERRIDE, accountGuardrails[field], "unsupported-guardrail-field");
        return;
      }

      const value = asFiniteNumber(accountGuardrails[field]);
      if (value === null) {
        recordTrace(trace, "guardrails", "accountPolicy.guardrails", field, TRACE_SOURCES.IGNORED_ACCOUNT_OVERRIDE, accountGuardrails[field], "invalid-guardrail-value");
        return;
      }

      const previous = merged[field];
      const next = mode === "raiseMinimum" ? Math.max(previous, value) : Math.min(previous, value);
      merged[field] = next;
      recordTrace(
        trace,
        "guardrails",
        "accountPolicy.guardrails",
        field,
        next === value ? TRACE_SOURCES.ACCOUNT_OVERRIDE : TRACE_SOURCES.FALLBACK_GUARDRAIL,
        next,
        next === value ? "account-tightened-guardrail" : "account-guardrail-cannot-weaken-hard-limit"
      );
    });

    if (merged.minConservativeFloorRatio < 0) {
      merged.minConservativeFloorRatio = 0;
      addWarning(warnings, "guardrail-min-floor-clamped", "Minimum conservative floor guardrail was clamped to zero.");
    }
    if (merged.minNonZeroConservativeFloorRatio < merged.minConservativeFloorRatio) {
      merged.minNonZeroConservativeFloorRatio = merged.minConservativeFloorRatio;
    }
    if (merged.maxElevatedCeilingRatio < 1) {
      merged.maxElevatedCeilingRatio = 1;
    }
    if (merged.maxCeilingTierMultiplier < 0) {
      merged.maxCeilingTierMultiplier = 0;
    }
    if (merged.maxThresholdTierValue < merged.minThresholdTierValue) {
      merged.maxThresholdTierValue = merged.minThresholdTierValue;
    }

    return merged;
  }

  function normalizeOverrideRows(overrides, namespace, warnings) {
    if (overrides == null) {
      return [];
    }

    if (Array.isArray(overrides)) {
      return overrides
        .filter(function (row, index) {
          const valid = isPlainObject(row);
          if (!valid) {
            addWarning(warnings, "ignored-invalid-override-row", `${namespace} override row was ignored because it is not an object.`, { index });
          }
          return valid;
        })
        .map(clonePolicyRow);
    }

    if (isPlainObject(overrides)) {
      return Object.keys(overrides).sort().reduce(function (rows, key) {
        const row = overrides[key];
        if (!isPlainObject(row)) {
          addWarning(warnings, "ignored-invalid-override-row", `${namespace} override row was ignored because it is not an object.`, { key });
          return rows;
        }
        const normalized = clonePolicyRow(row);
        normalized.overrideKey = normalized.overrideKey || key;
        rows.push(normalized);
        return rows;
      }, []);
    }

    addWarning(warnings, "ignored-invalid-override-namespace", `${namespace} was ignored because it is not an object or array.`, { namespace });
    return [];
  }

  function getLifestyleIdentity(row) {
    return normalizeKey(row.expenseTypeKey || row.typeKey || row.rangePolicyId || row.overrideKey || row.categoryKey);
  }

  function getCompressionPolicyIdentity(row) {
    return normalizeKey(row.expenseTypeKey || row.typeKey || row.policyId || row.overrideKey);
  }

  function getThresholdIdentity(row) {
    return normalizeKey(row.thresholdId || row.expenseTypeKey || row.typeKey || row.overrideKey);
  }

  function findLifestyleTarget(policies, override) {
    const rangePolicyId = normalizeKey(override.rangePolicyId);
    const expenseTypeKey = normalizeKey(override.expenseTypeKey || override.typeKey || override.overrideKey);
    const categoryKey = normalizeKey(override.categoryKey);

    return policies.find(function (policy) {
      return (rangePolicyId && policy.rangePolicyId === rangePolicyId)
        || (expenseTypeKey && policy.expenseTypeKey === expenseTypeKey)
        || (categoryKey && policy.categoryKey === categoryKey);
    }) || null;
  }

  function findCompressionPolicyTarget(policies, override) {
    const policyId = normalizeKey(override.policyId);
    const expenseTypeKey = normalizeKey(override.expenseTypeKey || override.typeKey || override.overrideKey);

    return policies.find(function (policy) {
      return (policyId && policy.policyId === policyId)
        || (expenseTypeKey && policy.expenseTypeKey === expenseTypeKey);
    }) || null;
  }

  function findThresholdTarget(thresholds, override) {
    const thresholdId = normalizeKey(override.thresholdId || override.overrideKey);
    const expenseTypeKey = normalizeKey(override.expenseTypeKey || override.typeKey);

    return thresholds.find(function (rule) {
      return (thresholdId && rule.thresholdId === thresholdId)
        || (expenseTypeKey && rule.expenseTypeKey === expenseTypeKey);
    }) || null;
  }

  function isZeroFloorAllowed(policy) {
    return policy.rangeBehavior === LIFESTYLE_RANGE_BEHAVIORS.PAUSEABLE
      || includesKey(ZERO_FLOOR_POLICIES, policy.protectedFloorPolicy)
      || policy.conservativeFloorRatio === 0;
  }

  function isProtectedLifestylePolicy(policy, guardrails) {
    return includesKey(guardrails.protectedExpenseTypeKeys, policy.expenseTypeKey)
      || includesKey(guardrails.protectedCategoryKeys, policy.categoryKey)
      || (policy.sliderEligible !== true && (
        policy.rangeBehavior === LIFESTYLE_RANGE_BEHAVIORS.FIXED
        || policy.rangeBehavior === LIFESTYLE_RANGE_BEHAVIORS.REVIEW_ONLY
      ));
  }

  function isAllowedLifestyleBehavior(defaultPolicy, requestedBehavior) {
    if (!Object.values(LIFESTYLE_RANGE_BEHAVIORS).includes(requestedBehavior)) {
      return false;
    }

    if (defaultPolicy.rangeBehavior === LIFESTYLE_RANGE_BEHAVIORS.PAUSEABLE) {
      return requestedBehavior === LIFESTYLE_RANGE_BEHAVIORS.PAUSEABLE
        || requestedBehavior === LIFESTYLE_RANGE_BEHAVIORS.REVIEW_ONLY
        || requestedBehavior === LIFESTYLE_RANGE_BEHAVIORS.FIXED;
    }

    if (defaultPolicy.sliderEligible === true) {
      return requestedBehavior === LIFESTYLE_RANGE_BEHAVIORS.COMPRESSIBLE
        || requestedBehavior === LIFESTYLE_RANGE_BEHAVIORS.EXPANDABLE
        || requestedBehavior === LIFESTYLE_RANGE_BEHAVIORS.REVIEW_ONLY
        || requestedBehavior === LIFESTYLE_RANGE_BEHAVIORS.FIXED;
    }

    return requestedBehavior === defaultPolicy.rangeBehavior
      || requestedBehavior === LIFESTYLE_RANGE_BEHAVIORS.REVIEW_ONLY
      || requestedBehavior === LIFESTYLE_RANGE_BEHAVIORS.FIXED;
  }

  function applyLifestyleNumericOverride(target, defaultPolicy, override, field, minValue, maxValue, namespace, trace) {
    const value = asFiniteNumber(override[field]);
    const id = defaultPolicy.rangePolicyId || defaultPolicy.expenseTypeKey;

    if (value === null) {
      recordTrace(trace, namespace, id, field, TRACE_SOURCES.IGNORED_ACCOUNT_OVERRIDE, override[field], "invalid-number");
      return;
    }

    const clamped = clampNumber(value, minValue, maxValue);
    target[field] = clamped;
    recordTrace(
      trace,
      namespace,
      id,
      field,
      clamped === value ? TRACE_SOURCES.ACCOUNT_OVERRIDE : TRACE_SOURCES.CLAMPED_ACCOUNT_OVERRIDE,
      clamped,
      clamped === value ? null : "outside-hard-bounds"
    );
  }

  function applyLifestyleOverrides(defaultPolicies, overrideRows, guardrails, warnings, trace) {
    const policies = defaultPolicies.map(clonePolicyRow);
    const defaultByType = {};
    defaultPolicies.forEach(function (policy) {
      defaultByType[policy.expenseTypeKey] = clonePolicyRow(policy);
      recordTrace(trace, "lifestyleRangePolicies", policy.rangePolicyId || policy.expenseTypeKey, "row", TRACE_SOURCES.DEFAULT_POLICY, policy.expenseTypeKey, "seed-policy-row");
    });

    overrideRows.forEach(function (override) {
      const target = findLifestyleTarget(policies, override);
      const overrideId = getLifestyleIdentity(override);

      if (!target) {
        addWarning(warnings, "ignored-unknown-lifestyle-override", "Lifestyle range override did not match a seed policy row.", { overrideId });
        recordTrace(trace, "lifestyleRangeOverrides", overrideId, "row", TRACE_SOURCES.IGNORED_ACCOUNT_OVERRIDE, override, "unknown-policy-row");
        return;
      }

      const defaultPolicy = defaultByType[target.expenseTypeKey] || clonePolicyRow(target);
      const protectedPolicy = isProtectedLifestylePolicy(defaultPolicy, guardrails);
      const targetId = target.rangePolicyId || target.expenseTypeKey;

      Object.keys(override).sort().forEach(function (field) {
        if (["rangePolicyId", "expenseTypeKey", "typeKey", "categoryKey", "overrideKey"].includes(field)) {
          return;
        }

        if (["sourcePolicyDecision", "version"].includes(field)) {
          recordTrace(trace, "lifestyleRangeOverrides", targetId, field, TRACE_SOURCES.IGNORED_ACCOUNT_OVERRIDE, override[field], "locked-policy-field");
          return;
        }

        if (field === "sliderEligible") {
          const requested = override[field] === true;
          if (protectedPolicy && requested) {
            target.sliderEligible = false;
            target.allowBelowBaseline = false;
            target.allowAboveBaseline = false;
            target.rangeBehavior = defaultPolicy.rangeBehavior;
            recordTrace(trace, "lifestyleRangeOverrides", targetId, field, TRACE_SOURCES.FALLBACK_GUARDRAIL, false, "protected-category-cannot-be-slider-eligible");
            return;
          }
          if (defaultPolicy.sliderEligible === true) {
            target.sliderEligible = requested;
            if (!requested) {
              target.allowBelowBaseline = false;
              target.allowAboveBaseline = false;
            }
            recordTrace(trace, "lifestyleRangeOverrides", targetId, field, TRACE_SOURCES.ACCOUNT_OVERRIDE, requested, null);
            return;
          }
          recordTrace(trace, "lifestyleRangeOverrides", targetId, field, TRACE_SOURCES.IGNORED_ACCOUNT_OVERRIDE, override[field], "seed-policy-not-slider-eligible");
          return;
        }

        if (field === "rangeBehavior") {
          const requestedBehavior = normalizeKey(override[field]);
          if (protectedPolicy && ![LIFESTYLE_RANGE_BEHAVIORS.FIXED, LIFESTYLE_RANGE_BEHAVIORS.REVIEW_ONLY].includes(requestedBehavior)) {
            target.rangeBehavior = defaultPolicy.rangeBehavior;
            recordTrace(trace, "lifestyleRangeOverrides", targetId, field, TRACE_SOURCES.FALLBACK_GUARDRAIL, target.rangeBehavior, "protected-category-behavior-locked");
            return;
          }
          if (!isAllowedLifestyleBehavior(defaultPolicy, requestedBehavior)) {
            recordTrace(trace, "lifestyleRangeOverrides", targetId, field, TRACE_SOURCES.IGNORED_ACCOUNT_OVERRIDE, override[field], "unsupported-range-behavior-transition");
            return;
          }
          target.rangeBehavior = requestedBehavior;
          if (requestedBehavior === LIFESTYLE_RANGE_BEHAVIORS.FIXED || requestedBehavior === LIFESTYLE_RANGE_BEHAVIORS.REVIEW_ONLY) {
            target.sliderEligible = false;
            target.allowBelowBaseline = false;
            target.allowAboveBaseline = false;
            target.requiresAdvisorReview = requestedBehavior === LIFESTYLE_RANGE_BEHAVIORS.REVIEW_ONLY || target.requiresAdvisorReview === true;
          }
          recordTrace(trace, "lifestyleRangeOverrides", targetId, field, TRACE_SOURCES.ACCOUNT_OVERRIDE, requestedBehavior, null);
          return;
        }

        if (field === "allowBelowBaseline") {
          const requested = override[field] === true;
          if (requested && (protectedPolicy || defaultPolicy.allowBelowBaseline !== true)) {
            recordTrace(trace, "lifestyleRangeOverrides", targetId, field, TRACE_SOURCES.FALLBACK_GUARDRAIL, false, "below-baseline-movement-not-allowed");
            return;
          }
          target.allowBelowBaseline = requested;
          recordTrace(trace, "lifestyleRangeOverrides", targetId, field, TRACE_SOURCES.ACCOUNT_OVERRIDE, requested, null);
          return;
        }

        if (field === "allowAboveBaseline") {
          const requested = override[field] === true;
          if (requested && (protectedPolicy || defaultPolicy.allowAboveBaseline !== true || defaultPolicy.rangeBehavior === LIFESTYLE_RANGE_BEHAVIORS.PAUSEABLE)) {
            recordTrace(trace, "lifestyleRangeOverrides", targetId, field, TRACE_SOURCES.FALLBACK_GUARDRAIL, false, "above-baseline-movement-not-allowed");
            return;
          }
          target.allowAboveBaseline = requested;
          recordTrace(trace, "lifestyleRangeOverrides", targetId, field, TRACE_SOURCES.ACCOUNT_OVERRIDE, requested, null);
          return;
        }

        if (field === "conservativeFloorRatio") {
          if (protectedPolicy || target.allowBelowBaseline !== true) {
            recordTrace(trace, "lifestyleRangeOverrides", targetId, field, TRACE_SOURCES.FALLBACK_GUARDRAIL, defaultPolicy.conservativeFloorRatio, "protected-or-fixed-floor-locked");
            return;
          }
          const minRatio = isZeroFloorAllowed(defaultPolicy) ? guardrails.minConservativeFloorRatio : guardrails.minNonZeroConservativeFloorRatio;
          applyLifestyleNumericOverride(target, defaultPolicy, override, field, minRatio, 1, "lifestyleRangeOverrides", trace);
          return;
        }

        if (field === "elevatedCeilingRatio") {
          if (protectedPolicy || target.allowAboveBaseline !== true) {
            recordTrace(trace, "lifestyleRangeOverrides", targetId, field, TRACE_SOURCES.FALLBACK_GUARDRAIL, defaultPolicy.elevatedCeilingRatio, "protected-or-fixed-ceiling-locked");
            return;
          }
          applyLifestyleNumericOverride(target, defaultPolicy, override, field, 1, guardrails.maxElevatedCeilingRatio, "lifestyleRangeOverrides", trace);
          return;
        }

        if (field === "ceilingTierMultiplier") {
          if (protectedPolicy || target.allowAboveBaseline !== true) {
            recordTrace(trace, "lifestyleRangeOverrides", targetId, field, TRACE_SOURCES.FALLBACK_GUARDRAIL, defaultPolicy.ceilingTierMultiplier, "protected-or-fixed-tier-multiplier-locked");
            return;
          }
          applyLifestyleNumericOverride(target, defaultPolicy, override, field, 0, guardrails.maxCeilingTierMultiplier, "lifestyleRangeOverrides", trace);
          return;
        }

        if (field === "floorTierKey" || field === "ceilingTierKey") {
          const value = normalizeKey(override[field]);
          if (!includesKey(LIFESTYLE_TIER_KEYS, value)) {
            recordTrace(trace, "lifestyleRangeOverrides", targetId, field, TRACE_SOURCES.IGNORED_ACCOUNT_OVERRIDE, override[field], "unsupported-tier-key");
            return;
          }
          target[field] = value;
          recordTrace(trace, "lifestyleRangeOverrides", targetId, field, TRACE_SOURCES.ACCOUNT_OVERRIDE, value, null);
          return;
        }

        if (field === "protectedFloorPolicy") {
          const value = normalizeKey(override[field]);
          if (!includesKey(PROTECTED_FLOOR_POLICIES, value)) {
            recordTrace(trace, "lifestyleRangeOverrides", targetId, field, TRACE_SOURCES.IGNORED_ACCOUNT_OVERRIDE, override[field], "unsupported-protected-floor-policy");
            return;
          }
          if (includesKey(ZERO_FLOOR_POLICIES, value) && !isZeroFloorAllowed(defaultPolicy)) {
            recordTrace(trace, "lifestyleRangeOverrides", targetId, field, TRACE_SOURCES.FALLBACK_GUARDRAIL, defaultPolicy.protectedFloorPolicy, "zero-floor-not-allowed-for-seed-policy");
            return;
          }
          target[field] = value;
          recordTrace(trace, "lifestyleRangeOverrides", targetId, field, TRACE_SOURCES.ACCOUNT_OVERRIDE, value, null);
          return;
        }

        if (field === "requiresAdvisorReview") {
          const requested = override[field] === true;
          if (defaultPolicy.requiresAdvisorReview === true && requested === false) {
            recordTrace(trace, "lifestyleRangeOverrides", targetId, field, TRACE_SOURCES.FALLBACK_GUARDRAIL, true, "advisor-review-cannot-be-weakened");
            return;
          }
          target.requiresAdvisorReview = requested;
          recordTrace(trace, "lifestyleRangeOverrides", targetId, field, TRACE_SOURCES.ACCOUNT_OVERRIDE, requested, null);
          return;
        }

        if (field === "notes" || field === "displayName") {
          if (typeof override[field] !== "string") {
            recordTrace(trace, "lifestyleRangeOverrides", targetId, field, TRACE_SOURCES.IGNORED_ACCOUNT_OVERRIDE, override[field], "invalid-text-value");
            return;
          }
          target[field] = override[field].trim().slice(0, 1000) || defaultPolicy[field];
          recordTrace(trace, "lifestyleRangeOverrides", targetId, field, TRACE_SOURCES.ACCOUNT_OVERRIDE, target[field], null);
          return;
        }

        recordTrace(trace, "lifestyleRangeOverrides", targetId, field, TRACE_SOURCES.IGNORED_ACCOUNT_OVERRIDE, override[field], "unsupported-lifestyle-override-field");
      });
    });

    policies.forEach(function (policy) {
      const defaultPolicy = defaultByType[policy.expenseTypeKey] || policy;
      const protectedPolicy = isProtectedLifestylePolicy(defaultPolicy, guardrails);
      if (protectedPolicy && policy.sliderEligible === true) {
        policy.sliderEligible = false;
        policy.allowBelowBaseline = false;
        policy.allowAboveBaseline = false;
        policy.rangeBehavior = defaultPolicy.rangeBehavior;
        recordTrace(trace, "lifestyleRangePolicies", policy.rangePolicyId || policy.expenseTypeKey, "sliderEligible", TRACE_SOURCES.FALLBACK_GUARDRAIL, false, "final-protected-category-guardrail");
      }
      if (policy.conservativeFloorRatio !== null) {
        const minRatio = isZeroFloorAllowed(defaultPolicy) ? guardrails.minConservativeFloorRatio : guardrails.minNonZeroConservativeFloorRatio;
        policy.conservativeFloorRatio = clampNumber(policy.conservativeFloorRatio, minRatio, 1);
      }
      if (policy.elevatedCeilingRatio !== null) {
        policy.elevatedCeilingRatio = clampNumber(policy.elevatedCeilingRatio, 1, guardrails.maxElevatedCeilingRatio);
      }
    });

    return policies;
  }

  function applyThresholdTiers(target, overrideTiers, guardrails, namespace, trace) {
    if (!isPlainObject(overrideTiers)) {
      recordTrace(trace, namespace, target.thresholdId || target.expenseTypeKey, "tiers", TRACE_SOURCES.IGNORED_ACCOUNT_OVERRIDE, overrideTiers, "invalid-tiers-object");
      return;
    }

    const nextTiers = cloneSerializable(target.tiers || {});
    TIER_KEYS.forEach(function (tierKey) {
      if (!Object.prototype.hasOwnProperty.call(overrideTiers, tierKey)) {
        return;
      }
      const value = asFiniteNumber(overrideTiers[tierKey]);
      if (value === null) {
        recordTrace(trace, namespace, target.thresholdId || target.expenseTypeKey, `tiers.${tierKey}`, TRACE_SOURCES.IGNORED_ACCOUNT_OVERRIDE, overrideTiers[tierKey], "invalid-tier-value");
        return;
      }
      const clamped = clampNumber(value, guardrails.minThresholdTierValue, guardrails.maxThresholdTierValue);
      nextTiers[tierKey] = clamped;
      recordTrace(
        trace,
        namespace,
        target.thresholdId || target.expenseTypeKey,
        `tiers.${tierKey}`,
        clamped === value ? TRACE_SOURCES.ACCOUNT_OVERRIDE : TRACE_SOURCES.CLAMPED_ACCOUNT_OVERRIDE,
        clamped,
        clamped === value ? null : "threshold-tier-outside-hard-bounds"
      );
    });

    let previous = null;
    TIER_KEYS.forEach(function (tierKey) {
      const value = asFiniteNumber(nextTiers[tierKey]);
      if (value === null) {
        return;
      }
      if (previous !== null && value < previous) {
        nextTiers[tierKey] = previous;
        recordTrace(trace, namespace, target.thresholdId || target.expenseTypeKey, `tiers.${tierKey}`, TRACE_SOURCES.CLAMPED_ACCOUNT_OVERRIDE, previous, "threshold-tier-order-enforced");
      }
      previous = nextTiers[tierKey];
    });

    target.tiers = nextTiers;
  }

  function applyCompressionThresholdOverrides(defaultThresholds, overrideRows, guardrails, warnings, trace) {
    const thresholds = defaultThresholds.map(clonePolicyRow);
    thresholds.forEach(function (rule) {
      recordTrace(trace, "compressionThresholdRules", rule.thresholdId || rule.expenseTypeKey, "row", TRACE_SOURCES.DEFAULT_POLICY, rule.thresholdId || rule.expenseTypeKey, "seed-policy-row");
    });

    overrideRows.forEach(function (override) {
      const target = findThresholdTarget(thresholds, override);
      const overrideId = getThresholdIdentity(override);
      if (!target) {
        addWarning(warnings, "ignored-unknown-threshold-override", "Compression threshold override did not match a seed threshold row.", { overrideId });
        recordTrace(trace, "compressionThresholdOverrides", overrideId, "row", TRACE_SOURCES.IGNORED_ACCOUNT_OVERRIDE, override, "unknown-threshold-row");
        return;
      }

      const targetId = target.thresholdId || target.expenseTypeKey;
      const orderedFields = Object.keys(override).sort(function (left, right) {
        if (left === "tiers") {
          return -1;
        }
        if (right === "tiers") {
          return 1;
        }
        if (left === "protectedFloor" && right !== "tiers") {
          return -1;
        }
        if (right === "protectedFloor" && left !== "tiers") {
          return 1;
        }
        return left.localeCompare(right);
      });

      orderedFields.forEach(function (field) {
        if (["thresholdId", "expenseTypeKey", "typeKey", "overrideKey"].includes(field)) {
          return;
        }

        if (field === "tiers") {
          applyThresholdTiers(target, override.tiers, guardrails, "compressionThresholdOverrides", trace);
          return;
        }

        if (field === "protectedFloor") {
          const value = asFiniteNumber(override[field]);
          if (value === null) {
            recordTrace(trace, "compressionThresholdOverrides", targetId, field, TRACE_SOURCES.IGNORED_ACCOUNT_OVERRIDE, override[field], "invalid-protected-floor");
            return;
          }
          const tiers = target.tiers || {};
          const minimum = asFiniteNumber(tiers.minimum);
          const comfortable = asFiniteNumber(tiers.comfortable);
          const minValue = minimum === null ? guardrails.minThresholdTierValue : minimum;
          const maxValue = comfortable === null ? guardrails.maxThresholdTierValue : Math.min(comfortable, guardrails.maxThresholdTierValue);
          const clamped = clampNumber(value, minValue, maxValue);
          target.protectedFloor = clamped;
          recordTrace(
            trace,
            "compressionThresholdOverrides",
            targetId,
            field,
            clamped === value ? TRACE_SOURCES.ACCOUNT_OVERRIDE : TRACE_SOURCES.CLAMPED_ACCOUNT_OVERRIDE,
            clamped,
            clamped === value ? null : "protected-floor-outside-safe-bounds"
          );
          return;
        }

        if (field === "notes") {
          if (typeof override[field] !== "string") {
            recordTrace(trace, "compressionThresholdOverrides", targetId, field, TRACE_SOURCES.IGNORED_ACCOUNT_OVERRIDE, override[field], "invalid-text-value");
            return;
          }
          target.notes = override[field].trim().slice(0, 1000) || target.notes;
          recordTrace(trace, "compressionThresholdOverrides", targetId, field, TRACE_SOURCES.ACCOUNT_OVERRIDE, target.notes, null);
          return;
        }

        recordTrace(trace, "compressionThresholdOverrides", targetId, field, TRACE_SOURCES.IGNORED_ACCOUNT_OVERRIDE, override[field], "unsupported-threshold-override-field");
      });
    });

    return thresholds;
  }

  function isProtectedCompressionPolicy(policy) {
    return policy.decision === COMPRESSION_DECISIONS.NO
      || policy.decision === COMPRESSION_DECISIONS.INTERVENTION
      || policy.canAutoReduce !== true;
  }

  function applyCompressionPolicyOverrides(defaultPolicies, overrideRows, warnings, trace) {
    const policies = defaultPolicies.map(clonePolicyRow);
    policies.forEach(function (rule) {
      recordTrace(trace, "compressionPolicyRules", rule.policyId || rule.expenseTypeKey, "row", TRACE_SOURCES.DEFAULT_POLICY, rule.policyId || rule.expenseTypeKey, "seed-policy-row");
    });

    overrideRows.forEach(function (override) {
      const target = findCompressionPolicyTarget(policies, override);
      const overrideId = getCompressionPolicyIdentity(override);
      if (!target) {
        addWarning(warnings, "ignored-unknown-compression-policy-override", "Compression policy override did not match a seed policy row.", { overrideId });
        recordTrace(trace, "compressionPolicyOverrides", overrideId, "row", TRACE_SOURCES.IGNORED_ACCOUNT_OVERRIDE, override, "unknown-compression-policy-row");
        return;
      }

      const protectedPolicy = isProtectedCompressionPolicy(target);
      const targetId = target.policyId || target.expenseTypeKey;
      Object.keys(override).sort().forEach(function (field) {
        if (["policyId", "expenseTypeKey", "typeKey", "overrideKey"].includes(field)) {
          return;
        }

        if (["decision", "canAutoReduce", "compressionOrderGroup", "compressionOrderRank", "projectionEffect", "timelineTreatment", "behaviorClass"].includes(field)) {
          recordTrace(
            trace,
            "compressionPolicyOverrides",
            targetId,
            field,
            protectedPolicy ? TRACE_SOURCES.FALLBACK_GUARDRAIL : TRACE_SOURCES.IGNORED_ACCOUNT_OVERRIDE,
            target[field],
            protectedPolicy ? "protected-compression-policy-field-locked" : "locked-compression-policy-field"
          );
          return;
        }

        if (field === "canPause") {
          const requested = override[field] === true;
          if (requested && target.canPause !== true) {
            recordTrace(trace, "compressionPolicyOverrides", targetId, field, TRACE_SOURCES.FALLBACK_GUARDRAIL, false, "only-pause-candidates-can-pause");
            return;
          }
          target.canPause = requested;
          recordTrace(trace, "compressionPolicyOverrides", targetId, field, TRACE_SOURCES.ACCOUNT_OVERRIDE, requested, null);
          return;
        }

        if (field === "canReduceToZero") {
          const requested = override[field] === true;
          if (requested && target.canReduceToZero !== true) {
            recordTrace(trace, "compressionPolicyOverrides", targetId, field, TRACE_SOURCES.FALLBACK_GUARDRAIL, false, "seed-policy-cannot-reduce-to-zero");
            return;
          }
          target.canReduceToZero = requested;
          recordTrace(trace, "compressionPolicyOverrides", targetId, field, TRACE_SOURCES.ACCOUNT_OVERRIDE, requested, null);
          return;
        }

        if (field === "requiresAdvisorConfirmation") {
          const requested = override[field] === true;
          target.requiresAdvisorConfirmation = requested || target.requiresAdvisorConfirmation === true;
          recordTrace(trace, "compressionPolicyOverrides", targetId, field, requested ? TRACE_SOURCES.ACCOUNT_OVERRIDE : TRACE_SOURCES.FALLBACK_GUARDRAIL, target.requiresAdvisorConfirmation, requested ? null : "advisor-confirmation-cannot-be-weakened-by-v1-policy");
          return;
        }

        if (field === "notes") {
          if (typeof override[field] !== "string") {
            recordTrace(trace, "compressionPolicyOverrides", targetId, field, TRACE_SOURCES.IGNORED_ACCOUNT_OVERRIDE, override[field], "invalid-text-value");
            return;
          }
          target.notes = override[field].trim().slice(0, 1000) || target.notes;
          recordTrace(trace, "compressionPolicyOverrides", targetId, field, TRACE_SOURCES.ACCOUNT_OVERRIDE, target.notes, null);
          return;
        }

        recordTrace(trace, "compressionPolicyOverrides", targetId, field, TRACE_SOURCES.IGNORED_ACCOUNT_OVERRIDE, override[field], "unsupported-compression-policy-override-field");
      });
    });

    policies.forEach(function (policy) {
      if (policy.decision === COMPRESSION_DECISIONS.NO || policy.decision === COMPRESSION_DECISIONS.INTERVENTION) {
        policy.canAutoReduce = false;
        policy.canPause = false;
      }
    });

    return policies;
  }

  function resolveHouseholdExpenseAccountPolicy(input) {
    const options = isPlainObject(input) ? input : {};
    const warnings = [];
    const dataGaps = [];
    const trace = makeTrace();

    const defaultLifestyleRangePolicies = normalizePolicyList(options.defaultLifestyleRangePolicies);
    const defaultCompressionPolicyRules = normalizePolicyList(options.defaultCompressionPolicyRules);
    const defaultCompressionThresholdRules = normalizePolicyList(options.defaultCompressionThresholdRules);

    const hasAccountPolicy = isPlainObject(options.accountPolicy);
    const accountPolicy = hasAccountPolicy ? cloneSerializable(options.accountPolicy) : null;
    if (options.accountPolicy != null && !hasAccountPolicy) {
      addWarning(warnings, "invalid-account-policy", "Account policy was ignored because it is not an object.");
    }
    if (!hasAccountPolicy) {
      addWarning(warnings, "missing-account-policy", "No account policy override was provided; MODEL90 seed defaults were used.");
    }

    if (!defaultLifestyleRangePolicies.length) {
      dataGaps.push({ code: "missing-default-lifestyle-range-policies", message: "Default lifestyle range policies were not provided." });
    }
    if (!defaultCompressionPolicyRules.length) {
      dataGaps.push({ code: "missing-default-compression-policy-rules", message: "Default compression policy rules were not provided." });
    }
    if (!defaultCompressionThresholdRules.length) {
      dataGaps.push({ code: "missing-default-compression-threshold-rules", message: "Default compression threshold rules were not provided." });
    }

    const guardrails = mergeHardGuardrails(
      options.hardGuardrails,
      accountPolicy ? accountPolicy.guardrails : null,
      warnings,
      trace
    );

    const lifestyleOverrides = normalizeOverrideRows(accountPolicy ? accountPolicy.lifestyleRangeOverrides : null, "lifestyleRangeOverrides", warnings);
    const thresholdOverrides = normalizeOverrideRows(accountPolicy ? accountPolicy.compressionThresholdOverrides : null, "compressionThresholdOverrides", warnings);
    const compressionPolicyOverrides = normalizeOverrideRows(accountPolicy ? accountPolicy.compressionPolicyOverrides : null, "compressionPolicyOverrides", warnings);

    const resolvedLifestyleRangePolicies = applyLifestyleOverrides(defaultLifestyleRangePolicies, lifestyleOverrides, guardrails, warnings, trace);
    const resolvedCompressionThresholdRules = applyCompressionThresholdOverrides(defaultCompressionThresholdRules, thresholdOverrides, guardrails, warnings, trace);
    const resolvedCompressionPolicyRules = applyCompressionPolicyOverrides(defaultCompressionPolicyRules, compressionPolicyOverrides, warnings, trace);

    trace.summary.warningCount = warnings.length;
    trace.summary.dataGapCount = dataGaps.length;

    return cloneSerializable({
      resolvedLifestyleRangePolicies,
      resolvedCompressionPolicyRules,
      resolvedCompressionThresholdRules,
      warnings,
      dataGaps,
      trace,
      metadata: {
        resolverVersion: HOUSEHOLD_EXPENSE_ACCOUNT_POLICY_RESOLVER_VERSION,
        accountPolicyVersion: accountPolicy && accountPolicy.version ? accountPolicy.version : null,
        source: hasAccountPolicy ? "defaultPolicy-plus-accountOverride" : "defaultPolicy",
        namespaces: {
          lifestyleRangePolicies: resolvedLifestyleRangePolicies.length,
          compressionPolicyRules: resolvedCompressionPolicyRules.length,
          compressionThresholdRules: resolvedCompressionThresholdRules.length,
          lifestyleRangeOverrides: lifestyleOverrides.length,
          compressionPolicyOverrides: compressionPolicyOverrides.length,
          compressionThresholdOverrides: thresholdOverrides.length
        },
        accountMetadata: accountPolicy && isPlainObject(accountPolicy.metadata) ? cloneSerializable(accountPolicy.metadata) : null
      }
    });
  }

  lensAnalysis.householdExpenseAccountPolicyResolver = Object.freeze({
    HOUSEHOLD_EXPENSE_ACCOUNT_POLICY_RESOLVER_VERSION,
    TRACE_SOURCES,
    DEFAULT_HARD_GUARDRAILS,
    resolveHouseholdExpenseAccountPolicy
  });
})(typeof globalThis !== "undefined" ? globalThis : this);
