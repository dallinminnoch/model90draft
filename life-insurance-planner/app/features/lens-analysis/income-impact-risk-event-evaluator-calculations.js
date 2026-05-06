(function (global) {
  const LensApp = global.LensApp || (global.LensApp = {});
  const lensAnalysis = LensApp.lensAnalysis || (LensApp.lensAnalysis = {});

  const CALCULATION_METHOD = "income-impact-risk-event-evaluator-v1";
  const DEFAULT_RULES_VERSION = "income-impact-caution-rules-v1";
  const RISK_SEVERITIES = Object.freeze(["critical", "at-risk", "caution"]);
  const SEVERITY_SORT_ORDER = Object.freeze({
    critical: 0,
    "at-risk": 1,
    caution: 2,
    stable: 3
  });
  const PHASE_SORT_ORDER = Object.freeze({
    preDeath: 0,
    deathEvent: 1,
    postDeath: 2,
    dataQuality: 3
  });

  function isPlainObject(value) {
    return Boolean(value && typeof value === "object" && !Array.isArray(value));
  }

  function normalizeString(value) {
    return String(value == null ? "" : value).trim();
  }

  function normalizeStatus(value) {
    return normalizeString(value).toLowerCase();
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
      if (Array.isArray(current) && key === "length") {
        return current.length;
      }
      return current[key];
    }, source);
  }

  function isValidSeverity(severity) {
    return RISK_SEVERITIES.includes(severity) || severity === "stable";
  }

  function isValidRule(rule) {
    return isPlainObject(rule)
      && Boolean(normalizeString(rule.id))
      && Boolean(normalizeString(rule.category))
      && isValidSeverity(normalizeString(rule.severity))
      && Boolean(normalizeString(rule.phase))
      && Boolean(normalizeString(rule.predicateId))
      && Boolean(normalizeString(rule.title));
  }

  function getRules(inputRules) {
    if (Array.isArray(inputRules)) {
      return inputRules;
    }
    return Array.isArray(lensAnalysis.incomeImpactCautionRules)
      ? lensAnalysis.incomeImpactCautionRules
      : [];
  }

  function getRulesVersion(rules) {
    const firstVersion = (Array.isArray(rules) ? rules : [])
      .map(function (rule) {
        return normalizeString(rule?.rulesVersion);
      })
      .find(Boolean);
    return firstVersion || DEFAULT_RULES_VERSION;
  }

  function getEvidencePaths(rule) {
    const explicit = Array.isArray(rule?.evidencePaths) ? rule.evidencePaths : [];
    const predicatePath = rule?.params?.path ? [rule.params.path] : [];
    return uniqueStrings(explicit.concat(predicatePath));
  }

  function collectDataGapSourcePaths(scenario) {
    const sourcePaths = [];
    (Array.isArray(scenario?.dataGaps) ? scenario.dataGaps : []).forEach(function (dataGap) {
      appendUnique(sourcePaths, dataGap?.sourcePaths);
    });
    return sourcePaths;
  }

  function buildEvidence(scenario, rule) {
    return getEvidencePaths(rule).map(function (path) {
      return {
        path,
        value: clonePlainValue(getPath(scenario, path))
      };
    });
  }

  function getEvidenceValue(evidence, path) {
    const item = evidence.find(function (entry) {
      return entry.path === path;
    });
    return item ? item.value : undefined;
  }

  function formatEvidenceValue(value) {
    if (value == null) {
      return "not available";
    }
    if (typeof value === "number" && Number.isFinite(value)) {
      return String(value);
    }
    if (typeof value === "boolean") {
      return value ? "true" : "false";
    }
    if (Array.isArray(value)) {
      return String(value.length);
    }
    if (isPlainObject(value)) {
      return JSON.stringify(value);
    }
    return normalizeString(value);
  }

  function renderSummary(rule, evidence) {
    const template = normalizeString(rule.summaryTemplate || rule.summary);
    if (!template) {
      return normalizeString(rule.title);
    }

    return template.replace(/\{([^}]+)\}/g, function (_match, token) {
      const rawToken = normalizeString(token);
      if (rawToken.endsWith(".length")) {
        const sourcePath = rawToken.slice(0, -7);
        const sourceValue = getEvidenceValue(evidence, sourcePath);
        return Array.isArray(sourceValue) ? String(sourceValue.length) : "0";
      }
      return formatEvidenceValue(getEvidenceValue(evidence, rawToken));
    });
  }

  function getDepletion(scenario) {
    return isPlainObject(scenario?.postDeathSeries?.depletion)
      ? scenario.postDeathSeries.depletion
      : {};
  }

  function evaluatePredicate(scenario, rule) {
    const predicateId = normalizeString(rule.predicateId);
    const params = isPlainObject(rule.params) ? rule.params : {};

    if (predicateId === "number-less-than-or-equal") {
      const value = toOptionalNumber(getPath(scenario, params.path));
      const threshold = toOptionalNumber(params.threshold);
      return {
        known: value != null && threshold != null,
        triggered: value != null && threshold != null && value <= threshold
      };
    }

    if (predicateId === "number-greater-than") {
      const value = toOptionalNumber(getPath(scenario, params.path));
      const threshold = toOptionalNumber(params.threshold);
      return {
        known: value != null && threshold != null,
        triggered: value != null && threshold != null && value > threshold
      };
    }

    if (predicateId === "depletion-is-true") {
      return {
        known: true,
        triggered: getDepletion(scenario).depleted === true
      };
    }

    if (predicateId === "depletion-within-months") {
      const depletion = getDepletion(scenario);
      const monthsCovered = toOptionalNumber(scenario?.timelineFacts?.monthsCovered ?? depletion.monthsCovered);
      const threshold = toOptionalNumber(params.months);
      return {
        known: threshold != null,
        triggered: depletion.depleted === true
          && monthsCovered != null
          && threshold != null
          && monthsCovered <= threshold
      };
    }

    if (predicateId === "status-not-complete") {
      return {
        known: true,
        triggered: normalizeStatus(getPath(scenario, params.path || "status")) !== "complete"
      };
    }

    if (predicateId === "array-has-entries") {
      const value = getPath(scenario, params.path);
      return {
        known: Array.isArray(value),
        triggered: Array.isArray(value) && value.length > 0
      };
    }

    return {
      known: false,
      triggered: false,
      unknownPredicate: true
    };
  }

  function resolveEventDate(scenario, rule) {
    if (rule.phase === "postDeath") {
      return scenario?.timelineFacts?.depletionDate
        || scenario?.postDeathSeries?.depletion?.depletionDate
        || null;
    }
    if (rule.phase === "deathEvent") {
      return scenario?.deathEvent?.date || scenario?.scenario?.selectedDeathDate || null;
    }
    return scenario?.scenario?.selectedDeathDate || null;
  }

  function resolveEventMonthIndex(scenario, rule) {
    if (rule.phase === "postDeath") {
      const depletionMonthIndex = toOptionalNumber(scenario?.postDeathSeries?.depletion?.depletionMonthIndex);
      if (depletionMonthIndex != null) {
        return depletionMonthIndex;
      }
      return toOptionalNumber(scenario?.timelineFacts?.monthsCovered);
    }
    if (rule.phase === "deathEvent") {
      return 0;
    }
    return null;
  }

  function buildEvent(scenario, rule) {
    const evidence = buildEvidence(scenario, rule);
    const sourcePaths = uniqueStrings(
      (Array.isArray(rule.sourcePaths) ? rule.sourcePaths : [])
        .concat(getEvidencePaths(rule))
        .concat(rule.id === "major-composer-data-gaps" ? collectDataGapSourcePaths(scenario) : [])
    );

    return {
      id: normalizeString(rule.id),
      ruleId: normalizeString(rule.id),
      category: normalizeString(rule.category),
      severity: normalizeString(rule.severity),
      title: normalizeString(rule.title),
      summary: renderSummary(rule, evidence),
      markerLabel: normalizeString(rule.markerLabel || rule.title),
      date: resolveEventDate(scenario, rule),
      monthIndex: resolveEventMonthIndex(scenario, rule),
      phase: normalizeString(rule.phase),
      priority: toOptionalNumber(rule.priority) ?? 999,
      evidence,
      sourcePaths,
      trace: {
        calculationMethod: CALCULATION_METHOD,
        predicateId: normalizeString(rule.predicateId),
        rulesVersion: normalizeString(rule.rulesVersion) || DEFAULT_RULES_VERSION
      }
    };
  }

  function compareNullableNumbers(left, right) {
    const leftNumber = toOptionalNumber(left);
    const rightNumber = toOptionalNumber(right);
    if (leftNumber == null && rightNumber == null) {
      return 0;
    }
    if (leftNumber == null) {
      return 1;
    }
    if (rightNumber == null) {
      return -1;
    }
    return leftNumber - rightNumber;
  }

  function compareStrings(left, right) {
    return normalizeString(left).localeCompare(normalizeString(right));
  }

  function sortRiskEvents(events) {
    return events.slice().sort(function (left, right) {
      const severityDiff = (SEVERITY_SORT_ORDER[left.severity] ?? 99) - (SEVERITY_SORT_ORDER[right.severity] ?? 99);
      if (severityDiff !== 0) {
        return severityDiff;
      }

      const priorityDiff = compareNullableNumbers(left.priority, right.priority);
      if (priorityDiff !== 0) {
        return priorityDiff;
      }

      const phaseDiff = (PHASE_SORT_ORDER[left.phase] ?? 99) - (PHASE_SORT_ORDER[right.phase] ?? 99);
      if (phaseDiff !== 0) {
        return phaseDiff;
      }

      const dateDiff = compareStrings(left.date, right.date);
      if (dateDiff !== 0) {
        return dateDiff;
      }

      const monthDiff = compareNullableNumbers(left.monthIndex, right.monthIndex);
      if (monthDiff !== 0) {
        return monthDiff;
      }

      return compareStrings(left.title || left.id, right.title || right.id);
    });
  }

  function sortStableEvents(events) {
    return events.slice().sort(function (left, right) {
      const phaseDiff = (PHASE_SORT_ORDER[left.phase] ?? 99) - (PHASE_SORT_ORDER[right.phase] ?? 99);
      if (phaseDiff !== 0) {
        return phaseDiff;
      }
      const priorityDiff = compareNullableNumbers(left.priority, right.priority);
      if (priorityDiff !== 0) {
        return priorityDiff;
      }
      return compareStrings(left.title || left.id, right.title || right.id);
    });
  }

  function evaluateIncomeImpactRiskEvents(input) {
    const safeInput = isPlainObject(input) ? input : {};
    const scenario = safeInput.scenario;
    const rules = getRules(safeInput.cautionRules);
    const events = [];
    const stableEvents = [];
    const warnings = [];
    const dataGaps = [];
    const trace = {
      calculationMethod: CALCULATION_METHOD,
      rulesVersion: getRulesVersion(rules),
      evaluatedRuleIds: [],
      triggeredRuleIds: [],
      skippedRuleIds: [],
      predicateIds: [],
      noFinancialCalculationsPerformed: true,
      statement: "No financial calculations were performed; this helper interprets the composed scenario contract."
    };

    if (!isPlainObject(scenario)) {
      dataGaps.push(makeIssue(
        "missing-scenario",
        "A composed Income Impact scenario is required before risk events can be evaluated.",
        ["scenario"]
      ));
      return {
        status: "partial",
        events: [],
        stableEvents: [],
        warnings,
        dataGaps,
        trace
      };
    }

    rules.forEach(function (rule, index) {
      const ruleId = normalizeString(rule?.id) || `rule-${index + 1}`;
      if (!isPlainObject(rule) || !isValidRule(rule)) {
        trace.skippedRuleIds.push(ruleId);
        warnings.push(makeIssue(
          "malformed-caution-rule-skipped",
          "A caution rule was skipped because required rule fields were missing or invalid.",
          [`cautionRules.${index}`],
          { ruleId }
        ));
        return;
      }

      if (rule.enabled === false) {
        trace.skippedRuleIds.push(ruleId);
        return;
      }

      trace.evaluatedRuleIds.push(ruleId);
      appendUnique(trace.predicateIds, [rule.predicateId]);
      const predicateResult = evaluatePredicate(scenario, rule);

      if (predicateResult.unknownPredicate) {
        trace.skippedRuleIds.push(ruleId);
        warnings.push(makeIssue(
          "unknown-predicate-skipped",
          "A caution rule was skipped because its predicateId is not supported by the evaluator.",
          [`cautionRules.${index}.predicateId`],
          {
            ruleId,
            predicateId: rule.predicateId
          }
        ));
        return;
      }

      if (!predicateResult.known || !predicateResult.triggered) {
        return;
      }

      trace.triggeredRuleIds.push(ruleId);
      const event = buildEvent(scenario, rule);
      if (event.severity === "stable") {
        stableEvents.push(event);
      } else if (RISK_SEVERITIES.includes(event.severity)) {
        events.push(event);
      }
    });

    return {
      status: dataGaps.length || warnings.length ? "partial" : "complete",
      events: sortRiskEvents(events),
      stableEvents: sortStableEvents(stableEvents),
      warnings,
      dataGaps,
      trace: {
        ...trace,
        evaluatedRuleIds: uniqueStrings(trace.evaluatedRuleIds),
        triggeredRuleIds: uniqueStrings(trace.triggeredRuleIds),
        skippedRuleIds: uniqueStrings(trace.skippedRuleIds),
        predicateIds: uniqueStrings(trace.predicateIds)
      }
    };
  }

  lensAnalysis.evaluateIncomeImpactRiskEvents = evaluateIncomeImpactRiskEvents;
})(typeof globalThis !== "undefined" ? globalThis : this);
