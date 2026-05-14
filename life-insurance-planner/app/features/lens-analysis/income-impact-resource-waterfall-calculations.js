(function (global) {
  const root = global.LensApp = global.LensApp || {};
  const lensAnalysis = root.lensAnalysis = root.lensAnalysis || {};

  const VERSION = "income-impact-resource-waterfall-v1";
  const SOURCE = "income-impact-resource-waterfall-calculations";

  const EVIDENCE_LEVELS = Object.freeze({
    calculated: "calculated",
    traceBacked: "trace-backed",
    assumptionBacked: "assumption-backed",
    estimated: "estimated",
    insufficientData: "insufficient-data"
  });

  const BUCKET_FAMILIES = Object.freeze({
    cash: "cash",
    emergencyFund: "emergencyFund",
    taxableInvestments: "taxableInvestments",
    educationSavings: "educationSavings",
    retirementAssets: "retirementAssets",
    homeEquity: "homeEquity",
    otherLiquid: "otherLiquid",
    otherIlliquid: "otherIlliquid",
    businessAssets: "businessAssets",
    unknown: "unknown"
  });

  const DEFAULT_WATERFALL_ORDER = Object.freeze([
    BUCKET_FAMILIES.cash,
    BUCKET_FAMILIES.emergencyFund,
    BUCKET_FAMILIES.otherLiquid,
    BUCKET_FAMILIES.taxableInvestments,
    BUCKET_FAMILIES.educationSavings,
    BUCKET_FAMILIES.retirementAssets,
    BUCKET_FAMILIES.homeEquity,
    BUCKET_FAMILIES.businessAssets,
    BUCKET_FAMILIES.otherIlliquid,
    BUCKET_FAMILIES.unknown
  ]);

  const EVENT_TYPES = Object.freeze({
    bucketReached: "bucket-reached",
    bucketDepleted: "bucket-depleted"
  });

  const FAMILY_METADATA = Object.freeze({
    [BUCKET_FAMILIES.cash]: {
      label: "Cash Savings",
      liquidityTier: "liquid",
      depletedLabel: "Cash Savings Depleted"
    },
    [BUCKET_FAMILIES.emergencyFund]: {
      label: "Emergency Fund",
      liquidityTier: "liquid",
      depletedLabel: "Emergency Fund Depleted"
    },
    [BUCKET_FAMILIES.otherLiquid]: {
      label: "Other Liquid Resources",
      liquidityTier: "liquid",
      depletedLabel: "Other Liquid Resources Depleted"
    },
    [BUCKET_FAMILIES.taxableInvestments]: {
      label: "Taxable Investments",
      liquidityTier: "liquid",
      depletedLabel: "Taxable Assets Depleted"
    },
    [BUCKET_FAMILIES.educationSavings]: {
      label: "Education Savings",
      liquidityTier: "restricted",
      reachedLabel: "Education Savings Used for Living Needs",
      depletedLabel: "Education Savings Depleted"
    },
    [BUCKET_FAMILIES.retirementAssets]: {
      label: "Retirement Assets",
      liquidityTier: "restricted",
      reachedLabel: "Retirement Assets Tapped",
      depletedLabel: "Retirement Assets Depleted"
    },
    [BUCKET_FAMILIES.homeEquity]: {
      label: "Home Equity",
      liquidityTier: "illiquid",
      reachedLabel: "Home Equity Becomes Last Resort",
      depletedLabel: "Home Equity Depleted"
    },
    [BUCKET_FAMILIES.businessAssets]: {
      label: "Business Assets",
      liquidityTier: "illiquid",
      depletedLabel: "Business Assets Depleted"
    },
    [BUCKET_FAMILIES.otherIlliquid]: {
      label: "Other Illiquid Resources",
      liquidityTier: "illiquid",
      depletedLabel: "Other Illiquid Resources Depleted"
    },
    [BUCKET_FAMILIES.unknown]: {
      label: "Unclassified Resources",
      liquidityTier: "unknown",
      depletedLabel: "Unclassified Resources Depleted"
    }
  });

  function isPlainObject(value) {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
  }

  function clonePlainValue(value) {
    if (value == null || typeof value !== "object") {
      return value;
    }
    if (Array.isArray(value)) {
      return value.map(clonePlainValue);
    }
    const output = {};
    Object.keys(value).forEach((key) => {
      output[key] = clonePlainValue(value[key]);
    });
    return output;
  }

  function normalizeString(value) {
    return typeof value === "string" ? value.trim() : "";
  }

  function normalizeKey(value) {
    return normalizeString(value).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  }

  function toOptionalNumber(value) {
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
    if (typeof value === "string" && value.trim() !== "") {
      const parsed = Number(value.replace(/[$,%\s,]/g, ""));
      return Number.isFinite(parsed) ? parsed : null;
    }
    return null;
  }

  function roundMoney(value) {
    const numeric = toOptionalNumber(value);
    return numeric == null ? null : Math.round(numeric * 100) / 100;
  }

  function roundMonth(value) {
    const numeric = toOptionalNumber(value);
    return numeric == null ? null : Math.round(numeric * 1000) / 1000;
  }

  function getPath(source, path) {
    if (!isPlainObject(source) && !Array.isArray(source)) {
      return undefined;
    }
    return String(path).split(".").reduce((cursor, key) => {
      if (cursor == null) {
        return undefined;
      }
      return cursor[key];
    }, source);
  }

  function makeWarning(id, message, sourcePath) {
    return {
      id,
      message,
      sourcePath: sourcePath || null
    };
  }

  function getFamilyOrder(family) {
    const index = DEFAULT_WATERFALL_ORDER.indexOf(family);
    return index === -1 ? DEFAULT_WATERFALL_ORDER.length : index;
  }

  function familyFromText(value) {
    const key = normalizeKey(value);
    if (!key) {
      return null;
    }
    if (/(checking|savings|cash|bank|liquid-cash)/.test(key)) {
      return BUCKET_FAMILIES.cash;
    }
    if (/(emergency|reserve|rainy-day)/.test(key)) {
      return BUCKET_FAMILIES.emergencyFund;
    }
    if (/(taxable|brokerage|investment|mutual-fund|stock|bond)/.test(key)) {
      return BUCKET_FAMILIES.taxableInvestments;
    }
    if (/(529|education|college|tuition)/.test(key)) {
      return BUCKET_FAMILIES.educationSavings;
    }
    if (/(retirement|401k|401-k|ira|roth|pension)/.test(key)) {
      return BUCKET_FAMILIES.retirementAssets;
    }
    if (/(home-equity|equity|heloc|house)/.test(key)) {
      return BUCKET_FAMILIES.homeEquity;
    }
    if (/(business|private-company|closely-held)/.test(key)) {
      return BUCKET_FAMILIES.businessAssets;
    }
    if (/(illiquid|real-estate|property|land)/.test(key)) {
      return BUCKET_FAMILIES.otherIlliquid;
    }
    if (/(liquid|money-market|short-term)/.test(key)) {
      return BUCKET_FAMILIES.otherLiquid;
    }
    return null;
  }

  function normalizeBucketFamily(raw) {
    if (!isPlainObject(raw)) {
      return BUCKET_FAMILIES.unknown;
    }
    const explicitFamily = normalizeString(raw.family || raw.bucketFamily || raw.type);
    if (Object.values(BUCKET_FAMILIES).includes(explicitFamily)) {
      return explicitFamily;
    }
    return familyFromText([
      raw.family,
      raw.bucketFamily,
      raw.category,
      raw.type,
      raw.label,
      raw.name,
      raw.id
    ].filter(Boolean).join(" ")) || BUCKET_FAMILIES.unknown;
  }

  function normalizeEvidenceLevel(value, fallback) {
    const normalized = normalizeString(value);
    if (Object.values(EVIDENCE_LEVELS).includes(normalized)) {
      return normalized;
    }
    return fallback || EVIDENCE_LEVELS.assumptionBacked;
  }

  function firstNumberAtPath(source, paths) {
    for (const path of paths) {
      const value = toOptionalNumber(getPath(source, path));
      if (value != null) {
        return { value, sourcePath: path };
      }
    }
    return null;
  }

  function normalizeBucket(rawBucket, index, sourcePathPrefix) {
    const raw = isPlainObject(rawBucket) ? rawBucket : {};
    const family = normalizeBucketFamily(raw);
    const metadata = FAMILY_METADATA[family] || FAMILY_METADATA[BUCKET_FAMILIES.unknown];
    const warnings = [];
    const startingValue = roundMoney(
      raw.startingValue ?? raw.value ?? raw.amount ?? raw.balance ?? raw.currentValue ?? raw.marketValue
    );
    if (startingValue == null) {
      warnings.push(makeWarning("missing-bucket-value", "Resource bucket is missing a numeric starting value.", `${sourcePathPrefix}.${index}`));
    }
    if (family === BUCKET_FAMILIES.unknown) {
      warnings.push(makeWarning("unknown-bucket-family", "Resource bucket family could not be classified from supplied fields.", `${sourcePathPrefix}.${index}`));
    }
    return {
      id: normalizeString(raw.id) || `${family}-${index + 1}`,
      family,
      label: normalizeString(raw.label || raw.name) || metadata.label,
      startingValue,
      remainingValue: roundMoney(raw.remainingValue ?? startingValue),
      order: toOptionalNumber(raw.order) ?? getFamilyOrder(family),
      liquidityTier: normalizeString(raw.liquidityTier) || metadata.liquidityTier,
      included: raw.included === false ? false : startingValue != null && startingValue > 0,
      sourcePath: normalizeString(raw.sourcePath) || `${sourcePathPrefix}.${index}`,
      evidenceLevel: normalizeEvidenceLevel(raw.evidenceLevel, EVIDENCE_LEVELS.assumptionBacked),
      warnings
    };
  }

  function collectAssetFactItems(assetFacts) {
    if (!isPlainObject(assetFacts)) {
      return [];
    }
    const candidatePaths = [
      "resourceBuckets",
      "assetBuckets",
      "buckets",
      "assets",
      "items",
      "resources"
    ];
    for (const path of candidatePaths) {
      const value = getPath(assetFacts, path);
      if (Array.isArray(value) && value.length) {
        return value.map((item, index) => ({
          item,
          sourcePath: `assetFacts.${path}.${index}`
        }));
      }
    }
    return [];
  }

  function deriveBuckets(input, warnings, trace) {
    const explicitBuckets = Array.isArray(input?.resourceBuckets) ? input.resourceBuckets : [];
    if (explicitBuckets.length) {
      trace.bucketSourceSummary.mode = "explicit";
      return explicitBuckets.map((bucket, index) => normalizeBucket(bucket, index, "resourceBuckets"));
    }

    const factItems = collectAssetFactItems(input?.assetFacts);
    if (factItems.length) {
      trace.bucketSourceSummary.mode = "assetFacts";
      return factItems.map(({ item, sourcePath }, index) => {
        const normalized = normalizeBucket(
          Object.assign({}, isPlainObject(item) ? item : {}, { sourcePath }),
          index,
          "assetFacts"
        );
        normalized.evidenceLevel = normalizeEvidenceLevel(normalized.evidenceLevel, EVIDENCE_LEVELS.traceBacked);
        return normalized;
      });
    }

    const aggregate = firstNumberAtPath(input, [
      "scenario.timelineFacts.resourcesAfterObligations",
      "scenario.deathEvent.resourcesAfterObligations",
      "financialRunway.netAvailableResources"
    ]);
    if (aggregate && aggregate.value > 0) {
      warnings.push(makeWarning(
        "aggregate-resource-only",
        "Only aggregate post-death resources were available, so bucket classification remains unknown.",
        aggregate.sourcePath
      ));
      trace.bucketSourceSummary.mode = "aggregate";
      return [
        normalizeBucket({
          id: "aggregate-post-death-resources",
          family: BUCKET_FAMILIES.unknown,
          label: "Aggregate Post-Death Resources",
          startingValue: aggregate.value,
          sourcePath: aggregate.sourcePath,
          evidenceLevel: EVIDENCE_LEVELS.traceBacked
        }, 0, "derivedBuckets")
      ];
    }

    warnings.push(makeWarning(
      "missing-resource-buckets",
      "No explicit resource buckets or usable aggregate post-death resources were available.",
      "resourceBuckets"
    ));
    trace.bucketSourceSummary.mode = "missing";
    return [];
  }

  function deriveBurnRateFromSeries(points) {
    if (!Array.isArray(points) || points.length < 2) {
      return null;
    }
    const normalized = points.map((point, index) => {
      if (!isPlainObject(point)) {
        return null;
      }
      const monthIndex = toOptionalNumber(point.monthIndex ?? point.monthOffset ?? index);
      const resources = toOptionalNumber(
        point.endingResources
          ?? point.remainingResources
          ?? point.resourceValue
          ?? point.resources
          ?? point.value
      );
      return monthIndex == null || resources == null ? null : { monthIndex, resources };
    }).filter(Boolean).sort((a, b) => a.monthIndex - b.monthIndex);

    for (let index = 1; index < normalized.length; index += 1) {
      const previous = normalized[index - 1];
      const current = normalized[index];
      const months = current.monthIndex - previous.monthIndex;
      const decrease = previous.resources - current.resources;
      if (months > 0 && decrease > 0) {
        return decrease / months;
      }
    }
    return null;
  }

  function resolveBurnRate(input, warnings, trace) {
    const explicitBurnRate = toOptionalNumber(input?.options?.monthlyBurnRate);
    if (explicitBurnRate != null) {
      trace.burnRateSource = "options.monthlyBurnRate";
      trace.assumptions.push("Monthly burn rate was supplied explicitly by the caller.");
      return {
        value: explicitBurnRate,
        evidenceLevel: normalizeEvidenceLevel(input?.options?.monthlyBurnRateEvidenceLevel, EVIDENCE_LEVELS.assumptionBacked),
        sourcePath: "options.monthlyBurnRate"
      };
    }

    const financialRunwayBurn = firstNumberAtPath(input, [
      "financialRunway.monthlyBurnRate",
      "financialRunway.monthlyShortfall",
      "scenario.postDeathSeries.layer3.summary.monthlyShortfall",
      "scenario.postDeathSeries.summary.monthlyShortfall",
      "scenario.timelineFacts.monthlyShortfall"
    ]);
    if (financialRunwayBurn) {
      trace.burnRateSource = financialRunwayBurn.sourcePath;
      return {
        value: financialRunwayBurn.value,
        evidenceLevel: EVIDENCE_LEVELS.calculated,
        sourcePath: financialRunwayBurn.sourcePath
      };
    }

    const annualShortfall = firstNumberAtPath(input, [
      "financialRunway.annualShortfall",
      "scenario.postDeathSeries.layer3.summary.annualShortfall",
      "scenario.postDeathSeries.summary.annualShortfall",
      "scenario.timelineFacts.annualShortfall"
    ]);
    if (annualShortfall) {
      trace.burnRateSource = annualShortfall.sourcePath;
      return {
        value: annualShortfall.value / 12,
        evidenceLevel: EVIDENCE_LEVELS.calculated,
        sourcePath: annualShortfall.sourcePath
      };
    }

    const seriesBurn = deriveBurnRateFromSeries(input?.postDeathSeries?.points || input?.scenario?.postDeathSeries?.points);
    if (seriesBurn != null) {
      trace.burnRateSource = "postDeathSeries.points";
      trace.assumptions.push("Monthly burn rate was estimated from the first decreasing post-death resource slope.");
      return {
        value: seriesBurn,
        evidenceLevel: EVIDENCE_LEVELS.estimated,
        sourcePath: "postDeathSeries.points"
      };
    }

    const netResources = firstNumberAtPath(input, [
      "financialRunway.netAvailableResources",
      "scenario.timelineFacts.resourcesAfterObligations",
      "scenario.deathEvent.resourcesAfterObligations"
    ]);
    const monthsCovered = firstNumberAtPath(input, [
      "financialRunway.totalMonthsOfSecurity",
      "scenario.timelineFacts.monthsCovered",
      "scenario.postDeathSeries.depletion.monthsCovered"
    ]);
    if (netResources && monthsCovered && netResources.value > 0 && monthsCovered.value > 0) {
      trace.burnRateSource = `${netResources.sourcePath}/${monthsCovered.sourcePath}`;
      trace.assumptions.push("Monthly burn rate was estimated from aggregate resources divided by months covered.");
      return {
        value: netResources.value / monthsCovered.value,
        evidenceLevel: EVIDENCE_LEVELS.estimated,
        sourcePath: trace.burnRateSource
      };
    }

    warnings.push(makeWarning(
      "missing-monthly-burn-rate",
      "No explicit or safely derivable monthly burn rate was available, so depletion timing was not estimated.",
      "options.monthlyBurnRate"
    ));
    trace.burnRateSource = null;
    return null;
  }

  function normalizeDateOnly(value) {
    const text = normalizeString(value);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) {
      return null;
    }
    const date = new Date(`${text}T00:00:00Z`);
    return Number.isNaN(date.getTime()) ? null : text;
  }

  function daysInMonth(year, monthIndex) {
    return new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
  }

  function addMonthsToDateOnly(dateText, monthOffset) {
    const normalized = normalizeDateOnly(dateText);
    const months = toOptionalNumber(monthOffset);
    if (!normalized || months == null) {
      return null;
    }
    const wholeMonths = Math.round(months);
    const [yearText, monthText, dayText] = normalized.split("-");
    const year = Number(yearText);
    const month = Number(monthText) - 1;
    const day = Number(dayText);
    const targetMonth = month + wholeMonths;
    const targetYear = year + Math.floor(targetMonth / 12);
    const normalizedMonth = ((targetMonth % 12) + 12) % 12;
    const targetDay = Math.min(day, daysInMonth(targetYear, normalizedMonth));
    return [
      String(targetYear).padStart(4, "0"),
      String(normalizedMonth + 1).padStart(2, "0"),
      String(targetDay).padStart(2, "0")
    ].join("-");
  }

  function resolveDeathDate(input) {
    return normalizeDateOnly(
      input?.options?.selectedDeathDate
        || input?.scenario?.scenario?.selectedDeathDate
        || input?.scenario?.deathEvent?.date
        || input?.timelineFacts?.selectedDeathDate
    );
  }

  function makeTimelineEvent(bucket, eventType, displayLabel, monthOffset, amount, burnRate, deathDate) {
    const date = deathDate ? addMonthsToDateOnly(deathDate, monthOffset) : null;
    const safeToRender = bucket.startingValue != null
      && bucket.startingValue > 0
      && burnRate?.value != null
      && burnRate.value > 0
      && monthOffset != null
      && amount != null;
    return {
      id: `${bucket.id}.${eventType}`,
      bucketId: bucket.id,
      eventType,
      displayLabel,
      family: bucket.family,
      monthOffset: roundMonth(monthOffset),
      date,
      amount: roundMoney(amount),
      evidenceLevel: burnRate?.evidenceLevel || EVIDENCE_LEVELS.insufficientData,
      safeToRender,
      sourcePath: bucket.sourcePath,
      trace: {
        bucketSourcePath: bucket.sourcePath,
        burnRateSourcePath: burnRate?.sourcePath || null,
        dateSourcePath: deathDate ? "selectedDeathDate" : null
      }
    };
  }

  function buildWaterfallEvents(buckets, burnRate, deathDate) {
    if (!burnRate || burnRate.value == null || burnRate.value <= 0) {
      return {
        depletionEvents: [],
        timelineEvents: []
      };
    }

    const depletionEvents = [];
    const timelineEvents = [];
    let cumulativeResources = 0;

    buckets.filter((bucket) => bucket.included).forEach((bucket) => {
      const metadata = FAMILY_METADATA[bucket.family] || FAMILY_METADATA[BUCKET_FAMILIES.unknown];
      const startMonth = cumulativeResources / burnRate.value;
      const endMonth = (cumulativeResources + bucket.startingValue) / burnRate.value;

      if (metadata.reachedLabel) {
        timelineEvents.push(makeTimelineEvent(
          bucket,
          EVENT_TYPES.bucketReached,
          metadata.reachedLabel,
          startMonth,
          bucket.startingValue,
          burnRate,
          deathDate
        ));
      }

      if (metadata.depletedLabel) {
        const depletionEvent = makeTimelineEvent(
          bucket,
          EVENT_TYPES.bucketDepleted,
          metadata.depletedLabel,
          endMonth,
          bucket.startingValue,
          burnRate,
          deathDate
        );
        depletionEvents.push(depletionEvent);
        timelineEvents.push(depletionEvent);
      }

      cumulativeResources += bucket.startingValue;
    });

    return {
      depletionEvents,
      timelineEvents: timelineEvents.sort((a, b) => {
        const monthDelta = (a.monthOffset ?? 0) - (b.monthOffset ?? 0);
        return monthDelta || String(a.id).localeCompare(String(b.id));
      })
    };
  }

  function summarizeBuckets(buckets, trace) {
    const countsByFamily = {};
    buckets.forEach((bucket) => {
      countsByFamily[bucket.family] = (countsByFamily[bucket.family] || 0) + 1;
    });
    trace.bucketSourceSummary.totalBuckets = buckets.length;
    trace.bucketSourceSummary.includedBuckets = buckets.filter((bucket) => bucket.included).length;
    trace.bucketSourceSummary.countsByFamily = countsByFamily;
  }

  function buildIncomeImpactResourceWaterfall(input) {
    const safeInput = isPlainObject(input) ? input : {};
    const warnings = [];
    const trace = {
      source: SOURCE,
      burnRateSource: null,
      bucketSourceSummary: {},
      assumptions: []
    };

    const buckets = deriveBuckets(safeInput, warnings, trace)
      .map((bucket, index) => Object.assign({}, bucket, { _inputIndex: index }))
      .sort((a, b) => {
        const orderDelta = (a.order ?? getFamilyOrder(a.family)) - (b.order ?? getFamilyOrder(b.family));
        return orderDelta || a._inputIndex - b._inputIndex;
      })
      .map((bucket) => {
        const output = Object.assign({}, bucket);
        delete output._inputIndex;
        return output;
      });
    summarizeBuckets(buckets, trace);

    buckets.forEach((bucket) => {
      bucket.warnings.forEach((warning) => warnings.push(warning));
    });

    const burnRate = resolveBurnRate(safeInput, warnings, trace);
    if (burnRate && burnRate.value <= 0) {
      warnings.push(makeWarning(
        "nonpositive-monthly-burn-rate",
        "Monthly burn rate is zero or negative, so resources are not projected to deplete through this waterfall.",
        burnRate.sourcePath
      ));
    }

    const deathDate = resolveDeathDate(safeInput);
    const eventSets = buildWaterfallEvents(buckets, burnRate, deathDate);

    return {
      version: VERSION,
      buckets,
      depletionEvents: eventSets.depletionEvents,
      timelineEvents: eventSets.timelineEvents,
      warnings,
      trace
    };
  }

  lensAnalysis.buildIncomeImpactResourceWaterfall = buildIncomeImpactResourceWaterfall;
  lensAnalysis.incomeImpactResourceWaterfallEvidenceLevels = EVIDENCE_LEVELS;
  lensAnalysis.incomeImpactResourceWaterfallBucketFamilies = BUCKET_FAMILIES;
  lensAnalysis.incomeImpactResourceWaterfallDefaultOrder = DEFAULT_WATERFALL_ORDER;
  lensAnalysis.incomeImpactResourceWaterfallEventTypes = EVENT_TYPES;

  if (typeof module !== "undefined" && module.exports) {
    module.exports = {
      buildIncomeImpactResourceWaterfall,
      INCOME_IMPACT_RESOURCE_WATERFALL_VERSION: VERSION,
      INCOME_IMPACT_RESOURCE_WATERFALL_SOURCE: SOURCE,
      INCOME_IMPACT_RESOURCE_WATERFALL_EVIDENCE_LEVELS: EVIDENCE_LEVELS,
      INCOME_IMPACT_RESOURCE_WATERFALL_BUCKET_FAMILIES: BUCKET_FAMILIES,
      INCOME_IMPACT_RESOURCE_WATERFALL_DEFAULT_ORDER: DEFAULT_WATERFALL_ORDER,
      INCOME_IMPACT_RESOURCE_WATERFALL_EVENT_TYPES: EVENT_TYPES
    };
  }
})(typeof window !== "undefined" ? window : globalThis);
