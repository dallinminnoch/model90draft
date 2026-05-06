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
      id: "depletion-within-24-months",
      category: "runway",
      severity: "at-risk",
      priority: 45,
      phase: "postDeath",
      predicateId: "depletion-within-months",
      params: {
        months: 24
      },
      title: "Resources deplete within 24 months",
      summaryTemplate: "Resources are projected to cover {timelineFacts.monthsCovered} months.",
      markerLabel: "24 months",
      evidencePaths: [
        "timelineFacts.monthsCovered",
        "timelineFacts.depletionDate",
        "postDeathSeries.depletion"
      ],
      sourcePaths: ["timelineFacts.monthsCovered"],
      enabled: true
    }),
    freezeRule({
      id: "low-runway-duration",
      category: "runway",
      severity: "caution",
      priority: 58,
      phase: "postDeath",
      predicateId: "depletion-within-months",
      params: {
        months: 36
      },
      title: "Runway duration is limited",
      summaryTemplate: "Resources are projected to cover {timelineFacts.monthsCovered} months before depletion.",
      markerLabel: "Low runway",
      evidencePaths: [
        "timelineFacts.monthsCovered",
        "timelineFacts.depletionDate",
        "postDeathSeries.depletion"
      ],
      sourcePaths: ["timelineFacts.monthsCovered"],
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
      id: "resources-remain-through-horizon",
      category: "runway",
      severity: "stable",
      priority: 85,
      phase: "postDeath",
      predicateId: "depletion-not-depleted",
      title: "Resources remain through the horizon",
      summaryTemplate: "Resources are not projected to deplete within the selected horizon.",
      markerLabel: "Not depleted",
      evidencePaths: [
        "postDeathSeries.depletion",
        "timelineFacts.monthsCovered"
      ],
      sourcePaths: ["postDeathSeries.depletion"],
      enabled: true
    }),
    freezeRule({
      id: "scenario-complete",
      category: "dataQuality",
      severity: "stable",
      priority: 90,
      phase: "dataQuality",
      predicateId: "status-equals",
      params: {
        path: "status",
        value: "complete"
      },
      title: "Scenario inputs are complete",
      summaryTemplate: "Scenario status is {status}.",
      markerLabel: "Complete",
      evidencePaths: [
        "status"
      ],
      sourcePaths: ["status"],
      enabled: true
    }),
    freezeRule({
      id: "missing-survivor-net-income",
      category: "income",
      severity: "caution",
      priority: 110,
      phase: "postDeath",
      predicateId: "issue-code-present",
      params: {
        path: "dataGaps",
        codes: [
          "missing-survivor-net-income",
          "missing-mature-net-survivor-income"
        ]
      },
      title: "Survivor net income needs review",
      summaryTemplate: "Survivor net income is missing from the setup inputs for the after-death runway.",
      markerLabel: "Income input",
      evidencePaths: [
        "dataGaps",
        "postDeathSeries.depletion"
      ],
      sourcePaths: [
        "lensModel.survivorScenario.survivorNetAnnualIncome",
        "survivorIncomeStreams"
      ],
      enabled: true
    }),
    freezeRule({
      id: "missing-final-expense-estimate",
      category: "obligations",
      severity: "caution",
      priority: 120,
      phase: "deathEvent",
      predicateId: "issue-code-present",
      params: {
        path: "dataGaps",
        codes: [
          "missing-final-expenses"
        ]
      },
      title: "Final expense estimate is missing",
      summaryTemplate: "Final expenses are not available for the death-event obligation estimate.",
      markerLabel: "Final expenses",
      evidencePaths: [
        "dataGaps",
        "deathEvent.immediateObligations",
        "deathEvent.resourcesAfterObligations"
      ],
      sourcePaths: ["deathEvent.layer2.immediateObligations.finalExpenses"],
      enabled: true
    }),
    freezeRule({
      id: "missing-transition-needs-estimate",
      category: "obligations",
      severity: "caution",
      priority: 130,
      phase: "deathEvent",
      predicateId: "issue-code-present",
      params: {
        path: "dataGaps",
        codes: [
          "missing-transition-needs"
        ]
      },
      title: "Transition needs estimate is missing",
      summaryTemplate: "Transition needs are not available for the death-event obligation estimate.",
      markerLabel: "Transition needs",
      evidencePaths: [
        "dataGaps",
        "deathEvent.immediateObligations",
        "deathEvent.resourcesAfterObligations"
      ],
      sourcePaths: ["deathEvent.layer2.immediateObligations.transitionNeeds"],
      enabled: true
    }),
    freezeRule({
      id: "asset-treatment-defaulted",
      category: "assetTreatment",
      severity: "caution",
      priority: 140,
      phase: "deathEvent",
      predicateId: "warning-code-present",
      params: {
        path: "warnings",
        codes: [
          "asset-treatment-assumptions-defaulted"
        ]
      },
      title: "Asset treatment defaults applied",
      summaryTemplate: "Saved asset-treatment assumptions were unavailable, so default treatment was applied and should be reviewed.",
      markerLabel: "Asset defaults",
      evidencePaths: [
        "warnings",
        "deathEvent.layer2.trace.assetTreatmentAssumptions",
        "deathEvent.survivorAvailableTreatedAssets"
      ],
      sourcePaths: [
        "warnings",
        "deathEvent.layer2.trace.assetTreatmentAssumptions"
      ],
      enabled: true
    }),
    freezeRule({
      id: "composer-status-partial",
      category: "dataQuality",
      severity: "caution",
      priority: 900,
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
      priority: 910,
      phase: "dataQuality",
      predicateId: "issue-code-present",
      params: {
        path: "dataGaps",
        excludeCodes: [
          "missing-survivor-net-income",
          "missing-mature-net-survivor-income",
          "missing-final-expenses",
          "missing-transition-needs"
        ]
      },
      title: "Additional setup gaps remain",
      summaryTemplate: "Scenario has additional data gaps that should be reviewed.",
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
