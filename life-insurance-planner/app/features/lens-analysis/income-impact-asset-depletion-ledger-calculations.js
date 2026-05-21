(function (global) {
  const LensApp = global.LensApp || (global.LensApp = {});
  const lensAnalysis = LensApp.lensAnalysis || (LensApp.lensAnalysis = {});

  const VERSION = "income-impact-canonical-runway-asset-waterfall-v1";
  const SOURCE = "income-impact-canonical-runway-asset-waterfall";
  const DEFAULT_MAX_MONTHS = 360;

  const STATUS = Object.freeze({
    ready: "ready",
    insufficientData: "insufficient-data",
    notApplicable: "not-applicable"
  });

  const EVENT_TYPES = Object.freeze({
    bucketTapped: "bucket-tapped",
    bucketDepleted: "bucket-depleted"
  });

  const DEFAULT_DEPLETION_ORDER = Object.freeze([
    "existingCoverage",
    "preDeathSavedCash",
    "cash",
    "emergencyFund",
    "otherLiquid",
    "taxableInvestments",
    "educationSavings",
    "retirementAssets",
    "nonqualifiedAnnuities",
    "homeEquity",
    "businessAssets",
    "otherSemiLiquid",
    "otherIlliquid",
    "unknown"
  ]);

  const AUTOMATIC_FAMILIES = Object.freeze(new Set([
    "preDeathSavedCash",
    "cash",
    "emergencyFund",
    "otherLiquid",
    "taxableInvestments"
  ]));

  const GATED_FAMILIES = Object.freeze(new Set([
    "educationSavings",
    "retirementAssets",
    "nonqualifiedAnnuities",
    "homeEquity",
    "businessAssets",
    "otherSemiLiquid",
    "otherIlliquid",
    "unknown"
  ]));

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

  function makeWarning(code, message, sourcePath, details) {
    const warning = { code, message };
    const path = normalizeString(sourcePath);
    if (path) {
      warning.sourcePath = path;
    }
    if (isPlainObject(details)) {
      warning.details = clonePlainValue(details);
    }
    return warning;
  }

  function makeBaseOutput(status, warnings, trace, extra) {
    return Object.assign({
      version: VERSION,
      status,
      orderedBuckets: [],
      ledgerMonths: [],
      bucketEvents: [],
      excludedBuckets: [],
      mechanicalSources: [],
      warnings,
      trace
    }, extra || {});
  }

  function normalizeOptions(input) {
    const rawOptions = isPlainObject(input?.options) ? input.options : {};
    const maxMonths = toOptionalNumber(rawOptions.maxMonths);
    const normalizedMaxMonths = maxMonths == null
      ? DEFAULT_MAX_MONTHS
      : Math.max(0, Math.floor(maxMonths));
    return {
      maxMonths: normalizedMaxMonths,
      growthPolicy: normalizeString(rawOptions.growthPolicy) === "growth-until-tapped" ? "growth-until-tapped" : "none",
      withdrawalTiming: normalizeString(rawOptions.withdrawalTiming) || "beginning-growth-then-end-withdrawal"
    };
  }

  function normalizeDepletionOrder(input) {
    const customOrder = Array.isArray(input?.depletionOrder)
      ? input.depletionOrder.map(normalizeString).filter(Boolean)
      : [];
    if (!customOrder.length) {
      return DEFAULT_DEPLETION_ORDER.slice();
    }
    return Array.from(new Set(customOrder.concat(DEFAULT_DEPLETION_ORDER)));
  }

  function getSeriesValue(series, monthIndex, fallback) {
    if (typeof series === "number" || typeof series === "string") {
      const value = toOptionalNumber(series);
      return value == null ? fallback : value;
    }
    if (Array.isArray(series)) {
      const explicit = series.find(function (entry) {
        if (isPlainObject(entry)) {
          return toOptionalNumber(entry.monthIndex) === monthIndex || toOptionalNumber(entry.monthOffset) === monthIndex;
        }
        return false;
      });
      if (explicit) {
        const value = toOptionalNumber(explicit.amount ?? explicit.value ?? explicit.monthlyAmount);
        return value == null ? fallback : value;
      }
      const indexedValue = toOptionalNumber(series[monthIndex]);
      return indexedValue == null ? fallback : indexedValue;
    }
    return fallback;
  }

  function getScheduledObligationTotal(scheduledObligations, monthIndex) {
    return (Array.isArray(scheduledObligations) ? scheduledObligations : []).reduce(function (total, obligation) {
      const obligationMonth = toOptionalNumber(obligation?.monthIndex ?? obligation?.monthOffset);
      if (obligationMonth !== monthIndex) {
        return total;
      }
      return total + Math.max(toOptionalNumber(obligation?.amount) || 0, 0);
    }, 0);
  }

  function normalizeFamily(value) {
    const family = normalizeString(value);
    if (family === "cashFlowContribution") {
      return "preDeathSavedCash";
    }
    return family || "unknown";
  }

  function getBucketPermissionMode(family) {
    if (family === "existingCoverage") {
      return "mechanical";
    }
    if (AUTOMATIC_FAMILIES.has(family)) {
      return "automatic";
    }
    if (GATED_FAMILIES.has(family)) {
      return "gated";
    }
    return "unsupported";
  }

  function getBucketPermissionSource(bucket) {
    if (bucket.family === "existingCoverage") {
      return "existing-coverage-treatment";
    }
    if (bucket.family === "preDeathSavedCash") {
      return "pre-death-cash-flow-contribution";
    }
    if (normalizeString(bucket.trace?.treatmentSource)) {
      return bucket.trace.treatmentSource;
    }
    if (normalizeString(bucket.trace?.treatmentPreset)) {
      return "asset-treatment-assumption";
    }
    if (bucket.explicitIncluded) {
      return "treated-asset-included";
    }
    return "bucket-input";
  }

  function getBucketSourceAssetIds(rawBucket, id) {
    const rawIds = []
      .concat(Array.isArray(rawBucket?.sourceAssetIds) ? rawBucket.sourceAssetIds : [])
      .concat(rawBucket?.assetId)
      .concat(rawBucket?.trace?.assetId)
      .concat(rawBucket?.trace?.sourceAssetId)
      .concat(id);
    return Array.from(new Set(rawIds.map(normalizeString).filter(Boolean)));
  }

  function shouldIncludeBucket(bucket) {
    const family = bucket.family;
    const permissionMode = getBucketPermissionMode(family);
    if (bucket.included === false) {
      return {
        included: false,
        reason: "bucket-marked-not-included",
        warning: "Bucket is marked included:false and was excluded from the canonical runway asset waterfall.",
        permissionMode
      };
    }
    if (permissionMode === "unsupported") {
      return {
        included: false,
        reason: "unsupported-asset-family",
        warning: "Asset family is not supported by the canonical runway asset waterfall.",
        permissionMode
      };
    }
    if (permissionMode === "gated" && bucket.explicitIncluded !== true) {
      return {
        included: false,
        reason: "gated-family-not-treatment-included",
        warning: "Gated asset family was excluded because existing treatment output did not mark it included.",
        permissionMode
      };
    }
    return {
      included: true,
      permissionMode,
      permissionSource: getBucketPermissionSource(bucket)
    };
  }

  function normalizeBucket(rawBucket, index, warnings, source) {
    const family = normalizeFamily(rawBucket?.family);
    const startingValue = toOptionalNumber(rawBucket?.startingValue ?? rawBucket?.value ?? rawBucket?.amount);
    const id = normalizeString(rawBucket?.id) || `${family}-${index + 1}`;
    const sourcePath = normalizeString(rawBucket?.sourcePath);
    const explicitIncluded = rawBucket?.included === true;
    const included = rawBucket?.included !== false;
    const roundedStartingValue = Math.max(roundMoney(startingValue || 0), 0);
    const baseBucket = {
      id,
      bucketId: id,
      family,
      category: family,
      label: normalizeString(rawBucket?.label) || family,
      startingValue: roundedStartingValue,
      value: roundedStartingValue,
      availableValue: roundedStartingValue,
      included,
      explicitIncluded,
      liquidityTier: normalizeString(rawBucket?.liquidityTier),
      growthActive: rawBucket?.growthActive === true,
      monthlyGrowthRate: toOptionalNumber(rawBucket?.monthlyGrowthRate) || 0,
      sourcePath,
      sourceAssetIds: getBucketSourceAssetIds(rawBucket, id),
      evidenceLevel: normalizeString(rawBucket?.evidenceLevel) || "trace-backed",
      trace: isPlainObject(rawBucket?.trace) ? clonePlainValue(rawBucket.trace) : {}
    };

    if (startingValue == null || startingValue <= 0) {
      const reason = startingValue == null ? "missing-starting-value" : "nonpositive-starting-value";
      warnings.push(makeWarning(
        reason,
        "Bucket was excluded because it did not have a positive spendable starting value.",
        sourcePath,
        { bucketId: id, family, source }
      ));
      return {
        excluded: Object.assign({}, baseBucket, { included: false, reason })
      };
    }

    const includeDecision = shouldIncludeBucket(baseBucket);
    if (!includeDecision.included) {
      warnings.push(makeWarning(
        includeDecision.reason,
        includeDecision.warning,
        sourcePath,
        { bucketId: id, family, source }
      ));
      return {
        excluded: Object.assign({}, baseBucket, {
          included: false,
          reason: includeDecision.reason,
          permissionMode: includeDecision.permissionMode,
          permissionSource: getBucketPermissionSource(baseBucket)
        })
      };
    }

    return {
      bucket: Object.assign({}, baseBucket, {
        automatic: includeDecision.permissionMode === "automatic",
        gated: includeDecision.permissionMode === "gated",
        excluded: false,
        permissionMode: includeDecision.permissionMode,
        permissionSource: includeDecision.permissionSource || getBucketPermissionSource(baseBucket),
        treatmentSource: getBucketPermissionSource(baseBucket),
        balance: baseBucket.startingValue,
        tapped: false,
        depleted: false,
        source,
        growthStoppedAfterTap: false
      })
    };
  }

  function normalizeExistingCoverageBucket(rawBucket, warnings) {
    if (!isPlainObject(rawBucket)) {
      return null;
    }
    return normalizeBucket(Object.assign({}, rawBucket, {
      id: normalizeString(rawBucket.id) || "existing-coverage",
      family: "existingCoverage",
      label: normalizeString(rawBucket.label) || "Existing coverage proceeds",
      trace: Object.assign({}, isPlainObject(rawBucket.trace) ? rawBucket.trace : {}, {
        mechanicalOnly: true,
        visibleStorylineEligible: false
      })
    }), 0, warnings, "existingCoverageBucket");
  }

  function snapshotBuckets(buckets) {
    return buckets.map(function (bucket) {
      return {
        id: bucket.id,
        bucketId: bucket.id,
        family: bucket.family,
        label: bucket.label,
        balance: roundMoney(bucket.balance),
        startingValue: bucket.startingValue,
        availableValue: bucket.availableValue,
        permissionMode: bucket.permissionMode,
        permissionSource: bucket.permissionSource,
        sourcePath: bucket.sourcePath,
        sourceAssetIds: bucket.sourceAssetIds,
        evidenceLevel: bucket.evidenceLevel
      };
    });
  }

  function sumBucketBalances(buckets) {
    return roundMoney(buckets.reduce(function (total, bucket) {
      return total + Math.max(toOptionalNumber(bucket.balance) || 0, 0);
    }, 0));
  }

  function makeBucketEvent(eventType, bucket, monthIndex, amountAtTap, amountDepleted, trace) {
    const mechanicalLedgerEvent = bucket.family === "existingCoverage" || bucket.trace?.mechanicalOnly === true;
    const visibleStorylineEligible = mechanicalLedgerEvent !== true
      && bucket.trace?.visibleStorylineEligible !== false
      && bucket.trace?.syntheticSurplusBucket !== true;
    return {
      eventType,
      bucketId: bucket.id,
      family: bucket.family,
      label: bucket.label,
      monthIndex,
      amountAtTap: amountAtTap == null ? null : roundMoney(amountAtTap),
      amountDepleted: amountDepleted == null ? null : roundMoney(amountDepleted),
      sourcePath: bucket.sourcePath,
      evidenceLevel: bucket.evidenceLevel,
      permissionMode: bucket.permissionMode,
      permissionSource: bucket.permissionSource,
      sourceAssetIds: Array.isArray(bucket.sourceAssetIds) ? bucket.sourceAssetIds.slice() : [],
      trace: Object.assign({
        source: SOURCE,
        mechanicalLedgerEvent,
        visibleStorylineEligible,
        permissionMode: bucket.permissionMode,
        permissionSource: bucket.permissionSource,
        bucketSourcePath: bucket.sourcePath
      }, trace || {})
    };
  }

  function sortBucketsByOrder(buckets, depletionOrder) {
    return buckets.slice().sort(function (left, right) {
      const leftIndex = depletionOrder.indexOf(left.family);
      const rightIndex = depletionOrder.indexOf(right.family);
      const safeLeftIndex = leftIndex === -1 ? Number.MAX_SAFE_INTEGER : leftIndex;
      const safeRightIndex = rightIndex === -1 ? Number.MAX_SAFE_INTEGER : rightIndex;
      return safeLeftIndex - safeRightIndex || left.id.localeCompare(right.id);
    });
  }

  function applyWithdrawal(buckets, depletionOrder, amount, monthIndex, bucketEvents) {
    let remaining = roundMoney(Math.max(amount, 0));
    const withdrawalsByBucket = [];
    if (remaining <= 0) {
      return { withdrawalsByBucket, unmetNeed: 0 };
    }

    sortBucketsByOrder(buckets, depletionOrder).forEach(function (bucket) {
      if (remaining <= 0 || bucket.balance <= 0) {
        return;
      }
      const balanceBeforeWithdrawal = roundMoney(bucket.balance);
      const withdrawal = roundMoney(Math.min(balanceBeforeWithdrawal, remaining));
      if (withdrawal <= 0) {
        return;
      }
      if (!bucket.tapped) {
        bucket.tapped = true;
        bucket.growthStoppedAfterTap = bucket.growthActive === true;
        bucketEvents.push(makeBucketEvent(
          EVENT_TYPES.bucketTapped,
          bucket,
          monthIndex,
          balanceBeforeWithdrawal,
          null,
          { withdrawalAmount: withdrawal }
        ));
      }
      bucket.balance = roundMoney(bucket.balance - withdrawal);
      remaining = roundMoney(remaining - withdrawal);
      withdrawalsByBucket.push({
        bucketId: bucket.id,
        family: bucket.family,
        amount: withdrawal,
        balanceBeforeWithdrawal,
        balanceAfterWithdrawal: roundMoney(bucket.balance)
      });
      if (bucket.balance <= 0 && !bucket.depleted) {
        bucket.depleted = true;
        bucket.balance = 0;
        bucketEvents.push(makeBucketEvent(
          EVENT_TYPES.bucketDepleted,
          bucket,
          monthIndex,
          null,
          withdrawal,
          { balanceBeforeWithdrawal }
        ));
      }
    });

    return {
      withdrawalsByBucket,
      unmetNeed: roundMoney(remaining)
    };
  }

  function applyImmediateObligations(buckets, depletionOrder, amount) {
    const immediateAmount = roundMoney(Math.max(toOptionalNumber(amount) || 0, 0));
    if (immediateAmount <= 0) {
      return [];
    }
    let remaining = immediateAmount;
    const withdrawals = [];
    sortBucketsByOrder(buckets, depletionOrder).forEach(function (bucket) {
      if (remaining <= 0 || bucket.balance <= 0) {
        return;
      }
      const balanceBeforeWithdrawal = roundMoney(bucket.balance);
      const withdrawal = roundMoney(Math.min(balanceBeforeWithdrawal, remaining));
      bucket.balance = roundMoney(bucket.balance - withdrawal);
      bucket.tapped = true;
      bucket.growthStoppedAfterTap = bucket.growthActive === true;
      remaining = roundMoney(remaining - withdrawal);
      withdrawals.push({
        bucketId: bucket.id,
        family: bucket.family,
        amount: withdrawal,
        balanceBeforeWithdrawal,
        balanceAfterWithdrawal: roundMoney(bucket.balance),
        mechanicalOnly: true
      });
      if (bucket.balance <= 0) {
        bucket.balance = 0;
        bucket.depleted = true;
      }
    });
    return withdrawals;
  }

  function applyGrowth(buckets, options) {
    if (options.growthPolicy !== "growth-until-tapped") {
      return [];
    }
    return buckets.map(function (bucket) {
      if (!bucket.growthActive || bucket.tapped || bucket.balance <= 0 || bucket.monthlyGrowthRate <= 0) {
        return null;
      }
      const balanceBeforeGrowth = roundMoney(bucket.balance);
      const growthAmount = roundMoney(balanceBeforeGrowth * bucket.monthlyGrowthRate);
      if (growthAmount <= 0) {
        return null;
      }
      bucket.balance = roundMoney(bucket.balance + growthAmount);
      return {
        bucketId: bucket.id,
        family: bucket.family,
        amount: growthAmount,
        balanceBeforeGrowth,
        balanceAfterGrowth: roundMoney(bucket.balance)
      };
    }).filter(Boolean);
  }

  function createSyntheticSurplusBucket() {
    return {
      id: "survivor-income-surplus-reserve",
      family: "cash",
      label: "Survivor income surplus reserve",
      startingValue: 0,
      included: true,
      liquidityTier: "liquid",
      growthActive: false,
      monthlyGrowthRate: 0,
      sourcePath: "layer3.points[].survivorIncome",
      evidenceLevel: "trace-backed",
      trace: {
        source: SOURCE,
        visibleStorylineEligible: false,
        syntheticSurplusBucket: true
      },
      balance: 0,
      tapped: false,
      depleted: false,
      source: "survivorIncomeSurplus",
      growthStoppedAfterTap: false
    };
  }

  function hasPotentialSurplusMonth(input, options) {
    for (let monthIndex = 0; monthIndex < options.maxMonths; monthIndex += 1) {
      const monthlyNeeds = Math.max(getSeriesValue(input.monthlyNeeds, monthIndex, 0), 0);
      const monthlyIncome = Math.max(getSeriesValue(input.monthlyIncome, monthIndex, 0), 0);
      const scheduledObligations = getScheduledObligationTotal(input.scheduledObligations, monthIndex);
      if (roundMoney(monthlyIncome - monthlyNeeds - scheduledObligations) > 0) {
        return true;
      }
    }
    return false;
  }

  function findSurplusDepositBucket(buckets) {
    return buckets.find(function (bucket) {
      return bucket.family === "cash" && bucket.included !== false;
    }) || null;
  }

  function applySurplusDeposit(buckets, amount) {
    const surplusAmount = roundMoney(Math.max(amount, 0));
    if (surplusAmount <= 0) {
      return {
        surplusDepositsByBucket: [],
        surplusDepositedToBucketId: null,
        surplusDepositedToBucketFamily: null
      };
    }
    const bucket = findSurplusDepositBucket(buckets);
    if (!bucket) {
      return {
        surplusDepositsByBucket: [],
        surplusDepositedToBucketId: null,
        surplusDepositedToBucketFamily: null
      };
    }
    const balanceBeforeDeposit = roundMoney(bucket.balance);
    bucket.balance = roundMoney(bucket.balance + surplusAmount);
    if (bucket.balance > 0 && bucket.depleted) {
      bucket.depleted = false;
    }
    return {
      surplusDepositsByBucket: [{
        bucketId: bucket.id,
        family: bucket.family,
        amount: surplusAmount,
        balanceBeforeDeposit,
        balanceAfterDeposit: roundMoney(bucket.balance)
      }],
      surplusDepositedToBucketId: bucket.id,
      surplusDepositedToBucketFamily: bucket.family
    };
  }

  function summarizeBucketEvents(bucketEvents) {
    return (Array.isArray(bucketEvents) ? bucketEvents : []).reduce(function (summary, event) {
      const bucketId = normalizeString(event?.bucketId);
      if (!bucketId) {
        return summary;
      }
      const current = summary[bucketId] || {};
      const monthIndex = toOptionalNumber(event.monthIndex);
      if (event.eventType === EVENT_TYPES.bucketTapped && monthIndex != null) {
        current.firstUsedMonth = current.firstUsedMonth == null
          ? monthIndex
          : Math.min(current.firstUsedMonth, monthIndex);
      }
      if (event.eventType === EVENT_TYPES.bucketDepleted && monthIndex != null) {
        current.depletionMonth = current.depletionMonth == null
          ? monthIndex
          : Math.min(current.depletionMonth, monthIndex);
      }
      summary[bucketId] = current;
      return summary;
    }, {});
  }

  function summarizeBucket(bucket, eventSummary, order, index) {
    const events = eventSummary[bucket.id] || {};
    return {
      bucketId: bucket.id,
      label: bucket.label,
      order,
      category: bucket.family,
      family: bucket.family,
      value: roundMoney(bucket.startingValue),
      availableValue: roundMoney(bucket.startingValue),
      automatic: bucket.permissionMode === "automatic",
      gated: bucket.permissionMode === "gated",
      excluded: false,
      permissionMode: bucket.permissionMode,
      permissionSource: bucket.permissionSource,
      treatmentSource: bucket.treatmentSource || bucket.permissionSource,
      sourceAssetIds: Array.isArray(bucket.sourceAssetIds) ? bucket.sourceAssetIds.slice() : [],
      sourcePath: bucket.sourcePath,
      evidenceLevel: bucket.evidenceLevel,
      depletionMonth: events.depletionMonth == null ? null : events.depletionMonth,
      firstUsedMonth: events.firstUsedMonth == null ? null : events.firstUsedMonth,
      trace: Object.assign({}, isPlainObject(bucket.trace) ? clonePlainValue(bucket.trace) : {}, {
        source: SOURCE,
        sortedIndex: index,
        permissionMode: bucket.permissionMode,
        permissionSource: bucket.permissionSource,
        finalBalance: roundMoney(bucket.balance)
      })
    };
  }

  function buildOrderedBuckets(buckets, depletionOrder, bucketEvents) {
    const eventSummary = summarizeBucketEvents(bucketEvents);
    return sortBucketsByOrder(buckets, depletionOrder)
      .filter(function (bucket) {
        return bucket.family !== "existingCoverage" && bucket.trace?.syntheticSurplusBucket !== true;
      })
      .map(function (bucket, index) {
        return summarizeBucket(
          bucket,
          eventSummary,
          depletionOrder.indexOf(bucket.family) === -1 ? DEFAULT_DEPLETION_ORDER.length + index : depletionOrder.indexOf(bucket.family),
          index
        );
      });
  }

  function buildMechanicalSources(buckets, depletionOrder, bucketEvents, immediateWithdrawals) {
    const eventSummary = summarizeBucketEvents(bucketEvents);
    const coverageSources = sortBucketsByOrder(buckets, depletionOrder)
      .filter(function (bucket) { return bucket.family === "existingCoverage"; })
      .map(function (bucket, index) {
        return Object.assign(summarizeBucket(bucket, eventSummary, 0, index), {
          mechanicalOnly: true,
          automatic: true,
          gated: false
        });
      });
    const immediateSource = Array.isArray(immediateWithdrawals) && immediateWithdrawals.length
      ? [{
          id: "immediate-obligations",
          type: "immediate-obligations",
          label: "Immediate obligations",
          mechanicalOnly: true,
          amount: roundMoney(immediateWithdrawals.reduce(function (total, withdrawal) {
            return total + Math.max(toOptionalNumber(withdrawal.amount) || 0, 0);
          }, 0)),
          withdrawalsByBucket: clonePlainValue(immediateWithdrawals),
          trace: {
            source: SOURCE,
            visibleStorylineEligible: false
          }
        }]
      : [];
    return coverageSources.concat(immediateSource);
  }

  function buildIncomeImpactAssetDepletionLedger(input) {
    const safeInput = isPlainObject(input) ? input : {};
    const options = normalizeOptions(safeInput);
    const warnings = [];
    const depletionOrder = normalizeDepletionOrder(safeInput);
    const trace = {
      source: SOURCE,
      depletionOrder: depletionOrder.slice(),
      canonicalWaterfall: true,
      growthPolicy: options.growthPolicy,
      treatmentSource: "startingBuckets-treated-values",
      totalResourcesReconciliation: {
        verified: true,
        monthsChecked: 0
      },
      assumptions: [
        "startingBucket.startingValue is treated as the already-treated spendable balance",
        "gated buckets are included only when the supplied treatment output marks the bucket included",
        "existing coverage proceeds are a mechanical source and not a normal story asset bucket"
      ],
      totalSurplusDeposited: 0,
      surplusDepositPolicy: {
        mode: "existing-cash-first",
        fallbackBucketId: "survivor-income-surplus-reserve",
        fallbackBucketFamily: "cash",
        emergencyFundDepositDefault: false,
        growthOnSurplusDeposits: false
      },
      syntheticSurplusBucketCreated: false
    };

    const hasMonthlyNeeds = safeInput.monthlyNeeds != null;
    if (!hasMonthlyNeeds) {
      warnings.push(makeWarning(
        "monthly-needs-missing",
        "Monthly needs are required to build the asset depletion ledger.",
        "input.monthlyNeeds"
      ));
      return makeBaseOutput(STATUS.insufficientData, warnings, trace);
    }

    const normalizedBuckets = [];
    const excludedBuckets = [];
    const coverageResult = normalizeExistingCoverageBucket(safeInput.existingCoverageBucket, warnings);
    if (coverageResult?.bucket) {
      normalizedBuckets.push(coverageResult.bucket);
    }
    if (coverageResult?.excluded) {
      excludedBuckets.push(coverageResult.excluded);
    }

    (Array.isArray(safeInput.startingBuckets) ? safeInput.startingBuckets : []).forEach(function (bucket, index) {
      const result = normalizeBucket(bucket, index, warnings, "startingBuckets");
      if (result.bucket) {
        normalizedBuckets.push(result.bucket);
      }
      if (result.excluded) {
        excludedBuckets.push(result.excluded);
      }
    });

    if (!normalizedBuckets.some(function (bucket) { return bucket.family === "cash"; }) && hasPotentialSurplusMonth(safeInput, options)) {
      const syntheticSurplusBucket = createSyntheticSurplusBucket();
      normalizedBuckets.push(syntheticSurplusBucket);
      trace.syntheticSurplusBucketCreated = true;
      trace.syntheticSurplusBucket = {
        id: syntheticSurplusBucket.id,
        family: syntheticSurplusBucket.family,
        included: syntheticSurplusBucket.included,
        growthActive: syntheticSurplusBucket.growthActive,
        sourcePath: syntheticSurplusBucket.sourcePath,
        visibleStorylineEligible: syntheticSurplusBucket.trace.visibleStorylineEligible,
        syntheticSurplusBucket: syntheticSurplusBucket.trace.syntheticSurplusBucket
      };
    }

    if (!normalizedBuckets.length) {
      warnings.push(makeWarning(
        "no-spendable-buckets",
        "No positive included spendable buckets were available for the asset depletion ledger.",
        "input.startingBuckets"
      ));
      return makeBaseOutput(STATUS.notApplicable, warnings, trace, {
        excludedBuckets
      });
    }

    const buckets = sortBucketsByOrder(normalizedBuckets, depletionOrder);
    const immediateWithdrawals = applyImmediateObligations(
      buckets,
      depletionOrder,
      safeInput.immediateObligations
    );
    if (immediateWithdrawals.length) {
      trace.immediateObligations = {
        amount: roundMoney(Math.max(toOptionalNumber(safeInput.immediateObligations) || 0, 0)),
        withdrawalsByBucket: clonePlainValue(immediateWithdrawals),
        mechanicalOnly: true,
        visibleStorylineEligible: false
      };
    }

    const ledgerMonths = [];
    const bucketEvents = [];
    for (let monthIndex = 0; monthIndex < options.maxMonths; monthIndex += 1) {
      const startingBuckets = snapshotBuckets(buckets);
      const growthAppliedByBucket = applyGrowth(buckets, options);
      const monthlyNeeds = Math.max(getSeriesValue(safeInput.monthlyNeeds, monthIndex, 0), 0);
      const monthlyIncome = Math.max(getSeriesValue(safeInput.monthlyIncome, monthIndex, 0), 0);
      const scheduledObligations = getScheduledObligationTotal(safeInput.scheduledObligations, monthIndex);
      const monthlyNetCashFlow = roundMoney(monthlyIncome - monthlyNeeds - scheduledObligations);
      const monthlyNetUse = roundMoney(Math.max(-monthlyNetCashFlow, 0));
      const surplusAmount = roundMoney(Math.max(monthlyNetCashFlow, 0));
      const surplusDepositResult = applySurplusDeposit(buckets, surplusAmount);
      trace.totalSurplusDeposited = roundMoney(trace.totalSurplusDeposited + surplusAmount);
      const withdrawalResult = applyWithdrawal(buckets, depletionOrder, monthlyNetUse, monthIndex, bucketEvents);
      const endingBuckets = snapshotBuckets(buckets);
      const totalAvailableResources = sumBucketBalances(buckets);
      const endingBucketTotal = roundMoney(endingBuckets.reduce(function (total, bucket) {
        return total + bucket.balance;
      }, 0));
      if (totalAvailableResources !== endingBucketTotal) {
        trace.totalResourcesReconciliation.verified = false;
      }
      ledgerMonths.push({
        monthIndex,
        startingBuckets,
        growthAppliedByBucket,
        withdrawalsByBucket: withdrawalResult.withdrawalsByBucket,
        endingBuckets,
        totalAvailableResources,
        monthlyNeeds,
        monthlyIncome,
        scheduledObligations,
        monthlyNetCashFlow,
        monthlyNetUse,
        surplusAmount,
        surplusDepositsByBucket: surplusDepositResult.surplusDepositsByBucket,
        surplusDepositedToBucketId: surplusDepositResult.surplusDepositedToBucketId,
        surplusDepositedToBucketFamily: surplusDepositResult.surplusDepositedToBucketFamily,
        unmetNeed: withdrawalResult.unmetNeed
      });
    }

    trace.totalResourcesReconciliation.monthsChecked = ledgerMonths.length;
    trace.totalResourcesReconciliation.initialSpendableResources = roundMoney(
      buckets.reduce(function (total, bucket) {
        const initialBucket = normalizedBuckets.find(function (candidate) {
          return candidate.id === bucket.id;
        });
        return total + (initialBucket ? initialBucket.startingValue : 0);
      }, 0)
    );
    trace.totalResourcesReconciliation.finalSpendableResources = ledgerMonths.length
      ? ledgerMonths[ledgerMonths.length - 1].totalAvailableResources
      : sumBucketBalances(buckets);

    const orderedBuckets = buildOrderedBuckets(buckets, depletionOrder, bucketEvents);
    const mechanicalSources = buildMechanicalSources(buckets, depletionOrder, bucketEvents, immediateWithdrawals);

    return {
      version: VERSION,
      status: STATUS.ready,
      orderedBuckets,
      ledgerMonths,
      bucketEvents,
      excludedBuckets,
      mechanicalSources,
      warnings,
      trace
    };
  }

  lensAnalysis.incomeImpactAssetDepletionLedgerCalculations = Object.freeze({
    buildIncomeImpactAssetDepletionLedger,
    buildIncomeImpactCanonicalRunwayAssetWaterfall: buildIncomeImpactAssetDepletionLedger
  });
  lensAnalysis.buildIncomeImpactAssetDepletionLedger = buildIncomeImpactAssetDepletionLedger;
  lensAnalysis.buildIncomeImpactCanonicalRunwayAssetWaterfall = buildIncomeImpactAssetDepletionLedger;
  lensAnalysis.incomeImpactAssetDepletionLedgerDefaultOrder = DEFAULT_DEPLETION_ORDER;
  lensAnalysis.incomeImpactCanonicalRunwayAssetWaterfallDefaultOrder = DEFAULT_DEPLETION_ORDER;
  lensAnalysis.incomeImpactAssetDepletionLedgerEventTypes = EVENT_TYPES;
  lensAnalysis.incomeImpactCanonicalRunwayAssetWaterfallEventTypes = EVENT_TYPES;

  if (typeof module !== "undefined" && module.exports) {
    module.exports = {
      buildIncomeImpactAssetDepletionLedger,
      buildIncomeImpactCanonicalRunwayAssetWaterfall: buildIncomeImpactAssetDepletionLedger,
      INCOME_IMPACT_ASSET_DEPLETION_LEDGER_VERSION: VERSION,
      INCOME_IMPACT_ASSET_DEPLETION_LEDGER_SOURCE: SOURCE,
      INCOME_IMPACT_ASSET_DEPLETION_LEDGER_DEFAULT_ORDER: DEFAULT_DEPLETION_ORDER,
      INCOME_IMPACT_ASSET_DEPLETION_LEDGER_EVENT_TYPES: EVENT_TYPES,
      INCOME_IMPACT_CANONICAL_RUNWAY_ASSET_WATERFALL_VERSION: VERSION,
      INCOME_IMPACT_CANONICAL_RUNWAY_ASSET_WATERFALL_SOURCE: SOURCE,
      INCOME_IMPACT_CANONICAL_RUNWAY_ASSET_WATERFALL_DEFAULT_ORDER: DEFAULT_DEPLETION_ORDER,
      INCOME_IMPACT_CANONICAL_RUNWAY_ASSET_WATERFALL_EVENT_TYPES: EVENT_TYPES
    };
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
