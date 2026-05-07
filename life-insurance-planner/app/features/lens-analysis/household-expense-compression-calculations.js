(function (global) {
  const LensApp = global.LensApp || (global.LensApp = {});
  const lensAnalysis = LensApp.lensAnalysis || (LensApp.lensAnalysis = {});

  // Owner: Lens analysis passive household expense compression classifier.
  // Purpose: classify expense facts for future advisor review without changing
  // current formulas, scenarios, expense facts, thresholds, or library entries.

  const CALCULATION_METHOD = "household-expense-compression-opportunities-v1";
  const DEFAULT_MODE = "reportingOnly";
  const MONTHLY_FREQUENCY_FACTORS = Object.freeze({
    monthly: 1,
    biweekly: 26 / 12,
    weekly: 52 / 12,
    quarterly: 1 / 3,
    semiannual: 1 / 6,
    annual: 1 / 12
  });
  const GENERATED_DEBT_REASON = "generated-debt-payment-source-owned";
  const ADVISOR_REVIEW_CATEGORIES = Object.freeze([
    "healthcare",
    "taxes",
    "legalProfessionalAdministrative",
    "educationEnrichment",
    "givingGiftsCommunityObligations",
    "businessSelfEmployment",
    "debtObligations"
  ]);
  const ADVISOR_REVIEW_NEED_TYPES = Object.freeze([
    "legalObligation",
    "debtObligation",
    "businessIncomePreserving"
  ]);

  function isPlainObject(value) {
    return Object.prototype.toString.call(value) === "[object Object]";
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

  function normalizeToken(value) {
    return normalizeString(value).toLowerCase();
  }

  function toOptionalNumber(value) {
    if (value == null || value === "") {
      return null;
    }

    const numberValue = Number(value);
    return Number.isFinite(numberValue) ? numberValue : null;
  }

  function firstNumber(values) {
    for (let index = 0; index < values.length; index += 1) {
      const numberValue = toOptionalNumber(values[index]);
      if (numberValue != null) {
        return numberValue;
      }
    }

    return null;
  }

  function createIssue(code, message, details) {
    return Object.assign({
      code,
      message
    }, isPlainObject(details) ? clonePlainValue(details) : {});
  }

  function getSourceExpenses(expenseFacts) {
    if (Array.isArray(expenseFacts)) {
      return expenseFacts;
    }

    if (expenseFacts && Array.isArray(expenseFacts.expenses)) {
      return expenseFacts.expenses;
    }

    return [];
  }

  function getResolvedThresholdRules(resolvedThresholds) {
    if (Array.isArray(resolvedThresholds)) {
      return resolvedThresholds;
    }

    if (resolvedThresholds && Array.isArray(resolvedThresholds.rules)) {
      return resolvedThresholds.rules;
    }

    return [];
  }

  function getLibraryEntry(expenseLibrary, typeKey) {
    const normalizedTypeKey = normalizeString(typeKey);
    if (!normalizedTypeKey) {
      return null;
    }

    if (expenseLibrary && typeof expenseLibrary.getExpenseLibraryEntry === "function") {
      const entry = expenseLibrary.getExpenseLibraryEntry(normalizedTypeKey);
      return entry && typeof entry === "object" ? entry : null;
    }

    const entries = Array.isArray(expenseLibrary)
      ? expenseLibrary
      : expenseLibrary && Array.isArray(expenseLibrary.entries)
        ? expenseLibrary.entries
        : [];

    return entries.find(function (entry) {
      return entry && (entry.typeKey === normalizedTypeKey || entry.libraryEntryKey === normalizedTypeKey);
    }) || null;
  }

  function findThresholdRule(thresholdRules, typeKey) {
    const normalizedTypeKey = normalizeString(typeKey);
    if (!normalizedTypeKey) {
      return null;
    }

    return thresholdRules.find(function (rule) {
      return rule && rule.expenseTypeKey === normalizedTypeKey;
    }) || null;
  }

  function isGeneratedDebtPaymentFact(expense, libraryEntry) {
    const duplicateProtectionKey = normalizeToken(expense && expense.duplicateProtectionKey);
    return expense && (
      expense.isGeneratedExpense === true
      || expense.isDebtPaymentExpense === true
      || expense.sourceKey === "debtRecords"
      || expense.sourceOwnedBy === "debtRecords"
      || expense.generatedOnly === true
      || (libraryEntry && (libraryEntry.sourceOwnedBy === "debtRecords" || libraryEntry.generatedOnly === true))
      || duplicateProtectionKey.indexOf("debt-payment:") === 0
    );
  }

  function isAdvisorReviewOnly(entry, thresholdRule) {
    if (entry && entry.requiresAdvisorConfirmation === true) {
      return true;
    }

    const categoryKey = normalizeString(entry && entry.categoryKey);
    const defaultNeedType = normalizeString(entry && entry.defaultNeedType);
    if (ADVISOR_REVIEW_CATEGORIES.indexOf(categoryKey) !== -1) {
      return true;
    }

    if (ADVISOR_REVIEW_NEED_TYPES.indexOf(defaultNeedType) !== -1) {
      return true;
    }

    return thresholdRule && thresholdRule.requiresAdvisorConfirmation === true;
  }

  function isPauseCandidate(entry, thresholdRule) {
    return (entry && (
      entry.compressionTier === "pauseCandidate"
      || entry.defaultNeedType === "savingsContribution"
    )) || (thresholdRule && thresholdRule.canPause === true);
  }

  function isCustomExpense(expense, entry) {
    return expense && (
      expense.isCustomExpense === true
      || expense.typeKey === "customExpenseRecord"
      || expense.categoryKey === "customExpense"
      || expense.categoryKey === "otherCustomExpense"
      || (entry && entry.isCustomType === true)
    );
  }

  function isProtectedExpense(entry, thresholdRule) {
    return (entry && (
      entry.protectedCategory === true
      || entry.isProtected === true
      || entry.priorityClass === "protected"
      || entry.defaultNeedType === "protectedEssential"
    )) || (thresholdRule && thresholdRule.behaviorClass === "protectedEssential");
  }

  function getMonthlyAmount(expense) {
    const monthlyRecurringAmount = toOptionalNumber(expense && expense.monthlyRecurringAmount);
    if (monthlyRecurringAmount != null) {
      return monthlyRecurringAmount;
    }

    const annualizedAmount = toOptionalNumber(expense && expense.annualizedAmount);
    if (annualizedAmount != null) {
      return annualizedAmount / 12;
    }

    const amount = toOptionalNumber(expense && expense.amount);
    if (amount == null) {
      return null;
    }

    const frequency = normalizeString(expense && expense.frequency) || "monthly";
    if (Object.prototype.hasOwnProperty.call(MONTHLY_FREQUENCY_FACTORS, frequency)) {
      return amount * MONTHLY_FREQUENCY_FACTORS[frequency];
    }

    return null;
  }

  function getAnnualAmount(expense, monthlyAmount) {
    const annualizedAmount = toOptionalNumber(expense && expense.annualizedAmount);
    if (annualizedAmount != null) {
      return annualizedAmount;
    }

    return monthlyAmount == null ? null : monthlyAmount * 12;
  }

  function getThresholdMonthlyBasisAmount(thresholdRule, householdFacts) {
    const householdMemberCount = toOptionalNumber(householdFacts && householdFacts.householdMemberCount);
    const dependentCount = toOptionalNumber(householdFacts && householdFacts.dependentCount);
    const income = firstNumber([
      householdFacts && householdFacts.netAnnualIncome,
      householdFacts && householdFacts.survivorNetAnnualIncome
    ]);

    if (!thresholdRule || !isPlainObject(thresholdRule.tiers)) {
      return {
        amount: null,
        dataGap: createIssue(
          "missing-threshold-rule",
          "A matching threshold rule is required before this expense can be classified as a compression opportunity."
        )
      };
    }

    if (thresholdRule.thresholdBasis === "perHouseholdMemberMonthly") {
      if (!(householdMemberCount > 0)) {
        return {
          amount: null,
          dataGap: createIssue(
            "missing-household-member-count",
            "householdMemberCount is required for per-household-member expense thresholds.",
            { thresholdId: thresholdRule.thresholdId }
          )
        };
      }

      return {
        amount: thresholdRule.tiers.comfortable * householdMemberCount,
        householdFactor: householdMemberCount,
        dataGap: null
      };
    }

    if (thresholdRule.thresholdBasis === "perDependentMonthly") {
      if (!(dependentCount > 0)) {
        return {
          amount: null,
          dataGap: createIssue(
            "missing-dependent-count",
            "dependentCount is required for per-dependent expense thresholds.",
            { thresholdId: thresholdRule.thresholdId }
          )
        };
      }

      return {
        amount: thresholdRule.tiers.comfortable * dependentCount,
        householdFactor: dependentCount,
        dataGap: null
      };
    }

    if (thresholdRule.thresholdBasis === "percentOfIncome") {
      if (!(income > 0)) {
        return {
          amount: null,
          dataGap: createIssue(
            "missing-income-for-percent-threshold",
            "Net income is required for percent-of-income expense thresholds.",
            { thresholdId: thresholdRule.thresholdId }
          )
        };
      }

      return {
        amount: (thresholdRule.tiers.comfortable / 100) * income / 12,
        incomeBasis: income,
        dataGap: null
      };
    }

    if (
      thresholdRule.thresholdBasis === "perHouseholdMonthly"
      || thresholdRule.thresholdBasis === "fixedMonthly"
      || thresholdRule.thresholdBasis === "advisorDefined"
    ) {
      return {
        amount: thresholdRule.tiers.comfortable,
        dataGap: null
      };
    }

    return {
      amount: null,
      dataGap: createIssue(
        "threshold-basis-not-classified",
        "Threshold basis is not classified by the passive V1 classifier.",
        { thresholdId: thresholdRule.thresholdId, thresholdBasis: thresholdRule.thresholdBasis || null }
      )
    };
  }

  function getThresholdFloor(thresholdRule, householdFacts) {
    if (!thresholdRule) {
      return null;
    }

    const protectedFloor = toOptionalNumber(thresholdRule.protectedFloor);
    if (protectedFloor == null) {
      return null;
    }

    if (thresholdRule.thresholdBasis === "perHouseholdMemberMonthly") {
      const householdMemberCount = toOptionalNumber(householdFacts && householdFacts.householdMemberCount);
      return householdMemberCount > 0 ? protectedFloor * householdMemberCount : protectedFloor;
    }

    if (thresholdRule.thresholdBasis === "perDependentMonthly") {
      const dependentCount = toOptionalNumber(householdFacts && householdFacts.dependentCount);
      return dependentCount > 0 ? protectedFloor * dependentCount : protectedFloor;
    }

    return protectedFloor;
  }

  function createBaseItem(expense, entry, thresholdRule, monthlyAmount, annualAmount) {
    return {
      id: normalizeString(expense && expense.expenseFactId)
        || normalizeString(expense && expense.expenseRecordId)
        || normalizeString(expense && expense.typeKey)
        || "expense",
      expenseFactId: normalizeString(expense && expense.expenseFactId) || null,
      expenseRecordId: normalizeString(expense && expense.expenseRecordId) || null,
      typeKey: normalizeString(expense && expense.typeKey) || null,
      categoryKey: normalizeString(expense && expense.categoryKey) || null,
      label: normalizeString(expense && expense.label)
        || normalizeString(entry && entry.label)
        || normalizeString(expense && expense.typeKey)
        || "Expense",
      frequency: normalizeString(expense && expense.frequency) || null,
      currentMonthlyAmount: monthlyAmount,
      currentAnnualAmount: annualAmount,
      oneTimeAmount: toOptionalNumber(expense && expense.oneTimeAmount),
      thresholdId: normalizeString(thresholdRule && thresholdRule.thresholdId) || null,
      thresholdBasis: normalizeString(thresholdRule && thresholdRule.thresholdBasis) || null,
      behaviorClass: normalizeString(thresholdRule && thresholdRule.behaviorClass) || null,
      defaultNeedType: normalizeString(entry && entry.defaultNeedType) || null,
      priorityClass: normalizeString(entry && entry.priorityClass) || null,
      compressionTier: normalizeString(entry && entry.compressionTier) || null,
      protectedFloor: getThresholdFloor(thresholdRule, null),
      canAutoReduce: thresholdRule ? thresholdRule.canAutoReduce === true : false,
      canPause: thresholdRule ? thresholdRule.canPause === true : false,
      sourcePath: normalizeString(expense && expense.sourcePath) || null,
      sourceKey: normalizeString(expense && expense.sourceKey) || null,
      sourceIndex: Number.isInteger(expense && expense.sourceIndex) ? expense.sourceIndex : null,
      trace: {
        sourceType: normalizeString(expense && expense.metadata && expense.metadata.sourceType) || null,
        recordSource: normalizeString(expense && expense.metadata && expense.metadata.recordSource) || null,
        libraryEntryKey: normalizeString(entry && entry.libraryEntryKey) || null
      }
    };
  }

  function withReason(item, reasonCode, reason) {
    return Object.assign({}, item, {
      reasonCode,
      reason
    });
  }

  function createOpportunity(item, thresholdRule, thresholdResult, householdFacts) {
    const protectedFloor = getThresholdFloor(thresholdRule, householdFacts);
    const thresholdMonthlyAmount = thresholdResult.amount;
    const possibleMonthlyReduction = item.currentMonthlyAmount == null || thresholdMonthlyAmount == null
      ? null
      : Math.max(0, item.currentMonthlyAmount - Math.max(thresholdMonthlyAmount, protectedFloor || 0));

    return Object.assign({}, item, {
      thresholdMonthlyAmount,
      protectedFloor,
      possibleMonthlyReduction,
      possibleAnnualReduction: possibleMonthlyReduction == null ? null : possibleMonthlyReduction * 12,
      status: possibleMonthlyReduction > 0 ? "candidate" : "within-threshold",
      note: "Reporting-only classification; no reduction has been applied."
    });
  }

  function classifyExpenseFact(expense, index, context) {
    const typeKey = normalizeString(expense && expense.typeKey);
    const entry = getLibraryEntry(context.expenseLibrary, typeKey);
    const thresholdRule = findThresholdRule(context.thresholdRules, typeKey);
    const monthlyAmount = getMonthlyAmount(expense);
    const annualAmount = getAnnualAmount(expense, monthlyAmount);
    const item = createBaseItem(expense, entry, thresholdRule, monthlyAmount, annualAmount);
    item.sourceIndex = Number.isInteger(item.sourceIndex) ? item.sourceIndex : index;

    if (isGeneratedDebtPaymentFact(expense, entry)) {
      context.excludedItems.push(withReason(
        item,
        GENERATED_DEBT_REASON,
        "Generated Debt Records payment facts are source-owned and excluded from expense compression."
      ));
      return;
    }

    if (!entry) {
      const issue = createIssue(
        "missing-expense-library-entry",
        "Expense fact typeKey is not present in the expense library.",
        { typeKey: typeKey || null, sourcePath: item.sourcePath }
      );
      context.dataGaps.push(issue);
      context.advisorReviewItems.push(withReason(item, issue.code, issue.message));
      return;
    }

    if (isCustomExpense(expense, entry)) {
      const issue = createIssue(
        "custom-expense-classification-required",
        "Custom expenses require advisor classification before compression can be evaluated.",
        { typeKey: item.typeKey, sourcePath: item.sourcePath }
      );
      context.dataGaps.push(issue);
      context.advisorReviewItems.push(withReason(item, issue.code, issue.message));
      return;
    }

    if (entry.categoryKey && item.categoryKey && entry.categoryKey !== item.categoryKey) {
      const issue = createIssue(
        "expense-category-mismatch",
        "Expense fact categoryKey does not match the expense library entry categoryKey.",
        {
          typeKey: item.typeKey,
          factCategoryKey: item.categoryKey,
          libraryCategoryKey: entry.categoryKey
        }
      );
      context.dataGaps.push(issue);
      context.advisorReviewItems.push(withReason(item, issue.code, issue.message));
      return;
    }

    if (item.frequency === "oneTime" || item.frequency === "other" || item.oneTimeAmount != null) {
      const issue = createIssue(
        "expense-frequency-review-required",
        "One-time or other-frequency expenses require a future periodic policy before compression classification.",
        { typeKey: item.typeKey, frequency: item.frequency, sourcePath: item.sourcePath }
      );
      context.dataGaps.push(issue);
      context.advisorReviewItems.push(withReason(item, issue.code, issue.message));
      return;
    }

    if (monthlyAmount == null) {
      const issue = createIssue(
        "missing-monthly-expense-amount",
        "A recurring monthly equivalent is required before this expense can be classified.",
        { typeKey: item.typeKey, sourcePath: item.sourcePath }
      );
      context.dataGaps.push(issue);
      context.advisorReviewItems.push(withReason(item, issue.code, issue.message));
      return;
    }

    if (isAdvisorReviewOnly(entry, thresholdRule) && context.options.includeAdvisorConfirmed !== true) {
      context.advisorReviewItems.push(withReason(
        item,
        "advisor-confirmation-required",
        "This category is review-only until future explicit advisor confirmation is supplied."
      ));
      return;
    }

    if (isPauseCandidate(entry, thresholdRule)) {
      if (context.options.includePauseCandidates === false) {
        context.excludedItems.push(withReason(
          item,
          "pause-candidate-reporting-disabled",
          "Pause-candidate reporting was disabled by options."
        ));
        return;
      }

      context.pauseCandidates.push(Object.assign({}, item, {
        status: "pause-candidate",
        possibleMonthlyPauseAmount: monthlyAmount,
        possibleAnnualPauseAmount: annualAmount,
        note: "Savings and contribution entries are pause candidates, not asset reductions."
      }));
      return;
    }

    if (!thresholdRule) {
      if (isProtectedExpense(entry, thresholdRule)) {
        context.protectedItems.push(withReason(
          item,
          "protected-expense-without-threshold",
          "Protected expense has no matching threshold rule in this passive V1 table."
        ));
        return;
      }

      context.advisorReviewItems.push(withReason(
        item,
        "missing-threshold-rule",
        "No matching threshold rule exists for this expense type in passive V1."
      ));
      return;
    }

    const thresholdResult = getThresholdMonthlyBasisAmount(thresholdRule, context.householdFacts);
    if (thresholdResult.dataGap) {
      const issue = Object.assign({}, thresholdResult.dataGap, {
        typeKey: item.typeKey,
        sourcePath: item.sourcePath
      });
      context.dataGaps.push(issue);
      context.advisorReviewItems.push(withReason(item, issue.code, issue.message));
      return;
    }

    if (isProtectedExpense(entry, thresholdRule) && thresholdRule.canAutoReduce !== true) {
      context.protectedItems.push(withReason(
        Object.assign({}, item, {
          thresholdMonthlyAmount: thresholdResult.amount,
          protectedFloor: getThresholdFloor(thresholdRule, context.householdFacts)
        }),
        "protected-expense-not-auto-reducible",
        "Protected expense is not auto-reducible in the passive V1 threshold table."
      ));
      return;
    }

    if (thresholdRule.canAutoReduce === true && monthlyAmount > thresholdResult.amount) {
      context.opportunities.push(createOpportunity(item, thresholdRule, thresholdResult, context.householdFacts));
      return;
    }

    if (isProtectedExpense(entry, thresholdRule)) {
      context.protectedItems.push(withReason(
        Object.assign({}, item, {
          thresholdMonthlyAmount: thresholdResult.amount,
          protectedFloor: getThresholdFloor(thresholdRule, context.householdFacts)
        }),
        "protected-expense-within-threshold",
        "Protected expense is within the passive threshold comparison."
      ));
      return;
    }

    context.excludedItems.push(withReason(
      Object.assign({}, item, {
        thresholdMonthlyAmount: thresholdResult.amount
      }),
      "expense-within-threshold",
      "Expense does not exceed the passive V1 threshold comparison."
    ));
  }

  function determineStatus(result) {
    if (result.dataGaps.length) {
      return "partial";
    }

    if (
      result.opportunities.length
      || result.pauseCandidates.length
      || result.advisorReviewItems.length
      || result.protectedItems.length
      || result.excludedItems.length
    ) {
      return "complete";
    }

    return "noExpenseFacts";
  }

  function calculateHouseholdExpenseCompressionOpportunities(input) {
    const safeInput = isPlainObject(input) ? input : {};
    const options = isPlainObject(safeInput.options) ? safeInput.options : {};
    const context = {
      expenseLibrary: safeInput.expenseLibrary || null,
      thresholdRules: getResolvedThresholdRules(safeInput.resolvedThresholds),
      householdFacts: isPlainObject(safeInput.householdFacts) ? safeInput.householdFacts : {},
      options: {
        mode: normalizeString(options.mode) || DEFAULT_MODE,
        includeAdvisorConfirmed: options.includeAdvisorConfirmed === true,
        includeGeneratedDebtPayments: options.includeGeneratedDebtPayments === true,
        includePauseCandidates: options.includePauseCandidates !== false
      },
      opportunities: [],
      pauseCandidates: [],
      advisorReviewItems: [],
      protectedItems: [],
      excludedItems: [],
      warnings: [],
      dataGaps: []
    };

    if (context.options.mode !== DEFAULT_MODE) {
      context.warnings.push(createIssue(
        "unsupported-mode-defaulted",
        "Only reportingOnly mode is supported by the passive V1 classifier.",
        { requestedMode: context.options.mode }
      ));
      context.options.mode = DEFAULT_MODE;
    }

    if (context.options.includeGeneratedDebtPayments === true) {
      context.warnings.push(createIssue(
        "generated-debt-payments-forced-excluded",
        "Generated debt-payment facts remain excluded in passive V1 even when includeGeneratedDebtPayments is true."
      ));
      context.options.includeGeneratedDebtPayments = false;
    }

    getSourceExpenses(safeInput.expenseFacts).forEach(function (expense, index) {
      classifyExpenseFact(expense, index, context);
    });

    const result = {
      status: null,
      opportunities: context.opportunities,
      pauseCandidates: context.pauseCandidates,
      advisorReviewItems: context.advisorReviewItems,
      protectedItems: context.protectedItems,
      excludedItems: context.excludedItems,
      warnings: context.warnings,
      dataGaps: context.dataGaps,
      trace: {
        calculationMethod: CALCULATION_METHOD,
        mode: DEFAULT_MODE,
        baseExpenseFactsMutated: false,
        baseScenarioMutated: false,
        resolvedThresholdSource: "explicit-input",
        layer5Wired: false,
        thresholdRuleCount: context.thresholdRules.length,
        sourceExpenseFactCount: getSourceExpenses(safeInput.expenseFacts).length
      }
    };
    result.status = determineStatus(result);

    return clonePlainValue(result);
  }

  lensAnalysis.householdExpenseCompressionCalculations = Object.freeze({
    calculateHouseholdExpenseCompressionOpportunities
  });
  lensAnalysis.calculateHouseholdExpenseCompressionOpportunities = calculateHouseholdExpenseCompressionOpportunities;
})(typeof window !== "undefined" ? window : globalThis);
