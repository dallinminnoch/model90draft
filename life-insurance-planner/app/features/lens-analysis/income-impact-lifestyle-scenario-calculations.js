(function (global) {
  const LensApp = global.LensApp || (global.LensApp = {});
  const lensAnalysis = LensApp.lensAnalysis || (LensApp.lensAnalysis = {});

  const CALCULATION_METHOD = "income-impact-lifestyle-scenario-v1";
  const MIN_SLIDER_VALUE = -100;
  const MAX_SLIDER_VALUE = 100;
  const DEFAULT_COMPARISON_SCENARIO_ID = "income-impact-lifestyle-adjusted-comparison";
  const DEFAULT_COMPARISON_KIND = "lifestyleComparison";
  const DEFAULT_COMPARISON_PATH_ID = "lifestyle-post-death-resources";

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

  function issueWithPreviewSource(source, issue) {
    return Object.assign({
      previewSource: source
    }, clonePlainValue(issue));
  }

  function collectPreviewIssues(source, result, warnings, dataGaps) {
    if (Array.isArray(result?.warnings)) {
      result.warnings.forEach(function (warning) {
        warnings.push(issueWithPreviewSource(source, warning));
      });
    }

    if (Array.isArray(result?.dataGaps)) {
      result.dataGaps.forEach(function (gap) {
        dataGaps.push(issueWithPreviewSource(source, gap));
      });
    }
  }

  function addMissingPreviewHelperIssue(helperName, dataGaps) {
    dataGaps.push(makeIssue(
      "missing-" + helperName,
      "Stream household expense preview could not run because " + helperName + " was unavailable.",
      ["LensApp.lensAnalysis." + helperName]
    ));
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

  function getMissingActiveGraphDefaultReasons(input) {
    const reasons = [];
    const basePostDeathSeries = getInputBasePostDeathSeries(input);
    const lensModel = isPlainObject(input?.lensModel) ? input.lensModel : {};
    const ongoingSupport = isPlainObject(input?.ongoingSupport)
      ? input.ongoingSupport
      : lensModel.ongoingSupport;
    const helperRequirements = [
      ["incomeImpactHouseholdExpensePolicyRuntimeAdapter", "prepareIncomeImpactHouseholdExpensePolicyPreview"],
      ["incomeImpactBaseHouseholdExpenseStream", "prepareIncomeImpactBaseHouseholdExpenseStream"],
      ["incomeImpactHouseholdExpenseAdjustmentEngine", "calculateIncomeImpactHouseholdExpenseAdjustments"],
      ["incomeImpactHouseholdExpenseScenarioHandoffPreview", "previewIncomeImpactHouseholdExpenseScenarioHandoff"]
    ];
    const hasExpenseFacts = Array.isArray(input?.expenseFacts)
      || Array.isArray(input?.expenseFacts?.expenses)
      || Array.isArray(lensModel?.expenseFacts?.expenses)
      || Array.isArray(input?.expenses);

    if (!Array.isArray(basePostDeathSeries?.points) || !basePostDeathSeries.points.length) {
      reasons.push("missingBasePostDeathSeries");
    }

    if (!hasExpenseFacts) {
      reasons.push("missingExpenseFacts");
    }

    if (!isPlainObject(ongoingSupport) || toOptionalNumber(ongoingSupport.monthlyTotalEssentialSupportCost) == null) {
      reasons.push("missingOngoingSupportMonthlyTotal");
    }

    helperRequirements.forEach(function ([namespaceKey, functionKey]) {
      if (!getHelperFunction(namespaceKey, functionKey)) {
        reasons.push("missingHelper:" + namespaceKey);
      }
    });

    return reasons;
  }

  function resolveHouseholdExpenseStreamPolicyMode(input) {
    if (input?.useStreamHouseholdExpenseAdjustments === true || input?.options?.useStreamHouseholdExpenseAdjustments === true) {
      return {
        mode: "preview",
        requestedMode: "preview",
        streamDefaultUsed: false,
        legacyFallbackUsed: false,
        legacyFallbackReason: null
      };
    }

    if (input?.useStreamHouseholdExpenseAdjustments === false || input?.options?.useStreamHouseholdExpenseAdjustments === false) {
      return {
        mode: "streamUnavailable",
        requestedMode: "legacy",
        streamDefaultUsed: false,
        legacyFallbackUsed: false,
        legacyFallbackReason: null,
        streamInputMissing: false,
        streamInputMissingReasons: [],
        legacyModeRetired: true
      };
    }

    const mode = normalizeString(input?.householdExpenseStreamPolicyMode || input?.options?.householdExpenseStreamPolicyMode).toLowerCase();
    if (mode === "activegraphadjustments" || mode === "active-graph-adjustments" || mode === "active_graph_adjustments") {
      return {
        mode: "activeGraphAdjustments",
        requestedMode: "activeGraphAdjustments",
        streamDefaultUsed: false,
        legacyFallbackUsed: false,
        legacyFallbackReason: null
      };
    }

    if (mode === "preview" || mode === "stream-preview" || mode === "streampreview") {
      return {
        mode: "preview",
        requestedMode: "preview",
        streamDefaultUsed: false,
        legacyFallbackUsed: false,
        legacyFallbackReason: null
      };
    }

    if (mode === "legacy") {
      return {
        mode: "streamUnavailable",
        requestedMode: "legacy",
        streamDefaultUsed: false,
        legacyFallbackUsed: false,
        legacyFallbackReason: null,
        streamInputMissing: false,
        streamInputMissingReasons: [],
        legacyModeRetired: true
      };
    }

    const missingDefaultReasons = getMissingActiveGraphDefaultReasons(input);
    if (!missingDefaultReasons.length) {
      return {
        mode: "activeGraphAdjustments",
        requestedMode: null,
        streamDefaultUsed: true,
        legacyFallbackUsed: false,
        legacyFallbackReason: null
      };
    }

    return {
      mode: "streamUnavailable",
      requestedMode: null,
      streamDefaultUsed: false,
      legacyFallbackUsed: false,
      legacyFallbackReason: null,
      streamInputMissing: true,
      streamInputMissingReasons: missingDefaultReasons
    };
  }

  function getHouseholdExpenseStreamPolicyTrace(policyResolution) {
    const resolution = isPlainObject(policyResolution) ? policyResolution : {};
    const streamInputMissingReasons = Array.isArray(resolution.streamInputMissingReasons)
      ? clonePlainValue(resolution.streamInputMissingReasons)
      : [];
    return {
      householdExpenseStreamPolicyModeResolved: normalizeString(resolution.mode) || "streamUnavailable",
      householdExpenseStreamPolicyModeRequested: normalizeString(resolution.requestedMode) || null,
      streamDefaultUsed: resolution.streamDefaultUsed === true,
      streamInputMissing: resolution.streamInputMissing === true,
      streamInputMissingReasons,
      legacyModeRetired: resolution.legacyModeRetired === true,
      legacyFallbackUsed: resolution.legacyFallbackUsed === true,
      legacyFallbackReason: normalizeString(resolution.legacyFallbackReason) || null
    };
  }

  function makeRetiredLegacyModeIssue() {
    return makeIssue(
      "retired-household-expense-legacy-mode",
      "Legacy household expense lifestyle scenario mode has been retired; stream inputs are required for graph adjustment output.",
      ["householdExpenseStreamPolicyMode"],
      {
        requestedMode: "legacy"
      }
    );
  }

  function makeMissingStreamInputIssue(reasons, requestedMode) {
    const safeReasons = uniqueStrings(reasons);
    return makeIssue(
      "missing-household-expense-stream-inputs",
      "Stream household expense graph adjustment could not run because required stream inputs or helpers were unavailable.",
      [
        "basePostDeathSeries.points",
        "expenseFacts.expenses",
        "lensModel.expenseFacts.expenses",
        "lensModel.ongoingSupport.monthlyTotalEssentialSupportCost",
        "LensApp.lensAnalysis"
      ],
      {
        requestedMode: normalizeString(requestedMode) || null,
        missingReasons: safeReasons
      }
    );
  }

  function getHelperFunction(namespaceKey, functionKey) {
    const api = lensAnalysis[namespaceKey];
    return api && typeof api[functionKey] === "function" ? api[functionKey] : null;
  }

  function buildStreamInput(sourceInput) {
    const lensModel = isPlainObject(sourceInput.lensModel) ? sourceInput.lensModel : undefined;
    const explicitExpenseFacts = isPlainObject(sourceInput.expenseFacts) || Array.isArray(sourceInput.expenseFacts)
      ? sourceInput.expenseFacts
      : undefined;
    const hasNormalizedExpenseFacts = Boolean(
      explicitExpenseFacts
      || Array.isArray(lensModel?.expenseFacts?.expenses)
    );

    return clonePlainValue({
      lensModel,
      expenseFacts: explicitExpenseFacts,
      expenses: !hasNormalizedExpenseFacts && Array.isArray(sourceInput.expenses) ? sourceInput.expenses : undefined,
      ongoingSupport: isPlainObject(sourceInput.ongoingSupport) ? sourceInput.ongoingSupport : undefined,
      expenseLibraryRows: Array.isArray(sourceInput.expenseLibraryRows) ? sourceInput.expenseLibraryRows : undefined,
      livingFloorMetadata: Array.isArray(sourceInput.livingFloorMetadata) ? sourceInput.livingFloorMetadata : undefined
    });
  }

  function buildPolicyPreviewInput(sourceInput) {
    return Object.assign({}, clonePlainValue(sourceInput), {
      includeOnlyGraphRows: false
    });
  }

  function buildHouseholdExpenseStreamPreview(sourceInput, sliderValue, basePostDeathSeries, streamOptions) {
    const options = isPlainObject(streamOptions) ? streamOptions : {};
    const policyMode = options.policyMode === "activeGraphAdjustments" ? "activeGraphAdjustments" : "preview";
    const applyEstimatedDollarFloors = options.applyEstimatedDollarFloors !== false;
    const warnings = [];
    const dataGaps = [];
    const policyPreviewFn = getHelperFunction(
      "incomeImpactHouseholdExpensePolicyRuntimeAdapter",
      "prepareIncomeImpactHouseholdExpensePolicyPreview"
    );
    const streamFn = getHelperFunction(
      "incomeImpactBaseHouseholdExpenseStream",
      "prepareIncomeImpactBaseHouseholdExpenseStream"
    );
    const adjustmentFn = getHelperFunction(
      "incomeImpactHouseholdExpenseAdjustmentEngine",
      "calculateIncomeImpactHouseholdExpenseAdjustments"
    );
    const handoffFn = getHelperFunction(
      "incomeImpactHouseholdExpenseScenarioHandoffPreview",
      "previewIncomeImpactHouseholdExpenseScenarioHandoff"
    );

    let policyPreview = null;
    let baseHouseholdExpenseStream = null;
    let householdExpenseAdjustmentResult = null;
    let scenarioHandoffPreview = null;

    if (policyPreviewFn) {
      policyPreview = policyPreviewFn(buildPolicyPreviewInput(sourceInput));
      collectPreviewIssues("incomeImpactHouseholdExpensePolicyRuntimeAdapter", policyPreview, warnings, dataGaps);
    } else {
      addMissingPreviewHelperIssue("incomeImpactHouseholdExpensePolicyRuntimeAdapter", dataGaps);
    }

    if (streamFn) {
      baseHouseholdExpenseStream = streamFn(buildStreamInput(sourceInput));
      collectPreviewIssues("incomeImpactBaseHouseholdExpenseStream", baseHouseholdExpenseStream, warnings, dataGaps);
    } else {
      addMissingPreviewHelperIssue("incomeImpactBaseHouseholdExpenseStream", dataGaps);
    }

    if (adjustmentFn && baseHouseholdExpenseStream) {
      householdExpenseAdjustmentResult = adjustmentFn({
        baseHouseholdExpenseStream,
        resolvedGraphAdjustmentPolicy: policyPreview?.resolvedGraphAdjustmentPolicy || sourceInput.resolvedGraphAdjustmentPolicy,
        livingFloorCalculationPreview: policyPreview?.livingFloorCalculationPreview || sourceInput.livingFloorCalculationPreview,
        sliderValue,
        applyEstimatedDollarFloors
      });
      collectPreviewIssues("incomeImpactHouseholdExpenseAdjustmentEngine", householdExpenseAdjustmentResult, warnings, dataGaps);
    } else if (!adjustmentFn) {
      addMissingPreviewHelperIssue("incomeImpactHouseholdExpenseAdjustmentEngine", dataGaps);
    }

    if (handoffFn) {
      scenarioHandoffPreview = handoffFn({
        basePostDeathSeries,
        householdExpenseAdjustmentResult: householdExpenseAdjustmentResult || {},
        options: {
          previewLabel: "Stream household expense adjustment preview"
        }
      });
      collectPreviewIssues("incomeImpactHouseholdExpenseScenarioHandoffPreview", scenarioHandoffPreview, warnings, dataGaps);
    } else {
      addMissingPreviewHelperIssue("incomeImpactHouseholdExpenseScenarioHandoffPreview", dataGaps);
    }

    return clonePlainValue({
      policyMode,
      baseHouseholdExpenseStream,
      resolvedGraphAdjustmentPolicy: policyPreview?.resolvedGraphAdjustmentPolicy || null,
      livingFloorContext: policyPreview?.livingFloorContext || null,
      livingFloorCalculationPreview: policyPreview?.livingFloorCalculationPreview || null,
      readinessNotices: policyPreview?.readinessNotices || null,
      householdExpenseAdjustmentResult,
      scenarioHandoffPreview,
      warnings,
      dataGaps,
      trace: {
        calculationMethod: "income-impact-household-expense-stream-policy-preview-v1",
        actualComparisonScenarioReplaced: policyMode === "activeGraphAdjustments",
        graphOutputChanged: policyMode === "activeGraphAdjustments",
        graphAdjustmentOverridesAppliedToGraph: policyMode === "activeGraphAdjustments",
        livingFloorsAppliedToGraph: policyMode === "activeGraphAdjustments" && applyEstimatedDollarFloors,
        floorsAppliedToGraph: policyMode === "activeGraphAdjustments" && applyEstimatedDollarFloors,
        estimatedDollarFloorsEnabled: applyEstimatedDollarFloors,
        floorAppliedBuckets: clonePlainValue(householdExpenseAdjustmentResult?.trace?.floorAppliedBuckets || []),
        floorSkippedBuckets: clonePlainValue(householdExpenseAdjustmentResult?.trace?.floorSkippedBuckets || []),
        missingFloorBuckets: clonePlainValue(householdExpenseAdjustmentResult?.trace?.missingFloorBuckets || []),
        bucketAggregationApplied: householdExpenseAdjustmentResult?.trace?.bucketAggregationApplied === true,
        perRowDollarFloorApplied: householdExpenseAdjustmentResult?.trace?.perRowDollarFloorApplied === true,
        activeRuntimeConsumer: policyMode === "activeGraphAdjustments",
        monthlyDeltaPreview: householdExpenseAdjustmentResult?.monthlyDelta ?? null,
        scenarioHandoffPreviewProduced: Boolean(scenarioHandoffPreview?.comparisonPostDeathSeries)
      },
      metadata: {
        activeRuntimeConsumer: policyMode === "activeGraphAdjustments",
        previewOnly: policyMode !== "activeGraphAdjustments"
      }
    });
  }

  function getHouseholdExpenseAdjustmentTrace(streamPreview) {
    return isPlainObject(streamPreview?.householdExpenseAdjustmentResult?.trace)
      ? streamPreview.householdExpenseAdjustmentResult.trace
      : {};
  }

  function buildStreamAdjustedPostDeathSeries(basePostDeathSeries, streamPreview) {
    const handoffSeries = streamPreview?.scenarioHandoffPreview?.comparisonPostDeathSeries;
    const handoffPoints = Array.isArray(handoffSeries?.points) ? handoffSeries.points : [];
    if (!handoffPoints.length) {
      return null;
    }

    const monthlyDelta = toOptionalNumber(streamPreview?.householdExpenseAdjustmentResult?.monthlyDelta) || 0;
    const adjustmentTrace = getHouseholdExpenseAdjustmentTrace(streamPreview);
    const estimatedDollarFloorsEnabled = adjustmentTrace.estimatedDollarFloorsEnabled === true;
    const floorAppliedBuckets = clonePlainValue(adjustmentTrace.floorAppliedBuckets || []);
    const floorSkippedBuckets = clonePlainValue(adjustmentTrace.floorSkippedBuckets || []);
    const missingFloorBuckets = clonePlainValue(adjustmentTrace.missingFloorBuckets || []);
    const points = handoffPoints.map(function (handoffPoint) {
      const point = clonePlainValue(handoffPoint);
      const endingResources = toOptionalNumber(point.householdExpenseAdjustedEndingResources);
      const availableResources = endingResources == null
        ? toOptionalNumber(point.householdExpenseAdjustedAvailableResources)
        : roundMoney(Math.max(0, endingResources));
      return Object.assign({}, point, {
        endingResources: endingResources == null ? point.endingResources : endingResources,
        availableResources: availableResources == null ? point.availableResources : availableResources,
        accumulatedUnmetNeed: endingResources == null ? point.accumulatedUnmetNeed : roundMoney(Math.max(0, -endingResources)),
        status: endingResources != null && endingResources <= 0 ? "depleted" : "available",
        trace: Object.assign({}, isPlainObject(point.trace) ? point.trace : {}, {
          householdExpenseStreamGraphAdjustmentApplied: true,
          graphAdjustmentSource: "baseHouseholdExpenseStream",
          graphAdjustmentOverridesApplied: true,
          livingFloorsApplied: estimatedDollarFloorsEnabled,
          estimatedDollarFloorsEnabled,
          floorAppliedBuckets,
          floorSkippedBuckets,
          missingFloorBuckets,
          bucketAggregationApplied: adjustmentTrace.bucketAggregationApplied === true,
          perRowDollarFloorApplied: adjustmentTrace.perRowDollarFloorApplied === true,
          monthlyExpenseDeltaApplied: monthlyDelta,
          cumulativeExpenseDeltaApplied: toOptionalNumber(point.cumulativeHouseholdExpenseDelta) || 0
        }),
        sourcePaths: uniqueStrings([].concat(point.sourcePaths || [], [
          "householdExpenseStreamPreview.householdExpenseAdjustmentResult"
        ]))
      });
    });

    const depletion = recalculateLifestyleDepletion(points, basePostDeathSeries?.depletion?.depletionDate);
    return {
      points,
      summary: summarizeLifestylePostDeathPoints(points, basePostDeathSeries?.summary),
      depletion,
      trace: {
        effectiveMonthlyDelta: monthlyDelta,
        monthIndexPolicy: "stream-handoff-preview-explicit-month-index",
        graphAdjustmentSource: "baseHouseholdExpenseStream",
        livingFloorsApplied: estimatedDollarFloorsEnabled,
        estimatedDollarFloorsEnabled,
        floorAppliedBuckets,
        floorSkippedBuckets,
        missingFloorBuckets,
        bucketAggregationApplied: adjustmentTrace.bucketAggregationApplied === true,
        perRowDollarFloorApplied: adjustmentTrace.perRowDollarFloorApplied === true
      }
    };
  }

  function buildHouseholdExpenseStreamComparisonScenario(basePostDeathSeries, streamPreview, input) {
    const warnings = Array.isArray(streamPreview?.warnings) ? clonePlainValue(streamPreview.warnings) : [];
    const dataGaps = Array.isArray(streamPreview?.dataGaps) ? clonePlainValue(streamPreview.dataGaps) : [];
    const postDeathSeries = buildStreamAdjustedPostDeathSeries(basePostDeathSeries, streamPreview);
    if (!postDeathSeries) {
      const basePoints = Array.isArray(basePostDeathSeries?.points) ? basePostDeathSeries.points : [];
      return {
        scenarioId: normalizeString(input?.options?.comparisonScenarioId) || DEFAULT_COMPARISON_SCENARIO_ID,
        kind: DEFAULT_COMPARISON_KIND,
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
          calculationMethod: "income-impact-household-expense-stream-comparison-adapter-v1",
          graphMonthlyDelta: 0,
          baseScenarioMutated: false,
          timingApplied: false,
          graphPathId: normalizeString(input?.options?.comparisonPathId) || DEFAULT_COMPARISON_PATH_ID,
          graphAdjustmentSource: "baseHouseholdExpenseStream",
          projectionSeriesApplied: false,
          noOpComparison: true,
          livingFloorsApplied: false,
          estimatedDollarFloorsEnabled: false
        }
      };
    }

    const graphMonthlyDelta = postDeathSeries.trace?.effectiveMonthlyDelta ?? 0;
    const adjustmentTrace = getHouseholdExpenseAdjustmentTrace(streamPreview);
    const estimatedDollarFloorsEnabled = adjustmentTrace.estimatedDollarFloorsEnabled === true;
    return {
      scenarioId: normalizeString(input?.options?.comparisonScenarioId) || DEFAULT_COMPARISON_SCENARIO_ID,
      kind: DEFAULT_COMPARISON_KIND,
      pathId: normalizeString(input?.options?.comparisonPathId) || DEFAULT_COMPARISON_PATH_ID,
      label: normalizeString(input?.options?.comparisonLabel) || "Lifestyle-adjusted projection",
      status: dataGaps.length ? "partial" : "complete",
      reductionsApplied: [],
      pausesApplied: [],
      postDeathSeries,
      depletion: postDeathSeries.depletion,
      accumulatedUnmetNeed: postDeathSeries.summary.accumulatedUnmetNeed ?? null,
      warnings,
      dataGaps,
      trace: {
        calculationMethod: "income-impact-household-expense-stream-comparison-adapter-v1",
        sourceCalculationMethod: streamPreview?.householdExpenseAdjustmentResult?.trace?.calculationMethod || null,
        sliderValue: streamPreview?.householdExpenseAdjustmentResult?.trace?.sliderValue ?? 0,
        monthlyDelta: graphMonthlyDelta,
        graphMonthlyDelta,
        unreconciledMonthlyDeltaExcluded: 0,
        baseScenarioMutated: false,
        timingApplied: false,
        graphPathId: normalizeString(input?.options?.comparisonPathId) || DEFAULT_COMPARISON_PATH_ID,
        graphAdjustmentSource: "baseHouseholdExpenseStream",
        graphAdjustmentItems: clonePlainValue(streamPreview?.householdExpenseAdjustmentResult?.rowAdjustments || []),
        bucketAdjustments: clonePlainValue(streamPreview?.householdExpenseAdjustmentResult?.bucketAdjustments || []),
        projectionSeriesApplied: graphMonthlyDelta !== 0,
        noOpComparison: graphMonthlyDelta === 0,
        livingFloorsApplied: estimatedDollarFloorsEnabled,
        estimatedDollarFloorsEnabled,
        floorAppliedBuckets: clonePlainValue(adjustmentTrace.floorAppliedBuckets || []),
        floorSkippedBuckets: clonePlainValue(adjustmentTrace.floorSkippedBuckets || []),
        missingFloorBuckets: clonePlainValue(adjustmentTrace.missingFloorBuckets || []),
        bucketAggregationApplied: adjustmentTrace.bucketAggregationApplied === true,
        perRowDollarFloorApplied: adjustmentTrace.perRowDollarFloorApplied === true,
        activeGraphAdjustmentMode: true
      }
    };
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

  function calculateIncomeImpactLifestyleComparisonScenario(input) {
    const sourceInput = isPlainObject(input) ? input : {};
    const issue = makeRetiredLegacyModeIssue();
    return {
      scenarioId: normalizeString(sourceInput?.options?.comparisonScenarioId) || DEFAULT_COMPARISON_SCENARIO_ID,
      kind: DEFAULT_COMPARISON_KIND,
      pathId: normalizeString(sourceInput?.options?.comparisonPathId) || DEFAULT_COMPARISON_PATH_ID,
      label: normalizeString(sourceInput?.options?.comparisonLabel) || "Lifestyle-adjusted projection",
      status: "partial",
      reductionsApplied: [],
      pausesApplied: [],
      warnings: [clonePlainValue(issue)],
      dataGaps: [issue],
      trace: {
        calculationMethod: "income-impact-lifestyle-comparison-retired-v1",
        legacyModeRetired: true,
        baseScenarioMutated: false,
        projectionSeriesApplied: false,
        noOpComparison: true
      }
    };
  }

  function buildStreamAdjustedExpenseRows(streamPreview) {
    const rowAdjustments = Array.isArray(streamPreview?.householdExpenseAdjustmentResult?.rowAdjustments)
      ? streamPreview.householdExpenseAdjustmentResult.rowAdjustments
      : [];
    return rowAdjustments.map(function (row) {
      return Object.assign({}, clonePlainValue(row), {
        sliderEligible: row?.graphAdjustable === true,
        rangeBehavior: normalizeString(row?.adjustmentClass) || null
      });
    });
  }

  function sumStreamRows(rows, predicate) {
    return roundMoney((Array.isArray(rows) ? rows : []).reduce(function (total, row) {
      return total + (predicate(row) ? (toOptionalNumber(row?.baselineMonthlyAmount) || 0) : 0);
    }, 0));
  }

  function applyStreamAdjustmentSummaryToOutput(output, streamPreview) {
    const adjustmentResult = isPlainObject(streamPreview?.householdExpenseAdjustmentResult)
      ? streamPreview.householdExpenseAdjustmentResult
      : {};
    const adjustedExpenses = buildStreamAdjustedExpenseRows(streamPreview);
    const totalBaselineMonthlyExpenses = toOptionalNumber(adjustmentResult.totalBaselineMonthlyExpenses ?? adjustmentResult.baselineMonthlyTotal);
    const totalAdjustedMonthlyExpenses = toOptionalNumber(adjustmentResult.totalAdjustedMonthlyExpenses ?? adjustmentResult.adjustedMonthlyTotal);
    output.adjustedExpenses = adjustedExpenses;
    output.totalBaselineMonthlyExpenses = totalBaselineMonthlyExpenses;
    output.totalAdjustedMonthlyExpenses = totalAdjustedMonthlyExpenses;
    output.monthlyDelta = toOptionalNumber(adjustmentResult.monthlyDelta) || 0;
    output.fixedExpensesTotal = sumStreamRows(adjustedExpenses, function (row) {
      return row?.graphAdjustable !== true;
    });
    output.sliderEligibleExpensesTotal = sumStreamRows(adjustedExpenses, function (row) {
      return row?.graphAdjustable === true;
    });
    output.conservativeFloorTotal = null;
    output.elevatedCeilingTotal = null;
    output.trace.expenseCount = adjustedExpenses.length;
    output.trace.sliderEligibleExpenseCount = adjustedExpenses.filter(function (item) {
      return item.sliderEligible === true;
    }).length;
    output.trace.fixedExpenseCount = adjustedExpenses.filter(function (item) {
      return item.sliderEligible !== true;
    }).length;
    output.trace.streamAdjustmentSummaryApplied = true;
    output.trace.baselinePreservedAtZero = output.sliderValue === 0
      ? totalBaselineMonthlyExpenses === totalAdjustedMonthlyExpenses
      : null;
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

    const output = {
      status: dataGaps.length ? "partial" : "complete",
      sliderValue,
      totalBaselineMonthlyExpenses: null,
      totalAdjustedMonthlyExpenses: null,
      monthlyDelta: 0,
      fixedExpensesTotal: null,
      sliderEligibleExpensesTotal: null,
      conservativeFloorTotal: null,
      elevatedCeilingTotal: null,
      warnings,
      dataGaps,
      trace: {
        calculationMethod: CALCULATION_METHOD,
        mode: normalizeString(sourceInput.options && sourceInput.options.mode) || "householdExpenseStream",
        sliderValue,
        expenseCount: 0,
        sliderEligibleExpenseCount: 0,
        fixedExpenseCount: 0,
        baselinePreservedAtZero: null,
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
    const streamPolicyResolution = resolveHouseholdExpenseStreamPolicyMode(sourceInput);
    const streamPolicyMode = streamPolicyResolution.mode;
    Object.assign(output.trace, getHouseholdExpenseStreamPolicyTrace(streamPolicyResolution));
    if (streamPolicyMode === "streamUnavailable") {
      const issue = streamPolicyResolution.legacyModeRetired === true
        ? makeRetiredLegacyModeIssue()
        : makeMissingStreamInputIssue(streamPolicyResolution.streamInputMissingReasons, streamPolicyResolution.requestedMode);
      output.warnings.push(clonePlainValue(issue));
      output.dataGaps.push(issue);
      output.status = "partial";
      output.trace.projectionSeriesApplied = false;
      output.trace.projectionSeriesDeferred = true;
      output.trace.graphPathChanged = false;
      output.trace.comparisonScenarioStatus = null;
    }

    if (streamPolicyMode === "preview") {
      output.householdExpenseStreamPreview = buildHouseholdExpenseStreamPreview(sourceInput, sliderValue, basePostDeathSeries, {
        policyMode: "preview",
        applyEstimatedDollarFloors: true
      });
      const missingPreviewComparisonReasons = getMissingActiveGraphDefaultReasons(sourceInput);
      if (basePostDeathSeries && !missingPreviewComparisonReasons.length) {
        const streamComparisonPreview = buildHouseholdExpenseStreamPreview(sourceInput, sliderValue, basePostDeathSeries, {
          policyMode: "activeGraphAdjustments",
          applyEstimatedDollarFloors: true
        });
        applyStreamAdjustmentSummaryToOutput(output, streamComparisonPreview);
        const comparisonScenario = buildHouseholdExpenseStreamComparisonScenario(basePostDeathSeries, streamComparisonPreview, sourceInput);
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
        output.trace.previewComparisonScenarioSource = "activeGraphAdjustments";
      } else if (basePostDeathSeries) {
        const issue = makeMissingStreamInputIssue(missingPreviewComparisonReasons, "preview");
        output.warnings.push(clonePlainValue(issue));
        output.dataGaps.push(issue);
        output.status = "partial";
        output.trace.streamInputMissing = true;
        output.trace.streamInputMissingReasons = clonePlainValue(missingPreviewComparisonReasons);
        output.trace.projectionSeriesApplied = false;
        output.trace.projectionSeriesDeferred = true;
        output.trace.graphPathChanged = false;
        output.trace.comparisonScenarioStatus = null;
        output.trace.previewComparisonScenarioSource = null;
      }
    } else if (streamPolicyMode === "activeGraphAdjustments") {
      const streamPreview = buildHouseholdExpenseStreamPreview(sourceInput, sliderValue, basePostDeathSeries, {
        policyMode: "activeGraphAdjustments",
        applyEstimatedDollarFloors: true
      });
      output.householdExpenseStreamPreview = streamPreview;
      applyStreamAdjustmentSummaryToOutput(output, streamPreview);
      if (basePostDeathSeries) {
        const comparisonScenario = buildHouseholdExpenseStreamComparisonScenario(basePostDeathSeries, streamPreview, sourceInput);
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
        output.trace.householdExpenseStreamPolicyMode = "activeGraphAdjustments";
        output.trace.householdExpenseStreamGraphPathActive = true;
        output.trace.estimatedDollarFloorsEnabled = streamPreview.householdExpenseAdjustmentResult?.trace?.estimatedDollarFloorsEnabled === true;
        output.trace.floorAppliedBuckets = clonePlainValue(streamPreview.householdExpenseAdjustmentResult?.trace?.floorAppliedBuckets || []);
        output.trace.floorSkippedBuckets = clonePlainValue(streamPreview.householdExpenseAdjustmentResult?.trace?.floorSkippedBuckets || []);
        output.trace.missingFloorBuckets = clonePlainValue(streamPreview.householdExpenseAdjustmentResult?.trace?.missingFloorBuckets || []);
        output.trace.bucketAggregationApplied = streamPreview.householdExpenseAdjustmentResult?.trace?.bucketAggregationApplied === true;
        output.trace.perRowDollarFloorApplied = streamPreview.householdExpenseAdjustmentResult?.trace?.perRowDollarFloorApplied === true;
      }
    }

    return output;
  }

  lensAnalysis.incomeImpactLifestyleScenarioCalculations = Object.freeze({
    calculateIncomeImpactLifestyleScenario,
    calculateIncomeImpactLifestyleComparisonScenario
  });
})(globalThis);
