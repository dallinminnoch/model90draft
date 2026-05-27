(function (global) {
  const LensApp = global.LensApp || (global.LensApp = {});
  const lensAnalysis = LensApp.lensAnalysis || (LensApp.lensAnalysis = {});

  const PROJECTION_METHOD = "monthly-household-wealth-v1";
  const MONTHLY_CADENCE = "monthly";
  const DEFAULT_OPTIONS = Object.freeze({
    allowNegativeAssets: true,
    growthMode: "activeEligibleOnly",
    cashFlowTiming: "growth-first-then-cash-flow"
  });
  const ACTIVE_GROWTH_STATUS = "method-active";
  const IGNORED_GROWTH_STATUSES = new Set([
    "reporting-only",
    "saved-only",
    "preview-only",
    "future-use",
    "inactive"
  ]);
  const CASH_FLOW_ROW_ID = "cashFlowContribution";

  function isPlainObject(value) {
    return Boolean(value && typeof value === "object" && !Array.isArray(value));
  }

  function normalizeString(value) {
    return String(value == null ? "" : value).trim();
  }

  function normalizeStatus(value) {
    return normalizeString(value).toLowerCase();
  }

  function toOptionalNumber(value) {
    if (value == null || value === "") {
      return null;
    }

    if (typeof value === "number") {
      return Number.isFinite(value) ? value : null;
    }

    const normalized = String(value).replace(/[$,\s]/g, "").trim();
    if (!normalized) {
      return null;
    }

    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : null;
  }

  function toOptionalRate(value) {
    if (value == null || value === "") {
      return null;
    }

    if (typeof value === "number") {
      if (!Number.isFinite(value)) {
        return null;
      }
      return value > 1 ? value / 100 : value;
    }

    const raw = String(value).trim();
    const parsed = Number(raw.replace(/[%,\s]/g, ""));
    if (!Number.isFinite(parsed)) {
      return null;
    }

    return raw.includes("%") || parsed > 1 ? parsed / 100 : parsed;
  }

  function roundMoney(value) {
    return Number.isFinite(value) ? Number(value.toFixed(2)) : 0;
  }

  function roundRate(value) {
    return Number.isFinite(value) ? Number(value.toFixed(10)) : 0;
  }

  function normalizeDateOnly(value) {
    if (value instanceof Date && !Number.isNaN(value.getTime())) {
      return {
        date: new Date(value.getFullYear(), value.getMonth(), value.getDate()),
        normalizedDate: [
          String(value.getFullYear()).padStart(4, "0"),
          String(value.getMonth() + 1).padStart(2, "0"),
          String(value.getDate()).padStart(2, "0")
        ].join("-")
      };
    }

    const normalized = normalizeString(value);
    const match = normalized.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) {
      return null;
    }

    const year = Number(match[1]);
    const monthIndex = Number(match[2]) - 1;
    const day = Number(match[3]);
    const date = new Date(year, monthIndex, day);
    if (
      Number.isNaN(date.getTime())
      || date.getFullYear() !== year
      || date.getMonth() !== monthIndex
      || date.getDate() !== day
    ) {
      return null;
    }

    return {
      date,
      normalizedDate: normalized
    };
  }

  function formatDateOnly(date) {
    return [
      String(date.getFullYear()).padStart(4, "0"),
      String(date.getMonth() + 1).padStart(2, "0"),
      String(date.getDate()).padStart(2, "0")
    ].join("-");
  }

  function addMonths(date, months) {
    const firstOfTargetMonth = new Date(date.getFullYear(), date.getMonth() + months, 1);
    const lastDayOfTargetMonth = new Date(
      firstOfTargetMonth.getFullYear(),
      firstOfTargetMonth.getMonth() + 1,
      0
    ).getDate();
    firstOfTargetMonth.setDate(Math.min(date.getDate(), lastDayOfTargetMonth));
    return firstOfTargetMonth;
  }

  function calculateWholeMonthsBetween(startDate, endDate) {
    const wholeMonths = (endDate.getFullYear() - startDate.getFullYear()) * 12
      + (endDate.getMonth() - startDate.getMonth());
    return endDate.getDate() < startDate.getDate() ? wholeMonths - 1 : wholeMonths;
  }

  function uniqueStrings(values) {
    return Array.from(new Set((Array.isArray(values) ? values : [])
      .map(function (value) {
        return normalizeString(value);
      })
      .filter(Boolean)));
  }

  function appendUnique(target, values) {
    uniqueStrings(values).forEach(function (value) {
      if (!target.includes(value)) {
        target.push(value);
      }
    });
  }

  function makeIssue(code, message, sourcePaths) {
    const issue = {
      code,
      message
    };
    const paths = uniqueStrings(sourcePaths);
    if (paths.length) {
      issue.sourcePaths = paths;
    }
    return issue;
  }

  function normalizeOptions(options) {
    const safeOptions = isPlainObject(options) ? options : {};
    return {
      allowNegativeAssets: safeOptions.allowNegativeAssets === false ? false : DEFAULT_OPTIONS.allowNegativeAssets,
      growthMode: normalizeString(safeOptions.growthMode) || DEFAULT_OPTIONS.growthMode,
      cashFlowTiming: normalizeString(safeOptions.cashFlowTiming) || DEFAULT_OPTIONS.cashFlowTiming
    };
  }

  function normalizeFrequency(value) {
    const normalized = normalizeStatus(value || MONTHLY_CADENCE);
    if (["annual", "annually", "yearly"].includes(normalized)) {
      return "annual";
    }
    if (["one-time", "one_time", "once"].includes(normalized)) {
      return "oneTime";
    }
    return MONTHLY_CADENCE;
  }

  function amountForFrequency(amount, frequency) {
    if (amount == null) {
      return null;
    }

    const normalizedFrequency = normalizeFrequency(frequency);
    if (normalizedFrequency === "annual") {
      return amount / 12;
    }
    return amount;
  }

  function isGrossLikeStream(stream) {
    const status = normalizeStatus(stream?.status);
    return status.includes("gross")
      || stream?.isGrossIncome === true
      || stream?.incomeType === "gross";
  }

  function isUsableIncomeStatus(status) {
    const normalized = normalizeStatus(status);
    return normalized.includes("net")
      || [
        "active",
        "available",
        "included",
        "mature",
        "method-active",
        "current-output-active",
        "calculated"
      ].includes(normalized);
  }

  function isExcludedStatus(status) {
    return ["excluded", "inactive", "missing", "not-available"].includes(normalizeStatus(status));
  }

  function normalizeCashFlowStreams(streams, kind, dataGaps, trace) {
    const normalizedStreams = [];
    const safeStreams = Array.isArray(streams) ? streams : [];

    if (kind === "income" && !safeStreams.length) {
      dataGaps.push(makeIssue(
        "missing-mature-net-income",
        "No mature net income stream was supplied for household wealth projection.",
        ["incomeStreams"]
      ));
    }

    safeStreams.forEach(function (stream, index) {
      const sourcePaths = uniqueStrings(stream?.sourcePaths);
      appendUnique(trace.sourcePaths, sourcePaths);

      if (kind === "income" && isGrossLikeStream(stream)) {
        dataGaps.push(makeIssue(
          "unsafe-gross-income-excluded",
          "Gross income was supplied without a mature net-income value and was excluded.",
          sourcePaths.length ? sourcePaths : [`incomeStreams.${index}`]
        ));
        return;
      }

      if (isExcludedStatus(stream?.status)) {
        return;
      }

      if (kind === "income" && !isUsableIncomeStatus(stream?.status)) {
        dataGaps.push(makeIssue(
          "missing-mature-net-income",
          "Income stream was excluded because its status did not identify a mature net-income value.",
          sourcePaths.length ? sourcePaths : [`incomeStreams.${index}.status`]
        ));
        return;
      }

      const amount = toOptionalNumber(stream?.amount);
      if (amount == null) {
        dataGaps.push(makeIssue(
          `missing-${kind}-amount`,
          `${kind === "income" ? "Income" : "Expense"} stream amount was missing or invalid.`,
          sourcePaths.length ? sourcePaths : [`${kind}Streams.${index}.amount`]
        ));
        return;
      }

      const monthlyAmount = amountForFrequency(amount, stream?.frequency);
      normalizedStreams.push({
        id: normalizeString(stream?.id) || `${kind}-${index + 1}`,
        label: normalizeString(stream?.label) || (kind === "income" ? "Income" : "Expense"),
        amount,
        monthlyAmount,
        frequency: normalizeFrequency(stream?.frequency),
        category: normalizeString(stream?.category),
        expenseType: normalizeString(stream?.expenseType),
        status: normalizeString(stream?.status),
        sourcePaths
      });
    });

    if (kind === "income" && safeStreams.length && !normalizedStreams.length) {
      dataGaps.push(makeIssue(
        "missing-mature-net-income",
        "No supplied income stream was usable as mature net income.",
        ["incomeStreams"]
      ));
    }

    return normalizedStreams;
  }

  function normalizeScheduledObligations(obligations, dataGaps, trace) {
    const safeObligations = Array.isArray(obligations) ? obligations : [];
    return safeObligations.reduce(function (items, obligation, index) {
      const sourcePaths = uniqueStrings(obligation?.sourcePaths);
      appendUnique(trace.sourcePaths, sourcePaths);

      if (isExcludedStatus(obligation?.status)) {
        return items;
      }

      const amount = toOptionalNumber(obligation?.amount);
      if (amount == null) {
        dataGaps.push(makeIssue(
          "missing-scheduled-obligation-amount",
          "Scheduled obligation amount was missing or invalid.",
          sourcePaths.length ? sourcePaths : [`scheduledObligations.${index}.amount`]
        ));
        return items;
      }

      items.push({
        id: normalizeString(obligation?.id) || `scheduled-obligation-${index + 1}`,
        label: normalizeString(obligation?.label) || "Scheduled obligation",
        amount,
        monthlyAmount: amountForFrequency(amount, obligation?.frequency),
        frequency: normalizeFrequency(obligation?.frequency),
        startDate: normalizeDateOnly(obligation?.startDate),
        endDate: normalizeDateOnly(obligation?.endDate),
        category: normalizeString(obligation?.category),
        status: normalizeString(obligation?.status),
        sourcePaths
      });
      return items;
    }, []);
  }

  function normalizeSavingAllocations(allocations, assetRows, dataGaps, trace) {
    const safeAllocations = Array.isArray(allocations) ? allocations : [];
    const rowsByCategory = new Map();
    assetRows.forEach(function (asset) {
      if (!rowsByCategory.has(asset.categoryKey)) {
        rowsByCategory.set(asset.categoryKey, asset);
      }
    });

    return safeAllocations.reduce(function (items, allocation, index) {
      const sourcePaths = uniqueStrings(allocation?.sourcePaths);
      appendUnique(trace.sourcePaths, sourcePaths);

      if (isExcludedStatus(allocation?.status)) {
        return items;
      }

      const monthlyAmount = toOptionalNumber(
        allocation?.monthlyAmount
        ?? allocation?.monthlyContributionAmount
        ?? allocation?.amount
      );
      const targetCategoryKey = normalizeString(
        allocation?.targetAssetCategoryKey
        || allocation?.assetCategoryKey
        || allocation?.categoryKey
      );
      if (monthlyAmount == null || monthlyAmount <= 0) {
        dataGaps.push(makeIssue(
          "missing-saving-allocation-amount",
          "Saving allocation amount was missing or invalid.",
          sourcePaths.length ? sourcePaths : [`savingAllocations.${index}.monthlyAmount`]
        ));
        return items;
      }
      if (!targetCategoryKey) {
        dataGaps.push(makeIssue(
          "missing-saving-allocation-target",
          "Saving allocation target asset category was missing.",
          sourcePaths.length ? sourcePaths : [`savingAllocations.${index}.targetAssetCategoryKey`]
        ));
        return items;
      }

      let targetAsset = rowsByCategory.get(targetCategoryKey);
      const allocationAnnualGrowthRate = toOptionalRate(allocation?.annualGrowthRate);
      const allocationGrowthActive = allocation?.growthEligible === true
        && normalizeStatus(allocation?.growthStatus) === ACTIVE_GROWTH_STATUS
        && allocationAnnualGrowthRate != null;
      if (!targetAsset) {
        const syntheticAsset = {
          id: `saving-allocation-${targetCategoryKey}`,
          categoryKey: targetCategoryKey,
          label: normalizeString(allocation?.targetAssetCategoryLabel || allocation?.label) || targetCategoryKey,
          currentValue: 0,
          includedInProjection: true,
          growthEligible: allocation?.growthEligible === true,
          annualGrowthRate: allocationAnnualGrowthRate,
          monthlyGrowthRate: 0,
          growthStatus: normalizeString(allocation?.growthStatus) || "current-dollar",
          growthActive: false,
          sourcePaths,
          trace: {
            source: "savingAllocations",
            syntheticSavingAllocationAsset: true,
            targetAssetCategoryKey: targetCategoryKey
          },
          ignoredMetadata: []
        };
        const normalizedGrowthStatus = normalizeStatus(syntheticAsset.growthStatus);
        syntheticAsset.growthActive = syntheticAsset.growthEligible === true
          && normalizedGrowthStatus === ACTIVE_GROWTH_STATUS
          && syntheticAsset.annualGrowthRate != null;
        syntheticAsset.monthlyGrowthRate = syntheticAsset.growthActive
          ? roundRate(Math.pow(1 + syntheticAsset.annualGrowthRate, 1 / 12) - 1)
          : 0;
        assetRows.push(syntheticAsset);
        rowsByCategory.set(targetCategoryKey, syntheticAsset);
        targetAsset = syntheticAsset;
      } else if (allocationGrowthActive && !targetAsset.growthActive) {
        targetAsset.growthEligible = true;
        targetAsset.annualGrowthRate = allocationAnnualGrowthRate;
        targetAsset.growthStatus = ACTIVE_GROWTH_STATUS;
        targetAsset.growthActive = true;
        targetAsset.monthlyGrowthRate = roundRate(Math.pow(1 + allocationAnnualGrowthRate, 1 / 12) - 1);
        targetAsset.sourcePaths = uniqueStrings((targetAsset.sourcePaths || []).concat(sourcePaths));
        targetAsset.trace = Object.assign({}, targetAsset.trace, {
          savingAllocationActivatedGrowth: true,
          savingAllocationGrowthSourcePaths: sourcePaths
        });
      }

      items.push({
        id: normalizeString(allocation?.id || allocation?.typeKey) || `saving-allocation-${index + 1}`,
        label: normalizeString(allocation?.label) || targetCategoryKey,
        monthlyAmount: roundMoney(monthlyAmount),
        targetCategoryKey,
        targetAssetId: targetAsset.id,
        sourcePaths
      });
      return items;
    }, []);
  }

  function isSameYearMonth(leftDate, rightDate) {
    return leftDate.getFullYear() === rightDate.getFullYear()
      && leftDate.getMonth() === rightDate.getMonth();
  }

  function isObligationActive(obligation, periodStart) {
    const startDate = obligation.startDate?.date || null;
    const endDate = obligation.endDate?.date || null;
    if (startDate && periodStart < startDate) {
      return false;
    }
    if (endDate && periodStart > endDate) {
      return false;
    }
    if (obligation.frequency === "oneTime") {
      return startDate ? isSameYearMonth(startDate, periodStart) : false;
    }
    return true;
  }

  function normalizeAssetLedger(assetLedger, dataGaps, trace) {
    const safeLedger = Array.isArray(assetLedger) ? assetLedger : [];
    if (!safeLedger.length) {
      dataGaps.push(makeIssue(
        "missing-asset-ledger",
        "No asset ledger was supplied for household wealth projection.",
        ["assetLedger"]
      ));
    }

    const includedRows = [];
    safeLedger.forEach(function (asset, index) {
      const sourcePaths = uniqueStrings(asset?.sourcePaths);
      appendUnique(trace.sourcePaths, sourcePaths);

      const categoryKey = normalizeString(asset?.categoryKey) || "uncategorized";
      const id = normalizeString(asset?.id) || `asset-${index + 1}`;
      const included = asset?.includedInProjection === true;
      if (!included) {
        trace.excludedAssetCategories.push(categoryKey);
        return;
      }

      const currentValue = toOptionalNumber(asset?.currentValue);
      if (currentValue == null) {
        dataGaps.push(makeIssue(
          "missing-current-asset-value",
          "Included asset row was missing a valid current value.",
          sourcePaths.length ? sourcePaths : [`assetLedger.${index}.currentValue`]
        ));
        return;
      }

      const growthStatus = normalizeString(asset?.growthStatus);
      const normalizedGrowthStatus = normalizeStatus(growthStatus);
      const annualGrowthRate = toOptionalRate(asset?.annualGrowthRate);
      const growthEligible = asset?.growthEligible === true;
      const growthActive = growthEligible
        && normalizedGrowthStatus === ACTIVE_GROWTH_STATUS
        && annualGrowthRate != null;

      if (!growthActive) {
        if (IGNORED_GROWTH_STATUSES.has(normalizedGrowthStatus)) {
          trace.ignoredGrowthCategories.push(categoryKey);
        } else {
          trace.growthIneligibleCategories.push(categoryKey);
        }
      }

      const ignoredMetadata = [];
      if (Object.prototype.hasOwnProperty.call(asset || {}, "taxDragPercent")) {
        ignoredMetadata.push("taxDragPercent");
      }
      if (Object.prototype.hasOwnProperty.call(asset || {}, "liquidityHaircutPercent")) {
        ignoredMetadata.push("liquidityHaircutPercent");
      }

      includedRows.push({
        id,
        categoryKey,
        label: normalizeString(asset?.label) || categoryKey,
        startingValue: roundMoney(currentValue),
        currentValue: roundMoney(currentValue),
        includedInProjection: true,
        growthEligible,
        annualGrowthRate,
        monthlyGrowthRate: growthActive ? roundRate(Math.pow(1 + annualGrowthRate, 1 / 12) - 1) : 0,
        growthStatus,
        growthActive,
        sourcePaths,
        trace: isPlainObject(asset?.trace) ? asset.trace : {},
        ignoredMetadata
      });
    });

    if (safeLedger.length && !includedRows.length) {
      dataGaps.push(makeIssue(
        "missing-included-assets",
        "Asset ledger did not include any rows marked for projection.",
        ["assetLedger.includedInProjection"]
      ));
    }

    return includedRows;
  }

  function sumMonthlyAmounts(streams) {
    return roundMoney(streams.reduce(function (total, stream) {
      return total + (toOptionalNumber(stream.monthlyAmount) || 0);
    }, 0));
  }

  function applySavingAllocations(assetRows, savingAllocations, availableSurplus) {
    let remainingSurplus = roundMoney(Math.max(availableSurplus, 0));
    let totalAllocated = 0;
    let totalUnfunded = 0;
    const allocationsByTarget = [];

    savingAllocations.forEach(function (allocation) {
      const plannedAmount = roundMoney(Math.max(allocation.monthlyAmount, 0));
      const allocatedAmount = roundMoney(Math.min(plannedAmount, remainingSurplus));
      const unfundedAmount = roundMoney(plannedAmount - allocatedAmount);
      const targetAsset = assetRows.find(function (asset) {
        return asset.id === allocation.targetAssetId;
      });

      if (targetAsset && allocatedAmount > 0) {
        targetAsset.currentValue = roundMoney(targetAsset.currentValue + allocatedAmount);
        remainingSurplus = roundMoney(remainingSurplus - allocatedAmount);
        totalAllocated = roundMoney(totalAllocated + allocatedAmount);
      }
      if (unfundedAmount > 0) {
        totalUnfunded = roundMoney(totalUnfunded + unfundedAmount);
      }

      allocationsByTarget.push({
        id: allocation.id,
        label: allocation.label,
        targetAssetId: allocation.targetAssetId,
        targetCategoryKey: allocation.targetCategoryKey,
        plannedAmount,
        allocatedAmount: targetAsset ? allocatedAmount : 0,
        unfundedAmount: targetAsset ? unfundedAmount : plannedAmount,
        sourcePaths: allocation.sourcePaths.slice()
      });
    });

    return {
      allocationsByTarget,
      totalAllocated,
      totalUnfunded,
      remainingSurplus
    };
  }

  function buildAssetSnapshot(assetRows, cashFlowContribution) {
    const snapshots = assetRows.map(function (asset) {
      return {
        id: asset.id,
        categoryKey: asset.categoryKey,
        label: asset.label,
        currentValue: roundMoney(asset.currentValue),
        includedInProjection: asset.includedInProjection,
        growthEligible: asset.growthEligible,
        annualGrowthRate: asset.annualGrowthRate == null ? null : roundRate(asset.annualGrowthRate),
        monthlyGrowthRate: roundRate(asset.monthlyGrowthRate),
        growthStatus: asset.growthStatus,
        growthActive: asset.growthActive,
        sourcePaths: asset.sourcePaths.slice(),
        trace: {
          ...asset.trace,
          ignoredMetadata: asset.ignoredMetadata.slice()
        }
      };
    });

    snapshots.push({
      id: CASH_FLOW_ROW_ID,
      categoryKey: CASH_FLOW_ROW_ID,
      label: "Cash-flow contribution",
      currentValue: roundMoney(cashFlowContribution),
      includedInProjection: true,
      growthEligible: false,
      annualGrowthRate: 0,
      monthlyGrowthRate: 0,
      growthStatus: "not-applicable",
      growthActive: false,
      sourcePaths: [],
      trace: {
        role: "aggregate-cash-flow"
      }
    });

    return snapshots;
  }

  function createBaseOutput(input, options, startDate, endDate, durationMonths, trace, warnings, dataGaps) {
    return {
      status: "not-available",
      startDate: startDate?.normalizedDate || normalizeString(input?.startDate),
      endDate: endDate?.normalizedDate || normalizeString(input?.endDate),
      cadence: MONTHLY_CADENCE,
      durationMonths: durationMonths == null ? 0 : durationMonths,
      summary: {
        startingAssets: 0,
        endingAssets: 0,
        totalIncome: 0,
        totalEssentialExpenses: 0,
        totalDiscretionaryExpenses: 0,
        totalScheduledObligations: 0,
        totalNetCashFlow: 0,
        totalInvestmentGrowth: 0,
        totalSavingAllocations: 0,
        totalUnallocatedSurplus: 0,
        totalUnfundedSavingAllocations: 0
      },
      points: [],
      warnings,
      dataGaps,
      trace: {
        projectionMethod: PROJECTION_METHOD,
        cashFlowTiming: options.cashFlowTiming,
        growthMode: options.growthMode,
        sourcePaths: uniqueStrings(trace.sourcePaths),
        excludedAssetCategories: uniqueStrings(trace.excludedAssetCategories),
        growthIneligibleCategories: uniqueStrings(trace.growthIneligibleCategories),
        reportingOnlyOrSavedOnlyGrowthCategoriesIgnored: uniqueStrings(trace.ignoredGrowthCategories),
        savingAllocationPolicy: {
          mode: "targeted-surplus-first",
          surplusRemainder: "cashFlowContribution",
          cap: "available-positive-net-cash-flow"
        }
      }
    };
  }

  function calculateHouseholdWealthProjection(input) {
    const safeInput = isPlainObject(input) ? input : {};
    const options = normalizeOptions(safeInput.options);
    const warnings = [];
    const dataGaps = [];
    const trace = {
      sourcePaths: [],
      excludedAssetCategories: [],
      growthIneligibleCategories: [],
      ignoredGrowthCategories: []
    };
    const startDate = normalizeDateOnly(safeInput.startDate);
    const endDate = normalizeDateOnly(safeInput.endDate);
    const requestedCadence = normalizeString(safeInput.cadence || MONTHLY_CADENCE);

    if (requestedCadence && requestedCadence !== MONTHLY_CADENCE) {
      dataGaps.push(makeIssue(
        "unsupported-cadence",
        "Only monthly cadence is supported in household wealth projection v1.",
        ["cadence"]
      ));
    }
    if (!startDate) {
      dataGaps.push(makeIssue("missing-start-date", "A valid startDate is required.", ["startDate"]));
    }
    if (!endDate) {
      dataGaps.push(makeIssue("missing-end-date", "A valid endDate is required.", ["endDate"]));
    }

    const durationMonths = startDate && endDate
      ? calculateWholeMonthsBetween(startDate.date, endDate.date)
      : null;
    const output = createBaseOutput(safeInput, options, startDate, endDate, durationMonths, trace, warnings, dataGaps);

    if (!startDate || !endDate || durationMonths == null || durationMonths < 0 || requestedCadence !== MONTHLY_CADENCE) {
      if (durationMonths != null && durationMonths < 0) {
        dataGaps.push(makeIssue("invalid-date-range", "endDate must be on or after startDate.", ["startDate", "endDate"]));
      }
      output.dataGaps = dataGaps;
      return output;
    }

    const assetRows = normalizeAssetLedger(safeInput.assetLedger, dataGaps, trace);
    const incomeStreams = normalizeCashFlowStreams(safeInput.incomeStreams, "income", dataGaps, trace);
    const expenseStreams = normalizeCashFlowStreams(safeInput.expenseStreams, "expense", dataGaps, trace);
    const obligations = normalizeScheduledObligations(safeInput.scheduledObligations, dataGaps, trace);
    const savingAllocations = normalizeSavingAllocations(safeInput.savingAllocations, assetRows, dataGaps, trace);
    const startingAssets = roundMoney(assetRows.reduce(function (total, asset) {
      return total + asset.currentValue;
    }, 0));
    let cashFlowContribution = 0;
    let endingAssets = startingAssets;
    let totalIncome = 0;
    let totalEssentialExpenses = 0;
    let totalDiscretionaryExpenses = 0;
    let totalScheduledObligations = 0;
    let totalNetCashFlow = 0;
    let totalInvestmentGrowth = 0;
    let totalSavingAllocations = 0;
    let totalUnallocatedSurplus = 0;
    let totalUnfundedSavingAllocations = 0;
    const points = [];

    for (let monthIndex = 1; monthIndex <= durationMonths; monthIndex += 1) {
      const periodStart = addMonths(startDate.date, monthIndex - 1);
      const pointDate = addMonths(startDate.date, monthIndex);
      const monthStartingAssets = endingAssets;
      let investmentGrowth = 0;

      assetRows.forEach(function (asset) {
        if (!asset.growthActive || asset.currentValue <= 0) {
          return;
        }
        const growthAmount = roundMoney(asset.currentValue * asset.monthlyGrowthRate);
        asset.currentValue = roundMoney(asset.currentValue + growthAmount);
        investmentGrowth = roundMoney(investmentGrowth + growthAmount);
      });

      const income = sumMonthlyAmounts(incomeStreams);
      const essentialExpenses = sumMonthlyAmounts(expenseStreams.filter(function (stream) {
        return normalizeStatus(stream.expenseType || stream.category) === "essential";
      }));
      const discretionaryExpenses = sumMonthlyAmounts(expenseStreams.filter(function (stream) {
        return normalizeStatus(stream.expenseType || stream.category) === "discretionary";
      }));
      const scheduledObligations = sumMonthlyAmounts(obligations.filter(function (obligation) {
        return isObligationActive(obligation, periodStart);
      }));
      const netCashFlow = roundMoney(income - essentialExpenses - discretionaryExpenses - scheduledObligations);
      const savingAllocationResult = applySavingAllocations(
        assetRows,
        savingAllocations,
        Math.max(netCashFlow, 0)
      );

      cashFlowContribution = roundMoney(
        cashFlowContribution + (netCashFlow < 0 ? netCashFlow : savingAllocationResult.remainingSurplus)
      );
      endingAssets = roundMoney(assetRows.reduce(function (total, asset) {
        return total + asset.currentValue;
      }, 0) + cashFlowContribution);
      if (!options.allowNegativeAssets) {
        endingAssets = Math.max(0, endingAssets);
      }

      totalIncome = roundMoney(totalIncome + income);
      totalEssentialExpenses = roundMoney(totalEssentialExpenses + essentialExpenses);
      totalDiscretionaryExpenses = roundMoney(totalDiscretionaryExpenses + discretionaryExpenses);
      totalScheduledObligations = roundMoney(totalScheduledObligations + scheduledObligations);
      totalNetCashFlow = roundMoney(totalNetCashFlow + netCashFlow);
      totalInvestmentGrowth = roundMoney(totalInvestmentGrowth + investmentGrowth);
      totalSavingAllocations = roundMoney(totalSavingAllocations + savingAllocationResult.totalAllocated);
      totalUnallocatedSurplus = roundMoney(totalUnallocatedSurplus + savingAllocationResult.remainingSurplus);
      totalUnfundedSavingAllocations = roundMoney(totalUnfundedSavingAllocations + savingAllocationResult.totalUnfunded);

      points.push({
        date: formatDateOnly(pointDate),
        monthIndex,
        startingAssets: monthStartingAssets,
        income,
        essentialExpenses,
        discretionaryExpenses,
        scheduledObligations,
        netCashFlow,
        savingAllocations: savingAllocationResult.allocationsByTarget,
        totalSavingAllocations: savingAllocationResult.totalAllocated,
        unallocatedSurplus: savingAllocationResult.remainingSurplus,
        unfundedSavingAllocations: savingAllocationResult.totalUnfunded,
        investmentGrowth,
        endingAssets,
        assetLedger: buildAssetSnapshot(assetRows, cashFlowContribution),
        sourcePaths: uniqueStrings(trace.sourcePaths),
        trace: {
          projectionMethod: PROJECTION_METHOD,
          cashFlowTiming: options.cashFlowTiming,
          growthMode: options.growthMode
        }
      });
    }

    output.status = dataGaps.length ? "partial" : "complete";
    output.summary = {
      startingAssets,
      endingAssets,
      totalIncome,
      totalEssentialExpenses,
      totalDiscretionaryExpenses,
      totalScheduledObligations,
      totalNetCashFlow,
      totalInvestmentGrowth,
      totalSavingAllocations,
      totalUnallocatedSurplus,
      totalUnfundedSavingAllocations
    };
    output.points = points;
    output.warnings = warnings;
    output.dataGaps = dataGaps;
    output.trace = {
      ...output.trace,
      sourcePaths: uniqueStrings(trace.sourcePaths),
      excludedAssetCategories: uniqueStrings(trace.excludedAssetCategories),
      growthIneligibleCategories: uniqueStrings(trace.growthIneligibleCategories),
      reportingOnlyOrSavedOnlyGrowthCategoriesIgnored: uniqueStrings(trace.ignoredGrowthCategories),
      savingAllocationPolicy: {
        mode: "targeted-surplus-first",
        allocationCount: savingAllocations.length,
        surplusRemainder: "cashFlowContribution",
        cap: "available-positive-net-cash-flow"
      }
    };

    return output;
  }

  lensAnalysis.calculateHouseholdWealthProjection = calculateHouseholdWealthProjection;
})(globalThis);
