(function (global) {
  const LensApp = global.LensApp || (global.LensApp = {});
  const lensAnalysis = LensApp.lensAnalysis || (LensApp.lensAnalysis = {});

  const CALCULATION_METHOD = "post-death-savings-projection-v1";
  const MONTHLY_CADENCE = "monthly";
  const DEFAULT_PROJECTION_HORIZON_MONTHS = 480;
  const EXCLUDED_STATUSES = new Set([
    "excluded",
    "inactive",
    "missing",
    "not-available",
    "not_available",
    "not-applicable",
    "omitted",
    "skipped"
  ]);

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

    const normalized = String(value).replace(/[$,%\s,]/g, "");
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

  function toWholeMonthCount(value) {
    const numericValue = toOptionalNumber(value);
    if (numericValue == null) {
      return null;
    }
    return Math.max(0, Math.floor(numericValue));
  }

  function roundMoney(value) {
    return Number.isFinite(Number(value)) ? Number(Number(value).toFixed(2)) : 0;
  }

  function roundRate(value) {
    return Number.isFinite(Number(value)) ? Number(Number(value).toFixed(10)) : 0;
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

  function uniqueStrings(values) {
    const output = [];
    (Array.isArray(values) ? values : []).forEach(function (value) {
      const normalized = normalizeString(value);
      if (normalized && !output.includes(normalized)) {
        output.push(normalized);
      }
    });
    return output;
  }

  function appendUnique(target, values) {
    uniqueStrings(values).forEach(function (value) {
      if (!target.includes(value)) {
        target.push(value);
      }
    });
  }

  function makeIssue(code, message, sourcePaths, details) {
    const issue = {
      code,
      message
    };
    const paths = uniqueStrings(sourcePaths);
    if (paths.length) {
      issue.sourcePaths = paths;
    }
    if (isPlainObject(details)) {
      issue.details = clonePlainValue(details);
    }
    return issue;
  }

  function readSourcePaths(row, fallback) {
    if (!isPlainObject(row)) {
      return uniqueStrings(fallback ? [fallback] : []);
    }
    const explicit = []
      .concat(Array.isArray(row.sourcePaths) ? row.sourcePaths : [])
      .concat(row.sourcePath ? [row.sourcePath] : []);
    const paths = uniqueStrings(explicit);
    return paths.length ? paths : uniqueStrings(fallback ? [fallback] : []);
  }

  function isExcludedStatus(status) {
    return EXCLUDED_STATUSES.has(normalizeStatus(status));
  }

  function normalizeOptions(input, warnings) {
    const safeInput = isPlainObject(input) ? input : {};
    const projectionHorizonMonths = toWholeMonthCount(safeInput.projectionHorizonMonths);
    if (projectionHorizonMonths == null || projectionHorizonMonths <= 0) {
      warnings.push(makeIssue(
        "projection-horizon-defaulted",
        "Projection horizon was missing or invalid and defaulted to the post-death savings horizon.",
        ["projectionHorizonMonths"],
        { defaultProjectionHorizonMonths: DEFAULT_PROJECTION_HORIZON_MONTHS }
      ));
    }
    return {
      cadence: MONTHLY_CADENCE,
      projectionHorizonMonths: projectionHorizonMonths == null || projectionHorizonMonths <= 0
        ? DEFAULT_PROJECTION_HORIZON_MONTHS
        : projectionHorizonMonths
    };
  }

  function normalizeContinuation(input) {
    const continuation = isPlainObject(input?.continuation) ? input.continuation : {};
    const requested = continuation.requested === true;
    const eligible = continuation.eligible === true;
    return {
      requested,
      eligible,
      effective: requested && eligible && continuation.effective === true,
      reason: normalizeString(continuation.reason) || (requested ? "missingCashFlowInputs" : "controlOff"),
      plannedMonthlyAmount: roundMoney(toOptionalNumber(continuation.plannedMonthlyAmount) || 0),
      minimumMonthlySurvivorCashFlow: toOptionalNumber(continuation.minimumMonthlySurvivorCashFlow),
      firstInsufficientMonthIndex: toWholeMonthCount(continuation.firstInsufficientMonthIndex),
      policy: normalizeString(continuation.policy) || "full-planned-monthly-continuation-only-v1"
    };
  }

  function normalizeSavingAllocations(allocations, warnings, dataGaps, trace) {
    return (Array.isArray(allocations) ? allocations : []).reduce(function (items, allocation, index) {
      if (!isPlainObject(allocation) || isExcludedStatus(allocation.status)) {
        return items;
      }

      const sourcePaths = readSourcePaths(allocation, `savingAllocations.${index}`);
      appendUnique(trace.sourcePaths, sourcePaths);
      const monthlyAmount = toOptionalNumber(
        allocation.monthlyAmount
        ?? allocation.monthlyContributionAmount
        ?? allocation.amount
      );
      const targetAssetCategoryKey = normalizeString(
        allocation.targetAssetCategoryKey
        || allocation.targetCategoryKey
        || allocation.assetCategoryKey
        || allocation.categoryKey
      );
      if (monthlyAmount == null || monthlyAmount <= 0) {
        dataGaps.push(makeIssue(
          "missing-post-death-saving-allocation-amount",
          "Post-death saving allocation amount was missing or invalid.",
          sourcePaths
        ));
        return items;
      }
      if (!targetAssetCategoryKey) {
        dataGaps.push(makeIssue(
          "missing-post-death-saving-allocation-target",
          "Post-death saving allocation target asset category was missing.",
          sourcePaths
        ));
        return items;
      }

      const annualGrowthRate = toOptionalRate(
        allocation.annualGrowthRate
        ?? allocation.assumedAnnualGrowthRatePercent
        ?? allocation.annualGrowthRatePercent
      );
      if (annualGrowthRate == null) {
        warnings.push(makeIssue(
          "post-death-saving-growth-defaulted",
          "Growth context was missing for a post-death saving target; a conservative zero-growth projection was used.",
          sourcePaths,
          { targetAssetCategoryKey }
        ));
      }
      const monthlyGrowthRate = annualGrowthRate == null
        ? 0
        : roundRate(Math.pow(1 + annualGrowthRate, 1 / 12) - 1);
      const normalizedAllocation = {
        id: normalizeString(allocation.id || allocation.typeKey) || `saving-allocation-${index + 1}`,
        label: normalizeString(allocation.label || allocation.targetAssetCategoryLabel) || targetAssetCategoryKey,
        monthlyAmount: roundMoney(monthlyAmount),
        targetAssetCategoryKey,
        targetAssetCategoryLabel: normalizeString(allocation.targetAssetCategoryLabel) || targetAssetCategoryKey,
        annualGrowthRate,
        monthlyGrowthRate,
        growthStatus: annualGrowthRate == null ? "conservative-zero-growth" : "method-active",
        sourcePaths
      };
      trace.normalizedSavingAllocations.push({
        id: normalizedAllocation.id,
        targetAssetCategoryKey,
        monthlyAmount: normalizedAllocation.monthlyAmount,
        annualGrowthRate,
        monthlyGrowthRate,
        sourcePaths
      });
      items.push(normalizedAllocation);
      return items;
    }, []);
  }

  function normalizeStartingBalances(rows, savingAllocations, trace) {
    const balances = new Map();
    const labels = new Map();

    (Array.isArray(rows) ? rows : []).forEach(function (row, index) {
      if (!isPlainObject(row)) {
        return;
      }
      const categoryKey = normalizeString(row.categoryKey || row.targetAssetCategoryKey || row.treatmentCategoryKey);
      if (!categoryKey) {
        return;
      }
      const sourcePaths = readSourcePaths(row, `startingCategoryBalances.${index}`);
      appendUnique(trace.sourcePaths, sourcePaths);
      const balance = toOptionalNumber(
        row.endingValue
        ?? row.treatedValue
        ?? row.startingValue
        ?? row.currentValue
        ?? row.value
      );
      if (balance == null) {
        return;
      }
      balances.set(categoryKey, roundMoney((balances.get(categoryKey) || 0) + Math.max(0, balance)));
      labels.set(categoryKey, normalizeString(row.label || row.targetAssetCategoryLabel) || categoryKey);
    });

    savingAllocations.forEach(function (allocation) {
      if (!balances.has(allocation.targetAssetCategoryKey)) {
        balances.set(allocation.targetAssetCategoryKey, 0);
        labels.set(allocation.targetAssetCategoryKey, allocation.targetAssetCategoryLabel || allocation.targetAssetCategoryKey);
      }
    });

    return {
      balances,
      labels
    };
  }

  function getMonthlySurplus(point) {
    const explicit = toOptionalNumber(point?.cashFlowBeforeSavings);
    if (explicit != null) {
      return explicit;
    }
    const survivorIncome = toOptionalNumber(point?.survivorIncome) || 0;
    const survivorNeeds = toOptionalNumber(point?.survivorNeeds) || 0;
    const scheduledObligations = toOptionalNumber(point?.scheduledObligations) || 0;
    return roundMoney(survivorIncome - survivorNeeds - scheduledObligations);
  }

  function createOutput(input, options, continuation, warnings, dataGaps, trace) {
    const startDate = normalizeDateOnly(input?.startDate);
    return {
      calculationMethod: CALCULATION_METHOD,
      status: dataGaps.length ? "partial" : "complete",
      cadence: options.cadence,
      startDate: startDate?.normalizedDate || normalizeString(input?.startDate),
      projectionHorizonMonths: options.projectionHorizonMonths,
      continuation: clonePlainValue(continuation),
      points: [],
      summary: {
        totalContinuedSavingContributions: 0,
        totalProjectedPostDeathSavingsValue: 0,
        totalGenericSurplusBeforeSavings: 0,
        totalGenericSurplusAfterSavings: 0,
        endingProjectedCategoryValue: 0,
        endingContributionGrowthValue: 0,
        targetCategoryCount: 0
      },
      warnings,
      dataGaps,
      trace
    };
  }

  function calculatePostDeathSavingsProjection(input) {
    const safeInput = isPlainObject(input) ? input : {};
    const warnings = [];
    const dataGaps = [];
    const options = normalizeOptions(safeInput, warnings);
    const continuation = normalizeContinuation(safeInput);
    const trace = {
      calculationMethod: CALCULATION_METHOD,
      sourcePaths: [],
      normalizedSavingAllocations: [],
      projectionPolicy: "continued post-death savings are funded only from positive survivor monthly cash flow, then projected by target asset category using available growth context.",
      fundingExclusions: [
        "insurance-proceeds",
        "starting-resources",
        "asset-drawdown"
      ]
    };
    const output = createOutput(safeInput, options, continuation, warnings, dataGaps, trace);
    const startDate = normalizeDateOnly(safeInput.startDate);
    if (!startDate) {
      dataGaps.push(makeIssue("missing-start-date", "A valid startDate is required.", ["startDate"]));
      output.status = "partial";
      output.dataGaps = dataGaps;
      return output;
    }

    const savingAllocations = normalizeSavingAllocations(safeInput.savingAllocations, warnings, dataGaps, trace);
    const startingBalances = normalizeStartingBalances(safeInput.startingCategoryBalances, savingAllocations, trace);
    const categoryBalances = new Map(startingBalances.balances);
    const contributionBalances = new Map();
    let totalContinuedSavingContributions = 0;
    let totalGenericSurplusBeforeSavings = 0;
    let totalGenericSurplusAfterSavings = 0;

    for (let monthIndex = 1; monthIndex <= options.projectionHorizonMonths; monthIndex += 1) {
      const point = Array.isArray(safeInput.cashFlowPoints) ? safeInput.cashFlowPoints[monthIndex - 1] : null;
      const pointDate = point?.date || formatDateOnly(addMonths(startDate.date, monthIndex));
      let genericSurplusBeforeSavings = roundMoney(Math.max(0, getMonthlySurplus(point)));
      let remainingSurplus = genericSurplusBeforeSavings;
      const contributions = [];

      savingAllocations.forEach(function (allocation) {
        const existingBalance = categoryBalances.get(allocation.targetAssetCategoryKey) || 0;
        const existingContributionBalance = contributionBalances.get(allocation.targetAssetCategoryKey) || 0;
        const grownBalance = roundMoney(existingBalance * (1 + allocation.monthlyGrowthRate));
        const grownContributionBalance = roundMoney(existingContributionBalance * (1 + allocation.monthlyGrowthRate));
        categoryBalances.set(allocation.targetAssetCategoryKey, grownBalance);
        contributionBalances.set(allocation.targetAssetCategoryKey, grownContributionBalance);
      });

      if (continuation.effective) {
        savingAllocations.forEach(function (allocation) {
          const contributedAmount = remainingSurplus >= allocation.monthlyAmount
            ? allocation.monthlyAmount
            : 0;
          if (contributedAmount <= 0 && allocation.monthlyAmount > 0) {
            dataGaps.push(makeIssue(
              "post-death-saving-surplus-insufficient",
              "A post-death point could not fund the full planned saving allocation from survivor cash flow.",
              allocation.sourcePaths,
              { monthIndex, targetAssetCategoryKey: allocation.targetAssetCategoryKey }
            ));
            return;
          }
          remainingSurplus = roundMoney(remainingSurplus - contributedAmount);
          totalContinuedSavingContributions = roundMoney(totalContinuedSavingContributions + contributedAmount);
          const nextCategoryBalance = roundMoney((categoryBalances.get(allocation.targetAssetCategoryKey) || 0) + contributedAmount);
          const nextContributionBalance = roundMoney((contributionBalances.get(allocation.targetAssetCategoryKey) || 0) + contributedAmount);
          categoryBalances.set(allocation.targetAssetCategoryKey, nextCategoryBalance);
          contributionBalances.set(allocation.targetAssetCategoryKey, nextContributionBalance);
          contributions.push({
            id: allocation.id,
            label: allocation.label,
            targetAssetCategoryKey: allocation.targetAssetCategoryKey,
            targetAssetCategoryLabel: allocation.targetAssetCategoryLabel,
            contributedAmount,
            monthlyGrowthRate: allocation.monthlyGrowthRate,
            endingCategoryValue: nextCategoryBalance,
            endingContributionValue: nextContributionBalance,
            sourcePaths: allocation.sourcePaths
          });
        });
      }

      const genericSurplusAfterSavings = continuation.effective
        ? roundMoney(remainingSurplus)
        : genericSurplusBeforeSavings;
      totalGenericSurplusBeforeSavings = roundMoney(totalGenericSurplusBeforeSavings + genericSurplusBeforeSavings);
      totalGenericSurplusAfterSavings = roundMoney(totalGenericSurplusAfterSavings + genericSurplusAfterSavings);
      output.points.push({
        monthIndex,
        date: pointDate,
        genericSurplusBeforeSavings,
        genericSurplusAfterSavings,
        totalContinuedSavingContributions: roundMoney(contributions.reduce(function (total, contribution) {
          return total + contribution.contributedAmount;
        }, 0)),
        contributions,
        categoryBalances: Array.from(categoryBalances.entries()).map(function (entry) {
          return {
            targetAssetCategoryKey: entry[0],
            targetAssetCategoryLabel: startingBalances.labels.get(entry[0]) || entry[0],
            endingValue: roundMoney(entry[1]),
            contributionValue: roundMoney(contributionBalances.get(entry[0]) || 0)
          };
        }),
        trace: {
          continuationEffective: continuation.effective,
          sourceCashFlowPointMonthIndex: point?.monthIndex ?? monthIndex,
          surplusFormula: "survivorIncome - survivorNeeds - scheduledObligations",
          doubleCountingGuard: "genericSurplusAfterSavings + continuedSavingContributions equals genericSurplusBeforeSavings before category growth."
        }
      });
    }

    const endingCategoryValue = roundMoney(Array.from(categoryBalances.values()).reduce(function (total, value) {
      return total + value;
    }, 0));
    const endingContributionGrowthValue = roundMoney(Array.from(contributionBalances.values()).reduce(function (total, value) {
      return total + value;
    }, 0));

    output.summary = {
      totalContinuedSavingContributions,
      totalProjectedPostDeathSavingsValue: endingContributionGrowthValue,
      totalGenericSurplusBeforeSavings,
      totalGenericSurplusAfterSavings,
      endingProjectedCategoryValue: endingCategoryValue,
      endingContributionGrowthValue,
      targetCategoryCount: savingAllocations.length
    };
    output.status = dataGaps.length ? "partial" : "complete";
    output.warnings = warnings;
    output.dataGaps = dataGaps;
    output.trace = {
      ...trace,
      sourcePaths: uniqueStrings(trace.sourcePaths)
    };

    return output;
  }

  lensAnalysis.calculatePostDeathSavingsProjection = calculatePostDeathSavingsProjection;
})(typeof globalThis !== "undefined" ? globalThis : this);
