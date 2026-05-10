(function (global) {
  const LensApp = global.LensApp || (global.LensApp = {});
  const lensAnalysis = LensApp.lensAnalysis || (LensApp.lensAnalysis = {});

  // Owner: inactive Income Impact policy preview preparation.
  // Non-goals: no scenario wiring, graph movement, storage access, DOM access,
  // floor aggregation/application, or effective conservative floor calculation.

  const ADAPTER_VERSION = 1;
  const ACTIVE_RUNTIME_CONSUMER = false;

  const PROTECTED_EXCLUDED_PLANNING_BUCKET_KEYS = Object.freeze([
    "debtObligations",
    "housingCore",
    "basicUtilities",
    "healthcareCare",
    "finalExpenses",
    "educationEnrichment",
    "insurancePremiums",
    "taxesLegalAdministrative",
    "givingCommunity",
    "businessSelfEmployment",
    "financialFeesTransactionCosts",
    "periodicSinkingFundOneTime",
    "customUnknown",
    "petsCoreCare",
    "childcareDependentSupport"
  ]);

  function isPlainObject(value) {
    return Boolean(value && typeof value === "object" && !Array.isArray(value));
  }

  function clonePlainValue(value) {
    if (Array.isArray(value)) {
      return value.map(clonePlainValue);
    }

    if (isPlainObject(value)) {
      return Object.keys(value).sort().reduce(function (clone, key) {
        const clonedValue = clonePlainValue(value[key]);
        if (clonedValue !== undefined) {
          clone[key] = clonedValue;
        }
        return clone;
      }, {});
    }

    if (typeof value === "number") {
      return Number.isFinite(value) ? value : null;
    }

    return value === undefined ? null : value;
  }

  function normalizeString(value) {
    return String(value == null ? "" : value).trim();
  }

  function hasOwn(source, key) {
    return Object.prototype.hasOwnProperty.call(source, key);
  }

  function getNestedValue(source, path) {
    if (!isPlainObject(source)) {
      return undefined;
    }

    return path.reduce(function (current, key) {
      return current == null ? undefined : current[key];
    }, source);
  }

  function createIssue(code, message, details) {
    const issue = { code, message };
    if (details !== undefined) {
      issue.details = clonePlainValue(details);
    }
    return issue;
  }

  function addMissingHelperIssue(warnings, helperName) {
    warnings.push(createIssue(
      "missing-" + helperName,
      "Income Impact household expense policy preview could not use " + helperName + " because the helper was unavailable."
    ));
  }

  function issueWithSource(source, issue) {
    return Object.assign({ source }, clonePlainValue(issue));
  }

  function collectIssues(source, result, targetWarnings, targetDataGaps) {
    if (Array.isArray(result?.warnings)) {
      result.warnings.forEach(function (warning) {
        targetWarnings.push(issueWithSource(source, warning));
      });
    }

    if (Array.isArray(result?.dataGaps)) {
      result.dataGaps.forEach(function (gap) {
        targetDataGaps.push(issueWithSource(source, gap));
      });
    }
  }

  function getFirstPlainObject(candidates) {
    for (let index = 0; index < candidates.length; index += 1) {
      if (isPlainObject(candidates[index])) {
        return candidates[index];
      }
    }
    return {};
  }

  function resolveAccountPolicySource(options) {
    if (isPlainObject(options.accountPolicy)) {
      return {
        source: "input.accountPolicy",
        accountPolicy: clonePlainValue(options.accountPolicy)
      };
    }

    const accountPolicyContext = isPlainObject(options.accountPolicyContext)
      ? options.accountPolicyContext
      : {};
    const storagePolicy = getNestedValue(accountPolicyContext, ["storageResult", "accountPolicy"]);
    if (isPlainObject(storagePolicy)) {
      return {
        source: "accountPolicyContext.storageResult.accountPolicy",
        accountPolicy: clonePlainValue(storagePolicy)
      };
    }

    const contextPolicy = accountPolicyContext.accountPolicy;
    if (isPlainObject(contextPolicy)) {
      return {
        source: "accountPolicyContext.accountPolicy",
        accountPolicy: clonePlainValue(contextPolicy)
      };
    }

    return {
      source: "emptyPolicy",
      accountPolicy: {}
    };
  }

  function resolveLivingFloorAssumptions(options, accountPolicy) {
    if (isPlainObject(options.livingFloorAssumptions)) {
      return {
        source: "input.livingFloorAssumptions",
        livingFloorAssumptions: clonePlainValue(options.livingFloorAssumptions)
      };
    }

    if (isPlainObject(accountPolicy.livingFloorAssumptions)) {
      return {
        source: "accountPolicy.livingFloorAssumptions",
        livingFloorAssumptions: clonePlainValue(accountPolicy.livingFloorAssumptions)
      };
    }

    return {
      source: "emptyLivingFloorAssumptions",
      livingFloorAssumptions: {}
    };
  }

  function buildContextInput(options) {
    const lensModel = isPlainObject(options.lensModel) ? options.lensModel : {};
    return clonePlainValue({
      profileRecord: getFirstPlainObject([
        options.profileRecord,
        getNestedValue(lensModel, ["profileRecord"]),
        getNestedValue(lensModel, ["profile"])
      ]),
      profileFacts: getFirstPlainObject([
        options.profileFacts,
        getNestedValue(lensModel, ["profileFacts"])
      ]),
      pmiFacts: getFirstPlainObject([
        options.pmiFacts,
        getNestedValue(lensModel, ["pmiFacts"]),
        getNestedValue(lensModel, ["protectionModeling", "pmiFacts"])
      ]),
      taxContext: getFirstPlainObject([
        options.taxContext,
        getNestedValue(options.assumptions, ["taxContext"]),
        getNestedValue(lensModel, ["taxContext"]),
        getNestedValue(lensModel, ["assumptions", "taxContext"])
      ]),
      valuationDate: options.valuationDate
        || getNestedValue(lensModel, ["valuationDate"])
        || getNestedValue(lensModel, ["metadata", "valuationDate"])
        || null,
      scenarioContext: getFirstPlainObject([
        options.scenarioContext,
        getNestedValue(lensModel, ["scenarioContext"])
      ]),
      deceasedInsuredCount: options.deceasedInsuredCount,
      adultDriverCount: options.adultDriverCount
    });
  }

  function resolveGraphAdjustmentPolicy(options, accountPolicy, warnings, dataGaps) {
    const graphResolverApi = lensAnalysis.householdExpenseGraphAdjustmentPolicyResolver;
    if (!graphResolverApi || typeof graphResolverApi.resolveHouseholdExpenseGraphAdjustmentPolicy !== "function") {
      addMissingHelperIssue(warnings, "householdExpenseGraphAdjustmentPolicyResolver");
      return {
        rows: [],
        counts: {},
        warnings: [],
        dataGaps: [],
        metadata: {
          activeRuntimeConsumer: ACTIVE_RUNTIME_CONSUMER,
          unavailable: true
        }
      };
    }

    const resolverInput = {
      accountPolicy,
      includeOnlyGraphRows: hasOwn(options, "includeOnlyGraphRows")
        ? options.includeOnlyGraphRows !== false
        : false
    };

    if (Array.isArray(options.expenseLibraryRows)) {
      resolverInput.expenseLibraryRows = clonePlainValue(options.expenseLibraryRows);
    }

    if (Array.isArray(options.lifestylePolicyRows)) {
      resolverInput.lifestylePolicyRows = clonePlainValue(options.lifestylePolicyRows);
    }

    if (Array.isArray(options.livingFloorMetadata)) {
      resolverInput.livingFloorMetadata = clonePlainValue(options.livingFloorMetadata);
    }

    const result = graphResolverApi.resolveHouseholdExpenseGraphAdjustmentPolicy(resolverInput);
    collectIssues("graphAdjustmentPolicyResolver", result, warnings, dataGaps);
    return clonePlainValue(result);
  }

  function resolveLivingFloorContext(options, warnings, dataGaps) {
    const contextResolverApi = lensAnalysis.householdExpenseLivingFloorContextResolver;
    if (!contextResolverApi || typeof contextResolverApi.resolveHouseholdExpenseLivingFloorContext !== "function") {
      addMissingHelperIssue(warnings, "householdExpenseLivingFloorContextResolver");
      return {
        householdContext: {},
        warnings: [],
        dataGaps: [],
        trace: {},
        metadata: {
          activeRuntimeConsumer: ACTIVE_RUNTIME_CONSUMER,
          unavailable: true
        }
      };
    }

    const result = contextResolverApi.resolveHouseholdExpenseLivingFloorContext(buildContextInput(options));
    collectIssues("livingFloorContextResolver", result, warnings, dataGaps);
    return clonePlainValue(result);
  }

  function calculateLivingFloorPreview(options, livingFloorAssumptions, livingFloorContext, warnings, dataGaps) {
    const calculationApi = lensAnalysis.householdExpenseLivingFloorCalculations;
    if (!calculationApi || typeof calculationApi.calculateHouseholdExpenseLivingFloors !== "function") {
      addMissingHelperIssue(warnings, "householdExpenseLivingFloorCalculations");
      return {
        buckets: {},
        warnings: [],
        dataGaps: [],
        trace: {},
        metadata: {
          activeRuntimeConsumer: ACTIVE_RUNTIME_CONSUMER,
          unavailable: true,
          calculatedBucketKeys: []
        }
      };
    }

    const calculationInput = {
      livingFloorAssumptions,
      householdContext: livingFloorContext.householdContext
    };

    if (Array.isArray(options.planningBucketKeys)) {
      calculationInput.planningBucketKeys = clonePlainValue(options.planningBucketKeys);
    }

    const result = calculationApi.calculateHouseholdExpenseLivingFloors(calculationInput);
    collectIssues("livingFloorCalculations", result, warnings, dataGaps);
    return clonePlainValue(result);
  }

  function buildReadinessNotices(livingFloorAssumptions, livingFloorContext, livingFloorCalculationPreview, warnings, dataGaps) {
    const readinessApi = lensAnalysis.householdExpenseLivingFloorReadinessWarnings;
    if (!readinessApi || typeof readinessApi.buildHouseholdExpenseLivingFloorReadinessWarnings !== "function") {
      addMissingHelperIssue(warnings, "householdExpenseLivingFloorReadinessWarnings");
      return {
        notices: [],
        warnings: [],
        dataGaps: [],
        metadata: {
          activeRuntimeConsumer: ACTIVE_RUNTIME_CONSUMER,
          unavailable: true
        }
      };
    }

    const result = readinessApi.buildHouseholdExpenseLivingFloorReadinessWarnings({
      livingFloorAssumptions,
      householdContext: livingFloorContext.householdContext,
      livingFloorCalculationResult: livingFloorCalculationPreview
    });
    collectIssues("livingFloorReadinessWarnings", result, warnings, dataGaps);
    return clonePlainValue(result);
  }

  function summarizeProtectedExcludedBuckets(resolvedGraphAdjustmentPolicy) {
    const rows = Array.isArray(resolvedGraphAdjustmentPolicy?.rows)
      ? resolvedGraphAdjustmentPolicy.rows
      : [];

    return PROTECTED_EXCLUDED_PLANNING_BUCKET_KEYS.map(function (planningBucketKey) {
      const bucketRows = rows.filter(function (row) {
        return row.planningBucketKey === planningBucketKey;
      });
      const graphAdjustableRowCount = bucketRows.filter(function (row) {
        return row.graphAdjustable === true;
      }).length;
      const adjustmentClasses = bucketRows.reduce(function (classes, row) {
        const adjustmentClass = normalizeString(row.adjustmentClass);
        if (adjustmentClass && !classes.includes(adjustmentClass)) {
          classes.push(adjustmentClass);
        }
        return classes;
      }, []).sort();

      return {
        planningBucketKey,
        rowCount: bucketRows.length,
        graphAdjustableRowCount,
        adjustmentClasses,
        activeInPreview: false
      };
    });
  }

  function prepareIncomeImpactHouseholdExpensePolicyPreview(input) {
    const options = isPlainObject(input) ? input : {};
    const warnings = [];
    const dataGaps = [];
    const accountPolicyContext = resolveAccountPolicySource(options);
    const accountPolicy = accountPolicyContext.accountPolicy;
    const livingFloorAssumptionsContext = resolveLivingFloorAssumptions(options, accountPolicy);
    const livingFloorAssumptions = livingFloorAssumptionsContext.livingFloorAssumptions;

    const resolvedGraphAdjustmentPolicy = resolveGraphAdjustmentPolicy(
      options,
      accountPolicy,
      warnings,
      dataGaps
    );
    const livingFloorContext = resolveLivingFloorContext(options, warnings, dataGaps);
    const livingFloorCalculationPreview = calculateLivingFloorPreview(
      options,
      livingFloorAssumptions,
      livingFloorContext,
      warnings,
      dataGaps
    );
    const readinessNotices = buildReadinessNotices(
      livingFloorAssumptions,
      livingFloorContext,
      livingFloorCalculationPreview,
      warnings,
      dataGaps
    );

    return clonePlainValue({
      resolvedGraphAdjustmentPolicy,
      livingFloorContext,
      livingFloorCalculationPreview,
      readinessNotices,
      protectedExcludedBucketPreview: summarizeProtectedExcludedBuckets(resolvedGraphAdjustmentPolicy),
      warnings,
      dataGaps,
      trace: {
        calculationMethod: "income-impact-household-expense-policy-runtime-adapter-v1",
        accountPolicySource: accountPolicyContext.source,
        livingFloorAssumptionsSource: livingFloorAssumptionsContext.source,
        graphPolicyPrepared: true,
        livingFloorContextPrepared: true,
        livingFloorCalculationPreviewPrepared: true,
        readinessNoticesPrepared: true,
        effectiveConservativeFloorCalculated: false,
        floorsAppliedToGraph: false,
        planningBucketFloorAggregationApplied: false,
        perRowFloorApplication: false,
        scenarioHelperCalled: false,
        storageTouched: false,
        inputsMutated: false,
        protectedExcludedPlanningBucketKeys: PROTECTED_EXCLUDED_PLANNING_BUCKET_KEYS.slice()
      },
      metadata: {
        adapterVersion: ADAPTER_VERSION,
        activeRuntimeConsumer: ACTIVE_RUNTIME_CONSUMER,
        previewOnly: true
      }
    });
  }

  lensAnalysis.incomeImpactHouseholdExpensePolicyRuntimeAdapter = Object.freeze({
    ADAPTER_VERSION,
    PROTECTED_EXCLUDED_PLANNING_BUCKET_KEYS,
    prepareIncomeImpactHouseholdExpensePolicyPreview
  });
})(typeof globalThis !== "undefined" ? globalThis : this);
