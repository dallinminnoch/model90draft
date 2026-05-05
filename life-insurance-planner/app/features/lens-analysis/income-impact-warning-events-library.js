(function (global) {
  const LensApp = global.LensApp || (global.LensApp = {});
  const lensAnalysis = LensApp.lensAnalysis || (LensApp.lensAnalysis = {});

  // Owner: Income Impact pivotal warning event library.
  // Purpose: define professional warning/risk event contracts for future
  // Income Impact timeline markers and risk panels. This module is pure: no
  // DOM access, no storage access, no method calls, no recommendation logic,
  // and no mutation of caller-owned inputs.

  const INCOME_IMPACT_WARNING_SEVERITIES = Object.freeze({
    stable: "stable",
    caution: "caution",
    atRisk: "at-risk",
    critical: "critical"
  });

  const SEVERITY_SORT_ORDER = Object.freeze({
    critical: 0,
    "at-risk": 1,
    caution: 2,
    stable: 3
  });

  const RISK_SEVERITIES = Object.freeze([
    INCOME_IMPACT_WARNING_SEVERITIES.critical,
    INCOME_IMPACT_WARNING_SEVERITIES.atRisk,
    INCOME_IMPACT_WARNING_SEVERITIES.caution
  ]);

  function freezeDefinition(definition) {
    return Object.freeze({
      id: definition.id,
      type: definition.type,
      label: definition.label,
      shortLabel: definition.shortLabel,
      severity: definition.severity,
      lane: definition.lane,
      trigger: definition.trigger,
      advisorCopy: definition.advisorCopy,
      requiredFacts: Object.freeze((definition.requiredFacts || []).slice())
    });
  }

  const INCOME_IMPACT_WARNING_EVENT_DEFINITIONS = Object.freeze([
    freezeDefinition({
      id: "deathEvent",
      type: "deathEvent",
      label: "Death scenario begins",
      shortLabel: "Death",
      severity: "stable",
      lane: "resources",
      trigger: "selectedDeath.date",
      advisorCopy: "The selected death date anchors the scenario timeline.",
      requiredFacts: ["selectedDeath.date"]
    }),
    freezeDefinition({
      id: "primaryIncomeStops",
      type: "primaryIncomeStops",
      label: "Primary income stops",
      shortLabel: "Income stops",
      severity: "at-risk",
      lane: "income",
      trigger: "timelineEvents.incomeStops",
      advisorCopy: "The household no longer has the primary earner's income in this scenario.",
      requiredFacts: ["incomeBasis.annualIncomeReplacementBase"]
    }),
    freezeDefinition({
      id: "existingCoverageAvailable",
      type: "existingCoverageAvailable",
      label: "Existing coverage available",
      shortLabel: "Coverage",
      severity: "stable",
      lane: "resources",
      trigger: "financialRunway.existingCoverage",
      advisorCopy: "Existing coverage is included in money available at death when present.",
      requiredFacts: ["treatedExistingCoverageOffset.totalTreatedCoverageOffset"]
    }),
    freezeDefinition({
      id: "liquidAssetsAvailable",
      type: "liquidAssetsAvailable",
      label: "Liquid assets available",
      shortLabel: "Assets",
      severity: "stable",
      lane: "resources",
      trigger: "financialRunway.availableAssets",
      advisorCopy: "Available assets are included according to prepared LENS planning buckets.",
      requiredFacts: ["treatedAssetOffsets.totalTreatedAssetValue"]
    }),
    freezeDefinition({
      id: "immediateCashNeed",
      type: "immediateCashNeed",
      label: "Immediate cash need",
      shortLabel: "Cash need",
      severity: "caution",
      lane: "resources",
      trigger: "financialRunway.immediateObligations",
      advisorCopy: "Immediate obligations reduce money available for ongoing support.",
      requiredFacts: ["finalExpenses.totalFinalExpenseNeed", "transitionNeeds.totalTransitionNeed", "treatedDebtPayoff.needs.debtPayoffAmount"]
    }),
    freezeDefinition({
      id: "finalExpensesDue",
      type: "finalExpensesDue",
      label: "Final expenses due",
      shortLabel: "Final expenses",
      severity: "caution",
      lane: "resources",
      trigger: "timelineEvents.finalExpensesDue",
      advisorCopy: "Final expenses are an immediate use of available resources.",
      requiredFacts: ["finalExpenses.totalFinalExpenseNeed"]
    }),
    freezeDefinition({
      id: "debtPayoffDue",
      type: "debtPayoffDue",
      label: "Debt payoff need",
      shortLabel: "Debt payoff",
      severity: "caution",
      lane: "resources",
      trigger: "timelineEvents.debtObligation",
      advisorCopy: "Debt treatment can reduce resources available for ongoing household support.",
      requiredFacts: ["treatedDebtPayoff.needs.debtPayoffAmount"]
    }),
    freezeDefinition({
      id: "survivorIncomeDelayed",
      type: "survivorIncomeDelayed",
      label: "Survivor income delay",
      shortLabel: "Income delay",
      severity: "caution",
      lane: "income",
      trigger: "survivorScenario.survivorIncomeStartDelayMonths",
      advisorCopy: "A survivor income delay can increase early cash-flow pressure.",
      requiredFacts: ["survivorScenario.survivorIncomeStartDelayMonths"]
    }),
    freezeDefinition({
      id: "monthlyBudgetDeficitBegins",
      type: "monthlyBudgetDeficitBegins",
      label: "Household budget deficit begins",
      shortLabel: "Deficit begins",
      severity: "at-risk",
      lane: "income",
      trigger: "financialRunway.annualShortfall",
      advisorCopy: "Annual household need exceeds survivor income in this scenario.",
      requiredFacts: ["ongoingSupport.annualTotalEssentialSupportCost", "survivorScenario.survivorNetAnnualIncome"]
    }),
    freezeDefinition({
      id: "resourcesFallBelow50Percent",
      type: "resourcesFallBelow50Percent",
      label: "Resources fall below 50%",
      shortLabel: "Below 50%",
      severity: "caution",
      lane: "resources",
      trigger: "scenarioTimeline.resourceSeries.points",
      advisorCopy: "Remaining resources fall below half of the starting amount.",
      requiredFacts: ["scenarioTimeline.resourceSeries.points"]
    }),
    freezeDefinition({
      id: "oneYearOfSupportRemaining",
      type: "oneYearOfSupportRemaining",
      label: "One year of support remaining",
      shortLabel: "1 year left",
      severity: "at-risk",
      lane: "resources",
      trigger: "scenarioTimeline.resourceSeries.points",
      advisorCopy: "Available resources are approaching the final year of estimated support.",
      requiredFacts: ["scenarioTimeline.resourceSeries.points", "financialRunway.annualShortfall"]
    }),
    freezeDefinition({
      id: "sixMonthsOfSupportRemaining",
      type: "sixMonthsOfSupportRemaining",
      label: "Six months of support remaining",
      shortLabel: "6 months left",
      severity: "critical",
      lane: "resources",
      trigger: "scenarioTimeline.resourceSeries.points",
      advisorCopy: "Available resources are approaching the final six months of estimated support.",
      requiredFacts: ["scenarioTimeline.resourceSeries.points", "financialRunway.annualShortfall"]
    }),
    freezeDefinition({
      id: "resourcesDepleted",
      type: "resourcesDepleted",
      label: "Resources depleted",
      shortLabel: "Depleted",
      severity: "critical",
      lane: "resources",
      trigger: "financialRunway.depletionDate",
      advisorCopy: "Available resources are projected to reach zero in this scenario.",
      requiredFacts: ["financialRunway.depletionDate"]
    }),
    freezeDefinition({
      id: "householdSupportAtRisk",
      type: "householdSupportAtRisk",
      label: "Household support at risk",
      shortLabel: "Support risk",
      severity: "at-risk",
      lane: "resources",
      trigger: "financialRunway.annualShortfall",
      advisorCopy: "Household support depends on the available resources lasting through the support period.",
      requiredFacts: ["financialRunway.annualShortfall", "financialRunway.totalMonthsOfSecurity"]
    }),
    freezeDefinition({
      id: "housingPaymentAtRisk",
      type: "housingPaymentAtRisk",
      label: "Housing payment at risk",
      shortLabel: "Housing risk",
      severity: "at-risk",
      lane: "housing",
      trigger: "future.housingRiskEvaluation",
      advisorCopy: "Housing payment risk requires mortgage timing and payment facts before it can be dated.",
      requiredFacts: ["ongoingSupport.monthlyHousingSupportCost", "ongoingSupport.mortgageRemainingTermMonths"]
    }),
    freezeDefinition({
      id: "educationWindowOpens",
      type: "educationWindowOpens",
      label: "Education funding window opens",
      shortLabel: "Education",
      severity: "stable",
      lane: "education",
      trigger: "timelineEvents.educationWindow",
      advisorCopy: "Education timing can be shown when dependent dates and education funding facts are available.",
      requiredFacts: ["educationSupport.currentDependentDetails", "educationSupport.totalEducationFundingNeed"]
    }),
    freezeDefinition({
      id: "educationFundingAtRisk",
      type: "educationFundingAtRisk",
      label: "Education funding at risk",
      shortLabel: "Education risk",
      severity: "at-risk",
      lane: "education",
      trigger: "future.educationRiskEvaluation",
      advisorCopy: "Education funding risk requires education timing and resource depletion timing before it can be dated.",
      requiredFacts: ["educationSupport.currentDependentDetails", "educationSupport.totalEducationFundingNeed"]
    }),
    freezeDefinition({
      id: "dependentSupportGapBegins",
      type: "dependentSupportGapBegins",
      label: "Dependent support gap begins",
      shortLabel: "Support gap",
      severity: "at-risk",
      lane: "education",
      trigger: "future.dependentSupportEvaluation",
      advisorCopy: "Dependent support risk requires dated dependent milestones before it can be evaluated.",
      requiredFacts: ["educationSupport.currentDependentDetails"]
    }),
    freezeDefinition({
      id: "emergencyReserveExhausted",
      type: "emergencyReserveExhausted",
      label: "Emergency reserve exhausted",
      shortLabel: "Reserve used",
      severity: "caution",
      lane: "resources",
      trigger: "future.reserveEvaluation",
      advisorCopy: "Emergency reserve usage requires reserve bucket details before it can be dated.",
      requiredFacts: ["cashReserveProjection", "treatedAssetOffsets.assets"]
    }),
    freezeDefinition({
      id: "partialEstimateOnly",
      type: "partialEstimateOnly",
      label: "Partial estimate only",
      shortLabel: "Partial",
      severity: "caution",
      lane: "dataQuality",
      trigger: "financialRunway.status",
      advisorCopy: "The estimate is using available facts and should be improved with the missing items.",
      requiredFacts: ["financialRunway.status", "dataGaps"]
    }),
    freezeDefinition({
      id: "majorDataGap",
      type: "majorDataGap",
      label: "Major data gap",
      shortLabel: "Data gap",
      severity: "at-risk",
      lane: "dataQuality",
      trigger: "dataGaps",
      advisorCopy: "Missing planning facts limit the precision of the Income Impact preview.",
      requiredFacts: ["dataGaps"]
    }),
    freezeDefinition({
      id: "noShortfall",
      type: "noShortfall",
      label: "No annual shortfall identified",
      shortLabel: "No shortfall",
      severity: "stable",
      lane: "resources",
      trigger: "financialRunway.status",
      advisorCopy: "Available survivor income covers the annual household need in this preview.",
      requiredFacts: ["financialRunway.status"]
    })
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
    const normalized = String(value).replace(/[$,%\s,]/g, "").trim();
    if (!normalized) {
      return null;
    }
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : null;
  }

  function roundMoney(value) {
    return Number.isFinite(value) ? Number(value.toFixed(2)) : null;
  }

  function getPath(source, path) {
    return normalizeString(path)
      .split(".")
      .filter(Boolean)
      .reduce(function (current, key) {
        return current && typeof current === "object" ? current[key] : undefined;
      }, source);
  }

  function cloneArray(value) {
    return Array.isArray(value) ? value.slice() : [];
  }

  function getDefinition(id) {
    return INCOME_IMPACT_WARNING_EVENT_DEFINITIONS.find(function (definition) {
      return definition.id === id;
    }) || null;
  }

  function getTimelineEvent(input, type) {
    const events = Array.isArray(input?.timelineEvents) ? input.timelineEvents : [];
    return events.find(function (event) {
      return event && event.type === type;
    }) || null;
  }

  function getScenarioPoints(input) {
    const points = getPath(input, "scenarioTimeline.resourceSeries.points");
    if (Array.isArray(points)) {
      return points;
    }
    const runwayPoints = getPath(input, "financialRunway.projectionPoints");
    return Array.isArray(runwayPoints) ? runwayPoints : [];
  }

  function getPointBalance(point) {
    const displayedBalance = toOptionalNumber(point?.displayedBalance);
    if (displayedBalance != null) {
      return displayedBalance;
    }
    const endingBalance = toOptionalNumber(point?.endingBalance);
    if (endingBalance != null) {
      return Math.max(0, endingBalance);
    }
    return toOptionalNumber(point?.balance);
  }

  function getPointRelativeMonth(point) {
    const relativeMonthIndex = toOptionalNumber(point?.relativeMonthIndex);
    if (relativeMonthIndex != null) {
      return relativeMonthIndex;
    }
    const yearIndex = toOptionalNumber(point?.yearIndex);
    return yearIndex == null ? null : yearIndex * 12;
  }

  function createEvent(definitionId, options) {
    const definition = getDefinition(definitionId);
    const safeOptions = isPlainObject(options) ? options : {};
    if (!definition) {
      return null;
    }

    return {
      id: safeOptions.id || definition.id,
      type: safeOptions.type || definition.type,
      label: safeOptions.label || definition.label,
      shortLabel: safeOptions.shortLabel || definition.shortLabel,
      severity: safeOptions.severity || definition.severity,
      date: safeOptions.date || null,
      age: safeOptions.age == null ? null : safeOptions.age,
      relativeMonthIndex: safeOptions.relativeMonthIndex == null ? null : safeOptions.relativeMonthIndex,
      lane: safeOptions.lane || definition.lane,
      trigger: safeOptions.trigger || definition.trigger,
      advisorCopy: safeOptions.advisorCopy || definition.advisorCopy,
      amount: safeOptions.amount == null ? null : roundMoney(safeOptions.amount),
      sourcePaths: cloneArray(safeOptions.sourcePaths || definition.requiredFacts),
      requiredFacts: cloneArray(definition.requiredFacts),
      dataGaps: cloneArray(safeOptions.dataGaps)
    };
  }

  function getEventDate(input, fallbackEvent) {
    return fallbackEvent?.date
      || getPath(input, "scenarioTimeline.scenario.deathDate")
      || getPath(input, "financialRunway.depletionDate")
      || null;
  }

  function findFirstPointAtOrBelowRemainingMonths(input, remainingMonthsThreshold) {
    const annualShortfall = toOptionalNumber(getPath(input, "financialRunway.annualShortfall"));
    if (annualShortfall == null || annualShortfall <= 0) {
      return null;
    }
    const monthlyShortfall = annualShortfall / 12;
    return getScenarioPoints(input).find(function (point) {
      const balance = getPointBalance(point);
      return balance != null && balance > 0 && balance / monthlyShortfall <= remainingMonthsThreshold;
    }) || null;
  }

  function findFirstPointBelowHalf(input) {
    const startingResources = toOptionalNumber(getPath(input, "financialRunway.netAvailableResources"))
      || toOptionalNumber(getPath(input, "financialRunway.startingResources"));
    if (startingResources == null || startingResources <= 0) {
      return null;
    }
    const threshold = startingResources * 0.5;
    return getScenarioPoints(input).find(function (point) {
      const relativeMonthIndex = getPointRelativeMonth(point);
      const balance = getPointBalance(point);
      return relativeMonthIndex != null
        && relativeMonthIndex > 0
        && balance != null
        && balance <= threshold;
    }) || null;
  }

  function findDepletedPoint(input) {
    return getScenarioPoints(input).find(function (point) {
      const relativeMonthIndex = getPointRelativeMonth(point);
      const balance = getPointBalance(point);
      const status = normalizeString(point?.status);
      return relativeMonthIndex != null
        && relativeMonthIndex >= 0
        && (
          status === "depleted"
          || balance === 0
          || (toOptionalNumber(point?.endingBalance) != null && toOptionalNumber(point.endingBalance) <= 0)
        );
    }) || null;
  }

  function getCriticalDataGaps(input) {
    const dataGaps = cloneArray(input?.dataGaps);
    const criticalCodes = [
      "missing-annual-essential-expenses",
      "missing-annual-shortfall",
      "missing-client-dob",
      "missing-assets-liquidity",
      "missing-existing-coverage"
    ];
    return dataGaps.filter(function (gap) {
      const code = normalizeString(gap?.code);
      return criticalCodes.includes(code);
    });
  }

  function sortIncomeImpactWarningEvents(events) {
    return cloneArray(events)
      .filter(isPlainObject)
      .sort(function (left, right) {
        const leftSeverity = SEVERITY_SORT_ORDER[left.severity] == null ? 99 : SEVERITY_SORT_ORDER[left.severity];
        const rightSeverity = SEVERITY_SORT_ORDER[right.severity] == null ? 99 : SEVERITY_SORT_ORDER[right.severity];
        if (leftSeverity !== rightSeverity) {
          return leftSeverity - rightSeverity;
        }

        const leftRelativeMonth = toOptionalNumber(left.relativeMonthIndex);
        const rightRelativeMonth = toOptionalNumber(right.relativeMonthIndex);
        if (leftRelativeMonth != null || rightRelativeMonth != null) {
          return (leftRelativeMonth == null ? Number.MAX_SAFE_INTEGER : leftRelativeMonth)
            - (rightRelativeMonth == null ? Number.MAX_SAFE_INTEGER : rightRelativeMonth);
        }

        const leftDate = normalizeString(left.date);
        const rightDate = normalizeString(right.date);
        if (leftDate !== rightDate) {
          return leftDate.localeCompare(rightDate);
        }

        return normalizeString(left.shortLabel || left.label || left.id)
          .localeCompare(normalizeString(right.shortLabel || right.label || right.id));
      });
  }

  function evaluateIncomeImpactWarningEvents(input) {
    const safeInput = isPlainObject(input) ? input : {};
    const risks = [];
    const stable = [];
    const dataGaps = [];
    const trace = {
      evaluatedDefinitions: [],
      deferredDefinitions: [],
      source: "income-impact-warning-events-library"
    };

    function addEvent(definitionId, options) {
      const event = createEvent(definitionId, options);
      if (!event) {
        return;
      }
      trace.evaluatedDefinitions.push(definitionId);
      if (event.severity === INCOME_IMPACT_WARNING_SEVERITIES.stable) {
        stable.push(event);
      } else if (RISK_SEVERITIES.includes(event.severity)) {
        risks.push(event);
      }
    }

    const deathEvent = getTimelineEvent(safeInput, "death");
    const deathDate = getPath(safeInput, "scenarioTimeline.scenario.deathDate") || deathEvent?.date || null;
    if (deathDate) {
      addEvent("deathEvent", {
        date: deathDate,
        age: getPath(safeInput, "scenarioTimeline.scenario.deathAge") || deathEvent?.age || null,
        relativeMonthIndex: 0,
        sourcePaths: ["scenarioTimeline.scenario.deathDate"]
      });
    }

    const existingCoverage = toOptionalNumber(getPath(safeInput, "financialRunway.existingCoverage"));
    if (existingCoverage != null && existingCoverage > 0) {
      addEvent("existingCoverageAvailable", {
        date: deathDate,
        relativeMonthIndex: 0,
        amount: existingCoverage,
        sourcePaths: ["financialRunway.existingCoverage"]
      });
    }

    const availableAssets = toOptionalNumber(getPath(safeInput, "financialRunway.availableAssets"));
    if (availableAssets != null && availableAssets > 0) {
      addEvent("liquidAssetsAvailable", {
        date: deathDate,
        relativeMonthIndex: 0,
        amount: availableAssets,
        sourcePaths: ["financialRunway.availableAssets"]
      });
    }

    const incomeStops = getTimelineEvent(safeInput, "incomeStops");
    const incomeStoppedAmount = toOptionalNumber(incomeStops?.amount);
    if (incomeStoppedAmount != null && incomeStoppedAmount > 0) {
      addEvent("primaryIncomeStops", {
        date: incomeStops.date || deathDate,
        age: incomeStops.age == null ? null : incomeStops.age,
        relativeMonthIndex: 0,
        amount: incomeStoppedAmount,
        sourcePaths: cloneArray(incomeStops.sourcePaths)
      });
    }

    const immediateObligations = toOptionalNumber(getPath(safeInput, "financialRunway.immediateObligations"));
    if (immediateObligations != null && immediateObligations > 0) {
      addEvent("immediateCashNeed", {
        date: deathDate,
        relativeMonthIndex: 0,
        amount: immediateObligations,
        sourcePaths: ["financialRunway.immediateObligations"]
      });
    }

    const finalExpenses = getTimelineEvent(safeInput, "finalExpensesDue");
    if (toOptionalNumber(finalExpenses?.amount) != null && toOptionalNumber(finalExpenses.amount) > 0) {
      addEvent("finalExpensesDue", {
        date: finalExpenses.date || deathDate,
        relativeMonthIndex: 0,
        amount: finalExpenses.amount,
        sourcePaths: cloneArray(finalExpenses.sourcePaths)
      });
    }

    const debtPayoff = getTimelineEvent(safeInput, "debtObligation");
    if (toOptionalNumber(debtPayoff?.amount) != null && toOptionalNumber(debtPayoff.amount) > 0) {
      addEvent("debtPayoffDue", {
        date: debtPayoff.date || deathDate,
        relativeMonthIndex: 0,
        amount: debtPayoff.amount,
        sourcePaths: cloneArray(debtPayoff.sourcePaths)
      });
    }

    const survivorIncomeDelayMonths = toOptionalNumber(getPath(safeInput, "lensModel.survivorScenario.survivorIncomeStartDelayMonths"));
    if (survivorIncomeDelayMonths != null && survivorIncomeDelayMonths > 0) {
      addEvent("survivorIncomeDelayed", {
        date: deathDate,
        relativeMonthIndex: survivorIncomeDelayMonths,
        amount: survivorIncomeDelayMonths,
        sourcePaths: ["survivorScenario.survivorIncomeStartDelayMonths"]
      });
    }

    const annualShortfall = toOptionalNumber(getPath(safeInput, "financialRunway.annualShortfall"));
    if (annualShortfall != null && annualShortfall > 0) {
      addEvent("monthlyBudgetDeficitBegins", {
        date: deathDate,
        relativeMonthIndex: 0,
        amount: annualShortfall,
        sourcePaths: ["financialRunway.annualShortfall"]
      });
    }

    const belowHalfPoint = findFirstPointBelowHalf(safeInput);
    if (belowHalfPoint) {
      addEvent("resourcesFallBelow50Percent", {
        date: belowHalfPoint.date || null,
        age: belowHalfPoint.age == null ? null : belowHalfPoint.age,
        relativeMonthIndex: getPointRelativeMonth(belowHalfPoint),
        amount: getPointBalance(belowHalfPoint),
        sourcePaths: cloneArray(belowHalfPoint.sourcePaths)
      });
    }

    const oneYearPoint = findFirstPointAtOrBelowRemainingMonths(safeInput, 12);
    if (oneYearPoint) {
      addEvent("oneYearOfSupportRemaining", {
        date: oneYearPoint.date || null,
        age: oneYearPoint.age == null ? null : oneYearPoint.age,
        relativeMonthIndex: getPointRelativeMonth(oneYearPoint),
        amount: getPointBalance(oneYearPoint),
        sourcePaths: cloneArray(oneYearPoint.sourcePaths)
      });
    }

    const sixMonthPoint = findFirstPointAtOrBelowRemainingMonths(safeInput, 6);
    if (sixMonthPoint) {
      addEvent("sixMonthsOfSupportRemaining", {
        date: sixMonthPoint.date || null,
        age: sixMonthPoint.age == null ? null : sixMonthPoint.age,
        relativeMonthIndex: getPointRelativeMonth(sixMonthPoint),
        amount: getPointBalance(sixMonthPoint),
        sourcePaths: cloneArray(sixMonthPoint.sourcePaths)
      });
    }

    const depletedPoint = findDepletedPoint(safeInput);
    const depletionDate = getPath(safeInput, "financialRunway.depletionDate") || depletedPoint?.date || null;
    if (depletionDate) {
      addEvent("resourcesDepleted", {
        date: depletionDate,
        age: depletedPoint?.age == null ? null : depletedPoint.age,
        relativeMonthIndex: getPointRelativeMonth(depletedPoint),
        amount: 0,
        sourcePaths: ["financialRunway.depletionDate"]
      });
    }

    const runwayStatus = normalizeString(getPath(safeInput, "financialRunway.status"));
    if (runwayStatus === "partial-estimate") {
      addEvent("partialEstimateOnly", {
        date: deathDate,
        relativeMonthIndex: 0,
        dataGaps: cloneArray(safeInput.dataGaps),
        sourcePaths: ["financialRunway.status", "dataGaps"]
      });
    }
    if (runwayStatus === "no-shortfall") {
      addEvent("noShortfall", {
        date: deathDate,
        relativeMonthIndex: 0,
        sourcePaths: ["financialRunway.status"]
      });
    }

    const criticalDataGaps = getCriticalDataGaps(safeInput);
    if (criticalDataGaps.length) {
      dataGaps.push(...criticalDataGaps.map(function (gap) {
        return {
          code: gap.code || null,
          label: gap.label || gap.code || "Additional profile information is needed.",
          sourcePaths: cloneArray(gap.sourcePaths)
        };
      }));
      addEvent("majorDataGap", {
        date: deathDate,
        relativeMonthIndex: 0,
        dataGaps: criticalDataGaps,
        sourcePaths: ["dataGaps"]
      });
    }

    [
      "housingPaymentAtRisk",
      "educationWindowOpens",
      "educationFundingAtRisk",
      "dependentSupportGapBegins",
      "emergencyReserveExhausted",
      "householdSupportAtRisk"
    ].forEach(function (definitionId) {
      if (!trace.evaluatedDefinitions.includes(definitionId)) {
        trace.deferredDefinitions.push(definitionId);
      }
    });

    return {
      risks: sortIncomeImpactWarningEvents(risks),
      stable: sortIncomeImpactWarningEvents(stable),
      dataGaps,
      trace
    };
  }

  lensAnalysis.INCOME_IMPACT_WARNING_SEVERITIES = INCOME_IMPACT_WARNING_SEVERITIES;
  lensAnalysis.INCOME_IMPACT_WARNING_EVENT_DEFINITIONS = INCOME_IMPACT_WARNING_EVENT_DEFINITIONS;
  lensAnalysis.evaluateIncomeImpactWarningEvents = evaluateIncomeImpactWarningEvents;
  lensAnalysis.sortIncomeImpactWarningEvents = sortIncomeImpactWarningEvents;
})(typeof globalThis !== "undefined" ? globalThis : this);
