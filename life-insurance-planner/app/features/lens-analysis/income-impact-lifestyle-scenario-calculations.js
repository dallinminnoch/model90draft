(function (global) {
  const LensApp = global.LensApp || (global.LensApp = {});
  const lensAnalysis = LensApp.lensAnalysis || (LensApp.lensAnalysis = {});

  const CALCULATION_METHOD = "income-impact-lifestyle-scenario-v1";
  const DEFAULT_MODE = "lifestyleScenarioOnly";
  const MIN_SLIDER_VALUE = -100;
  const MAX_SLIDER_VALUE = 100;
  const DEFAULT_COMPARISON_SCENARIO_ID = "income-impact-lifestyle-adjusted-comparison";
  const DEFAULT_COMPARISON_PATH_ID = "compression-post-death-resources";

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

    const parsed = Number(String(value).replace(/[$,%\s,]/g, ""));
    return Number.isFinite(parsed) ? parsed : null;
  }

  function roundMoney(value) {
    return Number.isFinite(Number(value)) ? Number(Number(value).toFixed(2)) : 0;
  }

  function clamp(value, minimum, maximum) {
    return Math.min(Math.max(value, minimum), maximum);
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

  function getExpenses(input) {
    if (Array.isArray(input?.expenses)) {
      return input.expenses;
    }

    if (Array.isArray(input?.baselineExpenses)) {
      return input.baselineExpenses;
    }

    if (Array.isArray(input?.expenseRecords)) {
      return input.expenseRecords;
    }

    if (Array.isArray(input?.expenseFacts?.expenses)) {
      return input.expenseFacts.expenses;
    }

    return [];
  }

  function getTypeKey(expense) {
    return normalizeString(expense && (expense.expenseTypeKey || expense.typeKey));
  }

  function getExpenseId(expense, index) {
    return normalizeString(expense && (expense.expenseId || expense.id || expense.recordId || expense.sourceId))
      || `expense-${index + 1}`;
  }

  function getExpenseLabel(expense, policy, index) {
    return normalizeString(expense && (expense.label || expense.displayName || expense.name))
      || normalizeString(policy && policy.displayName)
      || getTypeKey(expense)
      || `Expense ${index + 1}`;
  }

  function getMonthlyAmount(expense) {
    const direct = [
      expense && expense.monthlyAmount,
      expense && expense.monthlyEquivalent,
      expense && expense.monthlyEquivalentAmount,
      expense && expense.currentMonthlyAmount,
      expense && expense.baselineMonthlyAmount,
      expense && expense.amountMonthly
    ];

    for (let index = 0; index < direct.length; index += 1) {
      const value = toOptionalNumber(direct[index]);
      if (value != null) {
        return value;
      }
    }

    const amount = toOptionalNumber(expense && expense.amount);
    if (amount == null) {
      return null;
    }

    const frequency = normalizeString(expense && expense.frequency).toLowerCase();
    if (!frequency || frequency === "monthly" || frequency === "month") {
      return amount;
    }
    if (frequency === "annual" || frequency === "yearly" || frequency === "year") {
      return amount / 12;
    }
    if (frequency === "quarterly" || frequency === "quarter") {
      return amount / 3;
    }
    if (frequency === "weekly" || frequency === "week") {
      return amount * 52 / 12;
    }
    if (frequency === "biweekly" || frequency === "bi-weekly") {
      return amount * 26 / 12;
    }
    if (frequency === "semimonthly" || frequency === "semi-monthly") {
      return amount * 2;
    }

    return null;
  }

  function buildPolicyResolver(input) {
    if (typeof input?.policyResolver === "function") {
      return input.policyResolver;
    }

    if (typeof input?.resolveLifestyleRangePolicy === "function") {
      return input.resolveLifestyleRangePolicy;
    }

    const policyRules = Array.isArray(input?.lifestyleRangePolicies)
      ? input.lifestyleRangePolicies
      : Array.isArray(input?.lifestyleRangePolicyRules)
        ? input.lifestyleRangePolicyRules
        : null;

    if (policyRules) {
      return function resolveFromRules(expenseLike) {
        const typeKey = getTypeKey(expenseLike);
        const categoryKey = normalizeString(expenseLike && expenseLike.categoryKey);
        let rule = null;
        if (typeKey) {
          rule = policyRules.find(function (candidate) {
            return normalizeString(candidate && candidate.expenseTypeKey) === typeKey;
          });
        }
        if (!rule && categoryKey) {
          rule = policyRules.find(function (candidate) {
            return normalizeString(candidate && candidate.categoryKey) === categoryKey && candidate.sliderEligible === false;
          }) || policyRules.find(function (candidate) {
            return normalizeString(candidate && candidate.categoryKey) === categoryKey;
          });
        }
        return rule ? clonePlainValue(rule) : null;
      };
    }

    const policyApi = lensAnalysis.householdExpenseLifestyleRangePolicy;
    if (policyApi && typeof policyApi.resolveLifestyleRangePolicy === "function") {
      return policyApi.resolveLifestyleRangePolicy;
    }

    return function missingPolicyResolver() {
      return null;
    };
  }

  function isGeneratedDebtExpense(expense) {
    const sourceOwnedBy = normalizeString(expense && expense.sourceOwnedBy);
    const sourceKey = normalizeString(expense && expense.sourceKey);
    const sourcePath = normalizeString(expense && expense.sourcePath);
    const duplicateProtectionKey = normalizeString(expense && expense.duplicateProtectionKey);
    const categoryKey = normalizeString(expense && expense.categoryKey);
    return expense?.isDebtPaymentExpense === true
      || expense?.generatedOnly === true && categoryKey === "debtObligations"
      || sourceOwnedBy === "debtRecords"
      || sourceKey === "debtRecords"
      || sourcePath.includes("debtRecords")
      || duplicateProtectionKey.includes("debt-payment")
      || duplicateProtectionKey.includes("debtRecords")
      || categoryKey === "debtObligations";
  }

  function findThresholdRule(input, expense, policy) {
    const thresholdRules = Array.isArray(input?.resolvedThresholds)
      ? input.resolvedThresholds
      : Array.isArray(input?.thresholdRules)
        ? input.thresholdRules
        : Array.isArray(input?.defaultThresholds)
          ? input.defaultThresholds
          : [];
    const typeKey = getTypeKey(expense) || normalizeString(policy && policy.expenseTypeKey);
    const categoryKey = normalizeString(expense && expense.categoryKey) || normalizeString(policy && policy.categoryKey);

    return thresholdRules.find(function (rule) {
      return normalizeString(rule && rule.expenseTypeKey) === typeKey;
    }) || thresholdRules.find(function (rule) {
      return normalizeString(rule && rule.categoryKey) === categoryKey;
    }) || null;
  }

  function resolveThresholdMonthlyAmount(rule, tierKey, input) {
    if (!isPlainObject(rule) || !tierKey || tierKey === "notApplicable") {
      return null;
    }

    const tierValue = toOptionalNumber(rule.tiers && rule.tiers[tierKey]);
    if (tierValue == null) {
      return null;
    }

    const householdFacts = input?.householdFacts || {};
    const basis = normalizeString(rule.thresholdBasis);
    if (basis === "perHouseholdMemberMonthly") {
      const count = toOptionalNumber(householdFacts.householdMemberCount);
      return count && count > 0 ? tierValue * count : null;
    }
    if (basis === "perDependentMonthly") {
      const count = toOptionalNumber(householdFacts.dependentCount);
      return count && count > 0 ? tierValue * count : null;
    }
    if (basis === "percentOfIncome") {
      const annualIncome = toOptionalNumber(householdFacts.netAnnualIncome || householdFacts.survivorNetAnnualIncome);
      return annualIncome && annualIncome > 0 ? annualIncome * tierValue / 100 / 12 : null;
    }
    if (
      basis === "perHouseholdMonthly"
      || basis === "fixedMonthly"
      || basis === "advisorDefined"
      || !basis
    ) {
      return tierValue;
    }

    return null;
  }

  function getProtectedFloorAmount(rule) {
    const value = toOptionalNumber(rule && rule.protectedFloor);
    return value != null && value >= 0 ? value : null;
  }

  function calculateRangeAmounts(expense, policy, baselineMonthlyAmount, input) {
    const floorRatio = toOptionalNumber(policy && policy.conservativeFloorRatio);
    const ceilingRatio = toOptionalNumber(policy && policy.elevatedCeilingRatio);
    const thresholdRule = findThresholdRule(input, expense, policy);
    const thresholdFloor = resolveThresholdMonthlyAmount(thresholdRule, policy && policy.floorTierKey, input);
    const thresholdCeiling = resolveThresholdMonthlyAmount(thresholdRule, policy && policy.ceilingTierKey, input);
    const protectedFloor = getProtectedFloorAmount(thresholdRule);
    let floorMonthlyAmount = baselineMonthlyAmount;
    let ceilingMonthlyAmount = baselineMonthlyAmount;
    const floorSources = [];
    const ceilingSources = [];

    if (policy && policy.allowBelowBaseline === true) {
      floorMonthlyAmount = baselineMonthlyAmount * (floorRatio == null ? 1 : floorRatio);
      floorSources.push("conservativeFloorRatio");
      if (thresholdFloor != null) {
        floorMonthlyAmount = Math.max(floorMonthlyAmount, thresholdFloor);
        floorSources.push("floorTierKey");
      }
      if (protectedFloor != null && normalizeString(policy.protectedFloorPolicy).includes("Threshold")) {
        floorMonthlyAmount = Math.max(floorMonthlyAmount, protectedFloor);
        floorSources.push("protectedFloor");
      }
    }

    if (policy && policy.allowAboveBaseline === true) {
      ceilingMonthlyAmount = baselineMonthlyAmount * (ceilingRatio == null ? 1 : ceilingRatio);
      ceilingSources.push("elevatedCeilingRatio");
      if (thresholdCeiling != null) {
        const multiplier = toOptionalNumber(policy.ceilingTierMultiplier) || 1;
        const tierCeiling = thresholdCeiling * multiplier;
        ceilingMonthlyAmount = Math.min(ceilingMonthlyAmount, tierCeiling);
        ceilingSources.push("ceilingTierKey");
      }
    }

    floorMonthlyAmount = Math.min(baselineMonthlyAmount, Math.max(0, floorMonthlyAmount));
    ceilingMonthlyAmount = Math.max(baselineMonthlyAmount, ceilingMonthlyAmount);

    return {
      floorMonthlyAmount: roundMoney(floorMonthlyAmount),
      ceilingMonthlyAmount: roundMoney(ceilingMonthlyAmount),
      floorSource: floorSources.length ? floorSources.join("+") : "baseline",
      ceilingSource: ceilingSources.length ? ceilingSources.join("+") : "baseline",
      thresholdId: normalizeString(thresholdRule && thresholdRule.thresholdId) || null
    };
  }

  function getFixedReasonCode(expense, policy) {
    if (isGeneratedDebtExpense(expense)) {
      return "generated-debt-fixed";
    }

    const typeKey = getTypeKey(expense);
    if (typeKey === "rentOrMortgagePayment") {
      return "housing-payment-fixed";
    }

    const behavior = normalizeString(policy && policy.rangeBehavior);
    if (behavior === "reviewOnly") {
      return "review-only-fixed";
    }
    if (behavior === "fixed") {
      return "fixed-expense";
    }
    if (!policy) {
      return "missing-lifestyle-range-policy";
    }

    return "slider-ineligible";
  }

  function adjustEligibleExpense(baselineMonthlyAmount, range, sliderValue) {
    if (sliderValue < 0) {
      return baselineMonthlyAmount - ((baselineMonthlyAmount - range.floorMonthlyAmount) * Math.abs(sliderValue) / 100);
    }
    if (sliderValue > 0) {
      return baselineMonthlyAmount + ((range.ceilingMonthlyAmount - baselineMonthlyAmount) * sliderValue / 100);
    }
    return baselineMonthlyAmount;
  }

  function createAdjustedExpense(expense, policy, index, sliderValue, input, warnings) {
    const baselineRaw = getMonthlyAmount(expense);
    const baselineMonthlyAmount = roundMoney(baselineRaw == null ? 0 : Math.max(0, baselineRaw));
    const typeKey = getTypeKey(expense) || normalizeString(policy && policy.expenseTypeKey);
    const categoryKey = normalizeString(expense && expense.categoryKey) || normalizeString(policy && policy.categoryKey);
    const eligibleByPolicy = Boolean(policy && policy.sliderEligible === true);
    const sliderEligible = eligibleByPolicy && !isGeneratedDebtExpense(expense);
    const range = calculateRangeAmounts(expense, policy, baselineMonthlyAmount, input);
    let adjustedMonthlyAmount = baselineMonthlyAmount;
    let reasonCode = "slider-baseline";

    if (baselineRaw == null) {
      warnings.push(makeIssue(
        "missing-monthly-expense-amount",
        "Expense did not include a usable monthly amount; it was treated as zero for lifestyle range output.",
        [expense && expense.sourcePath],
        {
          expenseTypeKey: typeKey || null,
          expenseId: getExpenseId(expense, index)
        }
      ));
    }

    if (sliderEligible) {
      adjustedMonthlyAmount = adjustEligibleExpense(baselineMonthlyAmount, range, sliderValue);
      adjustedMonthlyAmount = clamp(adjustedMonthlyAmount, range.floorMonthlyAmount, range.ceilingMonthlyAmount);
      reasonCode = sliderValue < 0
        ? "slider-conservative-range"
        : sliderValue > 0
          ? "slider-elevated-range"
          : "slider-baseline";
    } else {
      reasonCode = getFixedReasonCode(expense, policy);
    }

    adjustedMonthlyAmount = roundMoney(adjustedMonthlyAmount);

    return {
      expenseId: getExpenseId(expense, index),
      label: getExpenseLabel(expense, policy, index),
      expenseTypeKey: typeKey || null,
      categoryKey: categoryKey || null,
      sourceKey: normalizeString(expense && expense.sourceKey) || null,
      sourceOwnedBy: normalizeString(expense && expense.sourceOwnedBy) || null,
      ownedByField: normalizeString(expense && expense.ownedByField) || null,
      sourcePath: normalizeString(expense && expense.sourcePath) || null,
      normalizedSourcePath: normalizeString(expense && expense.metadata && expense.metadata.normalizedSourcePath) || null,
      duplicateProtectionKey: normalizeString(expense && expense.duplicateProtectionKey) || null,
      baselineMonthlyAmount,
      adjustedMonthlyAmount,
      monthlyDelta: roundMoney(adjustedMonthlyAmount - baselineMonthlyAmount),
      sliderEligible,
      rangeBehavior: normalizeString(policy && policy.rangeBehavior) || "fixed",
      conservativeFloorRatio: policy && typeof policy.conservativeFloorRatio === "number" ? policy.conservativeFloorRatio : null,
      elevatedCeilingRatio: policy && typeof policy.elevatedCeilingRatio === "number" ? policy.elevatedCeilingRatio : null,
      floorMonthlyAmount: range.floorMonthlyAmount,
      ceilingMonthlyAmount: range.ceilingMonthlyAmount,
      floorSource: range.floorSource,
      ceilingSource: range.ceilingSource,
      thresholdId: range.thresholdId,
      isGeneratedExpense: expense?.isGeneratedExpense === true,
      isScalarHouseholdExpense: expense?.isScalarHouseholdExpense === true,
      isCompressionEligibleSource: expense?.isCompressionEligibleSource === true,
      isDebtPaymentExpense: expense?.isDebtPaymentExpense === true,
      reasonCode
    };
  }

  function sumMonthly(items, key) {
    return roundMoney(items.reduce(function (total, item) {
      return total + (toOptionalNumber(item && item[key]) || 0);
    }, 0));
  }

  function getInputBasePostDeathSeries(input) {
    if (isPlainObject(input?.basePostDeathSeries)) {
      return input.basePostDeathSeries;
    }
    if (isPlainObject(input?.postDeathSeries)) {
      return input.postDeathSeries;
    }
    if (isPlainObject(input?.scenario?.postDeathSeries)) {
      return input.scenario.postDeathSeries;
    }
    return null;
  }

  function isOngoingSupportReconciledExpense(item) {
    const sourceOwnedBy = normalizeString(item && item.sourceOwnedBy);
    const normalizedSourcePath = normalizeString(item && item.normalizedSourcePath);
    return sourceOwnedBy === "ongoingSupport"
      && item?.isScalarHouseholdExpense === true
      && item?.isCompressionEligibleSource === true
      && (
        Boolean(normalizedSourcePath && normalizedSourcePath.includes("lensModel.ongoingSupport."))
        || Boolean(normalizeString(item && item.ownedByField))
        || Boolean(normalizeString(item && item.sourceKey))
      );
  }

  function buildReconciledAdjustmentSummary(lifestyleScenario, warnings, dataGaps) {
    const adjustedExpenses = Array.isArray(lifestyleScenario?.adjustedExpenses)
      ? lifestyleScenario.adjustedExpenses
      : [];
    const graphAdjustmentItems = [];
    const unreconciledItems = [];
    let graphMonthlyDelta = 0;
    let graphBaselineMonthlyTotal = 0;

    adjustedExpenses.forEach(function (item) {
      const monthlyDelta = toOptionalNumber(item?.monthlyDelta) || 0;
      const baselineMonthlyAmount = toOptionalNumber(item?.baselineMonthlyAmount) || 0;
      const next = clonePlainValue(item);
      next.graphMonthlyDelta = 0;
      next.baseNeedReconciliationStatus = "not-required";
      next.baseNeedReconciliationReason = "no-graph-moving-delta";

      if (item?.sliderEligible === true && monthlyDelta !== 0) {
        if (isOngoingSupportReconciledExpense(item)) {
          next.graphMonthlyDelta = roundMoney(monthlyDelta);
          next.baseNeedReconciliationStatus = "reconciled";
          next.baseNeedReconciliationReason = "source-owned-ongoing-support-scalar";
          graphMonthlyDelta = roundMoney(graphMonthlyDelta + monthlyDelta);
          graphBaselineMonthlyTotal = roundMoney(graphBaselineMonthlyTotal + baselineMonthlyAmount);
        } else {
          next.baseNeedReconciliationStatus = "unreconciled";
          next.baseNeedReconciliationReason = "not-proven-in-base-survivor-need-stream";
          unreconciledItems.push(next);
        }
      }

      graphAdjustmentItems.push(next);
    });

    if (unreconciledItems.length) {
      const sourcePaths = uniqueStrings(unreconciledItems.map(function (item) {
        return item.sourcePath;
      }));
      const details = {
        expenseCount: unreconciledItems.length,
        monthlyDeltaExcluded: roundMoney(unreconciledItems.reduce(function (total, item) {
          return total + (toOptionalNumber(item.monthlyDelta) || 0);
        }, 0)),
        expenseTypeKeys: uniqueStrings(unreconciledItems.map(function (item) {
          return item.expenseTypeKey;
        }))
      };
      const issue = makeIssue(
        "unreconciled-lifestyle-expense-facts-excluded-from-graph",
        "Lifestyle expense facts with slider movement were not proven to be represented in the base survivor need stream, so their deltas were excluded from graph adjustment.",
        sourcePaths,
        details
      );
      dataGaps.push(issue);
      warnings.push(clonePlainValue(issue));
    }

    return {
      graphMonthlyDelta: roundMoney(graphMonthlyDelta),
      graphBaselineMonthlyTotal: roundMoney(graphBaselineMonthlyTotal),
      graphAdjustmentItems,
      unreconciledItems
    };
  }

  function getBaseMonthlySurvivorNeed(basePostDeathSeries) {
    const points = Array.isArray(basePostDeathSeries?.points) ? basePostDeathSeries.points : [];
    const point = points.find(function (candidate) {
      return toOptionalNumber(candidate?.survivorNeeds) != null
        || toOptionalNumber(candidate?.essentialNeeds) != null
        || toOptionalNumber(candidate?.discretionaryNeeds) != null;
    });
    if (!point) {
      return {
        value: null,
        sourcePath: null
      };
    }

    const survivorNeeds = toOptionalNumber(point.survivorNeeds);
    if (survivorNeeds != null) {
      return {
        value: roundMoney(survivorNeeds),
        sourcePath: "basePostDeathSeries.points.survivorNeeds"
      };
    }

    return {
      value: roundMoney((toOptionalNumber(point.essentialNeeds) || 0) + (toOptionalNumber(point.discretionaryNeeds) || 0)),
      sourcePath: "basePostDeathSeries.points.essentialNeeds+discretionaryNeeds"
    };
  }

  function validateGraphAdjustmentAgainstBaseNeeds(reconciledSummary, basePostDeathSeries, warnings, dataGaps) {
    if (!reconciledSummary || reconciledSummary.graphMonthlyDelta === 0) {
      return true;
    }

    const baseNeed = getBaseMonthlySurvivorNeed(basePostDeathSeries);
    if (baseNeed.value == null) {
      const issue = makeIssue(
        "missing-base-survivor-need-for-lifestyle-reconciliation",
        "Base post-death survivor need values were unavailable, so lifestyle graph adjustment was kept as a no-op.",
        ["basePostDeathSeries.points.survivorNeeds", "basePostDeathSeries.points.essentialNeeds", "basePostDeathSeries.points.discretionaryNeeds"]
      );
      dataGaps.push(issue);
      warnings.push(clonePlainValue(issue));
      return false;
    }

    if (reconciledSummary.graphBaselineMonthlyTotal > roundMoney(baseNeed.value + 1)) {
      const issue = makeIssue(
        "lifestyle-reconciled-expenses-exceed-base-survivor-needs",
        "Reconciled lifestyle expense facts exceed the base survivor need stream, so graph adjustment was kept as a no-op.",
        [baseNeed.sourcePath],
        {
          reconciledExpenseBaseline: reconciledSummary.graphBaselineMonthlyTotal,
          baseMonthlySurvivorNeed: baseNeed.value
        }
      );
      dataGaps.push(issue);
      warnings.push(clonePlainValue(issue));
      return false;
    }

    return true;
  }

  function getPointMonthIndex(point, index, warnings, dataGaps) {
    const monthIndex = toOptionalNumber(point && point.monthIndex);
    if (monthIndex != null && monthIndex >= 0) {
      return monthIndex;
    }
    const issue = makeIssue(
      "missing-post-death-month-index-for-lifestyle-comparison",
      "A post-death point was missing an explicit monthIndex, so lifestyle graph adjustment was kept as a no-op.",
      [`basePostDeathSeries.points.${index}.monthIndex`]
    );
    dataGaps.push(issue);
    warnings.push(clonePlainValue(issue));
    return null;
  }

  function recalculateLifestyleDepletion(points, fallbackDate) {
    const safePoints = Array.isArray(points) ? points : [];
    const depletedPoint = safePoints.find(function (point) {
      const endingResources = toOptionalNumber(point?.endingResources);
      return endingResources != null && endingResources <= 0;
    });
    if (!depletedPoint) {
      const lastPoint = safePoints[safePoints.length - 1] || {};
      return {
        depleted: false,
        depletionDate: null,
        depletionMonthIndex: null,
        monthsCovered: toOptionalNumber(lastPoint.monthIndex) ?? safePoints.length,
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

  function summarizeLifestylePostDeathPoints(points, baseSummary) {
    const totals = (Array.isArray(points) ? points : []).reduce(function (next, point) {
      next.totalSurvivorNeeds = roundMoney(next.totalSurvivorNeeds + (toOptionalNumber(point?.survivorNeeds) || 0));
      next.totalNetUse = roundMoney(next.totalNetUse + (toOptionalNumber(point?.netUse) || 0));
      return next;
    }, {
      totalSurvivorNeeds: 0,
      totalNetUse: 0
    });
    const lastPoint = Array.isArray(points) ? points[points.length - 1] || {} : {};
    return Object.assign({}, clonePlainValue(baseSummary || {}), totals, {
      endingResources: toOptionalNumber(lastPoint.endingResources),
      accumulatedUnmetNeed: toOptionalNumber(lastPoint.accumulatedUnmetNeed)
    });
  }

  function buildAdjustedPostDeathSeries(basePostDeathSeries, monthlyDelta, lifestyleScenario, warnings, dataGaps) {
    const basePoints = Array.isArray(basePostDeathSeries?.points) ? basePostDeathSeries.points : [];
    const canUseMonthIndexes = basePoints.every(function (basePoint, index) {
      return getPointMonthIndex(basePoint, index, warnings, dataGaps) != null;
    });
    const effectiveMonthlyDelta = canUseMonthIndexes ? monthlyDelta : 0;

    const points = basePoints.map(function (basePoint, index) {
      const point = clonePlainValue(basePoint);
      const monthIndex = canUseMonthIndexes ? getPointMonthIndex(basePoint, index, warnings, dataGaps) : 0;
      const elapsedMonths = Math.max(0, monthIndex || 0);
      const priorElapsedMonths = Math.max(0, elapsedMonths - 1);
      const cumulativeExpenseDelta = roundMoney(effectiveMonthlyDelta * elapsedMonths);
      const priorCumulativeExpenseDelta = roundMoney(effectiveMonthlyDelta * priorElapsedMonths);
      const baseSurvivorNeeds = toOptionalNumber(basePoint.survivorNeeds);
      const baseDiscretionaryNeeds = toOptionalNumber(basePoint.discretionaryNeeds);
      const baseNetUse = toOptionalNumber(basePoint.netUse);
      const baseStartingResources = toOptionalNumber(basePoint.startingResources);
      const baseEndingResources = toOptionalNumber(basePoint.endingResources);
      const baseAvailableResources = toOptionalNumber(basePoint.availableResources);
      const endingResources = baseEndingResources == null ? null : roundMoney(baseEndingResources - cumulativeExpenseDelta);
      const availableResources = endingResources == null
        ? (baseAvailableResources == null ? null : roundMoney(baseAvailableResources - cumulativeExpenseDelta))
        : roundMoney(Math.max(0, endingResources));
      const accumulatedUnmetNeed = endingResources == null ? null : roundMoney(Math.max(0, -endingResources));
      const survivorNeeds = baseSurvivorNeeds == null ? point.survivorNeeds : roundMoney(Math.max(0, baseSurvivorNeeds + effectiveMonthlyDelta));
      const discretionaryNeeds = baseDiscretionaryNeeds == null ? point.discretionaryNeeds : roundMoney(Math.max(0, baseDiscretionaryNeeds + effectiveMonthlyDelta));
      const netUse = baseNetUse == null ? point.netUse : roundMoney(Math.max(0, baseNetUse + effectiveMonthlyDelta));

      return Object.assign({}, point, {
        startingResources: baseStartingResources == null
          ? point.startingResources
          : roundMoney(baseStartingResources - priorCumulativeExpenseDelta),
        discretionaryNeeds,
        survivorNeeds,
        netUse,
        endingResources,
        availableResources,
        accumulatedUnmetNeed,
        status: endingResources != null && endingResources <= 0 ? "depleted" : "available",
        trace: Object.assign({}, isPlainObject(point.trace) ? point.trace : {}, {
          lifestyleScenarioApplied: effectiveMonthlyDelta !== 0,
          baseScenarioPointMutated: false,
          lifestyleSliderValue: lifestyleScenario?.sliderValue ?? 0,
          monthlyExpenseDeltaApplied: effectiveMonthlyDelta,
          cumulativeExpenseDeltaApplied: cumulativeExpenseDelta,
          elapsedMonthIndexUsed: elapsedMonths,
          graphAdjustmentSource: "reconciled-lifestyle-expense-facts"
        }),
        sourcePaths: uniqueStrings([].concat(point.sourcePaths || [], ["lifestyleScenario.adjustedExpenses"]))
      });
    });

    const depletion = recalculateLifestyleDepletion(points, basePostDeathSeries?.depletion?.depletionDate);
    return {
      points,
      summary: summarizeLifestylePostDeathPoints(points, basePostDeathSeries?.summary),
      depletion,
      trace: {
        effectiveMonthlyDelta,
        monthIndexPolicy: canUseMonthIndexes ? "explicit-monthIndex" : "no-op-missing-monthIndex"
      }
    };
  }

  function buildLifestyleComparisonScenario(basePostDeathSeries, lifestyleScenario, input) {
    const warnings = [];
    const dataGaps = [];
    const basePoints = Array.isArray(basePostDeathSeries?.points) ? basePostDeathSeries.points : [];
    if (!isPlainObject(lifestyleScenario) || basePoints.length < 2) {
      const issue = makeIssue(
        "missing-base-post-death-series-for-lifestyle-comparison",
        "Lifestyle comparison requires at least two base post-death points.",
        ["basePostDeathSeries.points"]
      );
      dataGaps.push(issue);
      warnings.push(clonePlainValue(issue));
      return {
        scenarioId: normalizeString(input?.options?.comparisonScenarioId) || DEFAULT_COMPARISON_SCENARIO_ID,
        kind: "compression",
        pathId: normalizeString(input?.options?.comparisonPathId) || DEFAULT_COMPARISON_PATH_ID,
        label: normalizeString(input?.options?.comparisonLabel) || "Lifestyle-adjusted projection",
        status: "partial",
        reductionsApplied: [],
        pausesApplied: [],
        postDeathSeries: {
          points: clonePlainValue(basePoints),
          summary: clonePlainValue(basePostDeathSeries?.summary || {}),
          depletion: clonePlainValue(basePostDeathSeries?.depletion || {})
        },
        depletion: clonePlainValue(basePostDeathSeries?.depletion || {}),
        accumulatedUnmetNeed: toOptionalNumber(basePostDeathSeries?.summary?.accumulatedUnmetNeed),
        warnings,
        dataGaps,
        trace: {
          calculationMethod: "income-impact-lifestyle-comparison-adapter-v1",
          sourceCalculationMethod: lifestyleScenario?.trace?.calculationMethod || null,
          sliderValue: lifestyleScenario?.sliderValue ?? 0,
          monthlyDelta: lifestyleScenario?.monthlyDelta ?? 0,
          graphMonthlyDelta: 0,
          unreconciledMonthlyDeltaExcluded: lifestyleScenario?.monthlyDelta ?? 0,
          baseScenarioMutated: false,
          timingApplied: false,
          graphPathId: normalizeString(input?.options?.comparisonPathId) || DEFAULT_COMPARISON_PATH_ID,
          baseNeedReconciliation: {
            status: "partial",
            policy: "base post-death series required",
            graphAdjustmentItemCount: 0,
            unreconciledItemCount: 0,
            graphBaselineMonthlyTotal: 0
          },
          graphAdjustmentItems: [],
          projectionSeriesApplied: false,
          noOpComparison: true
        }
      };
    }

    const reconciledSummary = buildReconciledAdjustmentSummary(lifestyleScenario, warnings, dataGaps);
    const canApplyGraphDelta = validateGraphAdjustmentAgainstBaseNeeds(reconciledSummary, basePostDeathSeries, warnings, dataGaps);
    const requestedGraphMonthlyDelta = canApplyGraphDelta ? reconciledSummary.graphMonthlyDelta : 0;
    const postDeathSeries = buildAdjustedPostDeathSeries(basePostDeathSeries, requestedGraphMonthlyDelta, lifestyleScenario, warnings, dataGaps);
    const graphMonthlyDelta = postDeathSeries.trace?.effectiveMonthlyDelta ?? 0;
    const status = dataGaps.length ? "partial" : (lifestyleScenario.status || "complete");

    return {
      scenarioId: normalizeString(input?.options?.comparisonScenarioId) || DEFAULT_COMPARISON_SCENARIO_ID,
      kind: "compression",
      pathId: normalizeString(input?.options?.comparisonPathId) || DEFAULT_COMPARISON_PATH_ID,
      label: normalizeString(input?.options?.comparisonLabel) || "Lifestyle-adjusted projection",
      status,
      reductionsApplied: [],
      pausesApplied: [],
      postDeathSeries,
      depletion: postDeathSeries.depletion,
      accumulatedUnmetNeed: postDeathSeries.summary.accumulatedUnmetNeed ?? null,
      warnings,
      dataGaps,
      trace: {
        calculationMethod: "income-impact-lifestyle-comparison-adapter-v1",
        sourceCalculationMethod: lifestyleScenario.trace?.calculationMethod || null,
        sliderValue: lifestyleScenario.sliderValue ?? 0,
        monthlyDelta: lifestyleScenario.monthlyDelta ?? 0,
        graphMonthlyDelta,
        unreconciledMonthlyDeltaExcluded: roundMoney((lifestyleScenario.monthlyDelta || 0) - graphMonthlyDelta),
        baseScenarioMutated: false,
        timingApplied: false,
        graphPathId: normalizeString(input?.options?.comparisonPathId) || DEFAULT_COMPARISON_PATH_ID,
        baseNeedReconciliation: {
          status: dataGaps.length ? "partial" : "complete",
          policy: "only source-owned ongoingSupport scalar household expense facts can move the graph",
          graphAdjustmentItemCount: reconciledSummary.graphAdjustmentItems.filter(function (item) {
            return toOptionalNumber(item.graphMonthlyDelta) !== 0;
          }).length,
          unreconciledItemCount: reconciledSummary.unreconciledItems.length,
          graphBaselineMonthlyTotal: reconciledSummary.graphBaselineMonthlyTotal
        },
        graphAdjustmentItems: reconciledSummary.graphAdjustmentItems,
        projectionSeriesApplied: graphMonthlyDelta !== 0,
        noOpComparison: graphMonthlyDelta === 0
      }
    };
  }

  function calculateIncomeImpactLifestyleComparisonScenario(input) {
    const sourceInput = isPlainObject(input) ? input : {};
    const lifestyleScenario = isPlainObject(sourceInput.lifestyleScenario)
      ? sourceInput.lifestyleScenario
      : calculateIncomeImpactLifestyleScenario(sourceInput);
    const basePostDeathSeries = getInputBasePostDeathSeries(sourceInput);
    return buildLifestyleComparisonScenario(basePostDeathSeries, lifestyleScenario, sourceInput);
  }

  function calculateIncomeImpactLifestyleScenario(input) {
    const sourceInput = isPlainObject(input) ? input : {};
    const warnings = [];
    const dataGaps = [];
    const rawSliderValue = toOptionalNumber(sourceInput.sliderValue);
    const sliderValue = clamp(rawSliderValue == null ? 0 : rawSliderValue, MIN_SLIDER_VALUE, MAX_SLIDER_VALUE);
    if (rawSliderValue != null && rawSliderValue !== sliderValue) {
      warnings.push(makeIssue(
        "lifestyle-slider-value-clamped",
        "Lifestyle slider value was clamped to the supported -100 to 100 range.",
        ["sliderValue"],
        {
          requestedValue: rawSliderValue,
          sliderValue
        }
      ));
    }

    const expenses = getExpenses(sourceInput).filter(isPlainObject);
    if (!expenses.length) {
      dataGaps.push(makeIssue(
        "missing-lifestyle-expenses",
        "Lifestyle scenario requires expense facts or baseline expense records.",
        ["expenses", "expenseFacts.expenses", "baselineExpenses"]
      ));
    }

    const policyResolver = buildPolicyResolver(sourceInput);
    const adjustedExpenses = expenses.map(function (expense, index) {
      const policy = policyResolver(expense);
      return createAdjustedExpense(expense, policy, index, sliderValue, sourceInput, warnings);
    });

    const totalBaselineMonthlyExpenses = sumMonthly(adjustedExpenses, "baselineMonthlyAmount");
    const totalAdjustedMonthlyExpenses = sumMonthly(adjustedExpenses, "adjustedMonthlyAmount");
    const sliderEligibleExpensesTotal = roundMoney(adjustedExpenses.reduce(function (total, item) {
      return total + (item.sliderEligible ? item.baselineMonthlyAmount : 0);
    }, 0));
    const fixedExpensesTotal = roundMoney(totalBaselineMonthlyExpenses - sliderEligibleExpensesTotal);
    const conservativeFloorTotal = sumMonthly(adjustedExpenses, "floorMonthlyAmount");
    const elevatedCeilingTotal = sumMonthly(adjustedExpenses, "ceilingMonthlyAmount");

    const output = {
      status: dataGaps.length ? "partial" : "complete",
      sliderValue,
      totalBaselineMonthlyExpenses,
      totalAdjustedMonthlyExpenses,
      monthlyDelta: roundMoney(totalAdjustedMonthlyExpenses - totalBaselineMonthlyExpenses),
      adjustedExpenses,
      fixedExpensesTotal,
      sliderEligibleExpensesTotal,
      conservativeFloorTotal,
      elevatedCeilingTotal,
      warnings,
      dataGaps,
      trace: {
        calculationMethod: CALCULATION_METHOD,
        mode: normalizeString(sourceInput.options && sourceInput.options.mode) || DEFAULT_MODE,
        sliderValue,
        expenseCount: adjustedExpenses.length,
        sliderEligibleExpenseCount: adjustedExpenses.filter(function (item) {
          return item.sliderEligible;
        }).length,
        fixedExpenseCount: adjustedExpenses.filter(function (item) {
          return !item.sliderEligible;
        }).length,
        baselinePreservedAtZero: sliderValue === 0
          ? totalBaselineMonthlyExpenses === totalAdjustedMonthlyExpenses
          : null,
        projectionSeriesApplied: false,
        projectionSeriesDeferred: true,
        timingApplied: false,
        rangeAdjustmentApplied: sliderValue !== 0,
        graphPathChanged: false,
        displayWired: false,
        storageTouched: false,
        inputsMutated: false
      }
    };

    const basePostDeathSeries = getInputBasePostDeathSeries(sourceInput);
    if (basePostDeathSeries) {
      const comparisonScenario = buildLifestyleComparisonScenario(basePostDeathSeries, output, sourceInput);
      if (comparisonScenario) {
        output.comparisonScenario = comparisonScenario;
        output.warnings = output.warnings.concat(comparisonScenario.warnings || []);
        output.dataGaps = output.dataGaps.concat(comparisonScenario.dataGaps || []);
        output.status = output.dataGaps.length ? "partial" : output.status;
        output.trace.projectionSeriesApplied = comparisonScenario.trace?.projectionSeriesApplied === true;
        output.trace.projectionSeriesDeferred = false;
        output.trace.graphPathChanged = Boolean(comparisonScenario);
        output.trace.comparisonScenarioStatus = comparisonScenario.status || null;
        output.trace.graphMonthlyDelta = comparisonScenario.trace?.graphMonthlyDelta ?? null;
        output.trace.unreconciledMonthlyDeltaExcluded = comparisonScenario.trace?.unreconciledMonthlyDeltaExcluded ?? null;
        output.trace.baseNeedReconciliationStatus = comparisonScenario.trace?.baseNeedReconciliation?.status || null;
      }
    }

    return output;
  }

  lensAnalysis.incomeImpactLifestyleScenarioCalculations = Object.freeze({
    calculateIncomeImpactLifestyleScenario,
    calculateIncomeImpactLifestyleComparisonScenario
  });
})(globalThis);
