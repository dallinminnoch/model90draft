(function (global) {
  const LensApp = global.LensApp || (global.LensApp = {});
  const lensAnalysis = LensApp.lensAnalysis || (LensApp.lensAnalysis = {});

  // Owner: inactive Income Impact household expense stream preparation.
  // Non-goals: no graph wiring, ratio application, living-floor calculation, or storage access.

  const STREAM_VERSION = 1;
  const ACTIVE_RUNTIME_CONSUMER = false;
  const MONEY_EPSILON = 0.005;
  const RAW_ONGOING_SUPPORT_MONTHLY_SOURCE_PATH = "lensModel.ongoingSupport.monthlyTotalEssentialSupportCost";
  const TREATED_ONGOING_SUPPORT_MONTHLY_SOURCE_PATH = "lensModel.treatedOngoingSupport.mortgageAdjusted.monthlyTotalEssentialSupportCost";

  const BASELINE_NON_HOUSING_ONGOING_SUPPORT_FIELDS = Object.freeze([
    "monthlyOtherInsuranceCost",
    "monthlyHealthcareOutOfPocketCost",
    "monthlyFoodCost",
    "monthlyTransportationCost",
    "monthlyChildcareAndDependentCareCost",
    "monthlyPhoneAndInternetCost",
    "monthlyHouseholdSuppliesCost",
    "monthlyOtherHouseholdExpenses"
  ]);

  const BASELINE_ONGOING_SUPPORT_FIELDS = Object.freeze([
    "monthlyHousingSupportCost"
  ].concat(BASELINE_NON_HOUSING_ONGOING_SUPPORT_FIELDS));

  const REFERENCE_ONGOING_SUPPORT_FIELDS = Object.freeze([
    "monthlyTravelAndDiscretionaryCost",
    "monthlySubscriptionsCost",
    "monthlyDiscretionaryPersonalSpending"
  ]);

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
    "petsCoreCare",
    "childcareDependentSupport",
    "financialFeesTransactionCosts",
    "periodicSinkingFundOneTime",
    "customUnknown"
  ]);

  const MONTHLY_FACTORS = Object.freeze({
    weekly: 52 / 12,
    biweekly: 26 / 12,
    semimonthly: 2,
    "semi-monthly": 2,
    monthly: 1,
    quarterly: 1 / 3,
    semiannual: 1 / 6,
    "semi-annual": 1 / 6,
    annual: 1 / 12,
    annually: 1 / 12,
    yearly: 1 / 12
  });

  function isPlainObject(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value);
  }

  function clonePlainValue(value) {
    if (Array.isArray(value)) {
      return value.map(clonePlainValue);
    }

    if (isPlainObject(value)) {
      return Object.keys(value).reduce(function (clone, key) {
        clone[key] = clonePlainValue(value[key]);
        return clone;
      }, {});
    }

    return value;
  }

  function normalizeString(value) {
    return String(value == null ? "" : value).trim();
  }

  function toOptionalNumber(value) {
    if (value === null || value === undefined || value === "") {
      return null;
    }

    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  }

  function roundMoney(value) {
    const number = toOptionalNumber(value);
    return number == null ? null : Math.round((number + Number.EPSILON) * 100) / 100;
  }

  function includesValue(list, value) {
    return list.indexOf(value) !== -1;
  }

  function createIssue(code, message, details) {
    return {
      code,
      message,
      details: clonePlainValue(details || {})
    };
  }

  function getExpenseFacts(input) {
    if (Array.isArray(input?.expenses)) {
      return input.expenses;
    }

    if (Array.isArray(input?.expenseFacts)) {
      return input.expenseFacts;
    }

    if (Array.isArray(input?.expenseFacts?.expenses)) {
      return input.expenseFacts.expenses;
    }

    if (Array.isArray(input?.lensModel?.expenseFacts?.expenses)) {
      return input.lensModel.expenseFacts.expenses;
    }

    return [];
  }

  function getOngoingSupport(input) {
    if (isPlainObject(input?.ongoingSupport)) {
      return input.ongoingSupport;
    }

    if (isPlainObject(input?.lensModel?.ongoingSupport)) {
      return input.lensModel.ongoingSupport;
    }

    return {};
  }

  function getTreatedOngoingSupport(input) {
    if (isPlainObject(input?.treatedOngoingSupport)) {
      return input.treatedOngoingSupport;
    }

    if (isPlainObject(input?.lensModel?.treatedOngoingSupport)) {
      return input.lensModel.treatedOngoingSupport;
    }

    return null;
  }

  function resolveIncomeImpactOngoingSupportBasis(input, warnings) {
    const rawOngoingSupport = getOngoingSupport(input);
    const treatedOngoingSupport = getTreatedOngoingSupport(input);
    const mortgageAdjusted = isPlainObject(treatedOngoingSupport?.mortgageAdjusted)
      ? treatedOngoingSupport.mortgageAdjusted
      : {};
    const treatedMonthlyTotal = toOptionalNumber(mortgageAdjusted.monthlyTotalEssentialSupportCost);
    const treatedReady = treatedOngoingSupport?.status === "ready" && treatedMonthlyTotal != null;

    if (treatedReady) {
      return {
        supportBasis: "treatedOngoingSupport",
        ongoingSupport: Object.assign({}, rawOngoingSupport, {
          monthlyMortgagePayment: mortgageAdjusted.monthlyMortgagePayment,
          monthlyHousingSupportCost: mortgageAdjusted.monthlyHousingSupportCost,
          monthlyTotalEssentialSupportCost: mortgageAdjusted.monthlyTotalEssentialSupportCost,
          annualTotalEssentialSupportCost: mortgageAdjusted.annualTotalEssentialSupportCost
        }),
        sourcePath: TREATED_ONGOING_SUPPORT_MONTHLY_SOURCE_PATH,
        treatedOngoingSupportFallbackUsed: false,
        treatedOngoingSupportStatus: treatedOngoingSupport.status
      };
    }

    if (treatedOngoingSupport) {
      warnings.push(createIssue(
        "treated-ongoing-support-unavailable-for-base-expense-stream",
        "Base household expense stream used raw ongoingSupport because treatedOngoingSupport was unavailable or missing a valid monthly total.",
        {
          sourcePath: TREATED_ONGOING_SUPPORT_MONTHLY_SOURCE_PATH,
          fallbackSourcePath: RAW_ONGOING_SUPPORT_MONTHLY_SOURCE_PATH,
          treatedOngoingSupportStatus: treatedOngoingSupport.status || null
        }
      ));
    }

    return {
      supportBasis: treatedOngoingSupport ? "ongoingSupportFallback" : "ongoingSupport",
      ongoingSupport: rawOngoingSupport,
      sourcePath: RAW_ONGOING_SUPPORT_MONTHLY_SOURCE_PATH,
      treatedOngoingSupportFallbackUsed: Boolean(treatedOngoingSupport),
      treatedOngoingSupportStatus: treatedOngoingSupport?.status || null
    };
  }

  function getExpenseLibraryRows(input) {
    if (Array.isArray(input?.expenseLibraryRows)) {
      return input.expenseLibraryRows;
    }

    const expenseLibrary = lensAnalysis.expenseLibrary;
    if (expenseLibrary && typeof expenseLibrary.getExpenseLibraryEntries === "function") {
      return expenseLibrary.getExpenseLibraryEntries();
    }

    if (expenseLibrary && Array.isArray(expenseLibrary.EXPENSE_LIBRARY_ENTRIES)) {
      return expenseLibrary.EXPENSE_LIBRARY_ENTRIES;
    }

    return [];
  }

  function getLivingFloorMetadataRows(input) {
    if (Array.isArray(input?.livingFloorMetadata)) {
      return input.livingFloorMetadata;
    }

    const metadata = lensAnalysis.householdExpenseLivingFloorMetadata;
    if (metadata && typeof metadata.getHouseholdExpenseLivingFloorMetadata === "function") {
      return metadata.getHouseholdExpenseLivingFloorMetadata();
    }

    if (metadata && Array.isArray(metadata.LIVING_FLOOR_BUCKET_METADATA)) {
      return metadata.LIVING_FLOOR_BUCKET_METADATA;
    }

    return [];
  }

  function createMapByKeys(rows, keys) {
    return rows.reduce(function (map, row) {
      if (!isPlainObject(row)) {
        return map;
      }

      keys.forEach(function (key) {
        const value = normalizeString(row[key]);
        if (value) {
          map[value] = row;
        }
      });

      return map;
    }, {});
  }

  function createLivingFloorMetadataByBucket(rows) {
    return rows.reduce(function (map, row) {
      const planningBucketKey = normalizeString(row?.planningBucketKey);
      if (planningBucketKey) {
        map[planningBucketKey] = row;
      }
      return map;
    }, {});
  }

  function getExpenseTypeKey(expense) {
    return normalizeString(
      expense?.expenseTypeKey
      || expense?.typeKey
      || expense?.libraryEntryKey
      || expense?.sourceTypeKey
    );
  }

  function getExpenseLabel(expense, libraryEntry, index) {
    return normalizeString(expense?.label)
      || normalizeString(expense?.name)
      || normalizeString(libraryEntry?.label)
      || getExpenseTypeKey(expense)
      || `Household expense ${index + 1}`;
  }

  function getExpenseId(expense, index) {
    return normalizeString(
      expense?.expenseFactId
      || expense?.expenseId
      || expense?.id
      || expense?.recordId
    ) || `expense-fact-${index + 1}`;
  }

  function getMonthlyAmount(expense) {
    const directValues = [
      expense?.baselineMonthlyAmount,
      expense?.monthlyAmount,
      expense?.monthlyRecurringAmount,
      expense?.monthlyEquivalent,
      expense?.monthlyEquivalentAmount,
      expense?.currentMonthlyAmount,
      expense?.amountMonthly
    ];

    for (let index = 0; index < directValues.length; index += 1) {
      const value = toOptionalNumber(directValues[index]);
      if (value != null) {
        return roundMoney(Math.max(0, value));
      }
    }

    const amount = toOptionalNumber(expense?.amount);
    if (amount == null) {
      return null;
    }

    const frequency = normalizeString(expense?.frequency || expense?.cadence || "monthly");
    const factor = MONTHLY_FACTORS[frequency] == null ? 1 : MONTHLY_FACTORS[frequency];
    return roundMoney(Math.max(0, amount * factor));
  }

  function getNormalizedSourcePath(expense) {
    return normalizeString(
      expense?.normalizedSourcePath
      || expense?.metadata?.normalizedSourcePath
      || expense?.trace?.normalizedSourcePath
    );
  }

  function getOngoingSupportField(expense) {
    const ownedByField = normalizeString(expense?.ownedByField);
    if (ownedByField && ownedByField.indexOf("monthly") === 0) {
      return ownedByField;
    }

    const normalizedSourcePath = getNormalizedSourcePath(expense);
    const prefix = "lensModel.ongoingSupport.";
    if (normalizedSourcePath.indexOf(prefix) === 0) {
      return normalizedSourcePath.slice(prefix.length);
    }

    return null;
  }

  function getRepresentedInBase(expense, context) {
    if (expense?.representedInBase === true) {
      return {
        representedInBase: true,
        reason: "explicit-represented-in-base"
      };
    }

    if (expense?.representedInBase === false) {
      return {
        representedInBase: false,
        reason: "explicit-reference-row"
      };
    }

    const ongoingSupportField = getOngoingSupportField(expense);
    if (
      context?.supportBasis?.supportBasis === "treatedOngoingSupport"
      && ongoingSupportField === "monthlyHousingSupportCost"
    ) {
      return {
        representedInBase: false,
        reason: "raw-housing-support-replaced-by-treated-ongoing-support"
      };
    }

    if (ongoingSupportField && includesValue(BASELINE_ONGOING_SUPPORT_FIELDS, ongoingSupportField)) {
      return {
        representedInBase: true,
        reason: "current-ongoing-support-essential-field"
      };
    }

    if (ongoingSupportField && includesValue(REFERENCE_ONGOING_SUPPORT_FIELDS, ongoingSupportField)) {
      return {
        representedInBase: false,
        reason: "current-ongoing-support-reference-field"
      };
    }

    return {
      representedInBase: false,
      reason: "not-represented-in-current-ongoing-support-total"
    };
  }

  function getBucketMetadata(planningBucketKey) {
    const expenseLibrary = lensAnalysis.expenseLibrary;
    if (expenseLibrary && typeof expenseLibrary.getExpensePlanningBucket === "function") {
      return expenseLibrary.getExpensePlanningBucket(planningBucketKey);
    }

    return null;
  }

  function getAdjustmentMetadata(planningBucketKey, livingFloorMetadataByBucket) {
    const metadata = livingFloorMetadataByBucket[planningBucketKey];
    return {
      adjustmentClass: normalizeString(metadata?.adjustmentClass) || "excludedFromAdjustment",
      minimumFloorMode: normalizeString(metadata?.minimumFloorMode) || "notAdjusted"
    };
  }

  function isProtectedOrSourceOwned(expense, planningBucketKey) {
    const categoryKey = normalizeString(expense?.categoryKey);
    return includesValue(PROTECTED_EXCLUDED_PLANNING_BUCKET_KEYS, planningBucketKey)
      || expense?.isDebtPaymentExpense === true
      || categoryKey === "debtObligations";
  }

  function createStreamRow(expense, index, context) {
    const expenseTypeKey = getExpenseTypeKey(expense);
    const libraryEntry = context.expenseLibraryByKey[expenseTypeKey] || null;
    const libraryPlanningBucketKey = normalizeString(libraryEntry?.planningBucketKey);
    const planningBucketKey = normalizeString(expense?.planningBucketKey) || libraryPlanningBucketKey || "customUnknown";
    const categoryKey = normalizeString(expense?.categoryKey) || normalizeString(libraryEntry?.categoryKey) || null;
    const livingFloorMetadata = getAdjustmentMetadata(planningBucketKey, context.livingFloorMetadataByBucket);
    const represented = getRepresentedInBase(expense, context);
    const monthlyAmount = getMonthlyAmount(expense);
    const protectedOrSourceOwned = isProtectedOrSourceOwned(expense, planningBucketKey);
    const adjustmentClass = protectedOrSourceOwned
      ? "excludedFromAdjustment"
      : livingFloorMetadata.adjustmentClass;
    const minimumFloorMode = protectedOrSourceOwned
      ? "notAdjusted"
      : livingFloorMetadata.minimumFloorMode;
    const sourceOwner = normalizeString(expense?.sourceOwnedBy)
      || normalizeString(libraryEntry?.sourceOwnedBy)
      || null;
    const ongoingSupportField = getOngoingSupportField(expense);

    return {
      expenseTypeKey: expenseTypeKey || null,
      planningBucketKey,
      categoryKey,
      label: getExpenseLabel(expense, libraryEntry, index),
      baselineMonthlyAmount: monthlyAmount,
      source: normalizeString(expense?.source) || normalizeString(libraryEntry?.source) || "expenseFacts",
      sourceOwner,
      representedInBase: represented.representedInBase,
      adjustmentClass,
      minimumFloorMode,
      inflationBucketKey: normalizeString(expense?.inflationBucketKey)
        || normalizeString(libraryEntry?.inflationBucketKey)
        || normalizeString(getBucketMetadata(planningBucketKey)?.inflationBucketKey)
        || null,
      trace: {
        rowSource: "expenseFacts",
        expenseFactId: getExpenseId(expense, index),
        sourcePath: normalizeString(expense?.sourcePath) || null,
        normalizedSourcePath: getNormalizedSourcePath(expense) || null,
        ownedByField: normalizeString(expense?.ownedByField) || null,
        ongoingSupportField,
        representedReason: represented.reason,
        libraryMatched: Boolean(libraryEntry),
        protectedOrSourceOwned,
        futureAdjustmentBehavior: protectedOrSourceOwned || adjustmentClass === "excludedFromAdjustment"
          ? "zero-delta"
          : "policy-adjustable",
        ratiosApplied: false,
        livingFloorCalculated: false,
        graphDeltaCalculated: false
      }
    };
  }

  function sumRows(rows) {
    return roundMoney(rows.reduce(function (total, row) {
      const amount = toOptionalNumber(row.baselineMonthlyAmount);
      return total + (amount == null ? 0 : amount);
    }, 0));
  }

  function getComposedOngoingSupportMonthlyTotal(ongoingSupport) {
    const explicit = toOptionalNumber(ongoingSupport?.monthlyTotalEssentialSupportCost);
    if (explicit != null) {
      return roundMoney(explicit);
    }

    const housing = toOptionalNumber(ongoingSupport?.monthlyHousingSupportCost);
    const nonHousing = toOptionalNumber(ongoingSupport?.monthlyNonHousingEssentialSupportCost);
    if (housing == null && nonHousing == null) {
      return null;
    }

    return roundMoney((housing || 0) + (nonHousing || 0));
  }

  function createScalarReconciliationRow(options) {
    const bucketMetadata = getBucketMetadata(options.planningBucketKey) || {};
    return {
      expenseTypeKey: options.expenseTypeKey,
      planningBucketKey: options.planningBucketKey,
      categoryKey: options.categoryKey,
      label: options.label,
      baselineMonthlyAmount: roundMoney(options.amount),
      source: "ongoingSupport",
      sourceOwner: "scalarOngoingSupport",
      representedInBase: true,
      adjustmentClass: "excludedFromAdjustment",
      minimumFloorMode: "notAdjusted",
      inflationBucketKey: normalizeString(bucketMetadata.inflationBucketKey) || "noInflationCurrentDollar",
      trace: {
        rowSource: "scalar-ongoing-support-reconciliation",
        sourcePath: options.sourcePath,
        normalizedSourcePath: options.sourcePath,
        ongoingSupportField: options.ongoingSupportField,
        representedReason: "scalar-reconciliation-preserves-current-baseline-parity",
        libraryMatched: false,
        protectedOrSourceOwned: true,
        futureAdjustmentBehavior: "zero-delta",
        ratiosApplied: false,
        livingFloorCalculated: false,
        graphDeltaCalculated: false
      }
    };
  }

  function addScalarReconciliationRows(rows, supportBasis, dataGaps) {
    const ongoingSupport = supportBasis.ongoingSupport || {};
    const reconciliationRows = [];
    const housingTarget = toOptionalNumber(ongoingSupport?.monthlyHousingSupportCost);
    if (housingTarget != null && housingTarget > MONEY_EPSILON) {
      const representedHousing = sumRows(rows.filter(function (row) {
        return row.representedInBase === true && row.trace?.ongoingSupportField === "monthlyHousingSupportCost";
      }));
      const housingGap = roundMoney(housingTarget - representedHousing);
      if (housingGap > MONEY_EPSILON) {
        reconciliationRows.push(createScalarReconciliationRow({
          expenseTypeKey: "ongoingSupportHousingReconciliation",
          planningBucketKey: "housingCore",
          categoryKey: "housingExpense",
          label: supportBasis.supportBasis === "treatedOngoingSupport"
            ? "Treated housing support reconciliation"
            : "Housing support reconciliation",
          amount: housingGap,
          sourcePath: supportBasis.supportBasis === "treatedOngoingSupport"
            ? "lensModel.treatedOngoingSupport.mortgageAdjusted.monthlyHousingSupportCost"
            : "lensModel.ongoingSupport.monthlyHousingSupportCost",
          ongoingSupportField: "monthlyHousingSupportCost"
        }));
        dataGaps.push(createIssue(
          "base-household-expense-stream-scalar-reconciliation-row-created",
          supportBasis.supportBasis === "treatedOngoingSupport"
            ? "A protected scalar treatedOngoingSupport reconciliation row was created to preserve treated housing baseline parity pending richer expense stream ownership."
            : "A protected scalar ongoingSupport reconciliation row was created to preserve current housing baseline parity pending richer expense stream ownership.",
          {
            planningBucketKey: "housingCore",
            amount: housingGap,
            supportBasis: supportBasis.supportBasis
          }
        ));
      } else if (housingGap < -MONEY_EPSILON) {
        dataGaps.push(createIssue(
          "base-household-expense-stream-represented-rows-exceed-housing-total",
          "Represented housing rows exceed the current ongoingSupport housing total.",
          { difference: housingGap }
        ));
      }
    }

    const nonHousingTarget = toOptionalNumber(ongoingSupport?.monthlyNonHousingEssentialSupportCost);
    if (nonHousingTarget != null) {
      const representedNonHousing = sumRows(rows.filter(function (row) {
        return row.representedInBase === true
          && includesValue(BASELINE_NON_HOUSING_ONGOING_SUPPORT_FIELDS, row.trace?.ongoingSupportField);
      }));
      const nonHousingGap = roundMoney(nonHousingTarget - representedNonHousing);
      if (nonHousingGap > MONEY_EPSILON) {
        reconciliationRows.push(createScalarReconciliationRow({
          expenseTypeKey: "ongoingSupportNonHousingReconciliation",
          planningBucketKey: "customUnknown",
          categoryKey: "customExpense",
          label: "Non-housing support reconciliation",
          amount: nonHousingGap,
          sourcePath: "lensModel.ongoingSupport.monthlyNonHousingEssentialSupportCost",
          ongoingSupportField: "monthlyNonHousingEssentialSupportCost"
        }));
        dataGaps.push(createIssue(
          "base-household-expense-stream-scalar-reconciliation-row-created",
          "A protected scalar ongoingSupport reconciliation row was created to preserve current non-housing baseline parity pending richer expense stream ownership.",
          { planningBucketKey: "customUnknown", amount: nonHousingGap }
        ));
      } else if (nonHousingGap < -MONEY_EPSILON) {
        dataGaps.push(createIssue(
          "base-household-expense-stream-represented-rows-exceed-non-housing-total",
          "Represented non-housing rows exceed the current ongoingSupport non-housing total.",
          { difference: nonHousingGap }
        ));
      }
    }

    return rows.concat(reconciliationRows);
  }

  function collectRowDataGaps(rows, dataGaps) {
    rows.forEach(function (row) {
      if (row.representedInBase === true && row.baselineMonthlyAmount == null) {
        dataGaps.push(createIssue(
          "base-household-expense-stream-missing-represented-row-amount",
          "A represented household expense stream row is missing a usable monthly amount.",
          {
            expenseTypeKey: row.expenseTypeKey,
            planningBucketKey: row.planningBucketKey
          }
        ));
      }

      if (!row.trace.libraryMatched && row.trace.rowSource === "expenseFacts") {
        dataGaps.push(createIssue(
          "base-household-expense-stream-missing-library-metadata",
          "An expense fact could not be joined to expense library metadata.",
          {
            expenseTypeKey: row.expenseTypeKey,
            planningBucketKey: row.planningBucketKey
          }
        ));
      }
    });
  }

  function prepareIncomeImpactBaseHouseholdExpenseStream(input) {
    const options = isPlainObject(input) ? input : {};
    const warnings = [];
    const dataGaps = [];
    const expenseLibraryByKey = createMapByKeys(getExpenseLibraryRows(options), ["typeKey", "libraryEntryKey"]);
    const livingFloorMetadataByBucket = createLivingFloorMetadataByBucket(getLivingFloorMetadataRows(options));
    const supportBasis = resolveIncomeImpactOngoingSupportBasis(options, warnings);
    const ongoingSupport = supportBasis.ongoingSupport;
    const expenseFacts = getExpenseFacts(options);

    let rows = expenseFacts.map(function (expense, index) {
      return createStreamRow(expense, index, {
        expenseLibraryByKey,
        livingFloorMetadataByBucket,
        supportBasis
      });
    });

    rows = addScalarReconciliationRows(rows, supportBasis, dataGaps);
    collectRowDataGaps(rows, dataGaps);

    const representedRows = rows.filter(function (row) {
      return row.representedInBase === true;
    });
    const referenceRows = rows.filter(function (row) {
      return row.representedInBase !== true;
    });
    const monthlyTotal = sumRows(representedRows);
    const ongoingSupportMonthlyTotal = getComposedOngoingSupportMonthlyTotal(ongoingSupport);
    const parityDifference = ongoingSupportMonthlyTotal == null
      ? null
      : roundMoney(monthlyTotal - ongoingSupportMonthlyTotal);

    if (ongoingSupportMonthlyTotal == null) {
      dataGaps.push(createIssue(
        "base-household-expense-stream-missing-ongoing-support-total",
        "Ongoing support monthly total was not available for baseline parity comparison.",
        { sourcePath: supportBasis.sourcePath }
      ));
    } else if (Math.abs(parityDifference) > MONEY_EPSILON) {
      dataGaps.push(createIssue(
        "base-household-expense-stream-parity-difference",
        "Represented stream rows do not match the selected ongoing support monthly total.",
        {
          monthlyTotal,
          ongoingSupportMonthlyTotal,
          difference: parityDifference,
          supportBasis: supportBasis.supportBasis
        }
      ));
    }

    return clonePlainValue({
      rows,
      representedRows,
      referenceRows,
      monthlyTotal,
      parity: {
        ongoingSupportMonthlyTotal,
        difference: parityDifference
      },
      warnings,
      dataGaps,
      trace: {
        sourceExpenseFactCount: expenseFacts.length,
        representedRowCount: representedRows.length,
        referenceRowCount: referenceRows.length,
        supportBasis: supportBasis.supportBasis,
        supportBasisSourcePath: supportBasis.sourcePath,
        treatedOngoingSupportFallbackUsed: supportBasis.treatedOngoingSupportFallbackUsed,
        treatedOngoingSupportStatus: supportBasis.treatedOngoingSupportStatus,
        scalarReconciliationRowCount: rows.filter(function (row) {
          return row.trace?.rowSource === "scalar-ongoing-support-reconciliation";
        }).length,
        ratiosApplied: false,
        livingFloorsCalculated: false,
        adjustedTotalsCalculated: false,
        graphDeltaCalculated: false,
        runtimeWired: false
      },
      metadata: {
        streamVersion: STREAM_VERSION,
        activeRuntimeConsumer: ACTIVE_RUNTIME_CONSUMER
      }
    });
  }

  lensAnalysis.incomeImpactBaseHouseholdExpenseStream = Object.freeze({
    STREAM_VERSION,
    BASELINE_ONGOING_SUPPORT_FIELDS,
    BASELINE_NON_HOUSING_ONGOING_SUPPORT_FIELDS,
    REFERENCE_ONGOING_SUPPORT_FIELDS,
    PROTECTED_EXCLUDED_PLANNING_BUCKET_KEYS,
    prepareIncomeImpactBaseHouseholdExpenseStream
  });
})(typeof globalThis !== "undefined" ? globalThis : this);
