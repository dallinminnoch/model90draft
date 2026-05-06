(function (globalScope) {
  const LensApp = globalScope.LensApp || (globalScope.LensApp = {});
  const lensAnalysis = LensApp.lensAnalysis || (LensApp.lensAnalysis = {});

  // Owner: reusable Lens analysis calculation engines.
  // Purpose: project household financial position from normalized primitive
  // inputs before a target date. Product-specific benefit, runway,
  // recommendation, event-lane, display, DOM, and persistence behavior belongs
  // downstream.

  const CALCULATION_VERSION = 1;
  const DEFAULT_PRE_TARGET_CONTEXT_MONTHS = 60;
  const MAX_PRE_TARGET_CONTEXT_MONTHS = 120;
  const PRE_TARGET_CONTEXT_MODE_MODELED_BACKCAST = "modeledBackcast";

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

    const parsed = Number(String(value).replace(/[$,%\s,]/g, "").trim());
    return Number.isFinite(parsed) ? parsed : null;
  }

  function roundMoney(value) {
    return Number.isFinite(value) ? Number(value.toFixed(2)) : null;
  }

  function uniqueStrings(values) {
    return Array.from(new Set(
      (Array.isArray(values) ? values : [])
        .map(normalizeString)
        .filter(Boolean)
    ));
  }

  function normalizeSourcePaths(input) {
    if (Array.isArray(input?.sourcePaths)) {
      return uniqueStrings(input.sourcePaths);
    }
    return uniqueStrings(input?.sourcePath ? [input.sourcePath] : []);
  }

  function parseDateOnly(value) {
    if (value == null || value === "") {
      return null;
    }

    if (value instanceof Date) {
      if (Number.isNaN(value.getTime())) {
        return null;
      }
      const date = new Date(value.getFullYear(), value.getMonth(), value.getDate());
      return {
        date,
        normalizedDate: formatDateOnly(date)
      };
    }

    const match = normalizeString(value).match(/^(\d{4})-(\d{2})-(\d{2})$/);
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
      normalizedDate: formatDateOnly(date)
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
    const output = new Date(date.getFullYear(), date.getMonth() + months, date.getDate());
    if (output.getDate() !== date.getDate()) {
      return new Date(output.getFullYear(), output.getMonth(), 0);
    }
    return output;
  }

  function calculateWholeMonthsBetweenDates(startDate, endDate) {
    if (!startDate || !endDate) {
      return null;
    }

    let months = (endDate.getFullYear() - startDate.getFullYear()) * 12
      + (endDate.getMonth() - startDate.getMonth());
    if (endDate.getDate() < startDate.getDate()) {
      months -= 1;
    }
    return months;
  }

  function createWarning(code, message, details) {
    const warning = { code, message };
    if (details !== undefined) {
      warning.details = details;
    }
    return warning;
  }

  function createDataGap(code, label, sourcePaths, details) {
    const dataGap = {
      code,
      label,
      sourcePaths: uniqueStrings(sourcePaths)
    };
    if (details !== undefined) {
      dataGap.details = details;
    }
    return dataGap;
  }

  function createOutputBase(input) {
    return {
      version: CALCULATION_VERSION,
      status: "not-calculated",
      asOfDate: null,
      targetDate: null,
      durationMonths: null,
      startingBalance: null,
      targetBalance: null,
      totalIncome: 0,
      totalExpenses: 0,
      totalEssentialExpenses: 0,
      totalDiscretionaryExpenses: 0,
      totalScheduledObligations: 0,
      totalAssetGrowth: 0,
      assetLedgerStart: [],
      assetLedgerTarget: [],
      preTargetPoints: [],
      points: [],
      inputs: {
        startingResources: normalizeInputSnapshot(input.startingResources),
        recurringIncome: normalizeInputSnapshot(input.recurringIncome),
        recurringExpenses: normalizeInputSnapshot(input.recurringExpenses),
        cashFlow: normalizeCashFlowSnapshot(input.cashFlow),
        assetLedger: normalizeAssetLedgerSnapshot(input.assetLedger),
        scheduledObligations: normalizeScheduledObligationSnapshot(input.scheduledObligations),
        assetGrowth: normalizeInputSnapshot(input.assetGrowth),
        options: isPlainObject(input.options) ? { ...input.options } : {}
      },
      sourcePaths: [],
      warnings: [],
      dataGaps: [],
      trace: {
        formula: [
          "current-dollar projection is used unless assetGrowth is explicitly active",
          "targetBalance = startingResources + recurringIncome - recurringExpenses - scheduledObligations + active asset growth",
          "assetLedger, when present, replaces scalar startingResources with the sum of included treated asset values"
        ],
        sourcePaths: [],
        assetLedger: {
          active: false,
          startingBalanceSource: "startingResources.value",
          includedCategoryKeys: [],
          excludedCategoryKeys: [],
          growthAppliedCategoryKeys: [],
          cashFlowAdjustmentCategoryKey: null
        },
        preTargetContext: {
          requested: false,
          mode: "none",
          precision: null,
          basis: null,
          months: 0,
          cashFlowApplied: false,
          assetLedgerApplied: false,
          assetGrowthApplied: false,
          reverseAssetGrowthApplied: false,
          reverseAssetGrowthEstimated: false,
          reverseAssetGrowthCategoryKeys: []
        }
      }
    };
  }

  function cloneSerializable(value) {
    if (value == null) {
      return value;
    }
    return JSON.parse(JSON.stringify(value));
  }

  function normalizeInputSnapshot(input) {
    const safeInput = isPlainObject(input) ? input : {};
    const snapshot = {
      value: toOptionalNumber(safeInput.value),
      status: normalizeString(safeInput.status) || null,
      sourcePath: safeInput.sourcePath || null,
      sourcePaths: normalizeSourcePaths(safeInput)
    };

    if (safeInput.frequency || safeInput.period) {
      snapshot.frequency = normalizeFrequency(safeInput.frequency || safeInput.period);
    }
    if (safeInput.active !== undefined) {
      snapshot.active = safeInput.active === true;
    }
    if (safeInput.unsafe !== undefined) {
      snapshot.unsafe = safeInput.unsafe === true;
    }
    if (safeInput.annualRatePercent !== undefined) {
      snapshot.annualRatePercent = toOptionalNumber(safeInput.annualRatePercent);
    }

    return snapshot;
  }

  function normalizeCashFlowSnapshot(input) {
    const safeInput = isPlainObject(input) ? input : {};
    return {
      recurringIncome: normalizeInputSnapshot(safeInput.recurringIncome),
      essentialExpenses: normalizeInputSnapshot(safeInput.essentialExpenses),
      discretionaryExpenses: normalizeInputSnapshot(safeInput.discretionaryExpenses),
      scheduledObligations: normalizeScheduledObligationSnapshot(safeInput.scheduledObligations)
    };
  }

  function normalizeAssetLedgerSnapshot(input) {
    return (Array.isArray(input) ? input : []).map(function (row) {
      const safeRow = isPlainObject(row) ? row : {};
      return {
        categoryKey: normalizeString(safeRow.categoryKey) || null,
        label: normalizeString(safeRow.label) || null,
        rawValue: toOptionalNumber(safeRow.rawValue),
        treatedValue: toOptionalNumber(safeRow.treatedValue),
        included: safeRow.included === true || safeRow.include === true,
        treatmentStatus: normalizeString(safeRow.treatmentStatus) || null,
        taxDragPercent: toOptionalNumber(safeRow.taxDragPercent),
        liquidityHaircutPercent: toOptionalNumber(safeRow.liquidityHaircutPercent),
        annualGrowthRatePercent: toOptionalNumber(safeRow.annualGrowthRatePercent),
        growthStatus: normalizeString(safeRow.growthStatus) || null,
        growthEligible: safeRow.growthEligible === true,
        sourcePaths: normalizeSourcePaths(safeRow)
      };
    });
  }

  function normalizeScheduledObligationSnapshot(input) {
    const rows = Array.isArray(input) ? input : (isPlainObject(input) ? [input] : []);
    return rows.map(function (row) {
      return {
        value: toOptionalNumber(row.value),
        monthlyAmount: toOptionalNumber(row.monthlyAmount),
        annualAmount: toOptionalNumber(row.annualAmount),
        termMonths: toOptionalNumber(row.termMonths),
        startMonth: toOptionalNumber(row.startMonth),
        endMonth: toOptionalNumber(row.endMonth),
        status: normalizeString(row.status) || null,
        includedInRecurringExpenses: row.includedInRecurringExpenses === true,
        separateFromRecurringExpenses: row.separateFromRecurringExpenses === true,
        sourcePath: row.sourcePath || null,
        sourcePaths: normalizeSourcePaths(row)
      };
    });
  }

  function normalizeFrequency(value) {
    const normalized = normalizeString(value).toLowerCase();
    if (normalized === "monthly" || normalized === "month") {
      return "monthly";
    }
    return "annual";
  }

  function normalizeAnnualAmount(input, defaultFrequency) {
    const safeInput = isPlainObject(input) ? input : {};
    const value = toOptionalNumber(safeInput.value);
    if (value == null) {
      return null;
    }
    const frequency = normalizeFrequency(safeInput.frequency || safeInput.period || defaultFrequency || "annual");
    return frequency === "monthly" ? value * 12 : value;
  }

  function isUnsafeIncomeInput(input) {
    const safeInput = isPlainObject(input) ? input : {};
    const status = normalizeString(safeInput.status).toLowerCase();
    return safeInput.unsafe === true
      || status.includes("gross")
      || status.includes("unsafe")
      || status.includes("unavailable");
  }

  function isActiveGrowthInput(input) {
    const safeInput = isPlainObject(input) ? input : {};
    const status = normalizeString(safeInput.status).toLowerCase();
    return safeInput.active === true
      || status === "active"
      || status === "method-active"
      || status === "current-output-active";
  }

  function normalizeAssetGrowthInput(input) {
    const safeInput = isPlainObject(input) ? input : {};
    const explicitRate = toOptionalNumber(safeInput.annualRatePercent);
    const valueRate = toOptionalNumber(safeInput.value);
    const annualRatePercent = explicitRate == null ? valueRate : explicitRate;
    const active = isActiveGrowthInput(safeInput) && annualRatePercent != null && annualRatePercent > 0;
    return {
      active,
      annualRatePercent: active ? annualRatePercent : 0,
      status: normalizeString(safeInput.status) || (active ? "active" : "current-dollar"),
      sourcePaths: normalizeSourcePaths(safeInput)
    };
  }

  function getCashFlowInput(safeInput, key, fallbackKey) {
    const cashFlow = isPlainObject(safeInput.cashFlow) ? safeInput.cashFlow : {};
    if (isPlainObject(cashFlow[key])) {
      return cashFlow[key];
    }
    if (fallbackKey && isPlainObject(safeInput[fallbackKey])) {
      return safeInput[fallbackKey];
    }
    return {};
  }

  function getScheduledObligationInput(safeInput) {
    const cashFlow = isPlainObject(safeInput.cashFlow) ? safeInput.cashFlow : {};
    return cashFlow.scheduledObligations !== undefined
      ? cashFlow.scheduledObligations
      : safeInput.scheduledObligations;
  }

  function isActiveLedgerGrowthStatus(value) {
    const status = normalizeString(value).toLowerCase();
    return status === "active"
      || status === "method-active"
      || status === "current-output-active";
  }

  function createLedgerSourcePath(row, index) {
    return normalizeString(row?.sourcePath)
      || (normalizeString(row?.categoryKey)
        ? `assetLedger.${normalizeString(row.categoryKey)}`
        : `assetLedger[${index}]`);
  }

  function normalizeAssetLedger(input, output) {
    const rows = Array.isArray(input) ? input : [];
    const normalizedRows = [];
    const includedCategoryKeys = [];
    const excludedCategoryKeys = [];
    const growthAppliedCategoryKeys = [];

    rows.forEach(function (row, index) {
      if (!isPlainObject(row)) {
        output.warnings.push(createWarning(
          "invalid-asset-ledger-row",
          "Asset ledger row was not an object and was skipped.",
          { index }
        ));
        return;
      }

      const categoryKey = normalizeString(row.categoryKey) || `asset-ledger-row-${index + 1}`;
      const sourcePaths = uniqueStrings(normalizeSourcePaths(row).concat(createLedgerSourcePath(row, index)));
      const included = row.included === true || row.include === true;
      const treatedValue = toOptionalNumber(row.treatedValue);
      const rawValue = toOptionalNumber(row.rawValue);
      const annualGrowthRatePercent = toOptionalNumber(row.annualGrowthRatePercent);
      const growthStatus = normalizeString(row.growthStatus);
      const growthEligible = row.growthEligible === true;
      const growthActive = included
        && growthEligible
        && isActiveLedgerGrowthStatus(growthStatus)
        && annualGrowthRatePercent != null
        && annualGrowthRatePercent > 0;

      if (!included) {
        excludedCategoryKeys.push(categoryKey);
      }
      if (included && (treatedValue == null || treatedValue < 0)) {
        output.dataGaps.push(createDataGap(
          "invalid-asset-ledger-treated-value",
          "Included asset ledger row was missing a usable treated value and was skipped.",
          sourcePaths,
          { categoryKey, index }
        ));
        return;
      }

      const balance = included ? Math.max(0, treatedValue || 0) : 0;
      if (included) {
        includedCategoryKeys.push(categoryKey);
      }
      if (growthActive) {
        growthAppliedCategoryKeys.push(categoryKey);
      } else if (included && growthEligible && annualGrowthRatePercent != null && annualGrowthRatePercent > 0) {
        output.warnings.push(createWarning(
          "asset-ledger-growth-inactive",
          "Asset ledger row had a growth rate but was not marked active for method use.",
          { categoryKey, growthStatus: growthStatus || null, sourcePaths }
        ));
      }

      normalizedRows.push({
        categoryKey,
        label: normalizeString(row.label) || categoryKey,
        rawValue: rawValue == null ? null : roundMoney(rawValue),
        treatedValue: treatedValue == null ? null : roundMoney(treatedValue),
        included,
        treatmentStatus: normalizeString(row.treatmentStatus) || null,
        taxDragPercent: toOptionalNumber(row.taxDragPercent),
        liquidityHaircutPercent: toOptionalNumber(row.liquidityHaircutPercent),
        annualGrowthRatePercent: annualGrowthRatePercent == null ? 0 : annualGrowthRatePercent,
        growthStatus: growthStatus || (growthActive ? "method-active" : "current-dollar"),
        growthEligible,
        growthActive,
        balance,
        sourcePaths,
        trace: isPlainObject(row.trace) ? cloneSerializable(row.trace) : null
      });
    });

    if (rows.length && !includedCategoryKeys.length) {
      output.warnings.push(createWarning(
        "asset-ledger-no-included-assets",
        "Asset ledger was provided but no included treated asset rows contributed to starting balance."
      ));
    }

    return {
      active: rows.length > 0,
      rows: normalizedRows,
      startingBalance: normalizedRows.reduce(function (total, row) {
        return total + (row.included ? row.balance : 0);
      }, 0),
      sourcePaths: uniqueStrings(normalizedRows.flatMap(function (row) {
        return row.sourcePaths;
      })),
      includedCategoryKeys: uniqueStrings(includedCategoryKeys),
      excludedCategoryKeys: uniqueStrings(excludedCategoryKeys),
      growthAppliedCategoryKeys: uniqueStrings(growthAppliedCategoryKeys)
    };
  }

  function snapshotLedgerRows(rows) {
    return rows.map(function (row) {
      return {
        categoryKey: row.categoryKey,
        label: row.label,
        rawValue: row.rawValue,
        treatedValue: row.treatedValue,
        included: row.included,
        treatmentStatus: row.treatmentStatus,
        taxDragPercent: row.taxDragPercent,
        liquidityHaircutPercent: row.liquidityHaircutPercent,
        annualGrowthRatePercent: row.annualGrowthRatePercent,
        growthStatus: row.growthStatus,
        growthEligible: row.growthEligible,
        growthActive: row.growthActive,
        balance: roundMoney(row.balance),
        sourcePaths: row.sourcePaths.slice(),
        trace: row.trace == null ? null : cloneSerializable(row.trace)
      };
    });
  }

  function cloneLedgerRows(rows) {
    return rows.map(function (row) {
      return {
        ...row,
        sourcePaths: row.sourcePaths.slice(),
        trace: row.trace == null ? null : cloneSerializable(row.trace)
      };
    });
  }

  function applyLedgerGrowth(rows) {
    let totalGrowth = 0;
    rows.forEach(function (row) {
      if (!row.included || !row.growthActive || row.balance <= 0) {
        row.lastGrowth = 0;
        return;
      }
      const monthlyGrowthRate = row.annualGrowthRatePercent / 100 / 12;
      const growth = row.balance * monthlyGrowthRate;
      row.balance += growth;
      row.lastGrowth = growth;
      totalGrowth += growth;
    });
    return totalGrowth;
  }

  function applyLedgerReverseGrowth(rows) {
    let totalGrowth = 0;
    const categoryKeys = [];

    rows.forEach(function (row) {
      if (!row.included || !row.growthActive || row.balance <= 0) {
        row.lastReverseGrowth = 0;
        return;
      }

      const monthlyGrowthRate = row.annualGrowthRatePercent / 100 / 12;
      if (!Number.isFinite(monthlyGrowthRate) || monthlyGrowthRate <= 0) {
        row.lastReverseGrowth = 0;
        return;
      }

      const balanceAfterGrowth = row.balance;
      const priorBalance = balanceAfterGrowth / (1 + monthlyGrowthRate);
      const growth = balanceAfterGrowth - priorBalance;
      row.balance = priorBalance;
      row.lastReverseGrowth = growth;
      totalGrowth += growth;
      categoryKeys.push(row.categoryKey);
    });

    return {
      totalGrowth,
      categoryKeys: uniqueStrings(categoryKeys)
    };
  }

  function applyLedgerCashFlow(rows, amount) {
    const normalizedAmount = toOptionalNumber(amount) || 0;
    if (!normalizedAmount) {
      return;
    }

    let cashFlowRow = rows.find(function (row) {
      return row.categoryKey === "householdCashFlowAdjustment";
    });
    if (!cashFlowRow) {
      cashFlowRow = {
        categoryKey: "householdCashFlowAdjustment",
        label: "Household cash-flow surplus / deficit",
        rawValue: null,
        treatedValue: 0,
        included: true,
        treatmentStatus: "cash-flow-adjustment",
        taxDragPercent: null,
        liquidityHaircutPercent: null,
        annualGrowthRatePercent: 0,
        growthStatus: "not-growth-eligible",
        growthEligible: false,
        growthActive: false,
        balance: 0,
        sourcePaths: ["cashFlow.recurringIncome", "cashFlow.essentialExpenses", "cashFlow.discretionaryExpenses"],
        trace: {
          source: "household-financial-position-cash-flow-adjustment",
          formula: "monthly income - monthly essential expenses - monthly discretionary expenses - scheduled obligations"
        }
      };
      rows.push(cashFlowRow);
    }
    cashFlowRow.balance += normalizedAmount;
    cashFlowRow.treatedValue = roundMoney(cashFlowRow.balance);
  }

  function sumLedgerBalance(rows) {
    return rows.reduce(function (total, row) {
      return total + (row.included ? row.balance : 0);
    }, 0);
  }

  function normalizeScheduledObligations(input, output) {
    const rows = Array.isArray(input) ? input : (isPlainObject(input) ? [input] : []);
    return rows
      .map(function (row, index) {
        const sourcePaths = normalizeSourcePaths(row);
        const status = normalizeString(row.status);
        const separate = row.separateFromRecurringExpenses === true
          || row.includedInRecurringExpenses === false
          || status.toLowerCase().includes("separate");
        const included = row.includedInRecurringExpenses === true
          || status.toLowerCase().includes("included-in-recurring");

        if (!separate || included) {
          output.warnings.push(createWarning(
            "scheduled-obligation-skipped-already-in-expenses",
            "Scheduled obligation was not added because it was not explicitly separate from recurring expenses.",
            { index, sourcePaths }
          ));
          return null;
        }

        const monthlyAmount = toOptionalNumber(row.monthlyAmount);
        const annualAmount = toOptionalNumber(row.annualAmount);
        const value = toOptionalNumber(row.value);
        const normalizedMonthlyAmount = monthlyAmount == null
          ? (annualAmount == null ? (value == null ? null : value / 12) : annualAmount / 12)
          : monthlyAmount;

        if (normalizedMonthlyAmount == null) {
          output.dataGaps.push(createDataGap(
            "missing-scheduled-obligation-amount",
            "A separate scheduled obligation was provided without a usable amount.",
            sourcePaths,
            { index }
          ));
          return null;
        }

        return {
          monthlyAmount: Math.max(0, normalizedMonthlyAmount),
          termMonths: toOptionalNumber(row.termMonths),
          startMonth: Math.max(1, toOptionalNumber(row.startMonth) || 1),
          endMonth: toOptionalNumber(row.endMonth),
          status: status || "separate-scheduled-obligation",
          sourcePaths
        };
      })
      .filter(Boolean);
  }

  function getScheduledObligationAmountForMonth(rows, monthIndex) {
    return rows.reduce(function (total, row) {
      if (monthIndex < row.startMonth) {
        return total;
      }
      if (row.termMonths != null && monthIndex > row.termMonths) {
        return total;
      }
      if (row.endMonth != null && monthIndex > row.endMonth) {
        return total;
      }
      return total + row.monthlyAmount;
    }, 0);
  }

  function normalizePreTargetContextOptions(options, output, assetGrowth, scheduledObligations, assetLedger) {
    const safeOptions = isPlainObject(options) ? options : {};
    const requested = safeOptions.includePreTargetContext === true;
    const mode = normalizeString(safeOptions.preTargetMode) || PRE_TARGET_CONTEXT_MODE_MODELED_BACKCAST;
    const requestedMonths = toOptionalNumber(safeOptions.preTargetMonths);
    const months = Math.max(
      0,
      Math.min(
        MAX_PRE_TARGET_CONTEXT_MONTHS,
        Math.round(requestedMonths == null ? DEFAULT_PRE_TARGET_CONTEXT_MONTHS : requestedMonths)
      )
    );
    const scheduledObligationSourcePaths = scheduledObligations.flatMap(function (row) {
      return row.sourcePaths;
    });
    const reverseAssetGrowthCategoryKeys = uniqueStrings(assetLedger?.growthAppliedCategoryKeys || []);

    output.trace.preTargetContext = {
      requested,
      mode: requested ? mode : "none",
      precision: requested ? "estimated" : null,
      basis: requested ? "current assumptions reversed from asOfDate; not historical account data" : null,
      months: requested ? months : 0,
      cashFlowApplied: false,
      assetLedgerApplied: false,
      assetGrowthApplied: false,
      reverseAssetGrowthApplied: false,
      reverseAssetGrowthEstimated: false,
      reverseAssetGrowthCategoryKeys,
      scheduledObligationsApplied: false,
      sourcePaths: []
    };

    if (!requested) {
      return {
        requested: false,
        active: false,
        mode: "none",
        months: 0,
        scheduledObligationSourcePaths
      };
    }

    if (mode !== PRE_TARGET_CONTEXT_MODE_MODELED_BACKCAST) {
      output.dataGaps.push(createDataGap(
        "unsupported-pre-target-context-mode",
        "Pre-target context was requested with an unsupported mode.",
        ["options.preTargetMode"],
        { received: mode, supportedMode: PRE_TARGET_CONTEXT_MODE_MODELED_BACKCAST }
      ));
      return {
        requested: true,
        active: false,
        mode,
        months,
        scheduledObligationSourcePaths
      };
    }

    output.warnings.push(createWarning(
      "modeled-backcast-not-historical",
      "Pre-target household position context is modeled from current assumptions and is not historical account data.",
      {
        mode,
        precision: "estimated",
        months
      }
    ));

    if (assetGrowth.active && !reverseAssetGrowthCategoryKeys.length) {
      output.warnings.push(createWarning(
        "modeled-backcast-reverse-asset-growth-not-applied",
        "Active forward asset growth could not be applied in reverse because no eligible asset-ledger growth rows were available.",
        {
          mode,
          assetGrowthStatus: assetGrowth.status,
          reason: "no-eligible-asset-ledger-growth-rows",
          sourcePaths: assetGrowth.sourcePaths
        }
      ));
      output.dataGaps.push(createDataGap(
        "reverse-asset-growth-not-applied",
        "Reverse asset growth could not be modeled without eligible method-active asset-ledger growth rows.",
        assetGrowth.sourcePaths,
        { mode, assetGrowthApplied: false, reason: "no-eligible-asset-ledger-growth-rows" }
      ));
    }

    return {
      requested: true,
      active: months > 0,
      mode,
      months,
      reverseAssetGrowthCategoryKeys,
      scheduledObligationSourcePaths
    };
  }

  function buildModeledBackcastPreTargetPoints(options) {
    const safeOptions = isPlainObject(options) ? options : {};
    const asOfDate = safeOptions.asOfDate;
    const months = safeOptions.months;
    const monthlyIncome = safeOptions.monthlyIncome;
    const monthlyExpenses = safeOptions.monthlyExpenses;
    const monthlyEssentialExpenses = toOptionalNumber(safeOptions.monthlyEssentialExpenses);
    const monthlyDiscretionaryExpenses = toOptionalNumber(safeOptions.monthlyDiscretionaryExpenses);
    const monthlyNetCashFlow = monthlyIncome - monthlyExpenses;
    const sourcePaths = uniqueStrings(safeOptions.sourcePaths);
    const points = [];
    const ledgerRows = Array.isArray(safeOptions.assetLedgerRows)
      ? cloneLedgerRows(safeOptions.assetLedgerRows)
      : [];
    const usesAssetLedger = ledgerRows.length > 0;
    const reverseAssetGrowthCategoryKeys = [];
    let totalReverseAssetGrowth = 0;
    let nextBalance = safeOptions.startingBalance;

    for (let monthOffset = -1; monthOffset >= -months; monthOffset -= 1) {
      const pointDate = addMonths(asOfDate.date, monthOffset);
      let modeledBalance;
      let reverseGrowth = 0;
      let assetLedgerSnapshot = [];

      if (usesAssetLedger) {
        applyLedgerCashFlow(ledgerRows, -monthlyNetCashFlow);
        const reverseGrowthResult = applyLedgerReverseGrowth(ledgerRows);
        reverseGrowth = reverseGrowthResult.totalGrowth;
        totalReverseAssetGrowth += reverseGrowth;
        reverseAssetGrowthCategoryKeys.push(...reverseGrowthResult.categoryKeys);
        modeledBalance = sumLedgerBalance(ledgerRows);
        assetLedgerSnapshot = snapshotLedgerRows(ledgerRows);
      } else {
        modeledBalance = nextBalance - monthlyNetCashFlow;
      }

      points.push({
        date: formatDateOnly(pointDate),
        monthIndex: monthOffset,
        startingBalance: roundMoney(modeledBalance),
        income: roundMoney(monthlyIncome),
        expenses: roundMoney(monthlyExpenses),
        essentialExpenses: roundMoney(monthlyEssentialExpenses == null ? monthlyExpenses : monthlyEssentialExpenses),
        discretionaryExpenses: roundMoney(monthlyDiscretionaryExpenses || 0),
        scheduledObligations: 0,
        growth: roundMoney(reverseGrowth),
        netCashFlow: roundMoney(monthlyNetCashFlow),
        netSurplusDeficit: roundMoney(monthlyNetCashFlow),
        endingBalance: roundMoney(modeledBalance),
        assetLedger: assetLedgerSnapshot,
        status: "modeledBackcast",
        precision: "estimated",
        sourcePaths
      });
      nextBalance = modeledBalance;
    }

    return {
      points: points.reverse(),
      assetLedgerApplied: usesAssetLedger,
      reverseAssetGrowthApplied: totalReverseAssetGrowth > 0,
      reverseAssetGrowthCategoryKeys: uniqueStrings(reverseAssetGrowthCategoryKeys),
      totalReverseAssetGrowth: roundMoney(totalReverseAssetGrowth)
    };
  }

  function buildCurrentPositionPreTargetPoints(options) {
    const safeOptions = isPlainObject(options) ? options : {};
    const asOfDate = safeOptions.asOfDate;
    const months = safeOptions.months;
    const startingBalance = safeOptions.startingBalance;
    const sourcePaths = uniqueStrings(safeOptions.sourcePaths);
    const points = [];

    for (let monthOffset = -months; monthOffset < 0; monthOffset += 1) {
      const pointDate = addMonths(asOfDate.date, monthOffset);
      points.push({
        date: formatDateOnly(pointDate),
        monthIndex: monthOffset,
        startingBalance: roundMoney(startingBalance),
        income: null,
        expenses: null,
        scheduledObligations: 0,
        growth: 0,
        netCashFlow: null,
        endingBalance: roundMoney(startingBalance),
        status: "currentPositionContext",
        precision: "estimated",
        sourcePaths
      });
    }

    return points;
  }

  function calculateHouseholdFinancialPosition(input) {
    const safeInput = isPlainObject(input) ? input : {};
    const output = createOutputBase(safeInput);
    const asOfDate = parseDateOnly(safeInput.asOfDate);
    const targetDate = parseDateOnly(safeInput.targetDate);

    if (!asOfDate) {
      output.dataGaps.push(createDataGap("missing-as-of-date", "asOfDate is required.", ["asOfDate"]));
    }
    if (!targetDate) {
      output.dataGaps.push(createDataGap("missing-target-date", "targetDate is required.", ["targetDate"]));
    }

    output.asOfDate = asOfDate ? asOfDate.normalizedDate : null;
    output.targetDate = targetDate ? targetDate.normalizedDate : null;

    if (!asOfDate || !targetDate) {
      output.status = "data-gap";
      finalizeOutput(output);
      return output;
    }

    const durationMonths = calculateWholeMonthsBetweenDates(asOfDate.date, targetDate.date);
    output.durationMonths = durationMonths;
    if (durationMonths == null || durationMonths < 0) {
      output.dataGaps.push(createDataGap(
        "invalid-target-before-as-of-date",
        "targetDate must be on or after asOfDate.",
        ["asOfDate", "targetDate"]
      ));
      output.status = "data-gap";
      finalizeOutput(output);
      return output;
    }

    const assetLedger = normalizeAssetLedger(safeInput.assetLedger, output);
    const usesAssetLedger = assetLedger.active;
    const scalarStartingBalance = toOptionalNumber(safeInput.startingResources?.value);
    const startingBalance = usesAssetLedger ? assetLedger.startingBalance : scalarStartingBalance;
    const startingResourcePaths = usesAssetLedger
      ? assetLedger.sourcePaths
      : normalizeSourcePaths(safeInput.startingResources);
    if (startingBalance == null) {
      output.dataGaps.push(createDataGap(
        "missing-starting-resources",
        "Starting household resources are missing.",
        startingResourcePaths
      ));
    }

    output.trace.assetLedger = {
      active: usesAssetLedger,
      startingBalanceSource: usesAssetLedger
        ? "assetLedger[].included treatedValue"
        : "startingResources.value",
      includedCategoryKeys: assetLedger.includedCategoryKeys,
      excludedCategoryKeys: assetLedger.excludedCategoryKeys,
      growthAppliedCategoryKeys: assetLedger.growthAppliedCategoryKeys,
      cashFlowAdjustmentCategoryKey: usesAssetLedger ? "householdCashFlowAdjustment" : null
    };
    if (usesAssetLedger) {
      output.assetLedgerStart = snapshotLedgerRows(assetLedger.rows);
      output.trace.formula.push("assetLedger path applies category-level monthly growth before monthly net cash flow is added to householdCashFlowAdjustment.");
    }

    const recurringIncomeInput = getCashFlowInput(safeInput, "recurringIncome", "recurringIncome");
    const essentialExpenseInput = getCashFlowInput(safeInput, "essentialExpenses", "recurringExpenses");
    const discretionaryExpenseInput = getCashFlowInput(safeInput, "discretionaryExpenses", null);
    const annualIncome = normalizeAnnualAmount(recurringIncomeInput, "annual");
    const recurringIncomePaths = normalizeSourcePaths(recurringIncomeInput);
    if (annualIncome == null || isUnsafeIncomeInput(recurringIncomeInput)) {
      output.dataGaps.push(createDataGap(
        isUnsafeIncomeInput(recurringIncomeInput)
          ? "unsafe-recurring-income"
          : "missing-net-recurring-income",
        "Mature net recurring household income is required; gross or unavailable income was not used.",
        recurringIncomePaths
      ));
    }

    const annualEssentialExpenses = normalizeAnnualAmount(essentialExpenseInput, "annual");
    const annualDiscretionaryExpenses = normalizeAnnualAmount(discretionaryExpenseInput, "annual");
    const recurringExpensePaths = normalizeSourcePaths(essentialExpenseInput);
    const discretionaryExpensePaths = normalizeSourcePaths(discretionaryExpenseInput);
    if (annualEssentialExpenses == null) {
      output.dataGaps.push(createDataGap(
        "missing-recurring-expenses",
        "Recurring household expenses are missing.",
        recurringExpensePaths
      ));
    }
    if (!isPlainObject(discretionaryExpenseInput)) {
      output.trace.formula.push("discretionaryExpenses input was not provided; discretionary expenses defaulted to 0 for compatibility.");
    }

    const annualExpenses = (annualEssentialExpenses == null ? null : annualEssentialExpenses)
      == null
      ? null
      : annualEssentialExpenses + (annualDiscretionaryExpenses || 0);
    const scheduledObligations = normalizeScheduledObligations(getScheduledObligationInput(safeInput), output);
    const assetGrowth = normalizeAssetGrowthInput(safeInput.assetGrowth);
    if (!assetGrowth.active) {
      output.trace.formula.push("assetGrowth was inactive; totalAssetGrowth remains 0 in current dollars.");
    }
    const preTargetContext = normalizePreTargetContextOptions(
      safeInput.options,
      output,
      assetGrowth,
      scheduledObligations,
      assetLedger
    );

    output.sourcePaths = uniqueStrings(
      startingResourcePaths
        .concat(recurringIncomePaths)
        .concat(recurringExpensePaths)
        .concat(discretionaryExpensePaths)
        .concat(assetGrowth.sourcePaths)
        .concat(scheduledObligations.flatMap(function (row) { return row.sourcePaths; }))
    );
    output.trace.sourcePaths = output.sourcePaths.slice();
    output.trace.preTargetContext.sourcePaths = uniqueStrings(
      startingResourcePaths
        .concat(recurringIncomePaths)
        .concat(recurringExpensePaths)
        .concat(discretionaryExpensePaths)
        .concat(preTargetContext.scheduledObligationSourcePaths)
        .concat(assetGrowth.active ? assetGrowth.sourcePaths : [])
    );
    output.startingBalance = startingBalance == null ? null : roundMoney(startingBalance);

    const hasStartingResourceGap = output.dataGaps.some(function (gap) {
      return gap.code === "missing-starting-resources";
    });
    const hasCashFlowGap = output.dataGaps.some(function (gap) {
      return [
        "missing-net-recurring-income",
        "unsafe-recurring-income",
        "missing-recurring-expenses"
      ].includes(gap.code);
    });
    if (output.dataGaps.some(function (gap) {
      return gap.code === "missing-starting-resources"
        || (durationMonths > 0 && [
          "missing-net-recurring-income",
          "unsafe-recurring-income",
          "missing-recurring-expenses"
        ].includes(gap.code));
    })) {
      output.status = "data-gap";
      finalizeOutput(output);
      return output;
    }

    const canUseCashFlow = !hasStartingResourceGap && !hasCashFlowGap;
    const monthlyIncome = canUseCashFlow ? annualIncome / 12 : 0;
    const monthlyEssentialExpenses = canUseCashFlow ? annualEssentialExpenses / 12 : 0;
    const monthlyDiscretionaryExpenses = canUseCashFlow ? (annualDiscretionaryExpenses || 0) / 12 : 0;
    const monthlyExpenses = monthlyEssentialExpenses + monthlyDiscretionaryExpenses;
    const monthlyGrowthRate = !usesAssetLedger && assetGrowth.active ? assetGrowth.annualRatePercent / 100 / 12 : 0;
    let runningBalance = startingBalance;
    let runningLedger = usesAssetLedger ? cloneLedgerRows(assetLedger.rows) : [];

    if (preTargetContext.active && canUseCashFlow) {
      const preTargetResult = buildModeledBackcastPreTargetPoints({
        asOfDate,
        months: preTargetContext.months,
        startingBalance,
        monthlyIncome,
        monthlyExpenses,
        monthlyEssentialExpenses,
        monthlyDiscretionaryExpenses,
        assetLedgerRows: usesAssetLedger ? assetLedger.rows : [],
        sourcePaths: output.trace.preTargetContext.sourcePaths
      });
      output.preTargetPoints = preTargetResult.points;
      output.trace.preTargetContext.cashFlowApplied = true;
      output.trace.preTargetContext.assetLedgerApplied = preTargetResult.assetLedgerApplied;
      output.trace.preTargetContext.assetGrowthApplied = preTargetResult.reverseAssetGrowthApplied;
      output.trace.preTargetContext.reverseAssetGrowthApplied = preTargetResult.reverseAssetGrowthApplied;
      output.trace.preTargetContext.reverseAssetGrowthEstimated = preTargetResult.reverseAssetGrowthApplied;
      output.trace.preTargetContext.reverseAssetGrowthCategoryKeys = preTargetResult.reverseAssetGrowthCategoryKeys;
      output.trace.preTargetContext.totalReverseAssetGrowth = preTargetResult.totalReverseAssetGrowth;
      output.trace.preTargetContext.basis = preTargetResult.assetLedgerApplied
        ? "current treated asset ledger, mature income/expense assumptions, and eligible category growth reversed from asOfDate; not historical account data"
        : "current income/expense assumptions reversed from asOfDate; not historical account data";
      output.trace.formula.push(
        preTargetResult.assetLedgerApplied
          ? "preTargetPoints use modeledBackcast by reversing treated asset-ledger balances, monthly net cash flow, and eligible method-active category growth from asOfDate; points are estimated and not historical account data."
          : "preTargetPoints use modeledBackcast current-dollar reverse cash flow and are not historical account data."
      );
    } else if (preTargetContext.active && !canUseCashFlow) {
      if (!hasStartingResourceGap && durationMonths === 0) {
        output.preTargetPoints = buildCurrentPositionPreTargetPoints({
          asOfDate,
          months: preTargetContext.months,
          startingBalance,
          sourcePaths: output.trace.preTargetContext.sourcePaths
        });
        output.trace.preTargetContext.mode = "currentPositionContext";
        output.trace.preTargetContext.basis = "current treated household resources carried backward from asOfDate because mature cash-flow inputs were unavailable";
        output.trace.preTargetContext.fallbackReason = "cash-flow-data-gap";
        output.trace.preTargetContext.cashFlowApplied = false;
        output.trace.formula.push("preTargetPoints use currentPositionContext when mature net income or recurring expenses are unavailable at a zero-month target; points carry startingResources backward and are not historical account data.");
      } else {
        output.trace.formula.push("preTargetPoints were not generated because mature net income or recurring expenses were unavailable, but targetBalance still used startingResources for a zero-month target.");
      }
    }

    output.points.push(createPoint({
      date: asOfDate.normalizedDate,
      monthIndex: 0,
      startingBalance: runningBalance,
      income: 0,
      expenses: 0,
      essentialExpenses: 0,
      discretionaryExpenses: 0,
      scheduledObligations: 0,
      growth: 0,
      endingBalance: runningBalance,
      assetLedger: usesAssetLedger ? snapshotLedgerRows(runningLedger) : [],
      status: "starting",
      sourcePaths: output.sourcePaths
    }));

    for (let monthIndex = 1; monthIndex <= durationMonths; monthIndex += 1) {
      const pointDate = addMonths(asOfDate.date, monthIndex);
      const pointStartingBalance = runningBalance;
      const growth = usesAssetLedger
        ? applyLedgerGrowth(runningLedger)
        : (pointStartingBalance > 0 ? pointStartingBalance * monthlyGrowthRate : 0);
      const scheduledObligationAmount = getScheduledObligationAmountForMonth(scheduledObligations, monthIndex);
      const netCashFlow = monthlyIncome - monthlyEssentialExpenses - monthlyDiscretionaryExpenses - scheduledObligationAmount;
      if (usesAssetLedger) {
        applyLedgerCashFlow(runningLedger, netCashFlow);
      }
      const endingBalance = usesAssetLedger
        ? sumLedgerBalance(runningLedger)
        : pointStartingBalance + growth + netCashFlow;
      runningBalance = endingBalance;

      output.totalIncome += monthlyIncome;
      output.totalEssentialExpenses += monthlyEssentialExpenses;
      output.totalDiscretionaryExpenses += monthlyDiscretionaryExpenses;
      output.totalExpenses += monthlyEssentialExpenses + monthlyDiscretionaryExpenses;
      output.totalScheduledObligations += scheduledObligationAmount;
      output.totalAssetGrowth += growth;
      output.points.push(createPoint({
        date: formatDateOnly(pointDate),
        monthIndex,
        startingBalance: pointStartingBalance,
        income: monthlyIncome,
        expenses: monthlyEssentialExpenses + monthlyDiscretionaryExpenses,
        essentialExpenses: monthlyEssentialExpenses,
        discretionaryExpenses: monthlyDiscretionaryExpenses,
        scheduledObligations: scheduledObligationAmount,
        growth,
        endingBalance,
        assetLedger: usesAssetLedger ? snapshotLedgerRows(runningLedger) : [],
        status: endingBalance < 0 ? "negative" : "projected",
        sourcePaths: output.sourcePaths
      }));
    }

    output.targetBalance = roundMoney(runningBalance);
    output.totalIncome = roundMoney(output.totalIncome);
    output.totalExpenses = roundMoney(output.totalExpenses);
    output.totalEssentialExpenses = roundMoney(output.totalEssentialExpenses);
    output.totalDiscretionaryExpenses = roundMoney(output.totalDiscretionaryExpenses);
    output.totalScheduledObligations = roundMoney(output.totalScheduledObligations);
    output.totalAssetGrowth = roundMoney(output.totalAssetGrowth);
    output.assetLedgerTarget = usesAssetLedger ? snapshotLedgerRows(runningLedger) : [];
    output.status = output.dataGaps.length ? "partial" : "complete";
    finalizeOutput(output);
    return output;
  }

  function createPoint(options) {
    const netCashFlow = options.income - options.expenses - options.scheduledObligations;
    return {
      date: options.date,
      monthIndex: options.monthIndex,
      startingBalance: roundMoney(options.startingBalance),
      income: roundMoney(options.income),
      expenses: roundMoney(options.expenses),
      essentialExpenses: roundMoney(options.essentialExpenses == null ? options.expenses : options.essentialExpenses),
      discretionaryExpenses: roundMoney(options.discretionaryExpenses || 0),
      scheduledObligations: roundMoney(options.scheduledObligations),
      growth: roundMoney(options.growth),
      netCashFlow: roundMoney(netCashFlow),
      netSurplusDeficit: roundMoney(netCashFlow),
      endingBalance: roundMoney(options.endingBalance),
      assetLedger: Array.isArray(options.assetLedger) ? cloneSerializable(options.assetLedger) : [],
      status: options.status,
      sourcePaths: uniqueStrings(options.sourcePaths)
    };
  }

  function finalizeOutput(output) {
    output.sourcePaths = uniqueStrings(output.sourcePaths);
    output.trace.sourcePaths = uniqueStrings(output.trace.sourcePaths.concat(output.sourcePaths));
    output.warnings = output.warnings.slice();
    output.dataGaps = output.dataGaps.slice();
  }

  lensAnalysis.calculateHouseholdFinancialPosition = calculateHouseholdFinancialPosition;
})(typeof globalThis !== "undefined" ? globalThis : this);
