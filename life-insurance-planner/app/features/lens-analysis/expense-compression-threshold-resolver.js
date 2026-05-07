(function (global) {
  const LensApp = global.LensApp || (global.LensApp = {});
  const lensAnalysis = LensApp.lensAnalysis || (LensApp.lensAnalysis = {});

  // Owner: Lens analysis passive expense compression threshold resolver.
  // Purpose: validate advisor/account threshold overrides and resolve them
  // against explicit MODEL90 default threshold input.
  // Non-goals: no persistence, no UI, no formula behavior, no normalization
  // behavior, and no Layer 5 wiring.

  const THRESHOLD_TIER_KEYS = Object.freeze([
    "minimum",
    "conservative",
    "average",
    "comfortable"
  ]);

  const ADVISOR_THRESHOLD_OVERRIDE_FIELDS = Object.freeze([
    "tiers",
    "protectedFloor",
    "updatedBy",
    "updatedAt"
  ]);

  const ADVISOR_THRESHOLD_METADATA_FIELDS = Object.freeze([
    "updatedBy",
    "updatedAt"
  ]);

  function isPlainObject(value) {
    return Object.prototype.toString.call(value) === "[object Object]";
  }

  function cloneTiers(tiers) {
    const safeTiers = isPlainObject(tiers) ? tiers : {};
    return {
      minimum: safeTiers.minimum,
      conservative: safeTiers.conservative,
      average: safeTiers.average,
      comfortable: safeTiers.comfortable
    };
  }

  function cloneThresholdRule(rule) {
    return {
      ...rule,
      tiers: cloneTiers(rule?.tiers)
    };
  }

  function normalizeThresholdId(value) {
    return String(value == null ? "" : value).trim();
  }

  function isFiniteNonNegativeNumber(value) {
    return typeof value === "number" && Number.isFinite(value) && value >= 0;
  }

  function createWarning(code, message, details) {
    return {
      code,
      message,
      ...(isPlainObject(details) ? details : {})
    };
  }

  function areTiersOrdered(tiers) {
    return tiers.minimum <= tiers.conservative
      && tiers.conservative <= tiers.average
      && tiers.average <= tiers.comfortable;
  }

  function normalizeDefaultThresholds(defaultThresholds, warnings) {
    const rules = Array.isArray(defaultThresholds) ? defaultThresholds : [];
    if (!Array.isArray(defaultThresholds)) {
      warnings.push(createWarning(
        "invalid-default-thresholds",
        "Default threshold input must be an array of threshold rules.",
        { sourcePath: "defaultThresholds" }
      ));
    }

    return rules
      .filter(function (rule, index) {
        if (!isPlainObject(rule)) {
          warnings.push(createWarning(
            "invalid-default-threshold-rule",
            "Default threshold rule was ignored because it is not an object.",
            { sourcePath: `defaultThresholds.${index}` }
          ));
          return false;
        }
        if (!normalizeThresholdId(rule.thresholdId)) {
          warnings.push(createWarning(
            "missing-default-threshold-id",
            "Default threshold rule was ignored because it has no thresholdId.",
            { sourcePath: `defaultThresholds.${index}` }
          ));
          return false;
        }
        return true;
      })
      .map(cloneThresholdRule);
  }

  function getAdvisorRulesByThresholdId(advisorOverrides, warnings) {
    if (advisorOverrides == null) {
      return {};
    }

    if (!isPlainObject(advisorOverrides)) {
      warnings.push(createWarning(
        "invalid-advisor-threshold-overrides",
        "Advisor threshold overrides were ignored because the override input is not an object.",
        { sourcePath: "advisorOverrides" }
      ));
      return {};
    }

    if (advisorOverrides.rulesByThresholdId == null) {
      return {};
    }

    if (!isPlainObject(advisorOverrides.rulesByThresholdId)) {
      warnings.push(createWarning(
        "invalid-advisor-threshold-rules",
        "Advisor threshold overrides were ignored because rulesByThresholdId is not an object.",
        { sourcePath: "advisorOverrides.rulesByThresholdId" }
      ));
      return {};
    }

    return advisorOverrides.rulesByThresholdId;
  }

  function collectUnsupportedOverrideFields(thresholdId, override, warnings) {
    Object.keys(override).forEach(function (field) {
      if (ADVISOR_THRESHOLD_OVERRIDE_FIELDS.indexOf(field) !== -1) {
        return;
      }

      warnings.push(createWarning(
        "unsupported-advisor-threshold-override-field",
        "Advisor threshold override field was ignored because it is not editable in V1.",
        {
          thresholdId,
          field,
          sourcePath: `advisorOverrides.rulesByThresholdId.${thresholdId}.${field}`
        }
      ));
    });
  }

  function resolveTierOverrides(thresholdId, defaultRule, override, warnings) {
    if (!Object.prototype.hasOwnProperty.call(override, "tiers")) {
      return null;
    }

    if (!isPlainObject(override.tiers)) {
      warnings.push(createWarning(
        "invalid-advisor-threshold-tiers",
        "Advisor threshold tier override was ignored because tiers is not an object.",
        { thresholdId, sourcePath: `advisorOverrides.rulesByThresholdId.${thresholdId}.tiers` }
      ));
      return null;
    }

    const unsupportedTierKeys = Object.keys(override.tiers).filter(function (tierKey) {
      return THRESHOLD_TIER_KEYS.indexOf(tierKey) === -1;
    });
    if (unsupportedTierKeys.length) {
      unsupportedTierKeys.forEach(function (tierKey) {
        warnings.push(createWarning(
          "unsupported-advisor-threshold-tier",
          "Advisor threshold tier override was ignored because the tier key is not supported.",
          {
            thresholdId,
            tierKey,
            sourcePath: `advisorOverrides.rulesByThresholdId.${thresholdId}.tiers.${tierKey}`
          }
        ));
      });
      return null;
    }

    const nextTiers = cloneTiers(defaultRule.tiers);
    let hasValidTier = false;
    let hasInvalidTier = false;
    THRESHOLD_TIER_KEYS.forEach(function (tierKey) {
      if (!Object.prototype.hasOwnProperty.call(override.tiers, tierKey)) {
        return;
      }

      const nextValue = Number(override.tiers[tierKey]);
      if (!isFiniteNonNegativeNumber(nextValue)) {
        hasInvalidTier = true;
        warnings.push(createWarning(
          "invalid-advisor-threshold-tier-value",
          "Advisor threshold tier override was ignored because the tier value is not a finite nonnegative number.",
          {
            thresholdId,
            tierKey,
            sourcePath: `advisorOverrides.rulesByThresholdId.${thresholdId}.tiers.${tierKey}`
          }
        ));
        return;
      }

      nextTiers[tierKey] = nextValue;
      hasValidTier = true;
    });

    if (hasInvalidTier || !hasValidTier) {
      return null;
    }

    if (!areTiersOrdered(nextTiers)) {
      warnings.push(createWarning(
        "invalid-advisor-threshold-tier-order",
        "Advisor threshold tier override was ignored because tiers must be ordered minimum <= conservative <= average <= comfortable.",
        { thresholdId, sourcePath: `advisorOverrides.rulesByThresholdId.${thresholdId}.tiers` }
      ));
      return null;
    }

    return nextTiers;
  }

  function resolveProtectedFloorOverride(thresholdId, override, resolvedTiers, warnings) {
    if (!Object.prototype.hasOwnProperty.call(override, "protectedFloor")) {
      return { changed: false, value: null };
    }

    const nextProtectedFloor = Number(override.protectedFloor);
    if (!isFiniteNonNegativeNumber(nextProtectedFloor)) {
      warnings.push(createWarning(
        "invalid-advisor-threshold-protected-floor",
        "Advisor protectedFloor override was ignored because it is not a finite nonnegative number.",
        { thresholdId, sourcePath: `advisorOverrides.rulesByThresholdId.${thresholdId}.protectedFloor` }
      ));
      return { changed: false, value: null };
    }

    if (isPlainObject(resolvedTiers) && nextProtectedFloor > resolvedTiers.comfortable) {
      warnings.push(createWarning(
        "invalid-advisor-threshold-protected-floor",
        "Advisor protectedFloor override was ignored because it cannot exceed the comfortable tier.",
        { thresholdId, sourcePath: `advisorOverrides.rulesByThresholdId.${thresholdId}.protectedFloor` }
      ));
      return { changed: false, value: null };
    }

    return { changed: true, value: nextProtectedFloor };
  }

  function hasSupportedOverrideChange(override) {
    return Object.keys(override).some(function (field) {
      return ADVISOR_THRESHOLD_METADATA_FIELDS.indexOf(field) === -1
        && ADVISOR_THRESHOLD_OVERRIDE_FIELDS.indexOf(field) !== -1;
    });
  }

  function resolveExpenseCompressionThresholds(input) {
    const safeInput = isPlainObject(input) ? input : {};
    const warnings = [];
    const defaultRules = normalizeDefaultThresholds(safeInput.defaultThresholds, warnings);
    const advisorRulesByThresholdId = getAdvisorRulesByThresholdId(safeInput.advisorOverrides, warnings);
    const defaultRuleIds = new Set();
    const resolvedRules = [];
    const appliedOverrides = [];
    const ignoredOverrides = [];

    defaultRules.forEach(function (defaultRule, index) {
      const thresholdId = normalizeThresholdId(defaultRule.thresholdId);
      if (defaultRuleIds.has(thresholdId)) {
        warnings.push(createWarning(
          "duplicate-default-threshold-id",
          "Duplicate default threshold rule was ignored.",
          { thresholdId, sourcePath: `defaultThresholds.${index}` }
        ));
        return;
      }

      defaultRuleIds.add(thresholdId);

      const override = advisorRulesByThresholdId[thresholdId];
      const resolvedRule = cloneThresholdRule(defaultRule);
      if (!isPlainObject(override)) {
        if (override != null) {
          ignoredOverrides.push(thresholdId);
          warnings.push(createWarning(
            "invalid-advisor-threshold-rule",
            "Advisor threshold override was ignored because the rule override is not an object.",
            { thresholdId, sourcePath: `advisorOverrides.rulesByThresholdId.${thresholdId}` }
          ));
        }
        resolvedRules.push(resolvedRule);
        return;
      }

      collectUnsupportedOverrideFields(thresholdId, override, warnings);

      let applied = false;
      const resolvedTiers = resolveTierOverrides(thresholdId, defaultRule, override, warnings);
      if (resolvedTiers) {
        resolvedRule.tiers = resolvedTiers;
        applied = true;
      }

      const protectedFloorResult = resolveProtectedFloorOverride(thresholdId, override, resolvedRule.tiers, warnings);
      if (protectedFloorResult.changed) {
        resolvedRule.protectedFloor = protectedFloorResult.value;
        applied = true;
      }

      if (applied) {
        appliedOverrides.push(thresholdId);
      } else if (hasSupportedOverrideChange(override)) {
        ignoredOverrides.push(thresholdId);
      }

      resolvedRules.push(resolvedRule);
    });

    Object.keys(advisorRulesByThresholdId).forEach(function (thresholdId) {
      const normalizedThresholdId = normalizeThresholdId(thresholdId);
      if (!defaultRuleIds.has(normalizedThresholdId)) {
        ignoredOverrides.push(normalizedThresholdId);
        warnings.push(createWarning(
          "unknown-advisor-threshold-id",
          "Advisor threshold override was ignored because the thresholdId does not exist in MODEL90 defaults.",
          {
            thresholdId: normalizedThresholdId,
            sourcePath: `advisorOverrides.rulesByThresholdId.${normalizedThresholdId}`
          }
        ));
      }
    });

    return {
      rules: resolvedRules.map(cloneThresholdRule),
      metadata: {
        source: "explicit-input",
        precedence: Object.freeze(["advisorAccountOverrides", "model90Defaults"]),
        defaultRuleCount: defaultRules.length,
        advisorOverrideCount: Object.keys(advisorRulesByThresholdId).length,
        appliedAdvisorOverrideCount: appliedOverrides.length,
        ignoredAdvisorOverrideCount: ignoredOverrides.length,
        appliedAdvisorOverrideThresholdIds: appliedOverrides.slice(),
        ignoredAdvisorOverrideThresholdIds: ignoredOverrides.slice()
      },
      warnings
    };
  }

  lensAnalysis.expenseCompressionThresholdResolver = {
    ADVISOR_THRESHOLD_OVERRIDE_FIELDS,
    THRESHOLD_TIER_KEYS,
    resolveExpenseCompressionThresholds
  };
})(typeof globalThis !== "undefined" ? globalThis : this);
