(function (global) {
  const LensApp = global.LensApp || (global.LensApp = {});
  const lensAnalysis = LensApp.lensAnalysis || (LensApp.lensAnalysis = {});

  const HOUSEHOLD_EXPENSE_COMPRESSION_STAGE_POLICY_VERSION = 1;
  const STAGED_COMPRESSION_STAGE_TYPES = Object.freeze({
    REDUCTION: "reduction",
    PAUSE: "pause",
    INTERVENTION_WINDOW: "interventionWindow"
  });
  const STAGED_COMPRESSION_TRIGGER_MODES = Object.freeze({
    FIXED_MONTH_V1: "fixedMonthV1"
  });

  function freezeRule(row) {
    return Object.freeze({
      stageId: row.stageId,
      stageName: row.stageName,
      stageOrder: row.stageOrder,
      stageType: row.stageType,
      effectiveMonthAfterDeath: row.effectiveMonthAfterDeath,
      triggerMode: STAGED_COMPRESSION_TRIGGER_MODES.FIXED_MONTH_V1,
      decisionsAllowed: Object.freeze(row.decisionsAllowed.slice()),
      compressionOrderGroups: Object.freeze(row.compressionOrderGroups.slice()),
      maxActionsPerStage: row.maxActionsPerStage ?? null,
      actionOrder: "policyOrderRank",
      appliesMath: row.appliesMath === true,
      markerOnly: row.markerOnly === true,
      advisorEditableLater: true,
      notes: row.notes || null
    });
  }

  const householdExpenseCompressionStagePolicyRules = Object.freeze([
    freezeRule({
      stageId: "immediate-discretionary-compression",
      stageName: "Immediate discretionary compression",
      stageOrder: 1,
      stageType: STAGED_COMPRESSION_STAGE_TYPES.REDUCTION,
      effectiveMonthAfterDeath: 1,
      decisionsAllowed: ["YES"],
      compressionOrderGroups: [
        "earlyDiscretionary",
        "travelLifestyle",
        "foodLifestyleBeforeGroceries"
      ],
      appliesMath: true,
      markerOnly: false,
      notes: "First staged expense step-down for discretionary, travel, dining, takeout, and lifestyle spending."
    }),
    freezeRule({
      stageId: "contribution-pauses",
      stageName: "Contribution pauses",
      stageOrder: 2,
      stageType: STAGED_COMPRESSION_STAGE_TYPES.PAUSE,
      effectiveMonthAfterDeath: 2,
      decisionsAllowed: ["PAUSE"],
      compressionOrderGroups: ["pauseContributions"],
      appliesMath: true,
      markerOnly: false,
      notes: "Contribution pauses reduce cash-flow need only; existing assets and reserves are not liquidated."
    }),
    freezeRule({
      stageId: "flexible-lifestyle-services",
      stageName: "Flexible lifestyle services",
      stageOrder: 3,
      stageType: STAGED_COMPRESSION_STAGE_TYPES.REDUCTION,
      effectiveMonthAfterDeath: 3,
      decisionsAllowed: ["YES"],
      compressionOrderGroups: ["flexibleLifestyleServices"],
      appliesMath: true,
      markerOnly: false,
      notes: "Flexible services step down after early discretionary reductions and contribution pauses."
    }),
    freezeRule({
      stageId: "flexible-essentials-compression",
      stageName: "Flexible essentials compression",
      stageOrder: 4,
      stageType: STAGED_COMPRESSION_STAGE_TYPES.REDUCTION,
      effectiveMonthAfterDeath: 6,
      decisionsAllowed: ["YES"],
      compressionOrderGroups: ["flexibleEssentials"],
      appliesMath: true,
      markerOnly: false,
      notes: "Later step-down for flexible essentials that may require more household adjustment time."
    }),
    freezeRule({
      stageId: "groceries-protected-flexible-compression",
      stageName: "Groceries and protected flexible compression",
      stageOrder: 5,
      stageType: STAGED_COMPRESSION_STAGE_TYPES.REDUCTION,
      effectiveMonthAfterDeath: 9,
      decisionsAllowed: ["YES"],
      compressionOrderGroups: ["groceriesAndProtectedFlexibleEssentials"],
      appliesMath: true,
      markerOnly: false,
      notes: "Groceries remain one-tier and floor-protected through the supplied reduction amount; the staged helper does not recompute thresholds or cliff-drop grocery spend."
    }),
    freezeRule({
      stageId: "transportation-utilities-pets-financial-leakage",
      stageName: "Transportation, utilities, pets, and financial leakage",
      stageOrder: 6,
      stageType: STAGED_COMPRESSION_STAGE_TYPES.REDUCTION,
      effectiveMonthAfterDeath: 12,
      decisionsAllowed: ["YES"],
      compressionOrderGroups: [
        "transportationFlex",
        "utilitiesBasicServices",
        "pets",
        "financialLeakage"
      ],
      appliesMath: true,
      markerOnly: false,
      notes: "Late flexible spending and fee cleanup stage; protected NO rows in these groups remain non-math."
    }),
    freezeRule({
      stageId: "intervention-window-candidates",
      stageName: "Intervention window candidates",
      stageOrder: 7,
      stageType: STAGED_COMPRESSION_STAGE_TYPES.INTERVENTION_WINDOW,
      effectiveMonthAfterDeath: 12,
      decisionsAllowed: ["INTERVENTION"],
      compressionOrderGroups: [
        "healthcareProtected",
        "childcareAndDependentSupport",
        "education",
        "valuesSensitiveGiving",
        "protectionInsurance",
        "taxesAndLegal",
        "debtObligations",
        "businessIncomePreserving",
        "housingProtected",
        "majorInterventions"
      ],
      appliesMath: false,
      markerOnly: true,
      notes: "Future intervention windows are marker-only in V1; they do not apply expense math or crisis wording."
    })
  ]);

  function cloneStageRule(rule) {
    return {
      stageId: rule.stageId,
      stageName: rule.stageName,
      stageOrder: rule.stageOrder,
      stageType: rule.stageType,
      effectiveMonthAfterDeath: rule.effectiveMonthAfterDeath,
      triggerMode: rule.triggerMode,
      decisionsAllowed: rule.decisionsAllowed.slice(),
      compressionOrderGroups: rule.compressionOrderGroups.slice(),
      maxActionsPerStage: rule.maxActionsPerStage,
      actionOrder: rule.actionOrder,
      appliesMath: rule.appliesMath,
      markerOnly: rule.markerOnly,
      advisorEditableLater: rule.advisorEditableLater,
      notes: rule.notes
    };
  }

  function getHouseholdExpenseCompressionStagePolicyRules() {
    return householdExpenseCompressionStagePolicyRules.map(cloneStageRule);
  }

  function getHouseholdExpenseCompressionStagePolicyById(stageId) {
    const normalizedStageId = String(stageId == null ? "" : stageId).trim();
    if (!normalizedStageId) {
      return null;
    }

    const rule = householdExpenseCompressionStagePolicyRules.find(function (candidate) {
      return candidate.stageId === normalizedStageId;
    });
    return rule ? cloneStageRule(rule) : null;
  }

  lensAnalysis.householdExpenseCompressionStagePolicy = Object.freeze({
    HOUSEHOLD_EXPENSE_COMPRESSION_STAGE_POLICY_VERSION,
    STAGED_COMPRESSION_STAGE_TYPES,
    STAGED_COMPRESSION_TRIGGER_MODES,
    householdExpenseCompressionStagePolicyRules,
    getHouseholdExpenseCompressionStagePolicyRules,
    getHouseholdExpenseCompressionStagePolicyById
  });
})(typeof globalThis !== "undefined" ? globalThis : this);
