(function (global) {
  const LensApp = global.LensApp || (global.LensApp = {});
  const lensAnalysis = LensApp.lensAnalysis || (LensApp.lensAnalysis = {});

  const CALCULATION_METHOD = "income-impact-triage-intervention-v1";
  const DEFERRED_INTERVENTION_KEYS = Object.freeze([
    "housing",
    "education",
    "emergencyReserve",
    "transportation",
    "healthcare",
    "foreclosure",
    "eviction",
    "downsize",
    "homeSale",
    "vehicleSale",
    "returnToWork"
  ]);
  const COMPRESSION_ARRAY_KEYS = Object.freeze({
    opportunities: "compressionOpportunities",
    pauseCandidates: "pauseCandidates",
    protectedItems: "protectedExpenseItems",
    excludedItems: "excludedExpenseItems",
    advisorReviewItems: "advisorReviewItems",
    dataGaps: "compressionDataGaps"
  });
  const COMPRESSION_POLICY_DECISIONS = Object.freeze(["YES", "NO", "PAUSE", "INTERVENTION"]);

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

  function appendUnique(target, values) {
    uniqueStrings(values).forEach(function (value) {
      if (!target.includes(value)) {
        target.push(value);
      }
    });
  }

  function normalizeDecision(value) {
    const normalized = normalizeString(value).toUpperCase();
    return COMPRESSION_POLICY_DECISIONS.includes(normalized) ? normalized : null;
  }

  function createEmptyPolicyDecisionSummary() {
    return {
      YES: 0,
      NO: 0,
      PAUSE: 0,
      INTERVENTION: 0,
      totalRules: 0,
      invalidDecisionCount: 0,
      byOrderGroup: {}
    };
  }

  function summarizeCompressionPolicyRules(policyRules) {
    const summary = createEmptyPolicyDecisionSummary();
    (Array.isArray(policyRules) ? policyRules : []).forEach(function (rule) {
      const decision = normalizeDecision(rule?.decision);
      if (!decision) {
        summary.invalidDecisionCount += 1;
        return;
      }

      summary[decision] += 1;
      summary.totalRules += 1;

      const orderGroup = normalizeString(rule?.compressionOrderGroup) || "unassigned";
      if (!summary.byOrderGroup[orderGroup]) {
        summary.byOrderGroup[orderGroup] = {
          YES: 0,
          NO: 0,
          PAUSE: 0,
          INTERVENTION: 0,
          totalRules: 0
        };
      }
      summary.byOrderGroup[orderGroup][decision] += 1;
      summary.byOrderGroup[orderGroup].totalRules += 1;
    });
    return summary;
  }

  function buildCompressionReporting(compressionReport, compressionPolicyRules) {
    const reportProvided = isPlainObject(compressionReport);
    const output = Object.keys(COMPRESSION_ARRAY_KEYS).reduce(function (next, sourceKey) {
      const outputKey = COMPRESSION_ARRAY_KEYS[sourceKey];
      next[outputKey] = reportProvided && Array.isArray(compressionReport[sourceKey])
        ? clonePlainValue(compressionReport[sourceKey])
        : [];
      return next;
    }, {});

    const reportTrace = reportProvided && isPlainObject(compressionReport.trace)
      ? clonePlainValue(compressionReport.trace)
      : {};
    output.compressionTrace = {
      reportingOnly: true,
      compressionReportingEnabled: reportProvided,
      source: reportProvided ? "explicit-input" : "none",
      classifierStatus: reportProvided ? normalizeString(compressionReport.status) || null : null,
      baseScenarioMutated: false,
      projectionMutated: false,
      graphPathChanged: false,
      reductionsApplied: false,
      layer5AppliedCompression: false,
      sourceTrace: reportTrace
    };
    output.policyDecisionSummary = summarizeCompressionPolicyRules(compressionPolicyRules);
    return output;
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

  function getPath(source, path) {
    const normalizedPath = normalizeString(path);
    if (!normalizedPath) {
      return undefined;
    }

    return normalizedPath.split(".").reduce(function (current, key) {
      if (current == null) {
        return undefined;
      }
      return current[key];
    }, source);
  }

  function firstDefined(source, paths) {
    for (let index = 0; index < paths.length; index += 1) {
      const value = getPath(source, paths[index]);
      if (value !== undefined && value !== null && value !== "") {
        return value;
      }
    }
    return null;
  }

  function getBaseSummary(scenario) {
    const postSummary = isPlainObject(scenario?.postDeathSeries?.summary)
      ? scenario.postDeathSeries.summary
      : {};

    return {
      resourcesAfterObligations: firstDefined(scenario, [
        "timelineFacts.resourcesAfterObligations",
        "deathEvent.resourcesAfterObligations"
      ]),
      monthsCovered: firstDefined(scenario, [
        "timelineFacts.monthsCovered",
        "postDeathSeries.depletion.monthsCovered"
      ]),
      depletionDate: firstDefined(scenario, [
        "timelineFacts.depletionDate",
        "postDeathSeries.depletion.depletionDate"
      ]),
      accumulatedUnmetNeed: firstDefined(scenario, [
        "timelineFacts.accumulatedUnmetNeed",
        "postDeathSeries.summary.accumulatedUnmetNeed"
      ]),
      totalSurvivorNeeds: firstDefined({ postSummary }, [
        "postSummary.totalSurvivorNeeds"
      ]),
      totalSurvivorIncome: firstDefined({ postSummary }, [
        "postSummary.totalSurvivorIncome"
      ]),
      totalScheduledObligations: firstDefined({ postSummary }, [
        "postSummary.totalScheduledObligations"
      ])
    };
  }

  function normalizeEvidence(event) {
    return Array.isArray(event?.evidence) ? clonePlainValue(event.evidence) : [];
  }

  function buildTriageEventFromRiskEvent(event, index, stable) {
    return {
      id: normalizeString(event?.id) || `${stable ? "stable" : "risk"}-event-${index + 1}`,
      sourceEventId: normalizeString(event?.id) || null,
      ruleId: normalizeString(event?.ruleId) || null,
      category: normalizeString(event?.category) || "general",
      severity: normalizeString(event?.severity) || (stable ? "stable" : "caution"),
      phase: normalizeString(event?.phase) || "postDeath",
      title: normalizeString(event?.title) || "Income Impact triage item",
      summary: normalizeString(event?.summary) || "Review this Income Impact scenario item.",
      date: event?.date || null,
      monthIndex: toOptionalNumber(event?.monthIndex),
      evidence: normalizeEvidence(event),
      sourcePaths: uniqueStrings(event?.sourcePaths),
      changesProjection: false,
      requiresAdvisorConfirmation: false,
      trace: {
        calculationMethod: CALCULATION_METHOD,
        source: stable ? "layer-4-stable-event" : "layer-4-risk-event"
      }
    };
  }

  function buildDataQualityEvent(issue, index, sourceKind) {
    const code = normalizeString(issue?.code || issue?.id) || `${sourceKind}-${index + 1}`;
    return {
      id: `${sourceKind}-${code}-${index + 1}`,
      sourceEventId: null,
      ruleId: code,
      category: "dataQuality",
      severity: "caution",
      phase: "dataQuality",
      title: `Data quality: ${code}`,
      summary: normalizeString(issue?.message) || "Review this Income Impact setup item.",
      date: null,
      monthIndex: null,
      evidence: [
        {
          path: sourceKind === "data-gap" ? "scenario.dataGaps" : "scenario.warnings",
          value: clonePlainValue(issue)
        }
      ],
      sourcePaths: uniqueStrings(issue?.sourcePaths),
      changesProjection: false,
      requiresAdvisorConfirmation: false,
      trace: {
        calculationMethod: CALCULATION_METHOD,
        source: sourceKind
      }
    };
  }

  function buildDiscretionaryCandidate(policy) {
    return {
      id: "discretionary-reduction-candidate",
      sourceEventId: null,
      ruleId: "discretionary-reduction-candidate",
      category: "expense",
      severity: "caution",
      phase: "postDeath",
      title: "Discretionary reduction candidate",
      summary: "A discretionary reduction policy was provided but has not been advisor-confirmed.",
      date: null,
      monthIndex: null,
      evidence: [
        {
          path: "triagePolicy.discretionaryReduction",
          value: clonePlainValue(policy)
        }
      ],
      sourcePaths: uniqueStrings(policy?.sourcePaths),
      changesProjection: false,
      requiresAdvisorConfirmation: true,
      trace: {
        calculationMethod: CALCULATION_METHOD,
        source: "policy-candidate",
        policyProvided: true,
        advisorConfirmed: false
      }
    };
  }

  function getReductionAmount(discretionaryNeeds, policy) {
    const monthlyAmount = toOptionalNumber(policy?.monthlyReductionAmount);
    if (monthlyAmount != null && monthlyAmount > 0) {
      return Math.min(discretionaryNeeds, monthlyAmount);
    }

    const rawPercent = toOptionalNumber(policy?.reductionPercent);
    if (rawPercent != null && rawPercent > 0) {
      const fraction = rawPercent > 1 ? rawPercent / 100 : rawPercent;
      return Math.min(discretionaryNeeds, discretionaryNeeds * fraction);
    }

    return 0;
  }

  function recalculateDepletion(points, fallbackStartDate) {
    const depletedPoint = points.find(function (point) {
      return toOptionalNumber(point.endingResources) != null && point.endingResources <= 0;
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
      depletionDate: depletedPoint.date || fallbackStartDate || null,
      depletionMonthIndex: toOptionalNumber(depletedPoint.monthIndex),
      monthsCovered: toOptionalNumber(depletedPoint.monthIndex),
      precision: "monthly"
    };
  }

  function buildDiscretionaryReductionScenario(scenario, policy, warnings, dataGaps) {
    const basePoints = Array.isArray(scenario?.postDeathSeries?.points)
      ? scenario.postDeathSeries.points
      : [];

    if (!basePoints.length) {
      dataGaps.push(makeIssue(
        "missing-post-death-points-for-discretionary-reduction",
        "Post-death survivor runway points are required before a discretionary reduction scenario can be created.",
        ["scenario.postDeathSeries.points"]
      ));
      return null;
    }

    let totalReduction = 0;
    let totalSurvivorIncome = 0;
    let totalEssentialNeeds = 0;
    let totalDiscretionaryNeeds = 0;
    let totalSurvivorNeeds = 0;
    let totalScheduledObligations = 0;
    let totalNetUse = 0;
    let previousEndingResources = null;
    const points = basePoints.map(function (basePoint, index) {
      const startingResources = index === 0
        ? toOptionalNumber(basePoint.startingResources)
        : previousEndingResources;
      const survivorIncome = toOptionalNumber(basePoint.survivorIncome) || 0;
      const essentialNeeds = toOptionalNumber(basePoint.essentialNeeds) || 0;
      const baseDiscretionaryNeeds = toOptionalNumber(basePoint.discretionaryNeeds) || 0;
      const baseSurvivorNeeds = toOptionalNumber(basePoint.survivorNeeds) || 0;
      const otherNeeds = Math.max(0, baseSurvivorNeeds - essentialNeeds - baseDiscretionaryNeeds);
      const scheduledObligations = toOptionalNumber(basePoint.scheduledObligations) || 0;
      const reduction = roundMoney(getReductionAmount(baseDiscretionaryNeeds, policy));
      const discretionaryNeeds = roundMoney(Math.max(0, baseDiscretionaryNeeds - reduction));
      const survivorNeeds = roundMoney(essentialNeeds + discretionaryNeeds + otherNeeds);
      const netUse = roundMoney(survivorNeeds + scheduledObligations - survivorIncome);
      const endingResources = roundMoney((startingResources || 0) + survivorIncome - survivorNeeds - scheduledObligations);
      const accumulatedUnmetNeed = roundMoney(Math.max(0, -endingResources));
      previousEndingResources = endingResources;

      totalReduction = roundMoney(totalReduction + reduction);
      totalSurvivorIncome = roundMoney(totalSurvivorIncome + survivorIncome);
      totalEssentialNeeds = roundMoney(totalEssentialNeeds + essentialNeeds);
      totalDiscretionaryNeeds = roundMoney(totalDiscretionaryNeeds + discretionaryNeeds);
      totalSurvivorNeeds = roundMoney(totalSurvivorNeeds + survivorNeeds);
      totalScheduledObligations = roundMoney(totalScheduledObligations + scheduledObligations);
      totalNetUse = roundMoney(totalNetUse + netUse);

      return {
        ...clonePlainValue(basePoint),
        startingResources: roundMoney(startingResources || 0),
        survivorIncome,
        essentialNeeds,
        discretionaryNeeds,
        survivorNeeds,
        scheduledObligations,
        netUse,
        endingResources,
        availableResources: roundMoney(Math.max(0, endingResources)),
        accumulatedUnmetNeed,
        trace: {
          ...(isPlainObject(basePoint.trace) ? clonePlainValue(basePoint.trace) : {}),
          layer5Intervention: "policy-provided-discretionary-reduction",
          protectedEssentialsPreserved: true,
          discretionaryReduction: reduction
        }
      };
    });

    if (totalReduction <= 0) {
      warnings.push(makeIssue(
        "discretionary-reduction-produced-no-change",
        "The advisor-confirmed discretionary reduction policy did not reduce any discretionary needs in the current survivor runway.",
        ["triagePolicy.discretionaryReduction", "scenario.postDeathSeries.points.discretionaryNeeds"]
      ));
    }

    const depletion = recalculateDepletion(points, scenario?.postDeathSeries?.depletion?.depletionDate);
    const endingResources = points.length ? points[points.length - 1].endingResources : null;
    const accumulatedUnmetNeed = points.length ? points[points.length - 1].accumulatedUnmetNeed : null;

    return {
      id: normalizeString(policy?.id) || "policy-provided-discretionary-reduction",
      type: "discretionaryReduction",
      status: dataGaps.length ? "partial" : "complete",
      title: normalizeString(policy?.label) || "Policy-provided discretionary reduction",
      advisorConfirmed: true,
      changesProjection: true,
      protectedEssentialsPreserved: true,
      input: {
        monthlyReductionAmount: toOptionalNumber(policy?.monthlyReductionAmount),
        reductionPercent: toOptionalNumber(policy?.reductionPercent),
        sourcePaths: uniqueStrings(policy?.sourcePaths)
      },
      summary: {
        totalDiscretionaryNeedsReduction: totalReduction,
        totalSurvivorIncome,
        totalEssentialNeeds,
        totalDiscretionaryNeeds,
        totalSurvivorNeeds,
        totalScheduledObligations,
        totalNetUse,
        endingResources,
        accumulatedUnmetNeed,
        baseEndingResources: scenario?.postDeathSeries?.summary?.endingResources ?? null,
        baseAccumulatedUnmetNeed: scenario?.postDeathSeries?.summary?.accumulatedUnmetNeed ?? null
      },
      postDeathSeries: {
        points,
        summary: {
          totalSurvivorIncome,
          totalEssentialNeeds,
          totalDiscretionaryNeeds,
          totalSurvivorNeeds,
          totalScheduledObligations,
          totalNetUse,
          endingResources,
          accumulatedUnmetNeed
        },
        depletion
      },
      warnings: [],
      dataGaps: [],
      trace: {
        calculationMethod: CALCULATION_METHOD,
        policyProvided: true,
        advisorConfirmed: true,
        inferred: false,
        modifiedFields: [
          "postDeathSeries.points.discretionaryNeeds",
          "postDeathSeries.points.survivorNeeds",
          "postDeathSeries.points.netUse",
          "postDeathSeries.points.endingResources"
        ],
        preservedFields: [
          "postDeathSeries.points.essentialNeeds",
          "baseScenario"
        ],
        statement: "This scenario is a copied policy-provided intervention; protected essential needs and the base scenario are preserved."
      }
    };
  }

  function collectDeferredPolicyWarnings(triagePolicy, warnings) {
    DEFERRED_INTERVENTION_KEYS.forEach(function (key) {
      if (triagePolicy && triagePolicy[key] != null) {
        warnings.push(makeIssue(
          "deferred-intervention-policy-ignored",
          "A policy input was provided for an intervention category that is intentionally not modeled in Layer 5 v1.",
          [`triagePolicy.${key}`],
          { policyKey: key }
        ));
      }
    });
  }

  function calculateIncomeImpactTriageInterventions(input) {
    const safeInput = isPlainObject(input) ? input : {};
    const scenario = safeInput.scenario;
    const riskEvaluation = safeInput.riskEvaluation;
    const triagePolicy = isPlainObject(safeInput.triagePolicy) ? safeInput.triagePolicy : {};
    const warnings = [];
    const dataGaps = [];
    const triageEvents = [];
    const stableTriageEvents = [];
    const interventionScenarios = [];
    const trace = {
      calculationMethod: CALCULATION_METHOD,
      layerPurpose: "Interpret composed Income Impact scenario and Layer 4 event output into triage events and optional policy-provided intervention shells.",
      baseScenarioMutated: false,
      riskEvaluationMutated: false,
      baseCasePreserved: true,
      noInterventionBaseCase: true,
      projectionChangingInterventionsRequireAdvisorConfirmation: true,
      noBaseFinancialCalculationsOwned: true,
      statement: "Layer 5 performs scenario interpretation and optional policy-provided intervention modeling only; it does not own base financial calculations.",
      deferredInterventionCategories: DEFERRED_INTERVENTION_KEYS.slice(),
      interventionScenarioIds: []
    };
    const compressionReporting = buildCompressionReporting(
      safeInput.compressionReport,
      safeInput.compressionPolicyRules
    );

    if (!isPlainObject(scenario)) {
      dataGaps.push(makeIssue(
        "missing-scenario",
        "A composed Income Impact scenario is required before Layer 5 triage can run.",
        ["scenario"]
      ));
    }

    if (!isPlainObject(riskEvaluation)) {
      dataGaps.push(makeIssue(
        "missing-risk-evaluation",
        "Layer 4 risk evaluation output is required before Layer 5 triage can run.",
        ["riskEvaluation"]
      ));
    }

    const baseScenarioSummary = isPlainObject(scenario) ? getBaseSummary(scenario) : {
      resourcesAfterObligations: null,
      monthsCovered: null,
      depletionDate: null,
      accumulatedUnmetNeed: null,
      totalSurvivorNeeds: null,
      totalSurvivorIncome: null,
      totalScheduledObligations: null
    };

    (Array.isArray(riskEvaluation?.events) ? riskEvaluation.events : []).forEach(function (event, index) {
      triageEvents.push(buildTriageEventFromRiskEvent(event, index, false));
    });

    (Array.isArray(riskEvaluation?.stableEvents) ? riskEvaluation.stableEvents : []).forEach(function (event, index) {
      stableTriageEvents.push(buildTriageEventFromRiskEvent(event, index, true));
    });

    (Array.isArray(scenario?.dataGaps) ? scenario.dataGaps : []).forEach(function (issue, index) {
      triageEvents.push(buildDataQualityEvent(issue, index, "data-gap"));
    });

    (Array.isArray(scenario?.warnings) ? scenario.warnings : []).forEach(function (issue, index) {
      triageEvents.push(buildDataQualityEvent(issue, index, "warning"));
    });

    collectDeferredPolicyWarnings(triagePolicy, warnings);

    const discretionaryPolicy = isPlainObject(triagePolicy.discretionaryReduction)
      ? triagePolicy.discretionaryReduction
      : null;
    if (discretionaryPolicy) {
      if (discretionaryPolicy.advisorConfirmed === true) {
        const scenarioOutput = buildDiscretionaryReductionScenario(
          scenario,
          discretionaryPolicy,
          warnings,
          dataGaps
        );
        if (scenarioOutput) {
          interventionScenarios.push(scenarioOutput);
          trace.interventionScenarioIds.push(scenarioOutput.id);
        }
      } else {
        warnings.push(makeIssue(
          "advisor-confirmation-required-for-discretionary-reduction",
          "A discretionary reduction policy was provided but was not modeled because advisor confirmation is required.",
          ["triagePolicy.discretionaryReduction"]
        ));
        triageEvents.push(buildDiscretionaryCandidate(discretionaryPolicy));
      }
    }

    return {
      status: dataGaps.length ? "partial" : "complete",
      baseScenarioSummary,
      triageEvents,
      stableTriageEvents,
      interventionScenarios,
      compressionOpportunities: compressionReporting.compressionOpportunities,
      pauseCandidates: compressionReporting.pauseCandidates,
      protectedExpenseItems: compressionReporting.protectedExpenseItems,
      excludedExpenseItems: compressionReporting.excludedExpenseItems,
      advisorReviewItems: compressionReporting.advisorReviewItems,
      compressionDataGaps: compressionReporting.compressionDataGaps,
      compressionTrace: compressionReporting.compressionTrace,
      policyDecisionSummary: compressionReporting.policyDecisionSummary,
      warnings,
      dataGaps,
      trace
    };
  }

  lensAnalysis.calculateIncomeImpactTriageInterventions = calculateIncomeImpactTriageInterventions;
})(typeof globalThis !== "undefined" ? globalThis : this);
