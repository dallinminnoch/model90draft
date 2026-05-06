(function (global) {
  const LensApp = global.LensApp || (global.LensApp = {});
  const lensAnalysis = LensApp.lensAnalysis || (LensApp.lensAnalysis = {});

  const RULES_VERSION = "income-impact-caution-rules-v1";

  function freezeRule(rule) {
    return Object.freeze({
      id: rule.id,
      category: rule.category,
      severity: rule.severity,
      priority: rule.priority,
      phase: rule.phase,
      predicateId: rule.predicateId,
      params: Object.freeze({ ...(rule.params || {}) }),
      title: rule.title,
      summaryTemplate: rule.summaryTemplate || null,
      summary: rule.summary || null,
      markerLabel: rule.markerLabel,
      evidencePaths: Object.freeze((rule.evidencePaths || []).slice()),
      sourcePaths: Object.freeze((rule.sourcePaths || []).slice()),
      enabled: rule.enabled !== false,
      rulesVersion: RULES_VERSION
    });
  }

  const incomeImpactCautionRules = Object.freeze([
    freezeRule({
      id: "resources-after-obligations-negative-or-zero",
      category: "resources",
      severity: "critical",
      priority: 10,
      phase: "deathEvent",
      predicateId: "number-less-than-or-equal",
      params: {
        path: "timelineFacts.resourcesAfterObligations",
        threshold: 0
      },
      title: "No resources after obligations",
      summaryTemplate: "Resources after obligations are {timelineFacts.resourcesAfterObligations}.",
      markerLabel: "No resources",
      evidencePaths: [
        "timelineFacts.resourcesAfterObligations",
        "deathEvent.resourcesAfterObligations",
        "deathEvent.immediateObligations"
      ],
      sourcePaths: ["timelineFacts.resourcesAfterObligations"],
      enabled: true
    }),
    freezeRule({
      id: "survivor-resources-depleted",
      category: "runway",
      severity: "critical",
      priority: 20,
      phase: "postDeath",
      predicateId: "depletion-is-true",
      title: "Survivor resources deplete",
      summaryTemplate: "Resources deplete on {timelineFacts.depletionDate}.",
      markerLabel: "Depleted",
      evidencePaths: [
        "postDeathSeries.depletion",
        "timelineFacts.depletionDate",
        "timelineFacts.monthsCovered"
      ],
      sourcePaths: ["postDeathSeries.depletion"],
      enabled: true
    }),
    freezeRule({
      id: "depletion-within-6-months",
      category: "runway",
      severity: "critical",
      priority: 30,
      phase: "postDeath",
      predicateId: "depletion-within-months",
      params: {
        months: 6
      },
      title: "Resources deplete within 6 months",
      summaryTemplate: "Resources are projected to cover {timelineFacts.monthsCovered} months.",
      markerLabel: "6 months",
      evidencePaths: [
        "timelineFacts.monthsCovered",
        "timelineFacts.depletionDate",
        "postDeathSeries.depletion"
      ],
      sourcePaths: ["timelineFacts.monthsCovered"],
      enabled: true
    }),
    freezeRule({
      id: "depletion-within-12-months",
      category: "runway",
      severity: "at-risk",
      priority: 40,
      phase: "postDeath",
      predicateId: "depletion-within-months",
      params: {
        months: 12
      },
      title: "Resources deplete within 12 months",
      summaryTemplate: "Resources are projected to cover {timelineFacts.monthsCovered} months.",
      markerLabel: "12 months",
      evidencePaths: [
        "timelineFacts.monthsCovered",
        "timelineFacts.depletionDate",
        "postDeathSeries.depletion"
      ],
      sourcePaths: ["timelineFacts.monthsCovered"],
      enabled: true
    }),
    freezeRule({
      id: "accumulated-unmet-need",
      category: "runway",
      severity: "at-risk",
      priority: 50,
      phase: "postDeath",
      predicateId: "number-greater-than",
      params: {
        path: "timelineFacts.accumulatedUnmetNeed",
        threshold: 0
      },
      title: "Unmet need accumulates",
      summaryTemplate: "Accumulated unmet need is {timelineFacts.accumulatedUnmetNeed}.",
      markerLabel: "Unmet need",
      evidencePaths: [
        "timelineFacts.accumulatedUnmetNeed",
        "postDeathSeries.summary.accumulatedUnmetNeed"
      ],
      sourcePaths: ["timelineFacts.accumulatedUnmetNeed"],
      enabled: true
    }),
    freezeRule({
      id: "immediate-obligations-reduce-resources",
      category: "obligations",
      severity: "caution",
      priority: 60,
      phase: "deathEvent",
      predicateId: "number-greater-than",
      params: {
        path: "deathEvent.immediateObligations",
        threshold: 0
      },
      title: "Immediate obligations reduce resources",
      summaryTemplate: "Immediate obligations reduce available resources by {deathEvent.immediateObligations}.",
      markerLabel: "Obligations",
      evidencePaths: [
        "deathEvent.immediateObligations",
        "deathEvent.resourcesAfterObligations"
      ],
      sourcePaths: ["deathEvent.immediateObligations"],
      enabled: true
    }),
    freezeRule({
      id: "coverage-added-at-death",
      category: "coverage",
      severity: "stable",
      priority: 70,
      phase: "deathEvent",
      predicateId: "number-greater-than",
      params: {
        path: "deathEvent.coverageAdded",
        threshold: 0
      },
      title: "Coverage added at death",
      summaryTemplate: "Coverage added at death is {deathEvent.coverageAdded}.",
      markerLabel: "Coverage",
      evidencePaths: [
        "deathEvent.coverageAdded",
        "timelineFacts.coverageAdded"
      ],
      sourcePaths: ["deathEvent.coverageAdded"],
      enabled: true
    }),
    freezeRule({
      id: "treated-assets-available-at-death",
      category: "resources",
      severity: "stable",
      priority: 80,
      phase: "deathEvent",
      predicateId: "number-greater-than",
      params: {
        path: "deathEvent.survivorAvailableTreatedAssets",
        threshold: 0
      },
      title: "Treated assets available at death",
      summaryTemplate: "Treated assets available at death are {deathEvent.survivorAvailableTreatedAssets}.",
      markerLabel: "Assets",
      evidencePaths: [
        "deathEvent.survivorAvailableTreatedAssets",
        "timelineFacts.survivorAvailableTreatedAssets"
      ],
      sourcePaths: ["deathEvent.survivorAvailableTreatedAssets"],
      enabled: true
    }),
    freezeRule({
      id: "composer-status-partial",
      category: "dataQuality",
      severity: "caution",
      priority: 90,
      phase: "dataQuality",
      predicateId: "status-not-complete",
      params: {
        path: "status"
      },
      title: "Scenario is partial",
      summaryTemplate: "Scenario status is {status}.",
      markerLabel: "Partial",
      evidencePaths: [
        "status",
        "dataGaps"
      ],
      sourcePaths: ["status"],
      enabled: true
    }),
    freezeRule({
      id: "major-composer-data-gaps",
      category: "dataQuality",
      severity: "caution",
      priority: 100,
      phase: "dataQuality",
      predicateId: "array-has-entries",
      params: {
        path: "dataGaps"
      },
      title: "Scenario has data gaps",
      summaryTemplate: "Scenario has {dataGaps.length} data gap entries.",
      markerLabel: "Data gaps",
      evidencePaths: [
        "dataGaps"
      ],
      sourcePaths: ["dataGaps"],
      enabled: true
    })
  ]);

  lensAnalysis.incomeImpactCautionRules = incomeImpactCautionRules;
})(typeof globalThis !== "undefined" ? globalThis : this);
