(function (global) {
  const LensApp = global.LensApp || (global.LensApp = {});
  const accountSettings = LensApp.accountSettings || (LensApp.accountSettings = {});

  // Owner: admin read-only household expense account policy display.
  // Non-goals: no editing, no saving, no policy calculations, no runtime graph wiring.

  const TEMPORARY_LOCAL_HOUSEHOLD_EXPENSE_POLICY_ACCOUNT_ID = "temporary-local-household-expense-policy-account-v1";
  const POLICY_DISPLAY_HOST_SELECTOR = "[data-household-expense-account-policy-status]";

  const PROTECTED_CATEGORY_SUMMARY = Object.freeze([
    { label: "Housing", status: "Locked / protected" },
    { label: "Debt obligations", status: "Locked / protected" },
    { label: "Tax and legal", status: "Locked / protected" },
    { label: "Healthcare", status: "Locked / protected" },
    { label: "Childcare / dependent care", status: "Locked / protected" },
    { label: "Insurance / protection", status: "Locked / protected" },
    { label: "Giving / remittances", status: "Review-only / values-sensitive" }
  ]);

  function isPlainObject(value) {
    return Boolean(value && typeof value === "object" && !Array.isArray(value));
  }

  function escapeHtml(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function getWarningList(source) {
    return Array.isArray(source?.warnings) ? source.warnings.filter(isPlainObject) : [];
  }

  function getDataGapList(source) {
    return Array.isArray(source?.dataGaps) ? source.dataGaps.filter(isPlainObject) : [];
  }

  function getPolicyInputs(currentLensAnalysis) {
    const lensAnalysis = isPlainObject(currentLensAnalysis) ? currentLensAnalysis : {};
    const lifestylePolicy = lensAnalysis.householdExpenseLifestyleRangePolicy;
    const compressionPolicy = lensAnalysis.householdExpenseCompressionPolicy;
    const compressionThresholds = lensAnalysis.expenseCompressionThresholds;

    return {
      defaultLifestyleRangePolicies: lifestylePolicy && typeof lifestylePolicy.listLifestyleRangePolicies === "function"
        ? lifestylePolicy.listLifestyleRangePolicies()
        : [],
      defaultCompressionPolicyRules: compressionPolicy && typeof compressionPolicy.getHouseholdExpenseCompressionPolicyRules === "function"
        ? compressionPolicy.getHouseholdExpenseCompressionPolicyRules()
        : [],
      defaultCompressionThresholdRules: compressionThresholds && typeof compressionThresholds.getExpenseCompressionThresholdRules === "function"
        ? compressionThresholds.getExpenseCompressionThresholdRules()
        : []
    };
  }

  function countNamespaceRows(accountPolicy, namespace) {
    return Array.isArray(accountPolicy?.[namespace]) ? accountPolicy[namespace].length : 0;
  }

  function getExpenseLibraryRows(currentLensAnalysis) {
    const library = currentLensAnalysis?.expenseLibrary;
    return library && typeof library.getExpenseLibraryEntries === "function"
      ? library.getExpenseLibraryEntries()
      : [];
  }

  function getPlanningBucketSummaryApi(currentLensAnalysis) {
    const summaryApi = currentLensAnalysis?.householdExpensePlanningBucketPolicySummary;
    if (summaryApi && typeof summaryApi.summarizeHouseholdExpensePlanningBucketPolicy === "function") {
      return summaryApi.summarizeHouseholdExpensePlanningBucketPolicy;
    }

    if (typeof currentLensAnalysis?.summarizeHouseholdExpensePlanningBucketPolicy === "function") {
      return currentLensAnalysis.summarizeHouseholdExpensePlanningBucketPolicy;
    }

    return null;
  }

  function getLivingFloorMetadataApi(currentLensAnalysis) {
    const metadataApi = currentLensAnalysis?.householdExpenseLivingFloorMetadata;
    if (metadataApi && typeof metadataApi.getHouseholdExpenseLivingFloorMetadata === "function") {
      return metadataApi;
    }

    return null;
  }

  function getPlanningBucketLabelMap(currentLensAnalysis) {
    const library = currentLensAnalysis?.expenseLibrary;
    const buckets = library && typeof library.getExpensePlanningBuckets === "function"
      ? library.getExpensePlanningBuckets()
      : [];

    return buckets.reduce(function (map, bucket) {
      if (bucket?.planningBucketKey) {
        map[bucket.planningBucketKey] = bucket.planningBucketLabel || bucket.label || bucket.planningBucketKey;
      }
      return map;
    }, {});
  }

  function getExpenseLabelMap(libraryRows) {
    return (Array.isArray(libraryRows) ? libraryRows : []).reduce(function (map, row) {
      const typeKey = row && (row.typeKey || row.expenseTypeKey);
      if (typeKey) {
        map[typeKey] = row.label || row.displayName || typeKey;
      }
      return map;
    }, {});
  }

  function formatRatio(value) {
    const numericValue = Number(value);
    return Number.isFinite(numericValue) ? numericValue.toFixed(2) : "n/a";
  }

  function formatRatioSetSummary(ratioSets) {
    const rows = Array.isArray(ratioSets) ? ratioSets : [];
    if (!rows.length) {
      return "No policy ratio sets";
    }

    return rows.map(function (ratioSet) {
      const rowCount = Array.isArray(ratioSet.expenseTypeKeys) ? ratioSet.expenseTypeKeys.length : 0;
      if (ratioSet.sliderEligible === true) {
        return `${ratioSet.rangeBehavior || "slider"} ${formatRatio(ratioSet.conservativeFloorRatio)}-${formatRatio(ratioSet.elevatedCeilingRatio)} (${rowCount})`;
      }

      return `${ratioSet.rangeBehavior || "locked"} locked (${rowCount})`;
    }).join("; ");
  }

  function formatValueSummary(values) {
    const list = Array.isArray(values) ? values.filter(Boolean) : [];
    return list.length ? list.join(", ") : "n/a";
  }

  function mapExceptionLabels(exceptionCandidates, labelByType) {
    return (Array.isArray(exceptionCandidates) ? exceptionCandidates : [])
      .map(function (candidate) {
        const typeKey = candidate.expenseTypeKey || "";
        const label = labelByType[typeKey] || typeKey;
        return {
          expenseTypeKey: typeKey,
          label,
          code: candidate.code || "exception"
        };
      });
  }

  function toBucketDisplayRow(bucket, labelByType) {
    const exceptionRows = mapExceptionLabels(bucket.exceptionCandidates, labelByType);
    return {
      planningBucketKey: bucket.planningBucketKey || "",
      planningBucketLabel: bucket.planningBucketLabel || bucket.planningBucketKey || "Unnamed bucket",
      lifestylePolicyRowCount: Number(bucket.lifestylePolicyRowCount) || 0,
      sliderEligibleRowCount: Number(bucket.sliderEligibleRowCount) || 0,
      ratioSetSummary: formatRatioSetSummary(bucket.distinctRatioSets),
      cleanBucketCandidate: bucket.cleanBucketCandidate === true,
      treatmentIncludedSummary: formatValueSummary(bucket.distinctLifestyleTreatmentIncludedValues),
      treatmentReasonSummary: formatValueSummary(bucket.distinctLifestyleTreatmentReasonValues),
      exceptionCount: exceptionRows.length,
      exceptionRows
    };
  }

  function toNoPolicyBucketDisplayRow(bucket) {
    return {
      planningBucketKey: bucket.planningBucketKey || "",
      planningBucketLabel: bucket.planningBucketLabel || bucket.planningBucketKey || "Unnamed bucket",
      lifestylePolicyRowCount: Number(bucket.lifestylePolicyRowCount) || 0,
      sliderEligibleRowCount: Number(bucket.sliderEligibleRowCount) || 0,
      treatmentIncludedSummary: String(bucket.lifestyleTreatmentIncluded),
      treatmentReasonSummary: bucket.lifestyleTreatmentReason || "no-policy-row",
      ratioSetSummary: "No lifestyle policy rows",
      cleanBucketCandidate: false,
      exceptionCount: 0,
      exceptionRows: []
    };
  }

  function buildPlanningBucketSummaryDisplayModel(currentLensAnalysis) {
    const summarize = getPlanningBucketSummaryApi(currentLensAnalysis);
    if (typeof summarize !== "function") {
      return {
        available: false,
        cleanIncludedBuckets: [],
        mixedExceptionBuckets: [],
        lockedSourceOwnedBuckets: [],
        trace: {
          source: "admin-household-expense-planning-bucket-summary-display",
          readOnly: true,
          helperAvailable: false
        }
      };
    }

    const summary = summarize();
    const buckets = Array.isArray(summary?.buckets) ? summary.buckets : [];
    const noPolicyRows = Array.isArray(summary?.noPolicyRows) ? summary.noPolicyRows : [];
    const labelByType = getExpenseLabelMap(getExpenseLibraryRows(currentLensAnalysis));

    return {
      available: true,
      summaryVersion: summary.summaryVersion || null,
      lifestylePolicyRowCount: Number(summary.lifestylePolicyRowCount) || 0,
      sliderEligibleRowCount: Number(summary.sliderEligibleRowCount) || 0,
      cleanIncludedBuckets: buckets
        .filter(function (bucket) {
          return bucket.cleanBucketCandidate === true;
        })
        .map(function (bucket) {
          return toBucketDisplayRow(bucket, labelByType);
        }),
      mixedExceptionBuckets: buckets
        .filter(function (bucket) {
          return bucket.sliderEligibleRowCount > 0 && bucket.cleanBucketCandidate !== true;
        })
        .map(function (bucket) {
          return toBucketDisplayRow(bucket, labelByType);
        }),
      lockedSourceOwnedBuckets: buckets
        .filter(function (bucket) {
          return bucket.sliderEligibleRowCount === 0;
        })
        .map(function (bucket) {
          return toBucketDisplayRow(bucket, labelByType);
        })
        .concat(noPolicyRows
          .filter(function (bucket) {
            return bucket.lifestyleTreatmentIncluded !== true;
          })
          .map(toNoPolicyBucketDisplayRow)),
      trace: {
        source: "admin-household-expense-planning-bucket-summary-display",
        readOnly: true,
        helperAvailable: true,
        editableControlsRendered: false,
        saveControlsRendered: false
      }
    };
  }

  function toLivingFloorDisplayRow(row, bucketLabelByKey) {
    return {
      planningBucketKey: row.planningBucketKey || "",
      planningBucketLabel: bucketLabelByKey[row.planningBucketKey] || row.planningBucketKey || "Unnamed bucket",
      adjustmentClass: row.adjustmentClass || "",
      minimumFloorMode: row.minimumFloorMode || "",
      benchmarkAvailable: row.benchmarkAvailable === true,
      benchmarkSource: row.benchmarkSource || "NONE",
      floorSource: row.floorSource || "NONE",
      stateAdjustmentSource: row.stateAdjustmentSource || "NONE",
      householdSizingMethod: row.householdSizingMethod || "none",
      adminEditable: row.adminEditable === true,
      adminDollarInputsRequired: row.adminDollarInputsRequired === true,
      sourceDataStatus: row.sourceDataStatus || "notApplicable",
      usesSurvivingHousehold: row.usesSurvivingHousehold === true,
      notes: row.notes || ""
    };
  }

  function buildLivingFloorMetadataDisplayModel(currentLensAnalysis) {
    const metadataApi = getLivingFloorMetadataApi(currentLensAnalysis);
    if (!metadataApi) {
      return {
        available: false,
        moneyFloorAdjustedBuckets: [],
        ratioAdjustedBuckets: [],
        excludedFromAdjustmentBuckets: [],
        foodAtHomeBands: [],
        stateSourcePriority: [],
        householdSizingRule: null,
        traceFields: [],
        trace: {
          source: "admin-household-expense-living-floor-metadata-display",
          readOnly: true,
          helperAvailable: false
        }
      };
    }

    const bucketLabelByKey = getPlanningBucketLabelMap(currentLensAnalysis);
    const rows = metadataApi.getHouseholdExpenseLivingFloorMetadata().map(function (row) {
      return toLivingFloorDisplayRow(row, bucketLabelByKey);
    });

    return {
      available: true,
      metadataVersion: metadataApi.LIVING_FLOOR_METADATA_VERSION || null,
      moneyFloorAdjustedBuckets: rows.filter(function (row) {
        return row.adjustmentClass === "moneyFloorAdjusted";
      }),
      ratioAdjustedBuckets: rows.filter(function (row) {
        return row.adjustmentClass === "ratioAdjusted";
      }),
      excludedFromAdjustmentBuckets: rows.filter(function (row) {
        return row.adjustmentClass === "excludedFromAdjustment";
      }),
      foodAtHomeBands: typeof metadataApi.getFoodAtHomeHouseholdMemberBands === "function"
        ? metadataApi.getFoodAtHomeHouseholdMemberBands()
        : [],
      stateSourcePriority: typeof metadataApi.getHouseholdExpenseLivingFloorStateSourcePriority === "function"
        ? metadataApi.getHouseholdExpenseLivingFloorStateSourcePriority()
        : [],
      householdSizingRule: typeof metadataApi.getHouseholdExpenseLivingFloorHouseholdSizingRule === "function"
        ? metadataApi.getHouseholdExpenseLivingFloorHouseholdSizingRule()
        : null,
      traceFields: typeof metadataApi.getHouseholdExpenseLivingFloorTraceFields === "function"
        ? metadataApi.getHouseholdExpenseLivingFloorTraceFields()
        : [],
      trace: {
        source: "admin-household-expense-living-floor-metadata-display",
        readOnly: true,
        helperAvailable: true,
        editableControlsRendered: false,
        saveControlsRendered: false
      }
    };
  }

  function getPolicyStatus(storageResult, resolvedPolicy) {
    if (storageResult?.status === "loaded") {
      return {
        code: "accountOverride",
        label: "Saved account override",
        message: "A saved browser-local account policy override is being resolved against MODEL90 seed defaults."
      };
    }

    if (storageResult?.status === "fallback" && storageResult?.metadata?.fallbackReason === "missing-account-policy") {
      return {
        code: "defaultSeedPolicy",
        label: "Default seed policy only",
        message: "No saved browser-local account override was found. MODEL90 seed policies are active."
      };
    }

    if (!resolvedPolicy) {
      return {
        code: "fallbackPolicy",
        label: "Fallback policy",
        message: "Policy resolution could not complete. Runtime helpers will rely on their safe seed fallbacks."
      };
    }

    return {
      code: "fallbackPolicy",
      label: "Fallback policy",
      message: "Saved policy could not be used safely. MODEL90 seed policies are active with warning trace."
    };
  }

  function buildHouseholdExpensePolicyDisplayModel(input) {
    const options = isPlainObject(input) ? input : {};
    const currentLensAnalysis = isPlainObject(options.currentLensAnalysis)
      ? options.currentLensAnalysis
      : (global.LensApp?.lensAnalysis || {});
    const storageApi = options.storageApi || global.LensApp?.accountSettings?.householdExpenseAccountPolicyStorage;
    const resolver = options.resolver || currentLensAnalysis.householdExpenseAccountPolicyResolver?.resolveHouseholdExpenseAccountPolicy;
    const storage = options.storage || global.localStorage;
    const accountId = options.accountId || TEMPORARY_LOCAL_HOUSEHOLD_EXPENSE_POLICY_ACCOUNT_ID;
    const warnings = [];
    const dataGaps = [];

    let storageResult = null;
    if (storageApi && typeof storageApi.loadHouseholdExpenseAccountPolicy === "function") {
      storageResult = storageApi.loadHouseholdExpenseAccountPolicy({
        accountId,
        storage
      });
      warnings.push.apply(warnings, getWarningList(storageResult));
      dataGaps.push.apply(dataGaps, getDataGapList(storageResult));
    } else {
      warnings.push({
        code: "household-expense-policy-storage-unavailable",
        message: "Household expense account policy storage adapter is unavailable."
      });
    }

    const policyInputs = getPolicyInputs(currentLensAnalysis);
    const accountPolicy = storageResult?.status === "loaded" && isPlainObject(storageResult.accountPolicy)
      ? storageResult.accountPolicy
      : null;
    let resolvedPolicy = null;

    if (typeof resolver === "function") {
      resolvedPolicy = resolver(Object.assign({}, policyInputs, {
        accountPolicy
      }));
      warnings.push.apply(warnings, getWarningList(resolvedPolicy));
      dataGaps.push.apply(dataGaps, getDataGapList(resolvedPolicy));
    } else {
      dataGaps.push({
        code: "household-expense-policy-resolver-unavailable",
        message: "Household expense account policy resolver is unavailable."
      });
    }

    const activePolicy = isPlainObject(resolvedPolicy) ? resolvedPolicy : {};
    const loadedPolicy = isPlainObject(storageResult?.accountPolicy) ? storageResult.accountPolicy : {};
    const status = getPolicyStatus(storageResult, resolvedPolicy);
    const planningBucketSummary = buildPlanningBucketSummaryDisplayModel(currentLensAnalysis);
    const livingFloorMetadata = buildLivingFloorMetadataDisplayModel(currentLensAnalysis);
    if (planningBucketSummary.available !== true) {
      dataGaps.push({
        code: "household-expense-planning-bucket-summary-unavailable",
        message: "Planning bucket policy summary helper is unavailable."
      });
    }
    if (livingFloorMetadata.available !== true) {
      dataGaps.push({
        code: "household-expense-living-floor-metadata-unavailable",
        message: "Household expense living-floor metadata helper is unavailable."
      });
    }

    return {
      accountId,
      accountIdSource: "temporaryLocalAdminFallback",
      status,
      counts: {
        lifestyleRangePolicyRows: Array.isArray(activePolicy.resolvedLifestyleRangePolicies)
          ? activePolicy.resolvedLifestyleRangePolicies.length
          : policyInputs.defaultLifestyleRangePolicies.length,
        compressionPolicyRows: Array.isArray(activePolicy.resolvedCompressionPolicyRules)
          ? activePolicy.resolvedCompressionPolicyRules.length
          : policyInputs.defaultCompressionPolicyRules.length,
        compressionThresholdRows: Array.isArray(activePolicy.resolvedCompressionThresholdRules)
          ? activePolicy.resolvedCompressionThresholdRules.length
          : policyInputs.defaultCompressionThresholdRules.length,
        lifestyleRangeOverrides: status.code === "accountOverride" ? countNamespaceRows(loadedPolicy, "lifestyleRangeOverrides") : 0,
        compressionPolicyOverrides: status.code === "accountOverride" ? countNamespaceRows(loadedPolicy, "compressionPolicyOverrides") : 0,
        compressionThresholdOverrides: status.code === "accountOverride" ? countNamespaceRows(loadedPolicy, "compressionThresholdOverrides") : 0,
        warnings: warnings.length,
        dataGaps: dataGaps.length
      },
      protectedCategories: PROTECTED_CATEGORY_SUMMARY.map(function (row) {
        return Object.assign({}, row);
      }),
      planningBucketSummary,
      livingFloorMetadata,
      warnings,
      dataGaps,
      trace: {
        source: "admin-household-expense-account-policy-read-only-display",
        accountId,
        accountIdSource: "temporaryLocalAdminFallback",
        storageStatus: storageResult?.status || "unavailable",
        storageFallbackReason: storageResult?.metadata?.fallbackReason || null,
        policySource: status.code,
        resolverAvailable: typeof resolver === "function",
        readOnly: true,
        editableControlsRendered: false,
        saveControlsRendered: false
      }
    };
  }

  function renderCountCard(label, value) {
    return `
      <article class="admin-summary-card">
        <span class="section-label">${escapeHtml(label)}</span>
        <strong>${escapeHtml(value)}</strong>
      </article>
    `;
  }

  function renderBucketExceptionSummary(row) {
    const exceptions = Array.isArray(row.exceptionRows) ? row.exceptionRows : [];
    if (!exceptions.length) {
      return "No drift exceptions";
    }

    return exceptions.slice(0, 4).map(function (exception) {
      return `${exception.label} (${exception.code})`;
    }).join("; ");
  }

  function renderBucketKeyLabel(row) {
    return `
      <strong>${escapeHtml(row.planningBucketLabel)}</strong>
      <span><code>${escapeHtml(row.planningBucketKey)}</code></span>
    `;
  }

  function renderCleanBucketRows(rows) {
    return rows.map(function (row) {
      return `
        <tr class="admin-tax-bracket-row" data-planning-bucket-summary-row data-planning-bucket-key="${escapeHtml(row.planningBucketKey)}">
          <td>${renderBucketKeyLabel(row)}</td>
          <td>${escapeHtml(row.lifestylePolicyRowCount)}</td>
          <td>${escapeHtml(row.sliderEligibleRowCount)}</td>
          <td>${escapeHtml(row.ratioSetSummary)}</td>
          <td>${row.cleanBucketCandidate ? "Yes" : "No"}</td>
        </tr>
      `;
    }).join("");
  }

  function renderMixedBucketRows(rows) {
    return rows.map(function (row) {
      return `
        <tr class="admin-tax-bracket-row" data-planning-bucket-summary-row data-planning-bucket-key="${escapeHtml(row.planningBucketKey)}">
          <td>${renderBucketKeyLabel(row)}</td>
          <td>${escapeHtml(row.lifestylePolicyRowCount)}</td>
          <td>${escapeHtml(row.sliderEligibleRowCount)}</td>
          <td>${escapeHtml(row.ratioSetSummary)}</td>
          <td>${escapeHtml(row.exceptionCount)}</td>
          <td>${escapeHtml(renderBucketExceptionSummary(row))}</td>
        </tr>
      `;
    }).join("");
  }

  function renderLockedBucketRows(rows) {
    return rows.map(function (row) {
      return `
        <tr class="admin-tax-bracket-row" data-planning-bucket-summary-row data-planning-bucket-key="${escapeHtml(row.planningBucketKey)}">
          <td>${renderBucketKeyLabel(row)}</td>
          <td>${escapeHtml(row.lifestylePolicyRowCount)}</td>
          <td>${escapeHtml(row.treatmentReasonSummary)}</td>
          <td>${escapeHtml(row.ratioSetSummary)}</td>
        </tr>
      `;
    }).join("");
  }

  function renderPlanningBucketSummaryTable(title, description, rows, columns, bodyHtml) {
    return `
      <section class="admin-tax-bracket-group" data-planning-bucket-summary-section="${escapeHtml(title)}">
        <div class="admin-tax-bracket-toolbar">
          <div>
            <span class="section-label">${escapeHtml(title)}</span>
            <p class="panel-copy">${escapeHtml(description)}</p>
          </div>
        </div>
        <table class="admin-tax-bracket-table">
          <thead>
            <tr>
              ${columns.map(function (column) {
                return `<th>${escapeHtml(column)}</th>`;
              }).join("")}
            </tr>
          </thead>
          <tbody>
            ${rows.length ? bodyHtml : `
              <tr class="admin-tax-bracket-row">
                <td colspan="${escapeHtml(columns.length)}">No buckets in this group.</td>
              </tr>
            `}
          </tbody>
        </table>
      </section>
    `;
  }

  function renderPlanningBucketSummary(summary) {
    const safeSummary = isPlainObject(summary) ? summary : {};
    const cleanRows = Array.isArray(safeSummary.cleanIncludedBuckets) ? safeSummary.cleanIncludedBuckets : [];
    const mixedRows = Array.isArray(safeSummary.mixedExceptionBuckets) ? safeSummary.mixedExceptionBuckets : [];
    const lockedRows = Array.isArray(safeSummary.lockedSourceOwnedBuckets) ? safeSummary.lockedSourceOwnedBuckets : [];

    if (safeSummary.available !== true) {
      return `
        <section class="admin-tax-bracket-group" data-household-expense-planning-bucket-summary>
          <div class="admin-tax-bracket-toolbar">
            <div>
              <span class="section-label">Planning Bucket Summary</span>
              <h3>Unavailable</h3>
              <p class="panel-copy">Planning bucket policy summary helper is not loaded.</p>
            </div>
          </div>
        </section>
      `;
    }

    return `
      <section class="admin-tax-bracket-group" data-household-expense-planning-bucket-summary>
        <div class="admin-tax-bracket-toolbar">
          <div>
            <span class="section-label">Planning Bucket Summary</span>
            <h3>Read-only Bucket Policy Summary</h3>
            <p class="panel-copy">Current type-level lifestyle policy grouped by planning bucket. Bucket-level editing is not enabled in this section.</p>
          </div>
        </div>
        <div class="admin-summary-grid" data-household-expense-planning-bucket-summary-counts>
          ${renderCountCard("Lifestyle policy rows", safeSummary.lifestylePolicyRowCount || 0)}
          ${renderCountCard("Slider rows", safeSummary.sliderEligibleRowCount || 0)}
          ${renderCountCard("Clean included buckets", cleanRows.length)}
          ${renderCountCard("Mixed buckets", mixedRows.length)}
          ${renderCountCard("Locked / source-owned buckets", lockedRows.length)}
        </div>
        ${renderPlanningBucketSummaryTable(
          "Clean Included Buckets",
          "Included buckets whose slider-eligible rows share one ratio set.",
          cleanRows,
          ["Bucket", "Rows", "Slider Rows", "Ratio Sets", "Clean"],
          renderCleanBucketRows(cleanRows)
        )}
        ${renderPlanningBucketSummaryTable(
          "Mixed Buckets / Row Exceptions",
          "Included buckets that still need row-level review before bucket-level controls.",
          mixedRows,
          ["Bucket", "Rows", "Slider Rows", "Ratio Sets", "Exceptions", "Exception Detail"],
          renderMixedBucketRows(mixedRows)
        )}
        ${renderPlanningBucketSummaryTable(
          "Locked Or Source-Owned Buckets",
          "Excluded, protected, source-owned, or no-policy buckets shown for admin context.",
          lockedRows,
          ["Bucket", "Rows", "Treatment Reason", "Policy Summary"],
          renderLockedBucketRows(lockedRows)
        )}
      </section>
    `;
  }

  function renderBoolean(value) {
    return value === true ? "Yes" : "No";
  }

  function renderLivingFloorBucketKeyLabel(row) {
    return `
      <strong>${escapeHtml(row.planningBucketLabel)}</strong>
      <span><code>${escapeHtml(row.planningBucketKey)}</code></span>
    `;
  }

  function renderMoneyFloorRows(rows) {
    return rows.map(function (row) {
      return `
        <tr class="admin-tax-bracket-row" data-living-floor-row data-living-floor-adjustment-class="${escapeHtml(row.adjustmentClass)}" data-planning-bucket-key="${escapeHtml(row.planningBucketKey)}">
          <td>${renderLivingFloorBucketKeyLabel(row)}</td>
          <td>${escapeHtml(row.minimumFloorMode)}</td>
          <td>${escapeHtml(row.benchmarkSource)}</td>
          <td>${escapeHtml(row.floorSource)}</td>
          <td>${escapeHtml(row.stateAdjustmentSource)}</td>
          <td>${escapeHtml(row.householdSizingMethod)}</td>
          <td>${renderBoolean(row.adminDollarInputsRequired)}</td>
          <td>${escapeHtml(row.sourceDataStatus)}</td>
        </tr>
      `;
    }).join("");
  }

  function renderRatioAdjustedRows(rows) {
    return rows.map(function (row) {
      return `
        <tr class="admin-tax-bracket-row" data-living-floor-row data-living-floor-adjustment-class="${escapeHtml(row.adjustmentClass)}" data-planning-bucket-key="${escapeHtml(row.planningBucketKey)}">
          <td>${renderLivingFloorBucketKeyLabel(row)}</td>
          <td>${escapeHtml(row.minimumFloorMode)}</td>
          <td>${renderBoolean(row.adminEditable)}</td>
          <td>${escapeHtml(row.benchmarkSource)}</td>
          <td>${escapeHtml(row.notes || "Ratio-only adjustment")}</td>
        </tr>
      `;
    }).join("");
  }

  function renderExcludedAdjustmentRows(rows) {
    return rows.map(function (row) {
      return `
        <tr class="admin-tax-bracket-row" data-living-floor-row data-living-floor-adjustment-class="${escapeHtml(row.adjustmentClass)}" data-planning-bucket-key="${escapeHtml(row.planningBucketKey)}">
          <td>${renderLivingFloorBucketKeyLabel(row)}</td>
          <td>${escapeHtml(row.minimumFloorMode)}</td>
          <td>${renderBoolean(row.benchmarkAvailable)}</td>
          <td>${escapeHtml(row.benchmarkSource)}</td>
          <td>${escapeHtml(row.householdSizingMethod)}</td>
          <td>${renderBoolean(row.adminEditable)}</td>
          <td>${escapeHtml(row.notes || "Excluded from adjustment")}</td>
        </tr>
      `;
    }).join("");
  }

  function renderLivingFloorTable(title, description, rows, columns, bodyHtml) {
    return `
      <section class="admin-tax-bracket-group" data-living-floor-section="${escapeHtml(title)}">
        <div class="admin-tax-bracket-toolbar">
          <div>
            <span class="section-label">${escapeHtml(title)}</span>
            <p class="panel-copy">${escapeHtml(description)}</p>
          </div>
        </div>
        <table class="admin-tax-bracket-table">
          <thead>
            <tr>
              ${columns.map(function (column) {
                return `<th>${escapeHtml(column)}</th>`;
              }).join("")}
            </tr>
          </thead>
          <tbody>
            ${rows.length ? bodyHtml : `
              <tr class="admin-tax-bracket-row">
                <td colspan="${escapeHtml(columns.length)}">No buckets in this group.</td>
              </tr>
            `}
          </tbody>
        </table>
      </section>
    `;
  }

  function formatBandRange(band) {
    const minAge = band.minAge == null ? "" : String(band.minAge);
    const maxAge = band.maxAge == null ? "+" : String(band.maxAge);
    return `${minAge}-${maxAge}`;
  }

  function renderFoodAtHomeBandRows(bands) {
    return bands.map(function (band) {
      return `
        <tr class="admin-tax-bracket-row" data-living-floor-food-band="${escapeHtml(band.bandKey)}">
          <td><code>${escapeHtml(band.bandKey)}</code></td>
          <td>${escapeHtml(formatBandRange(band))}</td>
          <td>${escapeHtml(band.sex || "any")}</td>
        </tr>
      `;
    }).join("");
  }

  function renderFoodAtHomeSizingDetails(summary) {
    const bands = Array.isArray(summary.foodAtHomeBands) ? summary.foodAtHomeBands : [];
    const stateSourcePriority = Array.isArray(summary.stateSourcePriority) ? summary.stateSourcePriority : [];
    const sizingRule = isPlainObject(summary.householdSizingRule) ? summary.householdSizingRule : {};

    return `
      <section class="admin-tax-bracket-group" data-living-floor-supporting-metadata>
        <div class="admin-tax-bracket-toolbar">
          <div>
            <span class="section-label">Food at Home Sizing Details</span>
            <p class="panel-copy">Metadata only. No dollar floors, state multipliers, or calculations are active.</p>
          </div>
        </div>
        <table class="admin-tax-bracket-table" data-living-floor-food-bands>
          <thead>
            <tr>
              <th>Band</th>
              <th>Age Range</th>
              <th>Sex</th>
            </tr>
          </thead>
          <tbody>
            ${renderFoodAtHomeBandRows(bands)}
          </tbody>
        </table>
        <div class="admin-summary-grid" data-living-floor-household-state-metadata>
          ${renderCountCard("Sizing rule", sizingRule.householdSizingRuleKey || "n/a")}
          ${renderCountCard("Deceased insured default", sizingRule.deceasedInsuredCountDefault == null ? "n/a" : sizingRule.deceasedInsuredCountDefault)}
          ${renderCountCard("Includes current dependents", renderBoolean(sizingRule.includeCurrentDependents))}
          ${renderCountCard("Projected dependents", sizingRule.includeProjectedFutureDependents === false ? "Excluded" : "Review")}
          ${renderCountCard("Minimum household size", sizingRule.survivingHouseholdSizeMinimum == null ? "n/a" : sizingRule.survivingHouseholdSizeMinimum)}
          ${renderCountCard("State priority", stateSourcePriority.join(" -> ") || "n/a")}
        </div>
      </section>
    `;
  }

  function renderLivingFloorMetadataSummary(summary) {
    const safeSummary = isPlainObject(summary) ? summary : {};
    const moneyFloorRows = Array.isArray(safeSummary.moneyFloorAdjustedBuckets) ? safeSummary.moneyFloorAdjustedBuckets : [];
    const ratioRows = Array.isArray(safeSummary.ratioAdjustedBuckets) ? safeSummary.ratioAdjustedBuckets : [];
    const excludedRows = Array.isArray(safeSummary.excludedFromAdjustmentBuckets) ? safeSummary.excludedFromAdjustmentBuckets : [];

    if (safeSummary.available !== true) {
      return `
        <section class="admin-tax-bracket-group" data-household-expense-living-floor-metadata>
          <div class="admin-tax-bracket-toolbar">
            <div>
              <span class="section-label">Living Floor Metadata</span>
              <h3>Unavailable</h3>
              <p class="panel-copy">Household expense living-floor metadata helper is not loaded.</p>
            </div>
          </div>
        </section>
      `;
    }

    return `
      <section class="admin-tax-bracket-group" data-household-expense-living-floor-metadata>
        <div class="admin-tax-bracket-toolbar">
          <div>
            <span class="section-label">Living Floor Metadata</span>
            <h3>Expense Floor Model</h3>
            <p class="panel-copy">Read-only bucket classification for future dollar floors and ratio-only adjustment. No floor calculations or editable dollar inputs are active.</p>
          </div>
        </div>
        <div class="admin-summary-grid" data-living-floor-class-counts>
          ${renderCountCard("Money-floor adjusted", moneyFloorRows.length)}
          ${renderCountCard("Ratio-adjusted", ratioRows.length)}
          ${renderCountCard("Excluded from adjustment", excludedRows.length)}
        </div>
        ${renderLivingFloorTable(
          "Money-Floor Adjusted",
          "Buckets intended to use one estimated dollar floor after bucket-level aggregation.",
          moneyFloorRows,
          ["Bucket", "Floor Mode", "Benchmark", "Floor Source", "State Source", "Sizing", "Dollar Inputs", "Source Data"],
          renderMoneyFloorRows(moneyFloorRows)
        )}
        ${renderLivingFloorTable(
          "Ratio-Adjusted",
          "Buckets that remain ratio-only, including zero-floor discretionary categories.",
          ratioRows,
          ["Bucket", "Floor Mode", "Admin Editable", "Benchmark", "Notes"],
          renderRatioAdjustedRows(ratioRows)
        )}
        ${renderLivingFloorTable(
          "Excluded From Adjustment",
          "Protected, source-owned, contractual, or unknown buckets excluded from adjustment.",
          excludedRows,
          ["Bucket", "Floor Mode", "Benchmark Available", "Benchmark", "Sizing", "Admin Editable", "Notes"],
          renderExcludedAdjustmentRows(excludedRows)
        )}
        ${renderFoodAtHomeSizingDetails(safeSummary)}
      </section>
    `;
  }

  function renderHouseholdExpensePolicyDisplay(model) {
    const safeModel = isPlainObject(model) ? model : buildHouseholdExpensePolicyDisplayModel();
    const counts = isPlainObject(safeModel.counts) ? safeModel.counts : {};
    const status = isPlainObject(safeModel.status) ? safeModel.status : {};
    const protectedRows = Array.isArray(safeModel.protectedCategories) ? safeModel.protectedCategories : [];

    return `
      <div class="admin-household-expense-policy-readonly" data-household-expense-account-policy-readonly data-policy-status="${escapeHtml(status.code || "unknown")}">
        <div class="admin-tax-bracket-group">
          <div class="admin-tax-bracket-toolbar">
            <div>
              <span class="section-label">Policy Source</span>
              <h3>${escapeHtml(status.label || "Policy unavailable")}</h3>
              <p class="panel-copy">${escapeHtml(status.message || "Household expense policy status is unavailable.")}</p>
              <p class="panel-copy">Account scope: ${escapeHtml(safeModel.accountId || "Not available")} (${escapeHtml(safeModel.accountIdSource || "unknown")})</p>
            </div>
          </div>
          <div class="admin-summary-grid" data-household-expense-policy-counts>
            ${renderCountCard("Lifestyle range rows", counts.lifestyleRangePolicyRows || 0)}
            ${renderCountCard("Compression policy rows", counts.compressionPolicyRows || 0)}
            ${renderCountCard("Compression threshold rows", counts.compressionThresholdRows || 0)}
            ${renderCountCard("Lifestyle overrides", counts.lifestyleRangeOverrides || 0)}
            ${renderCountCard("Compression overrides", counts.compressionPolicyOverrides || 0)}
            ${renderCountCard("Threshold overrides", counts.compressionThresholdOverrides || 0)}
            ${renderCountCard("Warnings", counts.warnings || 0)}
            ${renderCountCard("Data gaps", counts.dataGaps || 0)}
          </div>
        </div>
        ${renderPlanningBucketSummary(safeModel.planningBucketSummary)}
        ${renderLivingFloorMetadataSummary(safeModel.livingFloorMetadata)}
        <div class="admin-tax-bracket-group" data-household-expense-policy-protected-summary>
          <div class="admin-tax-bracket-toolbar">
            <span class="section-label">Protected Categories</span>
          </div>
          <ul class="admin-tax-bracket-list">
            ${protectedRows.map(function (row) {
              return `<li><strong>${escapeHtml(row.label)}</strong><span>${escapeHtml(row.status)}</span></li>`;
            }).join("")}
          </ul>
        </div>
      </div>
    `;
  }

  function initializeHouseholdExpenseAccountPolicyAdminDisplay() {
    const host = global.document?.querySelector?.(POLICY_DISPLAY_HOST_SELECTOR);
    if (!host) {
      return null;
    }

    const model = buildHouseholdExpensePolicyDisplayModel();
    host.innerHTML = renderHouseholdExpensePolicyDisplay(model);
    return model;
  }

  accountSettings.householdExpenseAccountPolicyAdminDisplay = Object.freeze({
    TEMPORARY_LOCAL_HOUSEHOLD_EXPENSE_POLICY_ACCOUNT_ID,
    PROTECTED_CATEGORY_SUMMARY,
    buildPlanningBucketSummaryDisplayModel,
    buildLivingFloorMetadataDisplayModel,
    buildHouseholdExpensePolicyDisplayModel,
    renderHouseholdExpensePolicyDisplay,
    initializeHouseholdExpenseAccountPolicyAdminDisplay
  });

  global.document?.addEventListener?.("DOMContentLoaded", initializeHouseholdExpenseAccountPolicyAdminDisplay);
})(typeof globalThis !== "undefined" ? globalThis : this);
