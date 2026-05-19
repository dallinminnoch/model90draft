(function (global) {
  const LensApp = global.LensApp || (global.LensApp = {});
  const lensAnalysis = LensApp.lensAnalysis || (LensApp.lensAnalysis = {});

  // Owner: Income Impact transition outlook helper.
  // Purpose: calculate a fixed 90-day fast-access cash outlook from existing
  // asset facts and post-death monthly cash-flow points.
  // Non-goals: no DOM access, no storage access, no scenario wiring, no graph
  // changes, no runway mutation, and no claim/probate/liquidity simulation.

  const VERSION = "income-impact-transition-outlook-v1";
  const SOURCE = "income-impact-transition-outlook-calculations";
  const DEFAULT_WINDOW_MONTHS = 3;
  const DEFAULT_WINDOW_DAYS = 90;

  const STATUS = Object.freeze({
    stable: "Stable",
    caution: "Caution",
    atRisk: "At Risk",
    likelyFailure: "Likely Failure",
    insufficientData: "insufficientData"
  });

  const FAST_ACCESS_CATEGORIES = Object.freeze(new Set([
    "cashAndCashEquivalents",
    "emergencyFund"
  ]));

  const NEAR_TERM_CATEGORIES = Object.freeze(new Set([
    "taxableBrokerageInvestments"
  ]));

  const FAST_ACCESS_BUCKET_FAMILIES = Object.freeze(new Set([
    "cash",
    "emergencyFund"
  ]));

  const NEAR_TERM_BUCKET_FAMILIES = Object.freeze(new Set([
    "taxableInvestments"
  ]));

  function isPlainObject(value) {
    return Boolean(value && typeof value === "object" && !Array.isArray(value));
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

  function normalizeString(value) {
    return String(value == null ? "" : value).trim();
  }

  function toOptionalNumber(value) {
    if (typeof lensAnalysis.toOptionalNumber === "function") {
      return lensAnalysis.toOptionalNumber(value);
    }
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
    const numeric = toOptionalNumber(value);
    return numeric == null ? 0 : Math.round(numeric * 100) / 100;
  }

  function roundRatio(value) {
    return Number.isFinite(value) ? Math.round(value * 10000) / 10000 : null;
  }

  function makeWarning(code, message, details) {
    const warning = { code, message };
    if (details !== undefined) {
      warning.details = clonePlainValue(details);
    }
    return warning;
  }

  function getAssets(assetFacts) {
    if (Array.isArray(assetFacts)) {
      return assetFacts;
    }
    if (Array.isArray(assetFacts?.assets)) {
      return assetFacts.assets;
    }
    return [];
  }

  function getResourceBuckets(resourceBuckets) {
    if (Array.isArray(resourceBuckets)) {
      return resourceBuckets;
    }
    if (Array.isArray(resourceBuckets?.resourceBuckets)) {
      return resourceBuckets.resourceBuckets;
    }
    if (Array.isArray(resourceBuckets?.buckets)) {
      return resourceBuckets.buckets;
    }
    return [];
  }

  function positiveAmount(value) {
    const amount = toOptionalNumber(value);
    return amount == null || amount <= 0 ? null : roundMoney(amount);
  }

  function addTraceItem(target, key, amount, item, sourcePath) {
    const normalizedKey = normalizeString(key) || "unknown";
    const existing = target.find(function (entry) {
      return entry.key === normalizedKey;
    });
    if (existing) {
      existing.amount = roundMoney(existing.amount + amount);
      existing.items.push({
        id: normalizeString(item?.assetId || item?.id) || null,
        label: normalizeString(item?.label || item?.name) || null,
        amount,
        sourcePath
      });
      return;
    }
    target.push({
      key: normalizedKey,
      amount,
      items: [{
        id: normalizeString(item?.assetId || item?.id) || null,
        label: normalizeString(item?.label || item?.name) || null,
        amount,
        sourcePath
      }]
    });
  }

  function classifyAsset(asset) {
    const categoryKey = normalizeString(asset?.categoryKey || asset?.category || asset?.assetCategory);
    if (FAST_ACCESS_CATEGORIES.has(categoryKey)) {
      return "fastAccess";
    }
    if (NEAR_TERM_CATEGORIES.has(categoryKey)) {
      return "nearTerm";
    }
    return "excluded";
  }

  function classifyBucket(bucket) {
    const family = normalizeString(bucket?.family || bucket?.bucketFamily || bucket?.type);
    if (FAST_ACCESS_BUCKET_FAMILIES.has(family)) {
      return "fastAccess";
    }
    if (NEAR_TERM_BUCKET_FAMILIES.has(family)) {
      return "nearTerm";
    }
    return "excluded";
  }

  function summarizeAssetFacts(assetFacts, warnings) {
    const assets = getAssets(assetFacts);
    const summary = createEmptyResourceSummary("assetFacts");
    assets.forEach(function (asset, index) {
      if (!isPlainObject(asset)) {
        warnings.push(makeWarning(
          "invalid-asset-fact-ignored",
          "Asset fact entry was not an object and was ignored.",
          { index }
        ));
        return;
      }
      const amount = positiveAmount(asset.currentValue ?? asset.rawValue ?? asset.value ?? asset.amount ?? asset.balance);
      const categoryKey = normalizeString(asset.categoryKey || asset.category || asset.assetCategory) || "unknown";
      if (amount == null) {
        warnings.push(makeWarning(
          "invalid-asset-value-ignored",
          "Asset fact value was missing, invalid, zero, or negative and was ignored.",
          { index, categoryKey }
        ));
        return;
      }
      applyResourceClassification(summary, classifyAsset(asset), categoryKey, amount, asset, `assetFacts.assets[${index}]`);
    });
    return summary;
  }

  function summarizeResourceBuckets(resourceBuckets, warnings) {
    const buckets = getResourceBuckets(resourceBuckets);
    const summary = createEmptyResourceSummary("resourceBucketsFallback");
    buckets.forEach(function (bucket, index) {
      if (!isPlainObject(bucket)) {
        warnings.push(makeWarning(
          "invalid-resource-bucket-ignored",
          "Resource bucket entry was not an object and was ignored.",
          { index }
        ));
        return;
      }
      const amount = positiveAmount(bucket.startingValue ?? bucket.value ?? bucket.amount ?? bucket.balance ?? bucket.currentValue);
      const family = normalizeString(bucket.family || bucket.bucketFamily || bucket.type) || "unknown";
      if (bucket.included === false || amount == null) {
        warnings.push(makeWarning(
          "invalid-resource-bucket-value-ignored",
          "Resource bucket was excluded or missing a positive value and was ignored.",
          { index, family }
        ));
        return;
      }
      applyResourceClassification(summary, classifyBucket(bucket), family, amount, bucket, `resourceBuckets[${index}]`);
    });
    return summary;
  }

  function createEmptyResourceSummary(sourceUsed) {
    return {
      sourceUsed,
      fastAccessResources: 0,
      nearTermResources: 0,
      excludedResources: 0,
      fastAccessCategories: [],
      nearTermCategories: [],
      excludedCategories: []
    };
  }

  function applyResourceClassification(summary, classification, key, amount, item, sourcePath) {
    if (classification === "fastAccess") {
      summary.fastAccessResources = roundMoney(summary.fastAccessResources + amount);
      addTraceItem(summary.fastAccessCategories, key, amount, item, sourcePath);
      return;
    }
    if (classification === "nearTerm") {
      summary.nearTermResources = roundMoney(summary.nearTermResources + amount);
      addTraceItem(summary.nearTermCategories, key, amount, item, sourcePath);
      return;
    }
    summary.excludedResources = roundMoney(summary.excludedResources + amount);
    addTraceItem(summary.excludedCategories, key, amount, item, sourcePath);
  }

  function hasUsableAssetFacts(assetFacts) {
    return getAssets(assetFacts).some(function (asset) {
      return isPlainObject(asset) && positiveAmount(asset.currentValue ?? asset.rawValue ?? asset.value ?? asset.amount ?? asset.balance) != null;
    });
  }

  function readAmount(source, keys) {
    if (typeof source === "number" || typeof source === "string") {
      return positiveAmount(source);
    }
    if (!isPlainObject(source)) {
      return null;
    }
    for (const key of keys) {
      const value = source[key];
      const amount = isPlainObject(value)
        ? positiveAmount(value.amount ?? value.value ?? value.monthlyAmount ?? value.total)
        : positiveAmount(value);
      if (amount != null) {
        return amount;
      }
    }
    return null;
  }

  function readMonthlyNeed(point) {
    return readAmount(point, [
      "survivorNeeds",
      "monthlySurvivorNeed",
      "survivorNeed",
      "needs",
      "monthlyNeeds",
      "monthlyNeed"
    ]);
  }

  function readScheduledObligations(point) {
    if (Array.isArray(point?.scheduledObligations)) {
      const total = point.scheduledObligations.reduce(function (sum, obligation) {
        return roundMoney(sum + (readAmount(obligation, ["amount", "value", "monthlyAmount", "total"]) || 0));
      }, 0);
      return total > 0 ? total : null;
    }
    return readAmount(point, [
      "scheduledObligations",
      "obligations",
      "scheduledObligationAmount",
      "monthlyScheduledObligations",
      "monthlyObligations"
    ]);
  }

  function getPostDeathPoints(input) {
    if (Array.isArray(input?.postDeathTimelinePoints)) {
      return input.postDeathTimelinePoints;
    }
    if (Array.isArray(input?.postDeathSeries?.points)) {
      return input.postDeathSeries.points;
    }
    if (Array.isArray(input?.scenario?.postDeathSeries?.points)) {
      return input.scenario.postDeathSeries.points;
    }
    return [];
  }

  function calculateTransitionNeed(points, windowMonths, warnings) {
    if (!Array.isArray(points) || !points.length) {
      warnings.push(makeWarning(
        "missing-post-death-timeline-points",
        "Post-death monthly points are required to calculate the 90-day transition need."
      ));
      return {
        transitionNeed90Days: null,
        monthlyPointCountUsed: 0,
        monthlyNeeds: []
      };
    }
    const selectedPoints = points.slice(0, windowMonths);
    if (selectedPoints.length < windowMonths) {
      warnings.push(makeWarning(
        "partial-transition-window-points",
        "Fewer than the requested transition-window monthly points were provided.",
        { expectedMonths: windowMonths, actualMonths: selectedPoints.length }
      ));
    }

    const monthlyNeeds = selectedPoints.map(function (point, index) {
      const survivorNeed = readMonthlyNeed(point) || 0;
      const scheduledObligations = readScheduledObligations(point) || 0;
      return {
        monthIndex: point?.monthIndex ?? index + 1,
        survivorNeeds: roundMoney(survivorNeed),
        scheduledObligations: roundMoney(scheduledObligations),
        totalMonthlyNeed: roundMoney(survivorNeed + scheduledObligations)
      };
    });
    const transitionNeed90Days = roundMoney(monthlyNeeds.reduce(function (total, point) {
      return total + point.totalMonthlyNeed;
    }, 0));

    warnings.push(makeWarning(
      "timeline-monthly-points-used",
      "Transition need uses post-death monthly survivor needs and scheduled obligations only; day-zero final expenses, debt payoff, claim timing, probate, and asset liquidity mechanics are not modeled."
    ));

    if (transitionNeed90Days <= 0) {
      warnings.push(makeWarning(
        "missing-transition-need",
        "Transition need was zero or unavailable; status was not inferred as Stable."
      ));
      return {
        transitionNeed90Days: null,
        monthlyPointCountUsed: selectedPoints.length,
        monthlyNeeds
      };
    }

    return {
      transitionNeed90Days,
      monthlyPointCountUsed: selectedPoints.length,
      monthlyNeeds
    };
  }

  function resolveStatus(transitionNeed90Days, fastAccessCoverageRatio) {
    if (transitionNeed90Days == null || transitionNeed90Days <= 0 || fastAccessCoverageRatio == null) {
      return STATUS.insufficientData;
    }
    if (fastAccessCoverageRatio < 0.5) {
      return STATUS.likelyFailure;
    }
    if (fastAccessCoverageRatio < 1) {
      return STATUS.atRisk;
    }
    if (fastAccessCoverageRatio < 1.25) {
      return STATUS.caution;
    }
    return STATUS.stable;
  }

  function normalizeWindowMonths(value) {
    const parsed = toOptionalNumber(value);
    return parsed == null || parsed <= 0 ? DEFAULT_WINDOW_MONTHS : Math.max(1, Math.floor(parsed));
  }

  function normalizeWindowDays(value) {
    const parsed = toOptionalNumber(value);
    return parsed == null || parsed <= 0 ? DEFAULT_WINDOW_DAYS : Math.max(1, Math.floor(parsed));
  }

  function calculateIncomeImpactTransitionOutlook(input) {
    const safeInput = isPlainObject(input) ? input : {};
    const options = isPlainObject(safeInput.options) ? safeInput.options : {};
    const warnings = [];
    const windowMonths = normalizeWindowMonths(options.windowMonths);
    const windowDays = normalizeWindowDays(options.windowDays);
    const resourceSummary = hasUsableAssetFacts(safeInput.assetFacts)
      ? summarizeAssetFacts(safeInput.assetFacts, warnings)
      : summarizeResourceBuckets(safeInput.resourceBuckets, warnings);
    const points = getPostDeathPoints(safeInput);
    const need = calculateTransitionNeed(points, windowMonths, warnings);
    const transitionNeed90Days = need.transitionNeed90Days;
    const fastAccessCoverageRatio = transitionNeed90Days == null
      ? null
      : roundRatio(resourceSummary.fastAccessResources / transitionNeed90Days);
    const nearTermCoverageRatio = transitionNeed90Days == null
      ? null
      : roundRatio((resourceSummary.fastAccessResources + resourceSummary.nearTermResources) / transitionNeed90Days);
    const status = resolveStatus(transitionNeed90Days, fastAccessCoverageRatio);

    if (resourceSummary.fastAccessResources <= 0 && transitionNeed90Days != null && transitionNeed90Days > 0) {
      warnings.push(makeWarning(
        "no-fast-access-resources",
        "No cash or emergency fund resources were available for the fixed 90-day transition outlook."
      ));
    }

    return {
      version: VERSION,
      windowDays,
      windowMonths,
      status,
      fastAccessResources: resourceSummary.fastAccessResources,
      nearTermResources: resourceSummary.nearTermResources,
      excludedResources: resourceSummary.excludedResources,
      transitionNeed90Days,
      fastAccessCoverageRatio,
      nearTermCoverageRatio,
      warnings,
      trace: {
        source: SOURCE,
        sourceUsed: resourceSummary.sourceUsed,
        windowPolicy: "fixed-90-day-v1",
        fastAccessPolicy: {
          includedCategories: Array.from(FAST_ACCESS_CATEGORIES),
          nearTermOnlyCategories: Array.from(NEAR_TERM_CATEGORIES),
          existingCoverageIncluded: false,
          lifeInsuranceProceedsIncluded: false,
          emergencyFundCountsAsFastAccess: true
        },
        includedFastAccess: resourceSummary.fastAccessCategories,
        nearTerm: resourceSummary.nearTermCategories,
        excluded: resourceSummary.excludedCategories,
        transitionNeed: {
          source: "postDeathTimelinePoints",
          monthlyPointCountUsed: need.monthlyPointCountUsed,
          monthlyNeeds: need.monthlyNeeds
        },
        deathEventUsedForFastAccessResources: false,
        assumptions: [
          "Ownership, survivor account access, beneficiary designations, probate timing, claim timing, and asset liquidity timing are not modeled in V1.",
          "Existing coverage and life insurance proceeds are excluded from fast-access resources because claim timing is not modeled.",
          "Taxable brokerage is classified as near-term only and does not improve the primary fast-access coverage ratio.",
          "Final expenses and debt payoff are not added unless they are already represented in monthly post-death points."
        ],
        noRunwayMutation: true,
        noGraphMutation: true
      }
    };
  }

  lensAnalysis.calculateIncomeImpactTransitionOutlook = calculateIncomeImpactTransitionOutlook;
  lensAnalysis.incomeImpactTransitionOutlookVersion = VERSION;

  if (typeof module !== "undefined" && module.exports) {
    module.exports = {
      calculateIncomeImpactTransitionOutlook,
      INCOME_IMPACT_TRANSITION_OUTLOOK_VERSION: VERSION,
      INCOME_IMPACT_TRANSITION_OUTLOOK_SOURCE: SOURCE
    };
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
