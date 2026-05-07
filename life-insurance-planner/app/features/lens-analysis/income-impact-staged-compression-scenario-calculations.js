(function (global) {
  const LensApp = global.LensApp || (global.LensApp = {});
  const lensAnalysis = LensApp.lensAnalysis || (LensApp.lensAnalysis = {});

  const CALCULATION_METHOD = "income-impact-staged-compression-scenario-v1";
  const DEFAULT_MODE = "stagedAlternateScenarioOnly";
  const VALID_POLICY_DECISIONS = Object.freeze(["YES", "NO", "PAUSE", "INTERVENTION"]);
  const VALID_STAGE_TYPES = Object.freeze(["reduction", "pause", "interventionWindow"]);
  const VALID_STAGE_TRIGGER_MODES = Object.freeze(["fixedMonthV1"]);
  const SCALAR_ITEMIZATION_GAP_CODE = "scalar-household-expenses-not-itemized-for-compression";
  const GENERATED_DEBT_REASON_CODES = Object.freeze([
    "generated-debt-payment-source-owned",
    "generated-debt-payment-excluded"
  ]);

  function isPlainObject(value) {
    return Boolean(value && typeof value === "object" && !Array.isArray(value));
  }

  function normalizeString(value) {
    return String(value == null ? "" : value).trim();
  }

  function toOptionalNumber(value) {
    if (value == null || value === "") {
      return null;
    }

    if (typeof value === "number") {
      return Number.isFinite(value) ? value : null;
    }

    const normalized = String(value).replace(/[$,%\s,]/g, "");
    if (!normalized) {
      return null;
    }

    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : null;
  }

  function roundMoney(value) {
    return Number.isFinite(Number(value)) ? Number(Number(value).toFixed(2)) : 0;
  }

  function clonePlainValue(value) {
    if (Array.isArray(value)) {
      return value.map(clonePlainValue);
    }

    if (isPlainObject(value)) {
      return Object.keys(value).reduce(function (next, key) {
        next[key] = clonePlainValue(value[key]);
        return next;
      }, {});
    }

    return value;
  }

  function uniqueStrings(values) {
    return Array.from(new Set((Array.isArray(values) ? values : [])
      .map(function (value) {
        return normalizeString(value);
      })
      .filter(Boolean)));
  }

  function makeIssue(code, message, sourcePaths, details) {
    const issue = {
      code,
      message
    };
    const paths = uniqueStrings(sourcePaths);
    if (paths.length) {
      issue.sourcePaths = paths;
    }
    if (isPlainObject(details)) {
      issue.details = clonePlainValue(details);
    }
    return issue;
  }

  function getItemTypeKey(item) {
    return normalizeString(item && (item.typeKey || item.expenseTypeKey));
  }

  function getPolicyTypeKey(rule) {
    return normalizeString(rule && rule.expenseTypeKey);
  }

  function buildPolicyIndex(policyRules, dataGaps) {
    if (!Array.isArray(policyRules) || !policyRules.length) {
      dataGaps.push(makeIssue(
        "missing-compression-policy-rules",
        "Compression policy rules are required before a staged alternate compression scenario can be calculated.",
        ["compressionPolicyRules"]
      ));
      return {
        byType: {},
        invalidCount: 0
      };
    }

    return policyRules.reduce(function (index, rule, ruleIndex) {
      if (!isPlainObject(rule)) {
        index.invalidCount += 1;
        dataGaps.push(makeIssue(
          "invalid-compression-policy-rule",
          "Compression policy rule was not an object.",
          [`compressionPolicyRules[${ruleIndex}]`]
        ));
        return index;
      }

      const typeKey = getPolicyTypeKey(rule);
      const decision = normalizeString(rule.decision);
      if (!typeKey || !VALID_POLICY_DECISIONS.includes(decision)) {
        index.invalidCount += 1;
        dataGaps.push(makeIssue(
          "invalid-compression-policy-rule",
          "Compression policy rule requires a valid expenseTypeKey and deterministic decision.",
          [`compressionPolicyRules[${ruleIndex}]`],
          {
            expenseTypeKey: typeKey || null,
            decision: decision || null
          }
        ));
        return index;
      }

      if (!index.byType[typeKey]) {
        index.byType[typeKey] = Object.assign({}, clonePlainValue(rule), {
          policyOrderIndex: ruleIndex
        });
      }
      return index;
    }, {
      byType: {},
      invalidCount: 0
    });
  }

  function buildStagePolicyIndex(stagePolicyRules, dataGaps, maxStages) {
    if (!Array.isArray(stagePolicyRules) || !stagePolicyRules.length) {
      dataGaps.push(makeIssue(
        "missing-compression-stage-policy-rules",
        "Compression stage policy rules are required before a staged alternate compression scenario can be calculated.",
        ["compressionStagePolicyRules"]
      ));
      return {
        rules: [],
        invalidCount: 0
      };
    }

    const normalized = stagePolicyRules.reduce(function (index, rule, ruleIndex) {
      if (!isPlainObject(rule)) {
        index.invalidCount += 1;
        dataGaps.push(makeIssue(
          "invalid-compression-stage-policy-rule",
          "Compression stage policy rule was not an object.",
          [`compressionStagePolicyRules[${ruleIndex}]`]
        ));
        return index;
      }

      const stageId = normalizeString(rule.stageId);
      const stageOrder = toOptionalNumber(rule.stageOrder);
      const stageType = normalizeString(rule.stageType);
      const triggerMode = normalizeString(rule.triggerMode);
      const effectiveMonthAfterDeath = toOptionalNumber(rule.effectiveMonthAfterDeath);
      const decisionsAllowed = Array.isArray(rule.decisionsAllowed)
        ? uniqueStrings(rule.decisionsAllowed)
        : [];
      const compressionOrderGroups = Array.isArray(rule.compressionOrderGroups)
        ? uniqueStrings(rule.compressionOrderGroups)
        : [];
      const maxActionsPerStage = toOptionalNumber(rule.maxActionsPerStage);
      const appliesMath = rule.appliesMath === true;
      const markerOnly = rule.markerOnly === true;
      const validDecisions = decisionsAllowed.length
        && decisionsAllowed.every(function (decision) { return VALID_POLICY_DECISIONS.includes(decision); });

      if (
        !stageId
        || stageOrder == null
        || !VALID_STAGE_TYPES.includes(stageType)
        || !VALID_STAGE_TRIGGER_MODES.includes(triggerMode)
        || effectiveMonthAfterDeath == null
        || effectiveMonthAfterDeath < 0
        || !validDecisions
        || !compressionOrderGroups.length
        || (appliesMath && markerOnly)
        || (!appliesMath && !markerOnly)
      ) {
        index.invalidCount += 1;
        dataGaps.push(makeIssue(
          "invalid-compression-stage-policy-rule",
          "Compression stage policy rule requires deterministic timing, decisions, groups, and math/marker ownership.",
          [`compressionStagePolicyRules[${ruleIndex}]`],
          {
            stageId: stageId || null,
            stageOrder,
            stageType: stageType || null,
            triggerMode: triggerMode || null,
            effectiveMonthAfterDeath,
            decisionsAllowed,
            compressionOrderGroups,
            appliesMath,
            markerOnly
          }
        ));
        return index;
      }

      index.rules.push(Object.assign({}, clonePlainValue(rule), {
        stageId,
        stageName: normalizeString(rule.stageName) || stageId,
        stageOrder,
        stageType,
        effectiveMonthAfterDeath,
        triggerMode,
        decisionsAllowed,
        compressionOrderGroups,
        maxActionsPerStage: maxActionsPerStage == null || maxActionsPerStage <= 0 ? null : Math.floor(maxActionsPerStage),
        actionOrder: normalizeString(rule.actionOrder) || "policyOrderRank",
        appliesMath,
        markerOnly,
        stagePolicyOrderIndex: ruleIndex
      }));
      return index;
    }, {
      rules: [],
      invalidCount: 0
    });

    normalized.rules = normalized.rules
      .sort(function (left, right) {
        if (left.stageOrder !== right.stageOrder) {
          return left.stageOrder - right.stageOrder;
        }
        return left.stagePolicyOrderIndex - right.stagePolicyOrderIndex;
      })
      .slice(0, maxStages);
    return normalized;
  }

  function isGeneratedDebtPaymentItem(item) {
    const reasonCode = normalizeString(item && item.reasonCode);
    const sourceKey = normalizeString(item && item.sourceKey);
    const sourceOwnedBy = normalizeString(item && item.sourceOwnedBy);
    const sourcePath = normalizeString(item && item.sourcePath);
    const duplicateProtectionKey = normalizeString(item && item.duplicateProtectionKey);
    const categoryKey = normalizeString(item && item.categoryKey);
    return item?.isDebtPaymentExpense === true
      || sourceKey === "debtRecords"
      || sourceOwnedBy === "debtRecords"
      || sourcePath.includes("debtRecords")
      || categoryKey === "debtPayment"
      || categoryKey === "debtObligations"
      || duplicateProtectionKey.includes("debt-payment")
      || GENERATED_DEBT_REASON_CODES.includes(reasonCode);
  }

  function hasScalarHouseholdItemizationGap(compressionReport) {
    const dataGaps = Array.isArray(compressionReport?.dataGaps) ? compressionReport.dataGaps : [];
    return dataGaps.some(function (gap) {
      return normalizeString(gap && gap.code) === SCALAR_ITEMIZATION_GAP_CODE;
    });
  }

  function isProtectedOrReviewOnlyItem(item) {
    const reasonCode = normalizeString(item && item.reasonCode);
    const status = normalizeString(item && item.status);
    return reasonCode.includes("protected")
      || reasonCode.includes("advisor")
      || status === "protected"
      || status === "advisor-review";
  }

  function getReportCollection(compressionReport, key) {
    return Array.isArray(compressionReport?.[key])
      ? compressionReport[key].filter(isPlainObject)
      : [];
  }

  function getEligibleItems(compressionReport, policyIndex, options, dataGaps, warnings) {
    const opportunities = getReportCollection(compressionReport, "opportunities");
    const pauseCandidates = getReportCollection(compressionReport, "pauseCandidates");
    const markerSources = []
      .concat(getReportCollection(compressionReport, "opportunities"))
      .concat(getReportCollection(compressionReport, "pauseCandidates"))
      .concat(getReportCollection(compressionReport, "advisorReviewItems"))
      .concat(getReportCollection(compressionReport, "protectedItems"))
      .concat(getReportCollection(compressionReport, "excludedItems"));
    const reductions = [];
    const pauses = [];
    const markerOnly = [];

    opportunities.forEach(function (item, itemIndex) {
      const typeKey = getItemTypeKey(item);
      const policy = typeKey ? policyIndex.byType[typeKey] : null;
      const decision = normalizeString(policy && policy.decision);

      if (isGeneratedDebtPaymentItem(item)) {
        dataGaps.push(makeIssue(
          "generated-debt-payment-in-eligible-staged-compression-opportunities",
          "Generated Debt Records payment facts cannot be eligible staged compression opportunities.",
          [item.sourcePath, `compressionReport.opportunities[${itemIndex}]`],
          { typeKey }
        ));
        return;
      }

      if (!policy) {
        dataGaps.push(makeIssue(
          "missing-policy-for-staged-compression-opportunity",
          "Compression opportunity is missing a matching deterministic policy rule.",
          [item.sourcePath, `compressionReport.opportunities[${itemIndex}]`],
          { typeKey }
        ));
        return;
      }

      if (decision !== "YES") {
        warnings.push(makeIssue(
          "non-yes-staged-compression-opportunity-ignored",
          "Compression opportunity was not applied because its policy decision is not YES.",
          [item.sourcePath, `compressionReport.opportunities[${itemIndex}]`],
          { typeKey, decision }
        ));
        return;
      }

      if (isProtectedOrReviewOnlyItem(item)) {
        warnings.push(makeIssue(
          "protected-or-review-staged-compression-opportunity-ignored",
          "Protected or advisor-review items are not applied in the staged alternate compression scenario.",
          [item.sourcePath, `compressionReport.opportunities[${itemIndex}]`],
          { typeKey }
        ));
        return;
      }

      const possibleMonthlyReduction = toOptionalNumber(item.possibleMonthlyReduction);
      if (possibleMonthlyReduction == null || possibleMonthlyReduction <= 0) {
        dataGaps.push(makeIssue(
          "missing-eligible-staged-monthly-reduction-amount",
          "Eligible YES staged compression opportunities require a positive possibleMonthlyReduction.",
          [item.sourcePath, `compressionReport.opportunities[${itemIndex}].possibleMonthlyReduction`],
          { typeKey }
        ));
        return;
      }

      reductions.push({
        item,
        policy,
        typeKey,
        decision,
        monthlyAmount: roundMoney(possibleMonthlyReduction),
        reportCollection: "opportunities"
      });
    });

    if (options.applyPauseCandidates) {
      pauseCandidates.forEach(function (item, itemIndex) {
        const typeKey = getItemTypeKey(item);
        const policy = typeKey ? policyIndex.byType[typeKey] : null;
        const decision = normalizeString(policy && policy.decision);

        if (isGeneratedDebtPaymentItem(item)) {
          dataGaps.push(makeIssue(
            "generated-debt-payment-in-eligible-staged-pause-candidates",
            "Generated Debt Records payment facts cannot be eligible staged pause candidates.",
            [item.sourcePath, `compressionReport.pauseCandidates[${itemIndex}]`],
            { typeKey }
          ));
          return;
        }

        if (!policy) {
          dataGaps.push(makeIssue(
            "missing-policy-for-staged-pause-candidate",
            "Pause candidate is missing a matching deterministic policy rule.",
            [item.sourcePath, `compressionReport.pauseCandidates[${itemIndex}]`],
            { typeKey }
          ));
          return;
        }

        if (decision !== "PAUSE") {
          warnings.push(makeIssue(
            "non-pause-staged-candidate-ignored",
            "Pause candidate was not applied because its policy decision is not PAUSE.",
            [item.sourcePath, `compressionReport.pauseCandidates[${itemIndex}]`],
            { typeKey, decision }
          ));
          return;
        }

        const possibleMonthlyPauseAmount = toOptionalNumber(item.possibleMonthlyPauseAmount);
        if (possibleMonthlyPauseAmount == null || possibleMonthlyPauseAmount <= 0) {
          dataGaps.push(makeIssue(
            "missing-eligible-staged-monthly-pause-amount",
            "Eligible PAUSE staged candidates require a positive possibleMonthlyPauseAmount.",
            [item.sourcePath, `compressionReport.pauseCandidates[${itemIndex}].possibleMonthlyPauseAmount`],
            { typeKey }
          ));
          return;
        }

        pauses.push({
          item,
          policy,
          typeKey,
          decision,
          monthlyAmount: roundMoney(possibleMonthlyPauseAmount),
          reportCollection: "pauseCandidates"
        });
      });
    }

    if (options.includeMarkerOnlyEvents) {
      markerSources.forEach(function (item, itemIndex) {
        const typeKey = getItemTypeKey(item);
        const policy = typeKey ? policyIndex.byType[typeKey] : null;
        const decision = normalizeString(policy && policy.decision);
        if (!policy || decision !== "INTERVENTION" || isGeneratedDebtPaymentItem(item)) {
          return;
        }
        markerOnly.push({
          item,
          policy,
          typeKey,
          decision,
          monthlyAmount: 0,
          reportCollection: "markerSources",
          reportIndex: itemIndex
        });
      });
    }

    return {
      reductions,
      pauses,
      markerOnly
    };
  }

  function sortEligibleActions(actions) {
    return actions.slice().sort(function (left, right) {
      const leftRank = toOptionalNumber(left.policy.compressionOrderRank) ?? Number.MAX_SAFE_INTEGER;
      const rightRank = toOptionalNumber(right.policy.compressionOrderRank) ?? Number.MAX_SAFE_INTEGER;
      if (leftRank !== rightRank) {
        return leftRank - rightRank;
      }

      const leftIndex = toOptionalNumber(left.policy.policyOrderIndex) ?? Number.MAX_SAFE_INTEGER;
      const rightIndex = toOptionalNumber(right.policy.policyOrderIndex) ?? Number.MAX_SAFE_INTEGER;
      if (leftIndex !== rightIndex) {
        return leftIndex - rightIndex;
      }

      return normalizeString(left.item.label || left.typeKey).localeCompare(normalizeString(right.item.label || right.typeKey));
    });
  }

  function resolveNeedBucket(action, dataGaps, requireCompleteItemization) {
    const item = action.item;
    const policy = action.policy;
    const typeKey = action.typeKey;
    const explicitNeedType = normalizeString(item.needType || item.defaultNeedType);
    const behaviorClass = normalizeString(item.behaviorClass || policy.behaviorClass);
    const orderGroup = normalizeString(policy.compressionOrderGroup);

    if (policy.decision === "PAUSE") {
      return "contributionPause";
    }
    if (explicitNeedType === "discretionary" || behaviorClass === "discretionary") {
      return "discretionary";
    }
    if (
      explicitNeedType === "essential"
      || behaviorClass === "flexibleEssential"
      || behaviorClass === "protectedEssential"
      || orderGroup === "groceriesAndProtectedFlexibleEssentials"
      || orderGroup === "flexibleEssentials"
      || orderGroup === "transportationFlex"
      || orderGroup === "utilitiesBasicServices"
      || typeKey === "groceries"
    ) {
      return "essential";
    }
    if (
      orderGroup === "earlyDiscretionary"
      || orderGroup === "travelLifestyle"
      || orderGroup === "foodLifestyleBeforeGroceries"
      || orderGroup === "flexibleLifestyleServices"
      || orderGroup === "pets"
      || orderGroup === "financialLeakage"
    ) {
      return "discretionary";
    }

    if (requireCompleteItemization) {
      dataGaps.push(makeIssue(
        "unclear-staged-compression-item-base-scenario-bucket",
        "Eligible staged compression item could not be mapped to a base survivor need bucket.",
        [item.sourcePath],
        { typeKey }
      ));
    }

    return null;
  }

  function findPointForMonth(basePoints, effectiveMonthAfterDeath) {
    const exact = basePoints.find(function (point) {
      return toOptionalNumber(point.monthIndex) === effectiveMonthAfterDeath;
    });
    if (exact) {
      return exact;
    }
    return basePoints.find(function (point) {
      const monthIndex = toOptionalNumber(point.monthIndex);
      return monthIndex != null && monthIndex >= effectiveMonthAfterDeath;
    }) || null;
  }

  function buildAppliedAction(action, bucket, actionType, stage, stageDate) {
    return {
      type: actionType,
      typeKey: action.typeKey,
      label: normalizeString(action.item.label) || action.typeKey,
      monthlyAmount: action.monthlyAmount,
      annualAmount: roundMoney(action.monthlyAmount * 12),
      needBucket: bucket,
      policyDecision: action.policy.decision,
      compressionOrderGroup: action.policy.compressionOrderGroup || null,
      compressionOrderRank: action.policy.compressionOrderRank ?? null,
      policyId: action.policy.policyId || null,
      stageId: stage.stageId,
      stageName: stage.stageName,
      stageOrder: stage.stageOrder,
      effectiveMonthAfterDeath: stage.effectiveMonthAfterDeath,
      effectiveDate: stageDate || null,
      sourcePath: normalizeString(action.item.sourcePath) || null,
      trace: {
        suppliedAmountField: actionType === "pause" ? "possibleMonthlyPauseAmount" : "possibleMonthlyReduction",
        thresholdRecomputed: false,
        stagePolicySource: "explicit-input",
        assetLiquidation: false,
        groceriesOneTierReductionPreserved: action.typeKey === "groceries" ? true : undefined
      }
    };
  }

  function buildMarkerOnlyAction(action, stage, stageDate) {
    return {
      type: "markerOnly",
      typeKey: action.typeKey,
      label: normalizeString(action.item.label) || normalizeString(action.policy.displayName) || action.typeKey,
      policyDecision: action.policy.decision,
      compressionOrderGroup: action.policy.compressionOrderGroup || null,
      compressionOrderRank: action.policy.compressionOrderRank ?? null,
      policyId: action.policy.policyId || null,
      stageId: stage.stageId,
      stageName: stage.stageName,
      stageOrder: stage.stageOrder,
      effectiveMonthAfterDeath: stage.effectiveMonthAfterDeath,
      effectiveDate: stageDate || null,
      sourcePath: normalizeString(action.item.sourcePath) || null,
      trace: {
        appliesMath: false,
        markerOnly: true,
        stagePolicySource: "explicit-input"
      }
    };
  }

  function recalculateDepletion(points, fallbackDate) {
    const depletedPoint = points.find(function (point) {
      const endingResources = toOptionalNumber(point.endingResources);
      return endingResources != null && endingResources <= 0;
    });

    if (!depletedPoint) {
      return {
        depleted: false,
        depletionDate: null,
        depletionMonthIndex: null,
        monthsCovered: points.length,
        precision: "monthly"
      };
    }

    return {
      depleted: true,
      depletionDate: depletedPoint.date || fallbackDate || null,
      depletionMonthIndex: toOptionalNumber(depletedPoint.monthIndex),
      monthsCovered: toOptionalNumber(depletedPoint.monthIndex),
      precision: "monthly"
    };
  }

  function summarizePoints(points, baseSummary) {
    const totals = points.reduce(function (next, point) {
      next.totalSurvivorIncome = roundMoney(next.totalSurvivorIncome + (toOptionalNumber(point.survivorIncome) || 0));
      next.totalEssentialNeeds = roundMoney(next.totalEssentialNeeds + (toOptionalNumber(point.essentialNeeds) || 0));
      next.totalDiscretionaryNeeds = roundMoney(next.totalDiscretionaryNeeds + (toOptionalNumber(point.discretionaryNeeds) || 0));
      next.totalSurvivorNeeds = roundMoney(next.totalSurvivorNeeds + (toOptionalNumber(point.survivorNeeds) || 0));
      next.totalScheduledObligations = roundMoney(next.totalScheduledObligations + (toOptionalNumber(point.scheduledObligations) || 0));
      next.totalNetUse = roundMoney(next.totalNetUse + (toOptionalNumber(point.netUse) || 0));
      return next;
    }, {
      totalSurvivorIncome: 0,
      totalEssentialNeeds: 0,
      totalDiscretionaryNeeds: 0,
      totalSurvivorNeeds: 0,
      totalScheduledObligations: 0,
      totalNetUse: 0
    });

    const lastPoint = points[points.length - 1] || {};
    return Object.assign({}, clonePlainValue(baseSummary || {}), totals, {
      endingResources: toOptionalNumber(lastPoint.endingResources),
      accumulatedUnmetNeed: toOptionalNumber(lastPoint.accumulatedUnmetNeed)
    });
  }

  function summarizeActiveRelief(actions, monthIndex) {
    return actions.reduce(function (summary, action) {
      if (action.effectiveMonthAfterDeath > monthIndex) {
        return summary;
      }

      if (action.type === "pause") {
        summary.pauseMonthlyRelief = roundMoney(summary.pauseMonthlyRelief + action.monthlyAmount);
      } else if (action.needBucket === "essential") {
        summary.essentialMonthlyRelief = roundMoney(summary.essentialMonthlyRelief + action.monthlyAmount);
      } else {
        summary.discretionaryMonthlyRelief = roundMoney(summary.discretionaryMonthlyRelief + action.monthlyAmount);
      }
      summary.monthlyReliefTotal = roundMoney(
        summary.essentialMonthlyRelief
        + summary.discretionaryMonthlyRelief
        + summary.pauseMonthlyRelief
      );
      return summary;
    }, {
      essentialMonthlyRelief: 0,
      discretionaryMonthlyRelief: 0,
      pauseMonthlyRelief: 0,
      monthlyReliefTotal: 0
    });
  }

  function buildStagedPostDeathSeries(basePostDeathSeries, appliedActions) {
    const basePoints = Array.isArray(basePostDeathSeries?.points) ? basePostDeathSeries.points : [];
    let cumulativeRelief = 0;
    const points = basePoints.map(function (basePoint, index) {
      const point = clonePlainValue(basePoint);
      const monthIndex = toOptionalNumber(basePoint.monthIndex) ?? index + 1;
      const activeRelief = summarizeActiveRelief(appliedActions, monthIndex);
      const baseSurvivorNeeds = toOptionalNumber(basePoint.survivorNeeds);
      const baseEssentialNeeds = toOptionalNumber(basePoint.essentialNeeds);
      const baseDiscretionaryNeeds = toOptionalNumber(basePoint.discretionaryNeeds);
      const baseNetUse = toOptionalNumber(basePoint.netUse);
      const baseStartingResources = toOptionalNumber(basePoint.startingResources);
      const baseEndingResources = toOptionalNumber(basePoint.endingResources);
      const baseAvailableResources = toOptionalNumber(basePoint.availableResources);
      const essentialRelief = baseEssentialNeeds == null ? 0 : Math.min(baseEssentialNeeds, activeRelief.essentialMonthlyRelief);
      const discretionaryRelief = baseDiscretionaryNeeds == null
        ? 0
        : Math.min(baseDiscretionaryNeeds, activeRelief.discretionaryMonthlyRelief + activeRelief.pauseMonthlyRelief);
      const totalPointRelief = baseSurvivorNeeds == null
        ? activeRelief.monthlyReliefTotal
        : Math.min(baseSurvivorNeeds, activeRelief.monthlyReliefTotal);
      cumulativeRelief = roundMoney(cumulativeRelief + totalPointRelief);

      const endingResources = baseEndingResources == null ? null : roundMoney(baseEndingResources + cumulativeRelief);
      const availableResources = endingResources == null
        ? (baseAvailableResources == null ? null : roundMoney(baseAvailableResources + cumulativeRelief))
        : roundMoney(Math.max(0, endingResources));
      const accumulatedUnmetNeed = endingResources == null ? null : roundMoney(Math.max(0, -endingResources));

      return Object.assign({}, point, {
        startingResources: baseStartingResources == null
          ? point.startingResources
          : roundMoney(baseStartingResources + cumulativeRelief - totalPointRelief),
        essentialNeeds: baseEssentialNeeds == null ? point.essentialNeeds : roundMoney(Math.max(0, baseEssentialNeeds - essentialRelief)),
        discretionaryNeeds: baseDiscretionaryNeeds == null ? point.discretionaryNeeds : roundMoney(Math.max(0, baseDiscretionaryNeeds - discretionaryRelief)),
        survivorNeeds: baseSurvivorNeeds == null ? point.survivorNeeds : roundMoney(Math.max(0, baseSurvivorNeeds - totalPointRelief)),
        netUse: baseNetUse == null ? point.netUse : roundMoney(Math.max(0, baseNetUse - totalPointRelief)),
        endingResources,
        availableResources,
        accumulatedUnmetNeed,
        status: endingResources != null && endingResources <= 0 ? "depleted" : "available",
        trace: Object.assign({}, isPlainObject(point.trace) ? point.trace : {}, {
          stagedCompressionScenarioApplied: true,
          baseScenarioPointMutated: false,
          activeMonthlyReliefApplied: activeRelief.monthlyReliefTotal,
          cumulativeReliefApplied: cumulativeRelief,
          essentialReliefApplied: essentialRelief,
          discretionaryReliefApplied: discretionaryRelief,
          pauseReliefApplied: Math.min(baseDiscretionaryNeeds == null ? activeRelief.pauseMonthlyRelief : Math.max(0, baseDiscretionaryNeeds - discretionaryRelief + activeRelief.pauseMonthlyRelief), activeRelief.pauseMonthlyRelief),
          activeReliefByStage: appliedActions
            .filter(function (action) { return action.effectiveMonthAfterDeath <= monthIndex; })
            .map(function (action) { return action.stageId; })
        }),
        sourcePaths: uniqueStrings([].concat(point.sourcePaths || [], ["compressionReport.opportunities", "compressionReport.pauseCandidates", "compressionStagePolicyRules"]))
      });
    });
    const depletion = recalculateDepletion(points, basePostDeathSeries?.depletion?.depletionDate);

    return {
      points,
      summary: summarizePoints(points, basePostDeathSeries?.summary),
      depletion
    };
  }

  function summarizeStageOutcome(basePostDeathSeries, actionsThroughStage) {
    const stagedSeries = buildStagedPostDeathSeries(basePostDeathSeries, actionsThroughStage);
    return {
      depletion: clonePlainValue(stagedSeries.depletion),
      monthsCovered: stagedSeries.depletion.monthsCovered ?? null,
      accumulatedUnmetNeed: stagedSeries.summary.accumulatedUnmetNeed ?? null,
      endingResourcesAtHorizon: stagedSeries.summary.endingResources ?? null
    };
  }

  function actionMatchesStage(action, stage) {
    return stage.decisionsAllowed.includes(action.decision)
      && stage.compressionOrderGroups.includes(normalizeString(action.policy.compressionOrderGroup));
  }

  function applyMaxActions(actions, stage) {
    if (stage.maxActionsPerStage == null) {
      return actions;
    }
    return actions.slice(0, stage.maxActionsPerStage);
  }

  function buildMonthlyReliefSchedule(stageEvents) {
    return stageEvents
      .filter(function (event) { return event.appliesMath; })
      .map(function (event) {
        return {
          stageId: event.stageId,
          stageOrder: event.stageOrder,
          effectiveMonthAfterDeath: event.effectiveMonthAfterDeath,
          effectiveDate: event.effectiveDate,
          monthlyReliefAdded: event.monthlyReliefAdded,
          cumulativeMonthlyReliefAfterStage: event.cumulativeMonthlyReliefAfterStage,
          actionCount: event.actionsApplied.length
        };
      });
  }

  function makeBlockedOutput(status, scenarioId, warnings, dataGaps, trace) {
    return clonePlainValue({
      status,
      baseScenarioUnchanged: true,
      stagedCompressionScenario: null,
      warnings,
      dataGaps,
      trace
    });
  }

  function calculateIncomeImpactStagedCompressionScenario(input) {
    const safeInput = isPlainObject(input) ? input : {};
    const scenario = safeInput.scenario;
    const compressionReport = isPlainObject(safeInput.compressionReport) ? safeInput.compressionReport : null;
    const optionsInput = isPlainObject(safeInput.options) ? safeInput.options : {};
    const maxStagesInput = toOptionalNumber(optionsInput.maxStages);
    const options = {
      mode: normalizeString(optionsInput.mode) || DEFAULT_MODE,
      scenarioId: normalizeString(optionsInput.scenarioId) || "income-impact-staged-compression-alternate-v1",
      requireCompleteItemization: optionsInput.requireCompleteItemization !== false,
      applyPauseCandidates: optionsInput.applyPauseCandidates !== false,
      maxStages: maxStagesInput == null || maxStagesInput <= 0 ? Number.MAX_SAFE_INTEGER : Math.floor(maxStagesInput),
      includeMarkerOnlyEvents: optionsInput.includeMarkerOnlyEvents !== false
    };
    const warnings = [];
    const dataGaps = [];
    const blockedReasons = [];
    const trace = {
      calculationMethod: CALCULATION_METHOD,
      mode: DEFAULT_MODE,
      noAiDecisionMaking: true,
      stagePolicySource: "explicit-input",
      baseScenarioMutated: false,
      postDeathSeriesReplaced: false,
      graphPathChanged: false,
      layer5Wired: false,
      displayWired: false,
      reductionsAppliedCount: 0,
      pausesAppliedCount: 0,
      markerOnlyEventCount: 0,
      monthlyReliefSchedule: [],
      blockedReasons
    };

    if (options.mode !== DEFAULT_MODE) {
      warnings.push(makeIssue(
        "unsupported-staged-compression-scenario-mode-defaulted",
        "Only stagedAlternateScenarioOnly mode is supported by income-impact-staged-compression-scenario-v1.",
        ["options.mode"],
        { requestedMode: options.mode }
      ));
      options.mode = DEFAULT_MODE;
    }

    if (!isPlainObject(scenario)) {
      dataGaps.push(makeIssue(
        "missing-base-income-impact-scenario",
        "A composed base Income Impact scenario is required before a staged alternate compression scenario can be calculated.",
        ["scenario"]
      ));
    }

    if (!compressionReport) {
      dataGaps.push(makeIssue(
        "missing-compression-report",
        "A precomputed compressionReport is required before a staged alternate compression scenario can be calculated.",
        ["compressionReport"]
      ));
    }

    const basePostDeathSeries = isPlainObject(scenario?.postDeathSeries) ? scenario.postDeathSeries : {};
    const basePoints = Array.isArray(basePostDeathSeries.points) ? basePostDeathSeries.points : [];
    if (!basePoints.length) {
      dataGaps.push(makeIssue(
        "missing-post-death-points-for-staged-compression-scenario",
        "Base scenario postDeathSeries.points are required before a staged alternate compression scenario can be calculated.",
        ["scenario.postDeathSeries.points"]
      ));
    }

    const policyIndex = buildPolicyIndex(safeInput.compressionPolicyRules, dataGaps);
    if (policyIndex.invalidCount > 0) {
      dataGaps.push(makeIssue(
        "invalid-compression-policy-rules-block-staged-scenario",
        "Invalid compression policy rules block staged alternate scenario calculation.",
        ["compressionPolicyRules"],
        { invalidCount: policyIndex.invalidCount }
      ));
    }

    const stagePolicyIndex = buildStagePolicyIndex(safeInput.compressionStagePolicyRules, dataGaps, options.maxStages);
    if (stagePolicyIndex.invalidCount > 0) {
      dataGaps.push(makeIssue(
        "invalid-compression-stage-policy-rules-block-staged-scenario",
        "Invalid compression stage policy rules block staged alternate scenario calculation.",
        ["compressionStagePolicyRules"],
        { invalidCount: stagePolicyIndex.invalidCount }
      ));
    }

    if (options.requireCompleteItemization && compressionReport && hasScalarHouseholdItemizationGap(compressionReport)) {
      dataGaps.push(makeIssue(
        "active-staged-compression-blocked-by-scalar-household-itemization-gap",
        "Scalar household expenses are not fully itemized as compression-ready facts; active staged alternate compression would be misleading.",
        ["compressionReport.dataGaps", "lensModel.ongoingSupport"]
      ));
    }

    const eligible = compressionReport
      ? getEligibleItems(compressionReport, policyIndex, options, dataGaps, warnings)
      : { reductions: [], pauses: [], markerOnly: [] };

    const reductionsApplied = [];
    const pausesApplied = [];
    const markerOnlyEvents = [];
    const stageEvents = [];
    let cumulativeMonthlyRelief = 0;
    let actionsThroughStage = [];

    stagePolicyIndex.rules.forEach(function (stage) {
      const stagePoint = findPointForMonth(basePoints, stage.effectiveMonthAfterDeath);
      const stageDate = normalizeString(stagePoint && stagePoint.date) || null;
      const stageEvent = {
        stageId: stage.stageId,
        stageName: stage.stageName,
        stageOrder: stage.stageOrder,
        stageType: stage.stageType,
        effectiveMonthAfterDeath: stage.effectiveMonthAfterDeath,
        effectiveDate: stageDate,
        triggerMode: stage.triggerMode,
        decisionsAllowed: stage.decisionsAllowed.slice(),
        compressionOrderGroups: stage.compressionOrderGroups.slice(),
        appliesMath: stage.appliesMath,
        markerOnly: stage.markerOnly,
        actionsApplied: [],
        markerOnlyActions: [],
        monthlyReliefAdded: 0,
        cumulativeMonthlyReliefAfterStage: cumulativeMonthlyRelief,
        remainingProjectedOutcome: null,
        trace: {
          actionOrder: stage.actionOrder,
          stagePolicySource: "explicit-input"
        }
      };

      if (stage.appliesMath) {
        const candidates = []
          .concat(stage.decisionsAllowed.includes("YES") ? eligible.reductions : [])
          .concat(stage.decisionsAllowed.includes("PAUSE") ? eligible.pauses : []);
        const selectedActions = applyMaxActions(sortEligibleActions(candidates.filter(function (action) {
          return actionMatchesStage(action, stage);
        })), stage);

        selectedActions.forEach(function (action) {
          const bucket = resolveNeedBucket(action, dataGaps, options.requireCompleteItemization);
          if (!bucket) {
            return;
          }
          const actionType = action.decision === "PAUSE" ? "pause" : "reduction";
          const appliedAction = buildAppliedAction(action, bucket, actionType, stage, stageDate);
          stageEvent.actionsApplied.push(appliedAction);
          if (actionType === "pause") {
            pausesApplied.push(appliedAction);
          } else {
            reductionsApplied.push(appliedAction);
          }
          actionsThroughStage.push(appliedAction);
          stageEvent.monthlyReliefAdded = roundMoney(stageEvent.monthlyReliefAdded + appliedAction.monthlyAmount);
        });

        cumulativeMonthlyRelief = roundMoney(cumulativeMonthlyRelief + stageEvent.monthlyReliefAdded);
        stageEvent.cumulativeMonthlyReliefAfterStage = cumulativeMonthlyRelief;
      }

      if (stage.markerOnly && options.includeMarkerOnlyEvents) {
        const selectedMarkers = applyMaxActions(sortEligibleActions(eligible.markerOnly.filter(function (action) {
          return actionMatchesStage(action, stage);
        })), stage);
        selectedMarkers.forEach(function (action) {
          const markerAction = buildMarkerOnlyAction(action, stage, stageDate);
          stageEvent.markerOnlyActions.push(markerAction);
          markerOnlyEvents.push(markerAction);
        });
      }

      if (stageEvent.actionsApplied.length || stageEvent.markerOnlyActions.length) {
        stageEvent.remainingProjectedOutcome = summarizeStageOutcome(basePostDeathSeries, actionsThroughStage);
        stageEvents.push(stageEvent);
      }
    });

    if (!reductionsApplied.length && !pausesApplied.length && !markerOnlyEvents.length && !dataGaps.length) {
      dataGaps.push(makeIssue(
        "no-eligible-staged-compression-actions-or-marker-events",
        "No eligible staged YES reductions, PAUSE candidates, or marker-only intervention events were available.",
        ["compressionReport.opportunities", "compressionReport.pauseCandidates", "compressionReport.advisorReviewItems"]
      ));
    }

    if (dataGaps.length) {
      blockedReasons.push.apply(blockedReasons, dataGaps.map(function (gap) { return gap.code; }));
      return makeBlockedOutput("blocked", options.scenarioId, warnings, dataGaps, trace);
    }

    const postDeathSeries = buildStagedPostDeathSeries(basePostDeathSeries, actionsThroughStage);
    const depletion = postDeathSeries.depletion;
    trace.reductionsAppliedCount = reductionsApplied.length;
    trace.pausesAppliedCount = pausesApplied.length;
    trace.markerOnlyEventCount = markerOnlyEvents.length;
    trace.monthlyReliefSchedule = buildMonthlyReliefSchedule(stageEvents);

    return clonePlainValue({
      status: "complete",
      baseScenarioUnchanged: true,
      stagedCompressionScenario: {
        scenarioId: options.scenarioId,
        label: "Staged expense compression alternate scenario",
        stagePolicyVersion: 1,
        stageEvents,
        reductionsApplied,
        pausesApplied,
        markerOnlyEvents,
        postDeathSeries,
        depletion,
        monthsCovered: depletion.monthsCovered ?? null,
        accumulatedUnmetNeed: postDeathSeries.summary.accumulatedUnmetNeed ?? null,
        trace: Object.assign({}, trace, {
          stageEventsCount: stageEvents.length,
          stagesEvaluatedCount: stagePolicyIndex.rules.length,
          finalCumulativeMonthlyRelief: cumulativeMonthlyRelief,
          thresholdRecomputed: false,
          basePreDeathSeriesModified: false,
          baseDeathEventModified: false,
          baseTimelineFactsModified: false,
          emergencyFundAssetsSpent: false,
          interventionsAppliedAsMath: false
        })
      },
      warnings,
      dataGaps,
      trace
    });
  }

  lensAnalysis.incomeImpactStagedCompressionScenarioCalculations = Object.freeze({
    calculateIncomeImpactStagedCompressionScenario
  });
  lensAnalysis.calculateIncomeImpactStagedCompressionScenario = calculateIncomeImpactStagedCompressionScenario;
})(typeof globalThis !== "undefined" ? globalThis : this);
