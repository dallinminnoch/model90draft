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
    "monthlyTravelAndDiscretionaryCost",
    "monthlySubscriptionsCost"
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

  function hasOwn(object, key) {
    return Object.prototype.hasOwnProperty.call(Object(object), key);
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

  function isUsableRuleList(value, keyName) {
    return Array.isArray(value) && value.some(function (candidate) {
      return isPlainObject(candidate) && normalizeString(candidate && candidate[keyName]);
    });
  }

  function getExplicitResolvedCompressionThresholdRules(input) {
    const candidates = [
      { path: "resolvedCompressionThresholdRules", owner: input },
      { path: "resolvedHouseholdExpensePolicy.resolvedCompressionThresholdRules", owner: input?.resolvedHouseholdExpensePolicy },
      { path: "householdExpenseAccountPolicy.resolvedCompressionThresholdRules", owner: input?.householdExpenseAccountPolicy },
      { path: "accountPolicyResolution.resolvedCompressionThresholdRules", owner: input?.accountPolicyResolution }
    ];

    for (let index = 0; index < candidates.length; index += 1) {
      const candidate = candidates[index];
      if (isPlainObject(candidate.owner) && hasOwn(candidate.owner, "resolvedCompressionThresholdRules")) {
        return {
          provided: true,
          path: candidate.path,
          value: candidate.owner.resolvedCompressionThresholdRules
        };
      }
    }

    return {
      provided: false,
      path: null,
      value: null
    };
  }

  function getExplicitResolvedCompressionPolicyRules(input) {
    const candidates = [
      { path: "resolvedCompressionPolicyRules", owner: input },
      { path: "resolvedHouseholdExpensePolicy.resolvedCompressionPolicyRules", owner: input?.resolvedHouseholdExpensePolicy },
      { path: "householdExpenseAccountPolicy.resolvedCompressionPolicyRules", owner: input?.householdExpenseAccountPolicy },
      { path: "accountPolicyResolution.resolvedCompressionPolicyRules", owner: input?.accountPolicyResolution }
    ];

    for (let index = 0; index < candidates.length; index += 1) {
      const candidate = candidates[index];
      if (isPlainObject(candidate.owner) && hasOwn(candidate.owner, "resolvedCompressionPolicyRules")) {
        return {
          provided: true,
          path: candidate.path,
          value: candidate.owner.resolvedCompressionPolicyRules
        };
      }
    }

    return {
      provided: false,
      path: null,
      value: null
    };
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
    const explicitResolved = getExplicitResolvedCompressionThresholdRules(input);
    if (explicitResolved.provided) {
      if (isUsableRuleList(explicitResolved.value, "thresholdId")) {
        return {
          rules: clonePlainValue(explicitResolved.value),
          metadata: {
            source: "resolvedAccountPolicy",
            policySource: "resolvedAccountPolicy",
            sourcePath: explicitResolved.path,
            precedence: ["resolvedAccountPolicy", "model90Defaults"]
          },
          warnings: []
        };
      }

      const issue = createIssue(
        "invalid-resolved-compression-threshold-rules",
        "Resolved compression threshold rules were missing or invalid; MODEL90 seed thresholds were used as a safe fallback.",
        { sourcePath: explicitResolved.path }
      );
      warnings.push(issue);
      dataGaps.push(clonePlainValue(issue));
    }

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
          source: explicitResolved.provided || Object.keys(advisorOverrides.rulesByThresholdId || {}).length ? "fallbackPolicy" : "defaultSeedPolicy",
          policySource: explicitResolved.provided || Object.keys(advisorOverrides.rulesByThresholdId || {}).length ? "fallbackPolicy" : "defaultSeedPolicy",
          precedence: ["model90Defaults"]
        },
        warnings: []
      };
    }

    const resolved = resolver.resolveExpenseCompressionThresholds({
      defaultThresholds,
      advisorOverrides
    });
    const advisorOverrideCount = Object.keys(advisorOverrides.rulesByThresholdId || {}).length;
    resolved.metadata = Object.assign({}, isPlainObject(resolved.metadata) ? resolved.metadata : {}, {
      policySource: explicitResolved.provided || advisorOverrideCount ? "fallbackPolicy" : "defaultSeedPolicy",
      sourcePath: explicitResolved.provided
        ? "fallback:expenseCompressionThresholdResolver"
        : advisorOverrideCount
          ? "advisorThresholdOverrides"
          : "LensApp.lensAnalysis.expenseCompressionThresholds"
    });
    return resolved;
  }

  function getExpenseLibrary(input) {
    return input?.expenseLibrary || lensAnalysis.expenseLibrary || null;
  }

  function getPolicyResolution(input, warnings, dataGaps) {
    const explicitResolved = getExplicitResolvedCompressionPolicyRules(input);
    if (explicitResolved.provided) {
      if (isUsableRuleList(explicitResolved.value, "expenseTypeKey")) {
        return {
          rules: clonePlainValue(explicitResolved.value),
          source: "resolvedAccountPolicy",
          sourcePath: explicitResolved.path,
          fallbackPolicyUsed: false
        };
      }

      const issue = createIssue(
        "invalid-resolved-compression-policy-rules",
        "Resolved compression policy rules were missing or invalid; MODEL90 seed compression policy was used as a safe fallback.",
        { sourcePath: explicitResolved.path }
      );
      warnings.push(issue);
      dataGaps.push(clonePlainValue(issue));
    }

    const policy = lensAnalysis.householdExpenseCompressionPolicy;
    if (policy && typeof policy.getHouseholdExpenseCompressionPolicyRules === "function") {
      return {
        rules: policy.getHouseholdExpenseCompressionPolicyRules(),
        source: explicitResolved.provided ? "fallbackPolicy" : "defaultSeedPolicy",
        sourcePath: "LensApp.lensAnalysis.householdExpenseCompressionPolicy",
        fallbackPolicyUsed: explicitResolved.provided
      };
    }

    dataGaps.push(createIssue(
      "missing-household-expense-compression-policy",
      "Household expense compression policy rules are unavailable.",
      { sourcePath: "lensAnalysis.householdExpenseCompressionPolicy" }
    ));
    return {
      rules: [],
      source: "fallbackPolicy",
      sourcePath: null,
      fallbackPolicyUsed: true
    };
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
    const compressionPolicyResolution = getPolicyResolution(safeInput, warnings, dataGaps);
    const compressionPolicyRules = compressionPolicyResolution.rules;
    const scalarGap = appendScalarHouseholdItemizationGap(lensModel, expenseFacts, dataGaps);
    const classifierInput = {
      expenseFacts: {
        expenses: clonePlainValue(expenseFacts)
      },
      expenseLibrary: getExpenseLibrary(safeInput),
      householdFacts,
      options: {
        mode: "reportingOnly",
        includeAdvisorConfirmed: safeInput.options?.includeAdvisorConfirmed === true,
        includeGeneratedDebtPayments: false,
        includePauseCandidates: safeInput.options?.includePauseCandidates !== false
      }
    };
    if (resolvedThresholds?.metadata?.policySource === "resolvedAccountPolicy" && Array.isArray(resolvedThresholds.rules)) {
      classifierInput.resolvedCompressionThresholdRules = clonePlainValue(resolvedThresholds.rules);
    } else if (resolvedThresholds?.metadata?.policySource !== "defaultSeedPolicy") {
      classifierInput.resolvedThresholds = resolvedThresholds;
    }
    if (compressionPolicyResolution.source === "resolvedAccountPolicy") {
      classifierInput.resolvedCompressionPolicyRules = clonePlainValue(compressionPolicyRules);
    }

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
      thresholdPolicySource: resolvedThresholds?.metadata?.policySource || null,
      thresholdPolicySourcePath: resolvedThresholds?.metadata?.sourcePath || null,
      compressionPolicySource: compressionPolicyResolution.source,
      compressionPolicySourcePath: compressionPolicyResolution.sourcePath,
      fallbackPolicyUsed: compressionPolicyResolution.fallbackPolicyUsed === true
        || resolvedThresholds?.metadata?.policySource === "fallbackPolicy",
      resolvedAccountPolicyUsed: compressionPolicyResolution.source === "resolvedAccountPolicy"
        || resolvedThresholds?.metadata?.policySource === "resolvedAccountPolicy",
      incomeImpactCompressionPrep: {
        calculationMethod: CALCULATION_METHOD,
        reportingOnly: true,
        layer5Wired: false,
        displayWired: false,
        graphPathChanged: false,
        reductionsApplied: false,
        compressionPolicySource: compressionPolicyResolution.source,
        thresholdPolicySource: resolvedThresholds?.metadata?.policySource || null
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
        thresholdPolicySource: resolvedThresholds?.metadata?.policySource || null,
        thresholdPolicySourcePath: resolvedThresholds?.metadata?.sourcePath || null,
        compressionPolicySource: compressionPolicyResolution.source,
        compressionPolicySourcePath: compressionPolicyResolution.sourcePath,
        fallbackPolicyUsed: compressionPolicyResolution.fallbackPolicyUsed === true
          || resolvedThresholds?.metadata?.policySource === "fallbackPolicy",
        resolvedAccountPolicyUsed: compressionPolicyResolution.source === "resolvedAccountPolicy"
          || resolvedThresholds?.metadata?.policySource === "resolvedAccountPolicy",
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
