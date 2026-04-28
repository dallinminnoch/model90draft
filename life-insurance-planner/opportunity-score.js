// CODE NOTE: Shared Client Directory close index engine.
// Centralize edits here if the Close Index formula needs tuning later.
(function (global) {
  "use strict";

  if (global.LipOpportunityScore && typeof global.LipOpportunityScore.calculate === "function") {
    return;
  }

  function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
  }

  function parseNumeric(value) {
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }

    const normalized = String(value ?? "").replace(/[^\d.-]/g, "");
    const numeric = Number(normalized);
    return Number.isFinite(numeric) ? numeric : 0;
  }

  function parseDate(value) {
    const rawValue = String(value || "").trim();
    if (!rawValue) {
      return null;
    }

    const normalized = /T/.test(rawValue) ? rawValue : `${rawValue}T00:00:00`;
    const parsed = new Date(normalized);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  function getLatestProtectionModelingPayload(record) {
    if (!record || typeof record !== "object") {
      return null;
    }

    if (record.protectionModeling && typeof record.protectionModeling === "object") {
      return record.protectionModeling;
    }

    if (Array.isArray(record.protectionModelingEntries) && record.protectionModelingEntries.length) {
      return record.protectionModelingEntries[record.protectionModelingEntries.length - 1];
    }

    return null;
  }

  function getLatestProtectionModelingData(record) {
    const payload = getLatestProtectionModelingPayload(record);
    if (!payload || typeof payload !== "object") {
      return {};
    }

    return payload.data && typeof payload.data === "object"
      ? payload.data
      : payload;
  }

  function readNumberFromSources(record, modelingData, keys) {
    const sourceKeys = Array.isArray(keys) ? keys : [keys];
    for (let index = 0; index < sourceKeys.length; index += 1) {
      const key = sourceKeys[index];
      const modelingValue = parseNumeric(modelingData?.[key]);
      if (modelingValue > 0) {
        return modelingValue;
      }

      const recordValue = parseNumeric(record?.[key]);
      if (recordValue > 0) {
        return recordValue;
      }
    }

    return 0;
  }

  function deriveCurrentCoverage(record, modelingData, overrides) {
    if (Number.isFinite(overrides.currentCoverage)) {
      return Math.max(0, overrides.currentCoverage);
    }

    const modeledCoverageTotal = readNumberFromSources(record, modelingData, ["existingCoverageTotal"])
      || (
        readNumberFromSources(record, modelingData, ["individualDeathBenefit"])
        + readNumberFromSources(record, modelingData, ["groupLifeCoverage"])
        + readNumberFromSources(record, modelingData, ["currentCoverageAmount"])
        + readNumberFromSources(record, modelingData, ["currentLifeInsuranceCoverage"])
      );

    const explicitCoverage = Math.max(
      parseNumeric(record?.currentCoverage),
      parseNumeric(record?.coverageAmount)
    );

    const hasExplicitCoverage = record && typeof record === "object"
      && Object.prototype.hasOwnProperty.call(record, "currentCoverage");

    return hasExplicitCoverage
      ? Math.max(0, parseNumeric(record?.currentCoverage))
      : Math.max(0, modeledCoverageTotal, explicitCoverage);
  }

  function deriveModeledNeed(record, modelingData, overrides) {
    if (Number.isFinite(overrides.modeledNeed)) {
      return Math.max(0, overrides.modeledNeed);
    }

    const storedModeledNeed = Math.max(
      0,
      parseNumeric(record?.modeledNeed),
      parseNumeric(record?.coverageGap)
    );
    const hasStoredModeledNeed = record && typeof record === "object"
      && Object.prototype.hasOwnProperty.call(record, "modeledNeed");

    if (hasStoredModeledNeed) {
      return Math.max(0, parseNumeric(record?.modeledNeed));
    }

    return Math.max(
      0,
      storedModeledNeed,
      readNumberFromSources(record, modelingData, ["totalModeledNeed"]),
      readNumberFromSources(record, modelingData, ["totalNeed"]),
      readNumberFromSources(record, modelingData, ["totalCoverageNeed"]),
      readNumberFromSources(record, modelingData, ["totalDeathBenefitNeed"]),
      readNumberFromSources(record, modelingData, ["deathBenefitNeed"]),
      readNumberFromSources(record, modelingData, ["estimatedNeed"]),
      readNumberFromSources(record, modelingData, ["coverageNeed"]),
      readNumberFromSources(record, modelingData, ["coverageTarget"])
    );
  }

  function deriveUncoveredGap(record, currentCoverage, modeledNeed, overrides) {
    if (Number.isFinite(overrides.uncoveredGap)) {
      return Math.max(0, overrides.uncoveredGap);
    }

    const explicitUncoveredGap = parseNumeric(record?.uncoveredGap);
    const hasExplicitUncoveredGap = record && typeof record === "object"
      && Object.prototype.hasOwnProperty.call(record, "uncoveredGap");

    if (hasExplicitUncoveredGap) {
      return Math.max(0, explicitUncoveredGap);
    }

    return Math.max(0, modeledNeed - currentCoverage);
  }

  function getDaysBetween(date, now) {
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
      return null;
    }

    const difference = now.getTime() - date.getTime();
    if (!Number.isFinite(difference)) {
      return null;
    }

    return Math.max(0, Math.round(difference / 86400000));
  }

  function getScoreTier(score) {
    // CODE NOTE: Close Index display tiers are intentionally broad for quick table scanning.
    if (score > 70) {
      return "is-premium";
    }
    if (score >= 41) {
      return "is-building";
    }
    if (score >= 21) {
      return "is-caution";
    }
    return "is-risk";
  }

  function calculateOpportunitySizeScore(uncoveredGap) {
    if (uncoveredGap >= 2000000) {
      return 1;
    }
    if (uncoveredGap >= 1000000) {
      return 0.88;
    }
    if (uncoveredGap >= 500000) {
      return 0.74;
    }
    if (uncoveredGap >= 250000) {
      return 0.6;
    }
    if (uncoveredGap >= 100000) {
      return 0.45;
    }
    if (uncoveredGap >= 50000) {
      return 0.32;
    }
    if (uncoveredGap > 0) {
      return 0.2;
    }
    return 0;
  }

  function normalizeDependentCount(value) {
    return Math.max(0, Math.round(parseNumeric(value)));
  }

  function getStructuredDependentDetailsCount(record) {
    const dependentDetails = record?.dependentDetails;
    if (Array.isArray(dependentDetails)) {
      return dependentDetails.length;
    }

    if (typeof dependentDetails !== "string") {
      return null;
    }

    const normalizedDetails = dependentDetails.trim();
    if (!normalizedDetails) {
      return null;
    }

    try {
      const parsedDetails = JSON.parse(normalizedDetails);
      return Array.isArray(parsedDetails) ? parsedDetails.length : null;
    } catch (_error) {
      return null;
    }
  }

  function hasPresentRecordValue(record, fieldName) {
    return Boolean(
      record
      && typeof record === "object"
      && Object.prototype.hasOwnProperty.call(record, fieldName)
      && String(record[fieldName] ?? "").trim() !== ""
    );
  }

  function getSharedCurrentDependentCount(record) {
    const getCurrentDependentCount = global.LensApp?.clientRecords?.getCurrentDependentCount;
    if (typeof getCurrentDependentCount !== "function") {
      return null;
    }

    const dependentCount = Number(getCurrentDependentCount(record));
    return Number.isFinite(dependentCount) ? normalizeDependentCount(dependentCount) : null;
  }

  function getProfileCurrentDependentCount(record) {
    const structuredCount = getStructuredDependentDetailsCount(record);
    if (structuredCount !== null) {
      const sharedCount = getSharedCurrentDependentCount(record);
      return sharedCount !== null ? sharedCount : normalizeDependentCount(structuredCount);
    }

    if (hasPresentRecordValue(record, "dependentsCount")) {
      const sharedCount = getSharedCurrentDependentCount(record);
      return sharedCount !== null ? sharedCount : normalizeDependentCount(record?.dependentsCount);
    }

    if (hasPresentRecordValue(record, "dependentCount")) {
      return normalizeDependentCount(record?.dependentCount);
    }

    return null;
  }

  function getScoringChildrenCount(record, modelingData) {
    const profileDependentCount = getProfileCurrentDependentCount(record);
    if (profileDependentCount !== null) {
      return profileDependentCount;
    }

    return Math.max(0, Math.round(readNumberFromSources(record, modelingData, ["childrenNeedingFunding"])));
  }

  function calculate(record, options) {
    // CODE NOTE: This formula intentionally blends delivery likelihood and business opportunity into one 0-100 score.
    const overrides = options && typeof options === "object" ? options : {};
    const now = overrides.now instanceof Date && !Number.isNaN(overrides.now.getTime())
      ? overrides.now
      : new Date();
    const modelingData = overrides.modelingData && typeof overrides.modelingData === "object"
      ? overrides.modelingData
      : getLatestProtectionModelingData(record);
    const currentCoverage = deriveCurrentCoverage(record, modelingData, overrides);
    const modeledNeed = deriveModeledNeed(record, modelingData, overrides);
    const uncoveredGap = deriveUncoveredGap(record, currentCoverage, modeledNeed, overrides);
    const statusGroup = String(overrides.statusGroup || record?.statusGroup || "").trim().toLowerCase();
    const profileCreated = overrides.profileCreated != null
      ? Boolean(overrides.profileCreated)
      : Boolean(String(record?.displayName || "").trim()) && Boolean(String(record?.caseRef || "").trim());
    const preliminaryCompleted = overrides.preliminaryCompleted != null
      ? Boolean(overrides.preliminaryCompleted)
      : Boolean(record?.preliminaryUnderwritingCompleted);
    const pmiCompleted = overrides.pmiCompleted != null
      ? Boolean(overrides.pmiCompleted)
      : Boolean(record?.pmiCompleted);
    const analysisCompleted = overrides.analysisCompleted != null
      ? Boolean(overrides.analysisCompleted)
      : Boolean(record?.analysisCompleted) || statusGroup === "coverage-placed" || statusGroup === "closed";
    const lastTimelineDate = overrides.timelineDate instanceof Date
      ? overrides.timelineDate
      : parseDate(record?.dateProfileCreated || record?.lastReview || record?.lastUpdatedDate);
    const reviewDate = overrides.reviewDate instanceof Date
      ? overrides.reviewDate
      : parseDate(record?.lastReview || record?.lastUpdatedDate || record?.dateProfileCreated);
    const daysSinceTimeline = getDaysBetween(lastTimelineDate, now);
    const daysSinceReview = getDaysBetween(reviewDate, now);
    const activityAgeDays = daysSinceReview != null ? daysSinceReview : daysSinceTimeline;

    const householdAnnualIncome = Math.max(
      0,
      readNumberFromSources(record, modelingData, ["netAnnualIncome"]),
      readNumberFromSources(record, modelingData, ["annualNetIncome"]),
      readNumberFromSources(record, modelingData, ["grossAnnualIncome"]) * 0.76,
      readNumberFromSources(record, modelingData, ["annualIncome"]) * 0.76,
      readNumberFromSources(record, modelingData, ["householdIncome"]) * 0.76
    ) + Math.max(
      0,
      readNumberFromSources(record, modelingData, ["spouseIncome"]),
      readNumberFromSources(record, modelingData, ["spouseNetAnnualIncome"])
    ) + (readNumberFromSources(record, modelingData, ["bonusVariableIncome"]) * 0.6)
      + (readNumberFromSources(record, modelingData, ["employerBenefitsValue"]) * 0.5);
    const monthlyIncome = householdAnnualIncome / 12;
    const monthlySpending = Math.max(
      0,
      readNumberFromSources(record, modelingData, ["currentTotalMonthlySpending"])
    ) || [
      "monthlyHousingCost",
      "utilitiesCost",
      "foodCost",
      "insuranceCost",
      "transportationCost",
      "travelDiscretionaryCost",
      "subscriptionsCost"
    ].reduce(function (sum, key) {
      return sum + readNumberFromSources(record, modelingData, [key]);
    }, 0);
    const totalDebt = [
      "mortgageBalance",
      "otherRealEstateLoans",
      "autoLoans",
      "creditCardDebt",
      "studentLoans",
      "personalLoans",
      "businessDebt"
    ].reduce(function (sum, key) {
      return sum + readNumberFromSources(record, modelingData, [key]);
    }, 0);

    const affordabilityBuffer = monthlyIncome - monthlySpending;
    const cushionRatio = monthlyIncome > 0 ? affordabilityBuffer / monthlyIncome : -1;
    const debtPressure = householdAnnualIncome > 0
      ? clamp(totalDebt / Math.max(householdAnnualIncome * 4.5, 1), 0, 1)
      : 0.5;
    const affordability = householdAnnualIncome > 0
      ? clamp((clamp((cushionRatio + 0.1) / 0.55, 0, 1) * 0.72) + ((1 - debtPressure) * 0.28), 0, 1)
      : 0.42;

    const childrenCount = getScoringChildrenCount(record, modelingData);
    const householdMembers = Math.max(
      0,
      Math.round(parseNumeric(record?.membersCount)),
      Math.round(parseNumeric(record?.memberCount))
    );
    const spouseIncome = Math.max(
      0,
      readNumberFromSources(record, modelingData, ["spouseIncome"]),
      readNumberFromSources(record, modelingData, ["spouseNetAnnualIncome"])
    );
    const survivorIncome = Math.max(
      0,
      readNumberFromSources(record, modelingData, ["survivorNetAnnualIncome"]),
      readNumberFromSources(record, modelingData, ["survivorIncome"])
    );
    const hasSpouse = spouseIncome > 0
      || survivorIncome > 0
      || householdMembers > 1
      || /yes|true/i.test(String(modelingData?.survivorContinuesWorking || record?.survivorContinuesWorking || ""));
    const uncoveredGapRatio = modeledNeed > 0 ? clamp(uncoveredGap / modeledNeed, 0, 1) : uncoveredGap > 0 ? 1 : 0;
    const dependentPressure = clamp(childrenCount / 3, 0, 1);
    const householdIncomeUseRatio = clamp(readNumberFromSources(record, modelingData, ["householdIncomeUsePercent"]) / 100, 0, 1);
    const survivorSupportRatio = householdAnnualIncome > 0 ? clamp(survivorIncome / householdAnnualIncome, 0, 1) : 0;
    const survivorShortfall = householdAnnualIncome > 0
      ? 1 - survivorSupportRatio
      : (hasSpouse || childrenCount > 0 ? 0.55 : 0);
    const familyReliance = clamp(
      (dependentPressure * 0.45)
      + ((hasSpouse ? 1 : 0) * 0.2)
      + (householdIncomeUseRatio * 0.2)
      + (survivorShortfall * 0.15),
      0,
      1
    );
    const needPressure = clamp((uncoveredGapRatio * 0.55) + (familyReliance * 0.45), 0, 1);

    let stageReadiness = 0.08;
    if (statusGroup === "closed") {
      stageReadiness = 0.12;
    } else if (statusGroup === "coverage-placed") {
      stageReadiness = uncoveredGap > 0 ? 0.5 : 0.32;
    } else if (statusGroup === "in-review") {
      stageReadiness = analysisCompleted ? 0.88 : 0.76;
    } else if (analysisCompleted) {
      stageReadiness = 0.72;
    } else if (pmiCompleted) {
      stageReadiness = 0.56;
    } else if (preliminaryCompleted) {
      stageReadiness = 0.36;
    } else if (profileCreated) {
      stageReadiness = 0.2;
    }

    const completeness = clamp(
      (profileCreated ? 0.08 : 0)
      + (preliminaryCompleted ? 0.15 : 0)
      + (pmiCompleted ? 0.28 : 0)
      + (analysisCompleted ? 0.2 : 0)
      + (householdAnnualIncome > 0 ? 0.08 : 0)
      + (monthlySpending > 0 ? 0.08 : 0)
      + ((modeledNeed > 0 || currentCoverage > 0) ? 0.07 : 0)
      + ((childrenCount > 0 || hasSpouse || householdIncomeUseRatio > 0) ? 0.06 : 0),
      0,
      1
    );

    let momentum = 0.28;
    if (activityAgeDays != null) {
      if (activityAgeDays <= 7) {
        momentum = 1;
      } else if (activityAgeDays <= 21) {
        momentum = 0.82;
      } else if (activityAgeDays <= 45) {
        momentum = 0.65;
      } else if (activityAgeDays <= 90) {
        momentum = 0.45;
      } else if (activityAgeDays <= 180) {
        momentum = 0.25;
      } else {
        momentum = 0.12;
      }
    }

    const modeledNeedSource = String(record?.modeledNeedSource || "").trim().toLowerCase();
    const hasModelingPayload = Boolean(getLatestProtectionModelingPayload(record));
    const confidence = clamp(
      (hasModelingPayload ? 0.45 : ((modeledNeed > 0 || currentCoverage > 0) ? 0.25 : 0))
      + ((modeledNeedSource === "custom-amount" || !hasModelingPayload) ? 0.08 : 0.25)
      + (pmiCompleted ? 0.14 : 0)
      + (analysisCompleted ? 0.16 : 0),
      0,
      1
    );

    const opportunity = clamp(
      (uncoveredGapRatio * 0.55) + (calculateOpportunitySizeScore(uncoveredGap) * 0.45),
      0,
      1
    );

    let friction = 0;
    if (preliminaryCompleted && !pmiCompleted) {
      friction += 0.25;
    }
    if (pmiCompleted && !analysisCompleted && (daysSinceTimeline == null || daysSinceTimeline >= 14)) {
      friction += 0.18;
    }
    if (statusGroup === "in-review" && daysSinceTimeline != null && daysSinceTimeline >= 21) {
      friction += 0.28;
    }
    if (modeledNeedSource === "custom-amount") {
      friction += 0.06;
    }
    if (monthlyIncome > 0 && affordabilityBuffer <= 0) {
      friction += 0.16;
    }
    if (modeledNeed <= 0 && !pmiCompleted) {
      friction += 0.1;
    }
    friction = clamp(friction, 0, 1);

    const weighted = {
      stageReadiness: Math.round(stageReadiness * 26),
      completeness: Math.round(completeness * 16),
      affordability: Math.round(affordability * 15),
      needPressure: Math.round(needPressure * 12),
      momentum: Math.round(momentum * 8),
      confidence: Math.round(confidence * 7),
      opportunity: Math.round(opportunity * 16),
      frictionPenalty: Math.round(friction * 18)
    };

    const score = clamp(
      weighted.stageReadiness
      + weighted.completeness
      + weighted.affordability
      + weighted.needPressure
      + weighted.momentum
      + weighted.confidence
      + weighted.opportunity
      - weighted.frictionPenalty,
      0,
      100
    );

    return {
      score,
      tier: getScoreTier(score),
      currentCoverage,
      modeledNeed,
      uncoveredGap,
      affordabilityBuffer,
      householdAnnualIncome,
      monthlySpending,
      totalDebt,
      weighted,
      signals: {
        profileCreated,
        preliminaryCompleted,
        pmiCompleted,
        analysisCompleted,
        hasSpouse,
        childrenCount,
        uncoveredGapRatio,
        daysSinceTimeline,
        daysSinceReview,
        modeledNeedSource
      }
    };
  }

  global.LipOpportunityScore = {
    version: "2026-04-opportunity-score-v1",
    calculate: calculate,
    getScoreTier: getScoreTier
  };
})(window);
