(function (global) {
  const LensApp = global.LensApp || (global.LensApp = {});
  const lensAnalysis = LensApp.lensAnalysis || (LensApp.lensAnalysis = {});

  // Owner: read-only planning bucket policy summary for household expense policy migration.
  // Non-goals: no policy resolution, slider math, admin editing, storage, compression, or rendering behavior.

  const SUMMARY_VERSION = 1;
  const SOURCE_OWNED_REASONS = Object.freeze([
    "sourceOwnedDebt",
    "sourceOwnedFinalExpense",
    "sourceOwnedHealthcare",
    "sourceOwnedEducation"
  ]);

  function normalizeKey(value) {
    return String(value == null ? "" : value).trim();
  }

  function clonePlainValue(value) {
    if (Array.isArray(value)) {
      return value.map(clonePlainValue);
    }

    if (value && typeof value === "object") {
      return Object.keys(value).sort().reduce(function (clone, key) {
        clone[key] = clonePlainValue(value[key]);
        return clone;
      }, {});
    }

    return value;
  }

  function uniqueSorted(values) {
    return Array.from(new Set(values.filter(function (value) {
      return value !== null && value !== undefined && value !== "";
    }).map(String))).sort();
  }

  function getDefaultLibraryRows() {
    const library = lensAnalysis.expenseLibrary;
    return library && typeof library.getExpenseLibraryEntries === "function"
      ? library.getExpenseLibraryEntries()
      : [];
  }

  function getDefaultLifestylePolicyRows() {
    const policy = lensAnalysis.householdExpenseLifestyleRangePolicy;
    return policy && typeof policy.listLifestyleRangePolicies === "function"
      ? policy.listLifestyleRangePolicies()
      : [];
  }

  function getDefaultPlanningBuckets() {
    const library = lensAnalysis.expenseLibrary;
    return library && typeof library.getExpensePlanningBuckets === "function"
      ? library.getExpensePlanningBuckets()
      : [];
  }

  function getExplicitList(value, fallback) {
    return Array.isArray(value) ? value.map(clonePlainValue) : fallback().map(clonePlainValue);
  }

  function mapLibraryRowsByType(libraryRows) {
    return libraryRows.reduce(function (map, row) {
      const typeKey = normalizeKey(row && (row.typeKey || row.expenseTypeKey));
      if (typeKey) {
        map[typeKey] = row;
      }
      return map;
    }, {});
  }

  function mapPlanningBucketMetadata(planningBuckets, libraryRows) {
    const map = planningBuckets.reduce(function (bucketMap, bucket) {
      const key = normalizeKey(bucket && bucket.planningBucketKey);
      if (key) {
        bucketMap[key] = bucket;
      }
      return bucketMap;
    }, {});

    libraryRows.forEach(function (row) {
      const key = normalizeKey(row && row.planningBucketKey);
      if (key && !map[key]) {
        map[key] = {
          planningBucketKey: key,
          planningBucketLabel: row.planningBucketLabel || key,
          lifestyleTreatmentIncluded: row.lifestyleTreatmentIncluded,
          lifestyleTreatmentReason: row.lifestyleTreatmentReason
        };
      }
    });

    return map;
  }

  function createRatioSet(policyRow) {
    return {
      conservativeFloorRatio: typeof policyRow.conservativeFloorRatio === "number" ? policyRow.conservativeFloorRatio : null,
      elevatedCeilingRatio: typeof policyRow.elevatedCeilingRatio === "number" ? policyRow.elevatedCeilingRatio : null,
      rangeBehavior: normalizeKey(policyRow.rangeBehavior) || null,
      sourcePolicyDecision: normalizeKey(policyRow.sourcePolicyDecision) || null,
      sliderEligible: policyRow.sliderEligible === true
    };
  }

  function getRatioSetKey(ratioSet) {
    return [
      ratioSet.sliderEligible ? "slider" : "locked",
      ratioSet.rangeBehavior,
      ratioSet.conservativeFloorRatio,
      ratioSet.elevatedCeilingRatio,
      ratioSet.sourcePolicyDecision
    ].join("|");
  }

  function upsertRatioSet(bucket, ratioSet, expenseTypeKey) {
    const key = getRatioSetKey(ratioSet);
    const existing = bucket._ratioSetMap[key];
    if (existing) {
      existing.expenseTypeKeys.push(expenseTypeKey);
      existing.expenseTypeKeys = uniqueSorted(existing.expenseTypeKeys);
      return;
    }

    bucket._ratioSetMap[key] = Object.assign({}, ratioSet, {
      expenseTypeKeys: [expenseTypeKey]
    });
  }

  function createBucketSummary(bucketKey, bucketMetadata) {
    return {
      planningBucketKey: bucketKey,
      planningBucketLabel: bucketMetadata && bucketMetadata.planningBucketLabel || bucketKey,
      lifestylePolicyRowCount: 0,
      sliderEligibleRowCount: 0,
      expenseTypeKeys: [],
      sliderEligibleExpenseTypeKeys: [],
      distinctRatioSets: [],
      distinctRangeBehaviorValues: [],
      distinctLifestyleTreatmentIncludedValues: [],
      distinctLifestyleTreatmentReasonValues: [],
      exceptionCandidates: [],
      cleanBucketCandidate: false,
      _ratioSetMap: {}
    };
  }

  function addException(bucket, expenseTypeKey, code, message) {
    bucket.exceptionCandidates.push({
      expenseTypeKey,
      code,
      message
    });
  }

  function populateBucketRow(bucket, policyRow, libraryRow) {
    const expenseTypeKey = normalizeKey(policyRow.expenseTypeKey || policyRow.typeKey);
    const sliderEligible = policyRow.sliderEligible === true;
    const treatmentIncluded = libraryRow.lifestyleTreatmentIncluded;
    const treatmentReason = normalizeKey(libraryRow.lifestyleTreatmentReason);

    bucket.lifestylePolicyRowCount += 1;
    bucket.expenseTypeKeys.push(expenseTypeKey);
    if (sliderEligible) {
      bucket.sliderEligibleRowCount += 1;
      bucket.sliderEligibleExpenseTypeKeys.push(expenseTypeKey);
    }

    bucket.distinctRangeBehaviorValues.push(policyRow.rangeBehavior);
    bucket.distinctLifestyleTreatmentIncludedValues.push(String(treatmentIncluded));
    bucket.distinctLifestyleTreatmentReasonValues.push(treatmentReason);
    upsertRatioSet(bucket, createRatioSet(policyRow), expenseTypeKey);

    if (sliderEligible && treatmentIncluded !== true) {
      addException(
        bucket,
        expenseTypeKey,
        "slider-eligible-metadata-excluded",
        "Lifestyle policy row is slider eligible while planning bucket metadata is excluded."
      );
    }

    if (!sliderEligible && treatmentIncluded === true) {
      addException(
        bucket,
        expenseTypeKey,
        "locked-policy-metadata-included",
        "Lifestyle policy row is locked while planning bucket metadata is included."
      );
    }

    if (SOURCE_OWNED_REASONS.indexOf(treatmentReason) !== -1 && sliderEligible) {
      addException(
        bucket,
        expenseTypeKey,
        "source-owned-slider-eligible",
        "Source-owned planning metadata should not become an editable bucket control by default."
      );
    }
  }

  function finalizeBucket(bucket) {
    const sliderRatioSets = Object.keys(bucket._ratioSetMap)
      .map(function (key) {
        return bucket._ratioSetMap[key];
      })
      .filter(function (ratioSet) {
        return ratioSet.sliderEligible === true;
      });

    bucket.expenseTypeKeys = uniqueSorted(bucket.expenseTypeKeys);
    bucket.sliderEligibleExpenseTypeKeys = uniqueSorted(bucket.sliderEligibleExpenseTypeKeys);
    bucket.distinctRatioSets = Object.keys(bucket._ratioSetMap)
      .sort()
      .map(function (key) {
        const ratioSet = bucket._ratioSetMap[key];
        return Object.assign({}, ratioSet, {
          expenseTypeKeys: uniqueSorted(ratioSet.expenseTypeKeys)
        });
      });
    bucket.distinctRangeBehaviorValues = uniqueSorted(bucket.distinctRangeBehaviorValues);
    bucket.distinctLifestyleTreatmentIncludedValues = uniqueSorted(bucket.distinctLifestyleTreatmentIncludedValues);
    bucket.distinctLifestyleTreatmentReasonValues = uniqueSorted(bucket.distinctLifestyleTreatmentReasonValues);
    bucket.exceptionCandidates = bucket.exceptionCandidates.sort(function (left, right) {
      return left.expenseTypeKey.localeCompare(right.expenseTypeKey) || left.code.localeCompare(right.code);
    });
    bucket.cleanBucketCandidate = bucket.sliderEligibleRowCount > 0
      && sliderRatioSets.length === 1
      && bucket.distinctLifestyleTreatmentIncludedValues.length === 1
      && bucket.distinctLifestyleTreatmentIncludedValues[0] === "true"
      && bucket.distinctLifestyleTreatmentReasonValues.every(function (reason) {
        return SOURCE_OWNED_REASONS.indexOf(reason) === -1;
      })
      && bucket.exceptionCandidates.length === 0;

    delete bucket._ratioSetMap;
    return bucket;
  }

  function summarizeHouseholdExpensePlanningBucketPolicy(input) {
    const options = input && typeof input === "object" ? input : {};
    const libraryRows = getExplicitList(options.libraryRows || options.expenseLibraryRows, getDefaultLibraryRows);
    const lifestylePolicyRows = getExplicitList(options.lifestylePolicyRows || options.lifestyleRangePolicies, getDefaultLifestylePolicyRows);
    const planningBuckets = getExplicitList(options.planningBuckets, getDefaultPlanningBuckets);
    const libraryByType = mapLibraryRowsByType(libraryRows);
    const bucketMetadataByKey = mapPlanningBucketMetadata(planningBuckets, libraryRows);
    const bucketSummariesByKey = {};
    const unresolvedLifestylePolicyRows = [];

    lifestylePolicyRows.forEach(function (policyRow) {
      const expenseTypeKey = normalizeKey(policyRow && (policyRow.expenseTypeKey || policyRow.typeKey));
      const libraryRow = libraryByType[expenseTypeKey];
      if (!expenseTypeKey || !libraryRow || !normalizeKey(libraryRow.planningBucketKey)) {
        unresolvedLifestylePolicyRows.push({
          expenseTypeKey: expenseTypeKey || null,
          issue: !expenseTypeKey ? "missing-expense-type-key" : "missing-library-planning-bucket"
        });
        return;
      }

      const bucketKey = normalizeKey(libraryRow.planningBucketKey);
      const bucketMetadata = bucketMetadataByKey[bucketKey] || libraryRow;
      const bucket = bucketSummariesByKey[bucketKey] || createBucketSummary(bucketKey, bucketMetadata);
      bucketSummariesByKey[bucketKey] = bucket;
      populateBucketRow(bucket, policyRow, libraryRow);
    });

    const planningBucketOrder = planningBuckets.map(function (bucket) {
      return normalizeKey(bucket && bucket.planningBucketKey);
    }).filter(Boolean);
    const summaryBuckets = Object.keys(bucketSummariesByKey)
      .sort(function (left, right) {
        const leftIndex = planningBucketOrder.indexOf(left);
        const rightIndex = planningBucketOrder.indexOf(right);
        if (leftIndex !== -1 || rightIndex !== -1) {
          return (leftIndex === -1 ? Number.MAX_SAFE_INTEGER : leftIndex)
            - (rightIndex === -1 ? Number.MAX_SAFE_INTEGER : rightIndex);
        }
        return left.localeCompare(right);
      })
      .map(function (bucketKey) {
        return finalizeBucket(bucketSummariesByKey[bucketKey]);
      });

    const representedBucketKeys = new Set(summaryBuckets.map(function (bucket) {
      return bucket.planningBucketKey;
    }));
    const noPolicyRows = planningBuckets
      .filter(function (bucket) {
        return bucket && normalizeKey(bucket.planningBucketKey) && !representedBucketKeys.has(normalizeKey(bucket.planningBucketKey));
      })
      .map(function (bucket) {
        return {
          planningBucketKey: normalizeKey(bucket.planningBucketKey),
          planningBucketLabel: bucket.planningBucketLabel || normalizeKey(bucket.planningBucketKey),
          lifestylePolicyRowCount: 0,
          sliderEligibleRowCount: 0,
          lifestyleTreatmentIncluded: bucket.lifestyleTreatmentIncluded,
          lifestyleTreatmentReason: bucket.lifestyleTreatmentReason
        };
      });

    return clonePlainValue({
      summaryVersion: SUMMARY_VERSION,
      lifestylePolicyRowCount: lifestylePolicyRows.length,
      sliderEligibleRowCount: lifestylePolicyRows.filter(function (row) {
        return row && row.sliderEligible === true;
      }).length,
      planningBucketCount: summaryBuckets.length,
      buckets: summaryBuckets,
      cleanBucketCandidates: summaryBuckets
        .filter(function (bucket) {
          return bucket.cleanBucketCandidate === true;
        })
        .map(function (bucket) {
          return bucket.planningBucketKey;
        }),
      exceptionBucketKeys: summaryBuckets
        .filter(function (bucket) {
          return bucket.exceptionCandidates.length > 0 || bucket.distinctRatioSets.length > 1;
        })
        .map(function (bucket) {
          return bucket.planningBucketKey;
        }),
      unresolvedLifestylePolicyRows,
      noPolicyRows
    });
  }

  lensAnalysis.householdExpensePlanningBucketPolicySummary = Object.freeze({
    SUMMARY_VERSION,
    summarizeHouseholdExpensePlanningBucketPolicy
  });

  lensAnalysis.summarizeHouseholdExpensePlanningBucketPolicy = summarizeHouseholdExpensePlanningBucketPolicy;
})(globalThis);
