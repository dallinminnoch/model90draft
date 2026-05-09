(function (global) {
  const LensApp = global.LensApp || (global.LensApp = {});
  const lensAnalysis = LensApp.lensAnalysis || (LensApp.lensAnalysis = {});

  // Owner: pure household expense adjustment engine for the new Income Impact
  // policy model. Non-goals: no graph series construction, display rendering,
  // storage access, normalization, or runtime wiring.

  const ADJUSTMENT_ENGINE_VERSION = 1;
  const ACTIVE_RUNTIME_CONSUMER = false;
  const MIN_SLIDER_VALUE = -100;
  const MAX_SLIDER_VALUE = 100;

  const PROTECTED_EXCLUDED_PLANNING_BUCKET_KEYS = Object.freeze([
    "debtObligations",
    "housingCore",
    "basicUtilities",
    "healthcareCare",
    "finalExpenses",
    "educationEnrichment",
    "insurancePremiums",
    "taxesLegalAdministrative",
    "givingCommunity",
    "businessSelfEmployment",
    "financialFeesTransactionCosts",
    "periodicSinkingFundOneTime",
    "customUnknown",
    "petsCoreCare",
    "childcareDependentSupport"
  ]);

  function isPlainObject(value) {
    return Boolean(value && typeof value === "object" && !Array.isArray(value));
  }

  function clonePlainValue(value) {
    if (Array.isArray(value)) {
      return value.map(clonePlainValue);
    }

    if (isPlainObject(value)) {
      return Object.keys(value).sort().reduce(function (clone, key) {
        const nextValue = clonePlainValue(value[key]);
        if (nextValue !== undefined) {
          clone[key] = nextValue;
        }
        return clone;
      }, {});
    }

    if (typeof value === "number") {
      return Number.isFinite(value) ? value : null;
    }

    return value === undefined ? null : value;
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

  function clamp(value, minimum, maximum) {
    return Math.min(Math.max(value, minimum), maximum);
  }

  function createIssue(code, message, details) {
    const issue = { code, message };
    if (details !== undefined) {
      issue.details = clonePlainValue(details);
    }
    return issue;
  }

  function getInputExpenses(input) {
    if (Array.isArray(input?.baseHouseholdExpenseStream?.rows)) {
      return input.baseHouseholdExpenseStream.rows;
    }

    if (Array.isArray(input?.baseHouseholdExpenseStream?.representedRows)) {
      return input.baseHouseholdExpenseStream.representedRows;
    }

    if (Array.isArray(input?.baseHouseholdExpenseStreamRows)) {
      return input.baseHouseholdExpenseStreamRows;
    }

    if (Array.isArray(input?.representedRows)) {
      return input.representedRows;
    }

    if (Array.isArray(input?.expenses)) {
      return input.expenses;
    }

    if (Array.isArray(input?.expenseFacts?.expenses)) {
      return input.expenseFacts.expenses;
    }

    if (Array.isArray(input?.baselineExpenses)) {
      return input.baselineExpenses;
    }

    return [];
  }

  function isBaseHouseholdExpenseStreamInput(input) {
    return Array.isArray(input?.baseHouseholdExpenseStream?.rows)
      || Array.isArray(input?.baseHouseholdExpenseStream?.representedRows)
      || Array.isArray(input?.baseHouseholdExpenseStreamRows)
      || Array.isArray(input?.representedRows);
  }

  function getStreamMonthlyTotal(input) {
    return toOptionalNumber(input?.baseHouseholdExpenseStream?.monthlyTotal);
  }

  function isRepresentedStreamRow(row, streamMode) {
    if (!streamMode) {
      return true;
    }

    return row?.representedInBase === true;
  }

  function createSkippedRow(row, index, reason) {
    return {
      expenseId: getExpenseId(row, index),
      expenseTypeKey: getExpenseTypeKey(row) || null,
      label: normalizeString(row?.label || row?.displayName || row?.name) || getExpenseTypeKey(row) || "Expense " + (index + 1),
      planningBucketKey: normalizeString(row?.planningBucketKey) || null,
      categoryKey: normalizeString(row?.categoryKey) || null,
      baselineMonthlyAmount: roundMoney(getMonthlyAmount(row) ?? 0),
      representedInBase: row?.representedInBase === true,
      skippedReason: reason,
      trace: {
        source: "baseHouseholdExpenseStream",
        totalsAffected: false,
        graphDeltaAffected: false
      }
    };
  }

  function createSkippedRows(rows, streamMode) {
    if (!streamMode) {
      return [];
    }

    return rows.filter(function (row) {
      return isPlainObject(row) && row.representedInBase !== true;
    }).map(function (row, index) {
      return createSkippedRow(row, index, "not-represented-in-base");
    });
  }

  function getExpenseTypeKey(expense) {
    return normalizeString(expense && (expense.expenseTypeKey || expense.typeKey));
  }

  function getExpenseId(expense, index) {
    return normalizeString(expense && (
      expense.expenseId
      || expense.expenseFactId
      || expense.id
      || expense.recordId
      || expense.sourceId
    ))
      || "expense-" + (index + 1);
  }

  function getExpenseLabel(expense, policyRow, index) {
    return normalizeString(expense && (expense.label || expense.displayName || expense.name))
      || normalizeString(policyRow && policyRow.label)
      || getExpenseTypeKey(expense)
      || "Expense " + (index + 1);
  }

  function getMonthlyAmount(expense) {
    const directValues = [
      expense && expense.monthlyAmount,
      expense && expense.monthlyEquivalent,
      expense && expense.monthlyEquivalentAmount,
      expense && expense.currentMonthlyAmount,
      expense && expense.baselineMonthlyAmount,
      expense && expense.amountMonthly
    ];

    for (let index = 0; index < directValues.length; index += 1) {
      const value = toOptionalNumber(directValues[index]);
      if (value != null) {
        return value;
      }
    }

    const amount = toOptionalNumber(expense && expense.amount);
    if (amount == null) {
      return null;
    }

    const frequency = normalizeString(expense && expense.frequency).toLowerCase();
    if (!frequency || frequency === "monthly" || frequency === "month") {
      return amount;
    }
    if (frequency === "annual" || frequency === "yearly" || frequency === "year") {
      return amount / 12;
    }
    if (frequency === "quarterly" || frequency === "quarter") {
      return amount / 3;
    }
    if (frequency === "weekly" || frequency === "week") {
      return amount * 52 / 12;
    }
    if (frequency === "biweekly" || frequency === "bi-weekly") {
      return amount * 26 / 12;
    }
    if (frequency === "semimonthly" || frequency === "semi-monthly") {
      return amount * 2;
    }

    return null;
  }

  function getPolicyRows(input) {
    if (Array.isArray(input?.resolvedGraphAdjustmentPolicy?.rows)) {
      return input.resolvedGraphAdjustmentPolicy.rows;
    }

    if (Array.isArray(input?.graphAdjustmentPolicy?.rows)) {
      return input.graphAdjustmentPolicy.rows;
    }

    if (Array.isArray(input?.policyRows)) {
      return input.policyRows;
    }

    return [];
  }

  function getPolicyByTypeKey(input) {
    return getPolicyRows(input).filter(isPlainObject).reduce(function (byTypeKey, row) {
      const expenseTypeKey = normalizeString(row.expenseTypeKey || row.typeKey);
      if (expenseTypeKey) {
        byTypeKey[expenseTypeKey] = clonePlainValue(row);
      }
      return byTypeKey;
    }, {});
  }

  function getFloorPreviewBucket(input, planningBucketKey) {
    const buckets = isPlainObject(input?.livingFloorCalculationPreview?.buckets)
      ? input.livingFloorCalculationPreview.buckets
      : isPlainObject(input?.livingFloorPreview?.buckets)
        ? input.livingFloorPreview.buckets
        : {};
    return isPlainObject(buckets[planningBucketKey]) ? buckets[planningBucketKey] : null;
  }

  function getFloorAmount(input, planningBucketKey) {
    const bucket = getFloorPreviewBucket(input, planningBucketKey);
    const value = toOptionalNumber(bucket && (
      bucket.floorAmountMonthly
      ?? bucket.estimatedDollarPlanningFloorMonthly
      ?? bucket.monthlyFloorAmount
    ));
    return value != null && value >= 0 ? roundMoney(value) : null;
  }

  function isProtectedPlanningBucket(planningBucketKey) {
    return PROTECTED_EXCLUDED_PLANNING_BUCKET_KEYS.includes(normalizeString(planningBucketKey));
  }

  function normalizeRatio(value, fallbackValue) {
    const ratio = toOptionalNumber(value);
    return ratio != null && ratio >= 0 ? ratio : fallbackValue;
  }

  function calculateLinearAdjustment(baselineMonthlyAmount, floorMonthlyAmount, ceilingMonthlyAmount, sliderValue) {
    if (sliderValue < 0) {
      return baselineMonthlyAmount - ((baselineMonthlyAmount - floorMonthlyAmount) * Math.abs(sliderValue) / 100);
    }

    if (sliderValue > 0) {
      return baselineMonthlyAmount + ((ceilingMonthlyAmount - baselineMonthlyAmount) * sliderValue / 100);
    }

    return baselineMonthlyAmount;
  }

  function getProtectedReason(expense, planningBucketKey) {
    const sourceOwnedBy = normalizeString(expense && (expense.sourceOwnedBy || expense.sourceOwner));
    const sourceKey = normalizeString(expense && expense.sourceKey);
    const sourcePath = normalizeString(expense && expense.sourcePath);
    const categoryKey = normalizeString(expense && expense.categoryKey);
    if (isProtectedPlanningBucket(planningBucketKey)) {
      return "protected-planning-bucket";
    }
    if (expense?.isDebtPaymentExpense === true || categoryKey === "debtObligations") {
      return "debt-obligation-protected";
    }
    if (sourceOwnedBy === "debtRecords" || sourceKey === "debtRecords" || sourcePath.includes("debtRecords")) {
      return "debt-source-owned";
    }
    if (sourceOwnedBy === "scalarOngoingSupport") {
      return "scalar-ongoing-support-reconciliation";
    }
    return "";
  }

  function createBaseRowAdjustment(expense, index, policyRow, sliderValue, warnings) {
    const baselineRaw = getMonthlyAmount(expense);
    const baselineMonthlyAmount = roundMoney(baselineRaw == null ? 0 : Math.max(0, baselineRaw));
    const expenseTypeKey = getExpenseTypeKey(expense);
    const planningBucketKey = normalizeString(policyRow?.planningBucketKey || expense?.planningBucketKey) || null;
    const protectedReason = getProtectedReason(expense, planningBucketKey);
    const policyAdjustmentClass = normalizeString(policyRow?.adjustmentClass);
    const adjustmentClass = protectedReason
      ? "excludedFromAdjustment"
      : policyAdjustmentClass || "excludedFromAdjustment";
    const minimumFloorMode = protectedReason
      ? "notAdjusted"
      : normalizeString(policyRow?.minimumFloorMode) || "notAdjusted";
    const conservativeFloorRatio = normalizeRatio(policyRow?.conservativeFloorRatio, 1);
    const elevatedCeilingRatio = normalizeRatio(policyRow?.elevatedCeilingRatio, 1);
    const ratioFloorMonthlyAmount = minimumFloorMode === "zeroFloor"
      ? 0
      : roundMoney(baselineMonthlyAmount * conservativeFloorRatio);
    const elevatedCeilingMonthlyAmount = roundMoney(Math.max(baselineMonthlyAmount, baselineMonthlyAmount * elevatedCeilingRatio));
    const rowWarnings = [];
    const rowDataGaps = [];

    if (baselineRaw == null) {
      rowWarnings.push(createIssue(
        "missing-monthly-expense-amount",
        "Expense did not include a usable monthly amount; it was treated as zero for adjustment preview.",
        { expenseTypeKey, expenseId: getExpenseId(expense, index) }
      ));
    }

    if (!policyRow && !protectedReason && normalizeString(expense?.adjustmentClass) !== "excludedFromAdjustment") {
      rowDataGaps.push(createIssue(
        "missing-resolved-graph-policy-row",
        "Expense did not have a resolved graph adjustment policy row and was treated as excluded.",
        { expenseTypeKey, expenseId: getExpenseId(expense, index) }
      ));
    }

    if (protectedReason && policyAdjustmentClass && policyAdjustmentClass !== "excludedFromAdjustment") {
      rowWarnings.push(createIssue(
        "protected-bucket-adjustment-ignored",
        "A protected/source-owned planning bucket was kept excluded even though policy preview supplied an adjustable class.",
        { expenseTypeKey, planningBucketKey, requestedAdjustmentClass: policyAdjustmentClass }
      ));
    }

    rowWarnings.forEach(function (warning) {
      warnings.push(clonePlainValue(warning));
    });

    return {
      expenseId: getExpenseId(expense, index),
      label: getExpenseLabel(expense, policyRow, index),
      expenseTypeKey: expenseTypeKey || null,
      categoryKey: normalizeString(expense && expense.categoryKey) || null,
      planningBucketKey,
      baselineMonthlyAmount,
      adjustedMonthlyAmount: baselineMonthlyAmount,
      monthlyDelta: 0,
      adjustmentClass,
      minimumFloorMode,
      graphAdjustable: policyRow?.graphAdjustable === true && !protectedReason && adjustmentClass !== "excludedFromAdjustment",
      conservativeFloorRatio,
      elevatedCeilingRatio,
      ratioFloorMonthlyAmount,
      elevatedCeilingMonthlyAmount,
      estimatedDollarPlanningFloorMonthly: null,
      bucketFloorApplied: false,
      allocatedBucketFloorUpliftMonthly: 0,
      floorSourceLabel: normalizeString(policyRow?.floorSourceLabel) || null,
      floorSourceStatus: normalizeString(policyRow?.floorSourceStatus) || null,
      sourceKey: normalizeString(expense && expense.sourceKey) || null,
      sourceOwnedBy: normalizeString(expense && (expense.sourceOwnedBy || expense.sourceOwner)) || null,
      sourcePath: normalizeString(expense && expense.sourcePath) || null,
      representedInBase: expense?.representedInBase === true,
      reasonCode: protectedReason || (policyRow ? "policy-resolved" : "missing-policy-row"),
      warnings: rowWarnings,
      dataGaps: rowDataGaps,
      trace: {
        policySource: policyRow ? "resolvedGraphAdjustmentPolicy" : "missing",
        adjustmentClassSource: protectedReason ? "protectedBucketGuardrail" : "resolvedGraphAdjustmentPolicy",
        streamRowSource: normalizeString(expense?.trace?.rowSource) || null,
        sourceOwner: normalizeString(expense && (expense.sourceOwnedBy || expense.sourceOwner)) || null,
        floorAppliedAtPlanningBucketLevel: false,
        perRowDollarFloorApplied: false,
        sliderValue
      }
    };
  }

  function groupRowsByPlanningBucket(rowAdjustments, adjustmentClass) {
    return rowAdjustments.reduce(function (groups, row) {
      if (row.adjustmentClass !== adjustmentClass || !row.planningBucketKey) {
        return groups;
      }
      if (!groups[row.planningBucketKey]) {
        groups[row.planningBucketKey] = [];
      }
      groups[row.planningBucketKey].push(row);
      return groups;
    }, {});
  }

  function applyRatioOnlyAdjustments(rowAdjustments, sliderValue) {
    rowAdjustments.forEach(function (row) {
      if (row.adjustmentClass !== "ratioAdjusted") {
        return;
      }

      row.adjustedMonthlyAmount = roundMoney(calculateLinearAdjustment(
        row.baselineMonthlyAmount,
        row.ratioFloorMonthlyAmount,
        row.elevatedCeilingMonthlyAmount,
        sliderValue
      ));
      row.monthlyDelta = roundMoney(row.adjustedMonthlyAmount - row.baselineMonthlyAmount);
      row.reasonCode = sliderValue < 0
        ? "ratio-adjusted-conservative"
        : sliderValue > 0
          ? "ratio-adjusted-elevated"
          : "baseline";
    });
  }

  function createBucketAdjustment(planningBucketKey, rows, input, sliderValue, warnings, dataGaps) {
    const baselineMonthlyAmount = roundMoney(rows.reduce(function (total, row) {
      return total + row.baselineMonthlyAmount;
    }, 0));
    const ratioFloorMonthlyAmount = roundMoney(rows.reduce(function (total, row) {
      return total + row.ratioFloorMonthlyAmount;
    }, 0));
    const elevatedCeilingMonthlyAmount = roundMoney(rows.reduce(function (total, row) {
      return total + row.elevatedCeilingMonthlyAmount;
    }, 0));
    const estimatedDollarPlanningFloorMonthly = getFloorAmount(input, planningBucketKey);
    const bucketWarnings = [];
    const bucketDataGaps = [];
    let effectiveConservativeFloorMonthly = ratioFloorMonthlyAmount;
    let floorApplied = false;
    let floorSkippedReason = "not-needed";

    if (estimatedDollarPlanningFloorMonthly == null) {
      floorSkippedReason = "missing-estimated-dollar-floor-ratio-fallback";
      const issue = createIssue(
        "money-floor-bucket-missing-dollar-floor-ratio-fallback",
        "Money-floor adjusted bucket did not have an estimated dollar floor preview; ratio floor was used for the inactive adjustment preview.",
        { planningBucketKey }
      );
      bucketWarnings.push(clonePlainValue(issue));
      bucketDataGaps.push(issue);
      warnings.push(clonePlainValue(issue));
      dataGaps.push(clonePlainValue(issue));
    } else {
      effectiveConservativeFloorMonthly = roundMoney(Math.max(ratioFloorMonthlyAmount, estimatedDollarPlanningFloorMonthly));
      floorSkippedReason = estimatedDollarPlanningFloorMonthly > ratioFloorMonthlyAmount
        ? null
        : "ratio-floor-higher-than-dollar-floor";
    }

    const preliminaryAdjustedRows = rows.map(function (row) {
      return Object.assign({}, row, {
        preliminaryAdjustedMonthlyAmount: roundMoney(calculateLinearAdjustment(
          row.baselineMonthlyAmount,
          row.ratioFloorMonthlyAmount,
          row.elevatedCeilingMonthlyAmount,
          sliderValue
        ))
      });
    });
    const preliminaryAdjustedMonthlyAmount = roundMoney(preliminaryAdjustedRows.reduce(function (total, row) {
      return total + row.preliminaryAdjustedMonthlyAmount;
    }, 0));
    const adjustedMonthlyAmount = estimatedDollarPlanningFloorMonthly == null
      ? roundMoney(preliminaryAdjustedMonthlyAmount)
      : roundMoney(Math.max(preliminaryAdjustedMonthlyAmount, estimatedDollarPlanningFloorMonthly));
    floorApplied = estimatedDollarPlanningFloorMonthly != null
      && adjustedMonthlyAmount > preliminaryAdjustedMonthlyAmount;
    if (estimatedDollarPlanningFloorMonthly != null && !floorApplied && floorSkippedReason == null) {
      floorSkippedReason = "ratio-adjusted-amount-higher-than-dollar-floor";
    }
    const bucketFloorUpliftMonthly = roundMoney(Math.max(0, adjustedMonthlyAmount - preliminaryAdjustedMonthlyAmount));

    rows.forEach(function (row) {
      const preliminary = preliminaryAdjustedRows.find(function (candidate) {
        return candidate.expenseId === row.expenseId;
      });
      const baselineShare = baselineMonthlyAmount > 0 ? row.baselineMonthlyAmount / baselineMonthlyAmount : 0;
      const allocatedUplift = sliderValue < 0 ? roundMoney(bucketFloorUpliftMonthly * baselineShare) : 0;
      row.adjustedMonthlyAmount = roundMoney((preliminary?.preliminaryAdjustedMonthlyAmount || 0) + allocatedUplift);
      row.monthlyDelta = roundMoney(row.adjustedMonthlyAmount - row.baselineMonthlyAmount);
      row.bucketFloorApplied = floorApplied;
      row.allocatedBucketFloorUpliftMonthly = allocatedUplift;
      row.reasonCode = sliderValue < 0
        ? (floorApplied ? "money-floor-applied-conservative" : "money-floor-ratio-behavior-conservative")
        : sliderValue > 0
          ? (floorApplied ? "money-floor-applied-elevated" : "money-floor-ratio-behavior-elevated")
          : "baseline";
      row.trace = Object.assign({}, row.trace, {
        floorAppliedAtPlanningBucketLevel: floorApplied,
        perRowDollarFloorApplied: false,
        planningBucketBaselineMonthlyAmount: baselineMonthlyAmount
      });
    });

    return {
      planningBucketKey,
      adjustmentClass: "moneyFloorAdjusted",
      minimumFloorMode: "estimatedDollarFloor",
      rowCount: rows.length,
      baselineMonthlyAmount,
      adjustedMonthlyAmount,
      monthlyDelta: roundMoney(adjustedMonthlyAmount - baselineMonthlyAmount),
      ratioFloorMonthlyAmount,
      ratioAdjustedMonthlyAmount: preliminaryAdjustedMonthlyAmount,
      estimatedDollarPlanningFloorMonthly,
      effectiveConservativeFloorMonthly,
      elevatedCeilingMonthlyAmount,
      floorApplied,
      floorSkippedReason,
      bucketFloorUpliftMonthly,
      warnings: bucketWarnings,
      dataGaps: bucketDataGaps,
      trace: {
        floorAppliedOncePerPlanningBucket: true,
        perRowDollarFloorApplied: false,
        sliderValue
      }
    };
  }

  function createRatioBucketAdjustment(planningBucketKey, rows) {
    const baselineMonthlyAmount = roundMoney(rows.reduce(function (total, row) {
      return total + row.baselineMonthlyAmount;
    }, 0));
    const adjustedMonthlyAmount = roundMoney(rows.reduce(function (total, row) {
      return total + row.adjustedMonthlyAmount;
    }, 0));
    const minimumFloorModes = Array.from(new Set(rows.map(function (row) {
      return row.minimumFloorMode;
    }))).sort();

    return {
      planningBucketKey,
      adjustmentClass: "ratioAdjusted",
      minimumFloorMode: minimumFloorModes.length === 1 ? minimumFloorModes[0] : "mixed",
      rowCount: rows.length,
      baselineMonthlyAmount,
      adjustedMonthlyAmount,
      monthlyDelta: roundMoney(adjustedMonthlyAmount - baselineMonthlyAmount),
      ratioFloorMonthlyAmount: roundMoney(rows.reduce(function (total, row) {
        return total + row.ratioFloorMonthlyAmount;
      }, 0)),
      estimatedDollarPlanningFloorMonthly: null,
      effectiveConservativeFloorMonthly: null,
      floorApplied: false,
      floorSkippedReason: "ratio-adjusted",
      warnings: [],
      dataGaps: [],
      trace: {
        floorAppliedOncePerPlanningBucket: false,
        perRowDollarFloorApplied: false
      }
    };
  }

  function summarizeTotals(rowAdjustments, bucketAdjustments) {
    const baselineMonthlyTotal = roundMoney(rowAdjustments.reduce(function (total, row) {
      return total + row.baselineMonthlyAmount;
    }, 0));
    const adjustedMonthlyTotal = roundMoney(rowAdjustments.reduce(function (total, row) {
      return total + row.adjustedMonthlyAmount;
    }, 0));
    return {
      baselineMonthlyTotal,
      adjustedMonthlyTotal,
      monthlyDelta: roundMoney(adjustedMonthlyTotal - baselineMonthlyTotal),
      totalBaselineMonthlyExpenses: baselineMonthlyTotal,
      totalAdjustedMonthlyExpenses: adjustedMonthlyTotal,
      adjustedRowCount: rowAdjustments.length,
      adjustableRowCount: rowAdjustments.filter(function (row) {
        return row.adjustmentClass !== "excludedFromAdjustment";
      }).length,
      moneyFloorBucketCount: bucketAdjustments.filter(function (bucket) {
        return bucket.adjustmentClass === "moneyFloorAdjusted";
      }).length,
      floorAppliedBucketCount: bucketAdjustments.filter(function (bucket) {
        return bucket.floorApplied === true;
      }).length
    };
  }

  function summarizeSkippedBuckets(skippedRows) {
    return Object.keys(skippedRows.reduce(function (groups, row) {
      const planningBucketKey = normalizeString(row.planningBucketKey) || "unknown";
      if (!groups[planningBucketKey]) {
        groups[planningBucketKey] = [];
      }
      groups[planningBucketKey].push(row);
      return groups;
    }, {})).sort().map(function (planningBucketKey) {
      const rows = skippedRows.filter(function (row) {
        return (normalizeString(row.planningBucketKey) || "unknown") === planningBucketKey;
      });
      return {
        planningBucketKey,
        rowCount: rows.length,
        baselineMonthlyAmount: roundMoney(rows.reduce(function (total, row) {
          return total + row.baselineMonthlyAmount;
        }, 0)),
        skippedReason: "not-represented-in-base",
        totalsAffected: false
      };
    });
  }

  function calculateIncomeImpactHouseholdExpenseAdjustments(input) {
    const safeInput = isPlainObject(input) ? input : {};
    const warnings = [];
    const dataGaps = [];
    const sliderValue = clamp(toOptionalNumber(safeInput.sliderValue) ?? 0, MIN_SLIDER_VALUE, MAX_SLIDER_VALUE);
    const streamMode = isBaseHouseholdExpenseStreamInput(safeInput);
    const inputRows = getInputExpenses(safeInput).filter(isPlainObject);
    const skippedRows = createSkippedRows(inputRows, streamMode);
    const policyByTypeKey = getPolicyByTypeKey(safeInput);
    const rowAdjustments = inputRows.filter(function (expense) {
      return isRepresentedStreamRow(expense, streamMode);
    }).map(function (expense, index) {
      const policyRow = policyByTypeKey[getExpenseTypeKey(expense)] || null;
      const row = createBaseRowAdjustment(expense, index, policyRow, sliderValue, warnings);
      row.dataGaps.forEach(function (gap) {
        dataGaps.push(clonePlainValue(gap));
      });
      return row;
    });

    applyRatioOnlyAdjustments(rowAdjustments, sliderValue);

    const moneyFloorGroups = groupRowsByPlanningBucket(rowAdjustments, "moneyFloorAdjusted");
    const bucketAdjustments = Object.keys(moneyFloorGroups).sort().map(function (planningBucketKey) {
      return createBucketAdjustment(planningBucketKey, moneyFloorGroups[planningBucketKey], safeInput, sliderValue, warnings, dataGaps);
    });

    const ratioGroups = groupRowsByPlanningBucket(rowAdjustments, "ratioAdjusted");
    Object.keys(ratioGroups).sort().forEach(function (planningBucketKey) {
      bucketAdjustments.push(createRatioBucketAdjustment(planningBucketKey, ratioGroups[planningBucketKey]));
    });

    bucketAdjustments.sort(function (left, right) {
      return normalizeString(left.planningBucketKey).localeCompare(normalizeString(right.planningBucketKey));
    });
    const skippedBuckets = summarizeSkippedBuckets(skippedRows);
    const totals = summarizeTotals(rowAdjustments, bucketAdjustments);
    const streamMonthlyTotal = getStreamMonthlyTotal(safeInput);
    const streamParityDifference = streamMonthlyTotal == null
      ? null
      : roundMoney(totals.baselineMonthlyTotal - streamMonthlyTotal);
    if (streamMode && streamMonthlyTotal != null && streamParityDifference !== 0) {
      dataGaps.push(createIssue(
        "base-household-expense-stream-total-mismatch",
        "Represented stream row baseline total does not match the provided baseHouseholdExpenseStream monthly total.",
        {
          baselineMonthlyTotal: totals.baselineMonthlyTotal,
          streamMonthlyTotal,
          difference: streamParityDifference
        }
      ));
    }

    return clonePlainValue({
      rowAdjustments,
      bucketAdjustments,
      skippedRows,
      skippedBuckets,
      baselineMonthlyTotal: totals.baselineMonthlyTotal,
      adjustedMonthlyTotal: totals.adjustedMonthlyTotal,
      monthlyDelta: totals.monthlyDelta,
      totals,
      warnings,
      dataGaps,
      trace: {
        calculationMethod: "income-impact-household-expense-adjustment-engine-v1",
        sliderValue,
        baseHouseholdExpenseStreamUsed: streamMode,
        streamMonthlyTotal,
        streamParityDifference,
        representedRowCount: rowAdjustments.length,
        skippedRowCount: skippedRows.length,
        resolvedGraphAdjustmentPolicyUsed: Array.isArray(safeInput?.resolvedGraphAdjustmentPolicy?.rows),
        livingFloorCalculationPreviewUsed: isPlainObject(safeInput?.livingFloorCalculationPreview?.buckets),
        graphSeriesConstructed: false,
        graphDeltaApplied: false,
        floorsAppliedAtPlanningBucketLevel: true,
        perRowDollarFloorApplied: false,
        storageTouched: false,
        inputsMutated: false
      },
      metadata: {
        adjustmentEngineVersion: ADJUSTMENT_ENGINE_VERSION,
        activeRuntimeConsumer: ACTIVE_RUNTIME_CONSUMER
      }
    });
  }

  lensAnalysis.incomeImpactHouseholdExpenseAdjustmentEngine = Object.freeze({
    ADJUSTMENT_ENGINE_VERSION,
    PROTECTED_EXCLUDED_PLANNING_BUCKET_KEYS,
    calculateIncomeImpactHouseholdExpenseAdjustments
  });
})(typeof globalThis !== "undefined" ? globalThis : this);
