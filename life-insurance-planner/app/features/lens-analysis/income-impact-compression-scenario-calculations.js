(function (global) {
  const LensApp = global.LensApp || (global.LensApp = {});
  const lensAnalysis = LensApp.lensAnalysis || (LensApp.lensAnalysis = {});

  const CALCULATION_METHOD = "income-impact-compression-scenario-v1";
  const DEFAULT_MODE = "alternateScenarioOnly";
  const VALID_POLICY_DECISIONS = Object.freeze(["YES", "NO", "PAUSE", "INTERVENTION"]);
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
        "Compression policy rules are required before an alternate compression scenario can be calculated.",
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

  function isGeneratedDebtPaymentItem(item) {
    const reasonCode = normalizeString(item && item.reasonCode);
    const sourceKey = normalizeString(item && item.sourceKey);
    const sourcePath = normalizeString(item && item.sourcePath);
    const duplicateProtectionKey = normalizeString(item && item.duplicateProtectionKey);
    return item?.isGeneratedExpense === true
      || item?.isDebtPaymentExpense === true
      || sourceKey === "debtRecords"
      || sourcePath.includes("debtRecords")
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

  function getEligibleItems(compressionReport, policyIndex, options, dataGaps, warnings) {
    const opportunities = Array.isArray(compressionReport?.opportunities)
      ? compressionReport.opportunities.filter(isPlainObject)
      : [];
    const pauseCandidates = Array.isArray(compressionReport?.pauseCandidates)
      ? compressionReport.pauseCandidates.filter(isPlainObject)
      : [];
    const reductions = [];
    const pauses = [];

    opportunities.forEach(function (item, itemIndex) {
      const typeKey = getItemTypeKey(item);
      const policy = typeKey ? policyIndex.byType[typeKey] : null;
      const decision = normalizeString(policy && policy.decision);

      if (isGeneratedDebtPaymentItem(item)) {
        dataGaps.push(makeIssue(
          "generated-debt-payment-in-eligible-compression-opportunities",
          "Generated Debt Records payment facts cannot be eligible compression opportunities.",
          [item.sourcePath, `compressionReport.opportunities[${itemIndex}]`],
          { typeKey }
        ));
        return;
      }

      if (!policy) {
        dataGaps.push(makeIssue(
          "missing-policy-for-compression-opportunity",
          "Compression opportunity is missing a matching deterministic policy rule.",
          [item.sourcePath, `compressionReport.opportunities[${itemIndex}]`],
          { typeKey }
        ));
        return;
      }

      if (decision !== "YES") {
        warnings.push(makeIssue(
          "non-yes-compression-opportunity-ignored",
          "Compression opportunity was not applied because its policy decision is not YES.",
          [item.sourcePath, `compressionReport.opportunities[${itemIndex}]`],
          { typeKey, decision }
        ));
        return;
      }

      if (isProtectedOrReviewOnlyItem(item)) {
        warnings.push(makeIssue(
          "protected-or-review-compression-opportunity-ignored",
          "Protected or advisor-review items are not applied in the alternate compression scenario.",
          [item.sourcePath, `compressionReport.opportunities[${itemIndex}]`],
          { typeKey }
        ));
        return;
      }

      const possibleMonthlyReduction = toOptionalNumber(item.possibleMonthlyReduction);
      if (possibleMonthlyReduction == null || possibleMonthlyReduction <= 0) {
        dataGaps.push(makeIssue(
          "missing-eligible-monthly-reduction-amount",
          "Eligible YES compression opportunities require a positive possibleMonthlyReduction.",
          [item.sourcePath, `compressionReport.opportunities[${itemIndex}].possibleMonthlyReduction`],
          { typeKey }
        ));
        return;
      }

      reductions.push({
        item,
        policy,
        typeKey,
        monthlyAmount: roundMoney(possibleMonthlyReduction)
      });
    });

    if (options.applyPauseCandidates) {
      pauseCandidates.forEach(function (item, itemIndex) {
        const typeKey = getItemTypeKey(item);
        const policy = typeKey ? policyIndex.byType[typeKey] : null;
        const decision = normalizeString(policy && policy.decision);

        if (isGeneratedDebtPaymentItem(item)) {
          dataGaps.push(makeIssue(
            "generated-debt-payment-in-eligible-pause-candidates",
            "Generated Debt Records payment facts cannot be eligible pause candidates.",
            [item.sourcePath, `compressionReport.pauseCandidates[${itemIndex}]`],
            { typeKey }
          ));
          return;
        }

        if (!policy) {
          dataGaps.push(makeIssue(
            "missing-policy-for-pause-candidate",
            "Pause candidate is missing a matching deterministic policy rule.",
            [item.sourcePath, `compressionReport.pauseCandidates[${itemIndex}]`],
            { typeKey }
          ));
          return;
        }

        if (decision !== "PAUSE") {
          warnings.push(makeIssue(
            "non-pause-candidate-ignored",
            "Pause candidate was not applied because its policy decision is not PAUSE.",
            [item.sourcePath, `compressionReport.pauseCandidates[${itemIndex}]`],
            { typeKey, decision }
          ));
          return;
        }

        const possibleMonthlyPauseAmount = toOptionalNumber(item.possibleMonthlyPauseAmount);
        if (possibleMonthlyPauseAmount == null || possibleMonthlyPauseAmount <= 0) {
          dataGaps.push(makeIssue(
            "missing-eligible-monthly-pause-amount",
            "Eligible PAUSE candidates require a positive possibleMonthlyPauseAmount.",
            [item.sourcePath, `compressionReport.pauseCandidates[${itemIndex}].possibleMonthlyPauseAmount`],
            { typeKey }
          ));
          return;
        }

        pauses.push({
          item,
          policy,
          typeKey,
          monthlyAmount: roundMoney(possibleMonthlyPauseAmount)
        });
      });
    }

    return {
      reductions,
      pauses
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
        "unclear-compression-item-base-scenario-bucket",
        "Eligible compression item could not be mapped to a base survivor need bucket.",
        [item.sourcePath],
        { typeKey }
      ));
    }

    return null;
  }

  function buildAppliedAction(action, bucket, actionType) {
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
      sourcePath: normalizeString(action.item.sourcePath) || null,
      trace: {
        suppliedAmountField: actionType === "pause" ? "possibleMonthlyPauseAmount" : "possibleMonthlyReduction",
        thresholdRecomputed: false,
        assetLiquidation: false
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

  function buildAlternatePostDeathSeries(basePostDeathSeries, relief) {
    const basePoints = Array.isArray(basePostDeathSeries?.points) ? basePostDeathSeries.points : [];
    let cumulativeRelief = 0;
    const points = basePoints.map(function (basePoint, index) {
      const point = clonePlainValue(basePoint);
      const baseSurvivorNeeds = toOptionalNumber(basePoint.survivorNeeds);
      const baseEssentialNeeds = toOptionalNumber(basePoint.essentialNeeds);
      const baseDiscretionaryNeeds = toOptionalNumber(basePoint.discretionaryNeeds);
      const baseNetUse = toOptionalNumber(basePoint.netUse);
      const baseStartingResources = toOptionalNumber(basePoint.startingResources);
      const baseEndingResources = toOptionalNumber(basePoint.endingResources);
      const baseAvailableResources = toOptionalNumber(basePoint.availableResources);
      const essentialRelief = baseEssentialNeeds == null ? 0 : Math.min(baseEssentialNeeds, relief.essentialMonthlyRelief);
      const discretionaryRelief = baseDiscretionaryNeeds == null
        ? 0
        : Math.min(baseDiscretionaryNeeds, relief.discretionaryMonthlyRelief + relief.pauseMonthlyRelief);
      const totalPointRelief = baseSurvivorNeeds == null
        ? relief.monthlyReliefTotal
        : Math.min(baseSurvivorNeeds, relief.monthlyReliefTotal);
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
          compressionScenarioApplied: true,
          baseScenarioPointMutated: false,
          monthlyReliefApplied: totalPointRelief,
          cumulativeReliefApplied: cumulativeRelief,
          essentialReliefApplied: essentialRelief,
          discretionaryReliefApplied: discretionaryRelief,
          pauseReliefApplied: Math.min(baseDiscretionaryNeeds == null ? relief.pauseMonthlyRelief : Math.max(0, baseDiscretionaryNeeds - discretionaryRelief + relief.pauseMonthlyRelief), relief.pauseMonthlyRelief)
        }),
        sourcePaths: uniqueStrings([].concat(point.sourcePaths || [], ["compressionReport.opportunities", "compressionReport.pauseCandidates"]))
      });
    });
    const depletion = recalculateDepletion(points, basePostDeathSeries?.depletion?.depletionDate);

    return {
      points,
      summary: summarizePoints(points, basePostDeathSeries?.summary),
      depletion
    };
  }

  function makeBlockedOutput(status, scenarioId, warnings, dataGaps, trace) {
    return clonePlainValue({
      status,
      baseScenarioUnchanged: true,
      compressionScenario: null,
      warnings,
      dataGaps,
      trace
    });
  }

  function calculateIncomeImpactCompressionScenario(input) {
    const safeInput = isPlainObject(input) ? input : {};
    const scenario = safeInput.scenario;
    const compressionReport = isPlainObject(safeInput.compressionReport) ? safeInput.compressionReport : null;
    const optionsInput = isPlainObject(safeInput.options) ? safeInput.options : {};
    const options = {
      mode: normalizeString(optionsInput.mode) || DEFAULT_MODE,
      scenarioId: normalizeString(optionsInput.scenarioId) || "income-impact-compression-alternate-v1",
      maxItemsPerPass: Math.max(1, Math.round(toOptionalNumber(optionsInput.maxItemsPerPass) || Number.MAX_SAFE_INTEGER)),
      applyPauseCandidates: optionsInput.applyPauseCandidates !== false,
      requireCompleteItemization: optionsInput.requireCompleteItemization !== false
    };
    const warnings = [];
    const dataGaps = [];
    const blockedReasons = [];
    const trace = {
      calculationMethod: CALCULATION_METHOD,
      mode: DEFAULT_MODE,
      baseScenarioMutated: false,
      postDeathSeriesReplaced: false,
      graphPathChanged: false,
      layer5Wired: false,
      displayWired: false,
      reductionsAppliedCount: 0,
      pausesAppliedCount: 0,
      monthlyReliefTotal: 0,
      blockedReasons
    };

    if (options.mode !== DEFAULT_MODE) {
      warnings.push(makeIssue(
        "unsupported-compression-scenario-mode-defaulted",
        "Only alternateScenarioOnly mode is supported by income-impact-compression-scenario-v1.",
        ["options.mode"],
        { requestedMode: options.mode }
      ));
      options.mode = DEFAULT_MODE;
    }

    if (!isPlainObject(scenario)) {
      dataGaps.push(makeIssue(
        "missing-base-income-impact-scenario",
        "A composed base Income Impact scenario is required before an alternate compression scenario can be calculated.",
        ["scenario"]
      ));
    }

    if (!compressionReport) {
      dataGaps.push(makeIssue(
        "missing-compression-report",
        "A precomputed compressionReport is required before an alternate compression scenario can be calculated.",
        ["compressionReport"]
      ));
    }

    const basePostDeathSeries = isPlainObject(scenario?.postDeathSeries) ? scenario.postDeathSeries : {};
    const basePoints = Array.isArray(basePostDeathSeries.points) ? basePostDeathSeries.points : [];
    if (!basePoints.length) {
      dataGaps.push(makeIssue(
        "missing-post-death-points-for-compression-scenario",
        "Base scenario postDeathSeries.points are required before an alternate compression scenario can be calculated.",
        ["scenario.postDeathSeries.points"]
      ));
    }

    const policyIndex = buildPolicyIndex(safeInput.compressionPolicyRules, dataGaps);
    if (policyIndex.invalidCount > 0) {
      dataGaps.push(makeIssue(
        "invalid-compression-policy-rules-block-alternate-scenario",
        "Invalid compression policy rules block alternate scenario calculation.",
        ["compressionPolicyRules"],
        { invalidCount: policyIndex.invalidCount }
      ));
    }

    if (options.requireCompleteItemization && compressionReport && hasScalarHouseholdItemizationGap(compressionReport)) {
      dataGaps.push(makeIssue(
        "active-compression-blocked-by-scalar-household-itemization-gap",
        "Scalar household expenses are not fully itemized as compression-ready facts; active alternate compression would be misleading.",
        ["compressionReport.dataGaps", "lensModel.ongoingSupport"]
      ));
    }

    const eligible = compressionReport
      ? getEligibleItems(compressionReport, policyIndex, options, dataGaps, warnings)
      : { reductions: [], pauses: [] };
    const sortedReductions = sortEligibleActions(eligible.reductions).slice(0, options.maxItemsPerPass);
    const sortedPauses = sortEligibleActions(eligible.pauses).slice(0, options.maxItemsPerPass);

    const reductionsApplied = [];
    const pausesApplied = [];
    let essentialMonthlyRelief = 0;
    let discretionaryMonthlyRelief = 0;
    let pauseMonthlyRelief = 0;

    sortedReductions.forEach(function (action) {
      const bucket = resolveNeedBucket(action, dataGaps, options.requireCompleteItemization);
      if (!bucket) {
        return;
      }
      if (bucket === "essential") {
        essentialMonthlyRelief = roundMoney(essentialMonthlyRelief + action.monthlyAmount);
      } else {
        discretionaryMonthlyRelief = roundMoney(discretionaryMonthlyRelief + action.monthlyAmount);
      }
      reductionsApplied.push(buildAppliedAction(action, bucket, "reduction"));
    });

    sortedPauses.forEach(function (action) {
      const bucket = resolveNeedBucket(action, dataGaps, options.requireCompleteItemization);
      if (!bucket) {
        return;
      }
      pauseMonthlyRelief = roundMoney(pauseMonthlyRelief + action.monthlyAmount);
      pausesApplied.push(buildAppliedAction(action, bucket, "pause"));
    });

    if (!reductionsApplied.length && !pausesApplied.length && !dataGaps.length) {
      dataGaps.push(makeIssue(
        "no-eligible-compression-actions",
        "No eligible YES reductions or PAUSE candidates were available for the alternate compression scenario.",
        ["compressionReport.opportunities", "compressionReport.pauseCandidates"]
      ));
    }

    if (dataGaps.length) {
      blockedReasons.push.apply(blockedReasons, dataGaps.map(function (gap) { return gap.code; }));
      return makeBlockedOutput("blocked", options.scenarioId, warnings, dataGaps, trace);
    }

    const monthlyReliefTotal = roundMoney(essentialMonthlyRelief + discretionaryMonthlyRelief + pauseMonthlyRelief);
    const postDeathSeries = buildAlternatePostDeathSeries(basePostDeathSeries, {
      essentialMonthlyRelief,
      discretionaryMonthlyRelief,
      pauseMonthlyRelief,
      monthlyReliefTotal
    });
    const firstPoint = postDeathSeries.points[0] || {};
    const adjustedMonthlyNeed = toOptionalNumber(firstPoint.survivorNeeds);
    const depletion = postDeathSeries.depletion;
    trace.reductionsAppliedCount = reductionsApplied.length;
    trace.pausesAppliedCount = pausesApplied.length;
    trace.monthlyReliefTotal = monthlyReliefTotal;

    return clonePlainValue({
      status: "complete",
      baseScenarioUnchanged: true,
      compressionScenario: {
        scenarioId: options.scenarioId,
        label: "Expense compression alternate scenario",
        reductionsApplied,
        pausesApplied,
        adjustedMonthlyNeed,
        adjustedAnnualNeed: adjustedMonthlyNeed == null ? null : roundMoney(adjustedMonthlyNeed * 12),
        postDeathSeries,
        depletion,
        monthsCovered: depletion.monthsCovered ?? null,
        accumulatedUnmetNeed: postDeathSeries.summary.accumulatedUnmetNeed ?? null,
        trace: Object.assign({}, trace, {
          eligibleReductionCount: sortedReductions.length,
          eligiblePauseCount: sortedPauses.length,
          essentialMonthlyRelief,
          discretionaryMonthlyRelief,
          pauseMonthlyRelief,
          thresholdRecomputed: false,
          basePreDeathSeriesModified: false,
          baseDeathEventModified: false,
          baseTimelineFactsModified: false,
          emergencyFundAssetsSpent: false
        })
      },
      warnings,
      dataGaps,
      trace
    });
  }

  lensAnalysis.incomeImpactCompressionScenarioCalculations = Object.freeze({
    calculateIncomeImpactCompressionScenario
  });
  lensAnalysis.calculateIncomeImpactCompressionScenario = calculateIncomeImpactCompressionScenario;
})(typeof globalThis !== "undefined" ? globalThis : this);
