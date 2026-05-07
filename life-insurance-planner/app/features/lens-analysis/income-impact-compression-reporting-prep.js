(function (global) {
  const LensApp = global.LensApp || (global.LensApp = {});
  const lensAnalysis = LensApp.lensAnalysis || (LensApp.lensAnalysis = {});

  const CALCULATION_METHOD = "income-impact-compression-reporting-prep-v1";
  const SCALAR_HOUSEHOLD_SUPPORT_FIELDS = Object.freeze([
    "monthlyOtherInsuranceCost",
    "monthlyHealthcareOutOfPocketCost",
    "monthlyFoodCost",
    "monthlyTransportationCost",
    "monthlyChildcareAndDependentCareCost",
    "monthlyPhoneAndInternetCost",
    "monthlyHouseholdSuppliesCost",
    "monthlyOtherHouseholdExpenses",
    "monthlyNonHousingEssentialSupportCost",
    "annualNonHousingEssentialSupportCost",
    "monthlyTravelAndDiscretionaryCost",
    "monthlySubscriptionsCost",
    "monthlyDiscretionaryPersonalSpending",
    "annualDiscretionaryPersonalSpending"
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

  function createIssue(code, message, details) {
    return Object.assign({
      code,
      message
    }, isPlainObject(details) ? clonePlainValue(details) : {});
  }

  function getExpenseFacts(lensModel) {
    const expenseFacts = isPlainObject(lensModel?.expenseFacts) ? lensModel.expenseFacts : {};
    return Array.isArray(expenseFacts.expenses) ? expenseFacts.expenses : [];
  }

  function hasUsableAmount(value) {
    const amount = toOptionalNumber(value);
    return amount != null && amount > 0;
  }

  function getPresentScalarHouseholdSupportFields(lensModel) {
    const ongoingSupport = isPlainObject(lensModel?.ongoingSupport) ? lensModel.ongoingSupport : {};
    return SCALAR_HOUSEHOLD_SUPPORT_FIELDS.filter(function (fieldName) {
      return hasUsableAmount(ongoingSupport[fieldName]);
    });
  }

  function getItemizedScalarHouseholdSupportFields(expenseFacts) {
    return SCALAR_HOUSEHOLD_SUPPORT_FIELDS.filter(function (fieldName) {
      return expenseFacts.some(function (expense) {
        const sourcePath = normalizeString(expense?.sourcePath);
        const ownedByField = normalizeString(expense?.ownedByField);
        const sourceKey = normalizeString(expense?.sourceKey);
        return sourcePath.indexOf(`ongoingSupport.${fieldName}`) !== -1
          || ownedByField === fieldName
          || sourceKey === fieldName;
      });
    });
  }

  function getCurrentDependentDetailsCount(lensModel) {
    const details = lensModel?.educationSupport?.currentDependentDetails;
    return Array.isArray(details) ? details.length : null;
  }

  function deriveDependentCount(lensModel, householdFacts) {
    const explicitDependentCount = toOptionalNumber(householdFacts?.dependentCount);
    if (explicitDependentCount != null) {
      return {
        value: explicitDependentCount,
        sourcePath: "householdFacts.dependentCount"
      };
    }

    const linkedDependentCount = toOptionalNumber(lensModel?.educationSupport?.linkedDependentCount);
    if (linkedDependentCount != null) {
      return {
        value: linkedDependentCount,
        sourcePath: "lensModel.educationSupport.linkedDependentCount"
      };
    }

    const detailsCount = getCurrentDependentDetailsCount(lensModel);
    if (detailsCount != null) {
      return {
        value: detailsCount,
        sourcePath: "lensModel.educationSupport.currentDependentDetails"
      };
    }

    return {
      value: null,
      sourcePath: null
    };
  }

  function hasClearSurvivorContext(input, lensModel, householdFacts) {
    const optionContext = normalizeString(input?.options?.householdContext || input?.options?.incomeImpactHouseholdContext);
    const factContext = normalizeString(householdFacts?.householdContext || householdFacts?.context);
    if (optionContext === "survivor" || factContext === "survivor") {
      return true;
    }

    if (input?.options?.survivorContext === true || householdFacts?.survivorContext === true) {
      return true;
    }

    const survivorIncomeSource = normalizeString(lensModel?.survivorScenario?.survivorIncomeSource);
    return survivorIncomeSource === "derived-from-spouse-income"
      || survivorIncomeSource === "survivor-continues-working";
  }

  function buildHouseholdFacts(input, dataGaps) {
    const safeInput = isPlainObject(input) ? input : {};
    const lensModel = isPlainObject(safeInput.lensModel) ? safeInput.lensModel : {};
    const explicitFacts = isPlainObject(safeInput.householdFacts) ? safeInput.householdFacts : {};
    const householdFacts = clonePlainValue(explicitFacts);
    const sourcePaths = isPlainObject(householdFacts.sourcePaths) ? clonePlainValue(householdFacts.sourcePaths) : {};
    const explicitHouseholdMemberCount = toOptionalNumber(explicitFacts.householdMemberCount);
    const dependentCount = deriveDependentCount(lensModel, explicitFacts);

    if (dependentCount.value != null && householdFacts.dependentCount == null) {
      householdFacts.dependentCount = dependentCount.value;
      sourcePaths.dependentCount = dependentCount.sourcePath;
    }

    if (explicitHouseholdMemberCount != null) {
      householdFacts.householdMemberCount = explicitHouseholdMemberCount;
      sourcePaths.householdMemberCount = "householdFacts.householdMemberCount";
    } else if (hasClearSurvivorContext(safeInput, lensModel, explicitFacts)) {
      if (dependentCount.value != null) {
        householdFacts.householdMemberCount = 1 + dependentCount.value;
        sourcePaths.householdMemberCount = `survivor-household:1+${dependentCount.sourcePath || "dependentCount"}`;
      } else {
        dataGaps.push(createIssue(
          "missing-dependent-count-for-survivor-household-size",
          "Dependent count is required before survivor household member count can be derived for compression thresholds.",
          { sourcePaths: ["lensModel.educationSupport.linkedDependentCount", "lensModel.educationSupport.currentDependentDetails"] }
        ));
      }
    } else {
      dataGaps.push(createIssue(
        "unclear-household-context-for-compression",
        "Household member count was not provided and survivor household context was not explicit enough to derive it safely.",
        { sourcePaths: ["householdFacts.householdMemberCount", "options.householdContext"] }
      ));
    }

    if (householdFacts.netAnnualIncome == null) {
      const primaryNetIncome = toOptionalNumber(lensModel?.incomeBasis?.insuredNetAnnualIncome);
      const spouseNetIncome = toOptionalNumber(lensModel?.incomeBasis?.spouseOrPartnerNetAnnualIncome);
      if (primaryNetIncome != null || spouseNetIncome != null) {
        householdFacts.netAnnualIncome = (primaryNetIncome || 0) + (spouseNetIncome || 0);
        sourcePaths.netAnnualIncome = "lensModel.incomeBasis";
      }
    }

    if (householdFacts.survivorNetAnnualIncome == null) {
      const survivorNetIncome = toOptionalNumber(lensModel?.survivorScenario?.survivorNetAnnualIncome);
      if (survivorNetIncome != null) {
        householdFacts.survivorNetAnnualIncome = survivorNetIncome;
        sourcePaths.survivorNetAnnualIncome = "lensModel.survivorScenario.survivorNetAnnualIncome";
      }
    }

    householdFacts.sourcePaths = sourcePaths;
    return householdFacts;
  }

  function resolveDefaultThresholds(input, warnings, dataGaps) {
    if (Array.isArray(input?.defaultThresholds)) {
      return input.defaultThresholds;
    }

    const thresholdDefaults = lensAnalysis.expenseCompressionThresholds;
    if (thresholdDefaults && typeof thresholdDefaults.getExpenseCompressionThresholdRules === "function") {
      return thresholdDefaults.getExpenseCompressionThresholdRules();
    }

    dataGaps.push(createIssue(
      "missing-expense-compression-threshold-defaults",
      "MODEL90 default expense compression thresholds are unavailable.",
      { sourcePath: "lensAnalysis.expenseCompressionThresholds" }
    ));
    warnings.push(createIssue(
      "compression-threshold-defaults-unavailable",
      "Compression reporting prep could not load MODEL90 threshold defaults."
    ));
    return [];
  }

  function resolveThresholds(input, warnings, dataGaps) {
    const resolver = lensAnalysis.expenseCompressionThresholdResolver;
    const defaultThresholds = resolveDefaultThresholds(input, warnings, dataGaps);
    const advisorOverrides = isPlainObject(input?.advisorThresholdOverrides)
      ? input.advisorThresholdOverrides
      : isPlainObject(input?.advisorOverrides)
        ? input.advisorOverrides
        : { rulesByThresholdId: {} };

    if (input?.caseThresholdOverrides != null || input?.caseOverrides != null) {
      warnings.push(createIssue(
        "case-threshold-overrides-unsupported",
        "Case-level expense compression threshold overrides are intentionally unsupported in V1 reporting prep."
      ));
    }

    if (!resolver || typeof resolver.resolveExpenseCompressionThresholds !== "function") {
      dataGaps.push(createIssue(
        "missing-expense-compression-threshold-resolver",
        "Expense compression threshold resolver is unavailable.",
        { sourcePath: "lensAnalysis.expenseCompressionThresholdResolver" }
      ));
      return {
        rules: defaultThresholds,
        metadata: {
          source: "model90DefaultsOnly",
          precedence: ["model90Defaults"]
        },
        warnings: []
      };
    }

    return resolver.resolveExpenseCompressionThresholds({
      defaultThresholds,
      advisorOverrides
    });
  }

  function getExpenseLibrary(input) {
    return input?.expenseLibrary || lensAnalysis.expenseLibrary || null;
  }

  function getPolicyRules(dataGaps) {
    const policy = lensAnalysis.householdExpenseCompressionPolicy;
    if (policy && typeof policy.getHouseholdExpenseCompressionPolicyRules === "function") {
      return policy.getHouseholdExpenseCompressionPolicyRules();
    }

    dataGaps.push(createIssue(
      "missing-household-expense-compression-policy",
      "Household expense compression policy rules are unavailable.",
      { sourcePath: "lensAnalysis.householdExpenseCompressionPolicy" }
    ));
    return [];
  }

  function getClassifier(dataGaps) {
    const classifier = lensAnalysis.householdExpenseCompressionCalculations;
    if (classifier && typeof classifier.calculateHouseholdExpenseCompressionOpportunities === "function") {
      return classifier.calculateHouseholdExpenseCompressionOpportunities;
    }

    if (typeof lensAnalysis.calculateHouseholdExpenseCompressionOpportunities === "function") {
      return lensAnalysis.calculateHouseholdExpenseCompressionOpportunities;
    }

    dataGaps.push(createIssue(
      "missing-household-expense-compression-classifier",
      "Household expense compression classifier is unavailable.",
      { sourcePath: "lensAnalysis.householdExpenseCompressionCalculations" }
    ));
    return null;
  }

  function createEmptyCompressionReport(dataGaps, warnings) {
    return {
      status: dataGaps.length ? "partial" : "noExpenseFacts",
      opportunities: [],
      pauseCandidates: [],
      advisorReviewItems: [],
      protectedItems: [],
      excludedItems: [],
      warnings: clonePlainValue(warnings),
      dataGaps: clonePlainValue(dataGaps),
      trace: {
        calculationMethod: "household-expense-compression-opportunities-v1",
        mode: "reportingOnly",
        baseExpenseFactsMutated: false,
        baseScenarioMutated: false,
        resolvedThresholdSource: "explicit-input",
        layer5Wired: false,
        sourceExpenseFactCount: 0
      }
    };
  }

  function appendScalarHouseholdItemizationGap(lensModel, expenseFacts, dataGaps) {
    const presentFields = getPresentScalarHouseholdSupportFields(lensModel);
    if (!presentFields.length) {
      return null;
    }

    const itemizedFields = getItemizedScalarHouseholdSupportFields(expenseFacts);
    const missingFields = presentFields.filter(function (fieldName) {
      return itemizedFields.indexOf(fieldName) === -1;
    });

    if (!missingFields.length) {
      return null;
    }

    const gap = createIssue(
      "scalar-household-expenses-not-itemized-for-compression",
      "Scalar household ongoingSupport expenses are present but are not fully itemized as compression-ready expense facts.",
      {
        sourcePaths: missingFields.map(function (fieldName) {
          return `lensModel.ongoingSupport.${fieldName}`;
        }),
        presentScalarHouseholdSupportFields: presentFields,
        itemizedScalarHouseholdSupportFields: itemizedFields,
        missingScalarHouseholdSupportFields: missingFields
      }
    );
    dataGaps.push(gap);
    return gap;
  }

  function prepareIncomeImpactCompressionReportingInputs(input) {
    const safeInput = isPlainObject(input) ? input : {};
    const lensModel = isPlainObject(safeInput.lensModel) ? safeInput.lensModel : {};
    const warnings = [];
    const dataGaps = [];
    const expenseFacts = getExpenseFacts(lensModel);
    const householdFacts = buildHouseholdFacts(safeInput, dataGaps);
    const resolvedThresholds = resolveThresholds(safeInput, warnings, dataGaps);
    const classifier = getClassifier(dataGaps);
    const compressionPolicyRules = getPolicyRules(dataGaps);
    const scalarGap = appendScalarHouseholdItemizationGap(lensModel, expenseFacts, dataGaps);
    const classifierInput = {
      expenseFacts: {
        expenses: clonePlainValue(expenseFacts)
      },
      expenseLibrary: getExpenseLibrary(safeInput),
      resolvedThresholds,
      householdFacts,
      options: {
        mode: "reportingOnly",
        includeAdvisorConfirmed: safeInput.options?.includeAdvisorConfirmed === true,
        includeGeneratedDebtPayments: false,
        includePauseCandidates: safeInput.options?.includePauseCandidates !== false
      }
    };

    const compressionReport = classifier
      ? classifier(classifierInput)
      : createEmptyCompressionReport(dataGaps, warnings);

    if (Array.isArray(resolvedThresholds?.warnings) && resolvedThresholds.warnings.length) {
      warnings.push.apply(warnings, clonePlainValue(resolvedThresholds.warnings));
    }

    if (scalarGap) {
      compressionReport.dataGaps = Array.isArray(compressionReport.dataGaps)
        ? compressionReport.dataGaps.concat([clonePlainValue(scalarGap)])
        : [clonePlainValue(scalarGap)];
      compressionReport.status = compressionReport.status === "noExpenseFacts" ? "partial" : compressionReport.status;
    }

    compressionReport.warnings = Array.isArray(compressionReport.warnings)
      ? compressionReport.warnings.concat(clonePlainValue(warnings))
      : clonePlainValue(warnings);
    compressionReport.trace = Object.assign({}, isPlainObject(compressionReport.trace) ? compressionReport.trace : {}, {
      incomeImpactCompressionPrep: {
        calculationMethod: CALCULATION_METHOD,
        reportingOnly: true,
        layer5Wired: false,
        displayWired: false,
        graphPathChanged: false,
        reductionsApplied: false
      }
    });

    return clonePlainValue({
      compressionReport,
      compressionPolicyRules,
      warnings,
      dataGaps,
      trace: {
        calculationMethod: CALCULATION_METHOD,
        reportingOnly: true,
        source: "explicit-input",
        thresholdSource: "MODEL90-defaults-plus-advisor-overrides",
        advisorOverridesSupported: true,
        caseOverridesSupported: false,
        layer5Wired: false,
        displayWired: false,
        graphPathChanged: false,
        reductionsApplied: false,
        expenseStreamSource: "lensModel.expenseFacts.expenses",
        expenseFactCount: expenseFacts.length,
        compressionPolicyRuleCount: compressionPolicyRules.length,
        thresholdRuleCount: Array.isArray(resolvedThresholds?.rules) ? resolvedThresholds.rules.length : 0,
        householdFacts,
        scalarHouseholdItemizationGapPresent: Boolean(scalarGap)
      }
    });
  }

  lensAnalysis.incomeImpactCompressionReportingPrep = Object.freeze({
    prepareIncomeImpactCompressionReportingInputs
  });
  lensAnalysis.prepareIncomeImpactCompressionReportingInputs = prepareIncomeImpactCompressionReportingInputs;
})(typeof globalThis !== "undefined" ? globalThis : this);
