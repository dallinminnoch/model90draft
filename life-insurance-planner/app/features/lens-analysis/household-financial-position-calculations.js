(function (globalScope) {
  const LensApp = globalScope.LensApp || (globalScope.LensApp = {});
  const lensAnalysis = LensApp.lensAnalysis || (LensApp.lensAnalysis = {});

  // Owner: reusable Lens analysis calculation engines.
  // Purpose: project household financial position from normalized primitive
  // inputs before a target date. Product-specific benefit, runway,
  // recommendation, event-lane, display, DOM, and persistence behavior belongs
  // downstream.

  const CALCULATION_VERSION = 1;

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
      totalScheduledObligations: 0,
      totalAssetGrowth: 0,
      points: [],
      inputs: {
        startingResources: normalizeInputSnapshot(input.startingResources),
        recurringIncome: normalizeInputSnapshot(input.recurringIncome),
        recurringExpenses: normalizeInputSnapshot(input.recurringExpenses),
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
          "targetBalance = startingResources + recurringIncome - recurringExpenses - scheduledObligations + active asset growth"
        ],
        sourcePaths: []
      }
    };
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

    const startingBalance = toOptionalNumber(safeInput.startingResources?.value);
    const startingResourcePaths = normalizeSourcePaths(safeInput.startingResources);
    if (startingBalance == null) {
      output.dataGaps.push(createDataGap(
        "missing-starting-resources",
        "Starting household resources are missing.",
        startingResourcePaths
      ));
    }

    const annualIncome = normalizeAnnualAmount(safeInput.recurringIncome, "annual");
    const recurringIncomePaths = normalizeSourcePaths(safeInput.recurringIncome);
    if (annualIncome == null || isUnsafeIncomeInput(safeInput.recurringIncome)) {
      output.dataGaps.push(createDataGap(
        isUnsafeIncomeInput(safeInput.recurringIncome)
          ? "unsafe-recurring-income"
          : "missing-net-recurring-income",
        "Mature net recurring household income is required; gross or unavailable income was not used.",
        recurringIncomePaths
      ));
    }

    const annualExpenses = normalizeAnnualAmount(safeInput.recurringExpenses, "annual");
    const recurringExpensePaths = normalizeSourcePaths(safeInput.recurringExpenses);
    if (annualExpenses == null) {
      output.dataGaps.push(createDataGap(
        "missing-recurring-expenses",
        "Recurring household expenses are missing.",
        recurringExpensePaths
      ));
    }

    const scheduledObligations = normalizeScheduledObligations(safeInput.scheduledObligations, output);
    const assetGrowth = normalizeAssetGrowthInput(safeInput.assetGrowth);
    if (!assetGrowth.active) {
      output.trace.formula.push("assetGrowth was inactive; totalAssetGrowth remains 0 in current dollars.");
    }

    output.sourcePaths = uniqueStrings(
      startingResourcePaths
        .concat(recurringIncomePaths)
        .concat(recurringExpensePaths)
        .concat(assetGrowth.sourcePaths)
        .concat(scheduledObligations.flatMap(function (row) { return row.sourcePaths; }))
    );
    output.trace.sourcePaths = output.sourcePaths.slice();
    output.startingBalance = startingBalance == null ? null : roundMoney(startingBalance);

    if (output.dataGaps.some(function (gap) {
      return [
        "missing-starting-resources",
        "missing-net-recurring-income",
        "unsafe-recurring-income",
        "missing-recurring-expenses"
      ].includes(gap.code);
    })) {
      output.status = "data-gap";
      finalizeOutput(output);
      return output;
    }

    const monthlyIncome = annualIncome / 12;
    const monthlyExpenses = annualExpenses / 12;
    const monthlyGrowthRate = assetGrowth.active ? assetGrowth.annualRatePercent / 100 / 12 : 0;
    let runningBalance = startingBalance;

    output.points.push(createPoint({
      date: asOfDate.normalizedDate,
      monthIndex: 0,
      startingBalance: runningBalance,
      income: 0,
      expenses: 0,
      scheduledObligations: 0,
      growth: 0,
      endingBalance: runningBalance,
      status: "starting",
      sourcePaths: output.sourcePaths
    }));

    for (let monthIndex = 1; monthIndex <= durationMonths; monthIndex += 1) {
      const pointDate = addMonths(asOfDate.date, monthIndex);
      const pointStartingBalance = runningBalance;
      const growth = pointStartingBalance > 0 ? pointStartingBalance * monthlyGrowthRate : 0;
      const scheduledObligationAmount = getScheduledObligationAmountForMonth(scheduledObligations, monthIndex);
      const netCashFlow = monthlyIncome - monthlyExpenses - scheduledObligationAmount;
      const endingBalance = pointStartingBalance + growth + netCashFlow;
      runningBalance = endingBalance;

      output.totalIncome += monthlyIncome;
      output.totalExpenses += monthlyExpenses;
      output.totalScheduledObligations += scheduledObligationAmount;
      output.totalAssetGrowth += growth;
      output.points.push(createPoint({
        date: formatDateOnly(pointDate),
        monthIndex,
        startingBalance: pointStartingBalance,
        income: monthlyIncome,
        expenses: monthlyExpenses,
        scheduledObligations: scheduledObligationAmount,
        growth,
        endingBalance,
        status: endingBalance < 0 ? "negative" : "projected",
        sourcePaths: output.sourcePaths
      }));
    }

    output.targetBalance = roundMoney(runningBalance);
    output.totalIncome = roundMoney(output.totalIncome);
    output.totalExpenses = roundMoney(output.totalExpenses);
    output.totalScheduledObligations = roundMoney(output.totalScheduledObligations);
    output.totalAssetGrowth = roundMoney(output.totalAssetGrowth);
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
      scheduledObligations: roundMoney(options.scheduledObligations),
      growth: roundMoney(options.growth),
      netCashFlow: roundMoney(netCashFlow),
      endingBalance: roundMoney(options.endingBalance),
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
