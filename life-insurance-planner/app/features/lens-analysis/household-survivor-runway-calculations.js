(function (global) {
  const LensApp = global.LensApp || (global.LensApp = {});
  const lensAnalysis = LensApp.lensAnalysis || (LensApp.lensAnalysis = {});

  const CALCULATION_METHOD = "household-survivor-runway-v1";
  const MONTHLY_CADENCE = "monthly";
  const DEFAULT_PROJECTION_HORIZON_MONTHS = 480;
  const DEFAULT_OPTIONS = Object.freeze({
    cadence: MONTHLY_CADENCE,
    preserveSignedResources: true
  });
  const EXCLUDED_STATUSES = new Set([
    "excluded",
    "inactive",
    "missing",
    "not-available",
    "not_applicable",
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

  function isSameYearMonth(leftDate, rightDate) {
    return leftDate.getFullYear() === rightDate.getFullYear()
      && leftDate.getMonth() === rightDate.getMonth();
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

  function getSourcePaths(row, fallback) {
    const explicitSourcePaths = uniqueStrings(
      (Array.isArray(row?.sourcePaths) ? row.sourcePaths : [])
        .concat(row?.sourcePath ? [row.sourcePath] : [])
    );
    return explicitSourcePaths.length ? explicitSourcePaths : uniqueStrings(fallback ? [fallback] : []);
  }

  function isExcludedStatus(status) {
    return EXCLUDED_STATUSES.has(normalizeStatus(status));
  }

  function isGrossIncomeStream(stream) {
    const status = normalizeStatus(stream?.status);
    const incomeType = normalizeStatus(stream?.incomeType);
    return incomeType === "gross"
      || stream?.isGrossIncome === true
      || status.includes("gross");
  }

  function isNetIncomeStream(stream) {
    const status = normalizeStatus(stream?.status);
    const incomeType = normalizeStatus(stream?.incomeType);
    return incomeType === "net" || status.includes("net");
  }

  function containsNormalizedTerm(row, term) {
    const normalizedTerm = normalizeStatus(term);
    return [
      row?.id,
      row?.label,
      row?.category,
      row?.status
    ].some(function (value) {
      return normalizeStatus(value).includes(normalizedTerm);
    });
  }

  function normalizeOptions(input, warnings) {
    const safeInput = isPlainObject(input) ? input : {};
    const safeOptions = isPlainObject(safeInput.options) ? safeInput.options : {};
    const requestedCadence = normalizeString(safeOptions.cadence || safeInput.cadence || DEFAULT_OPTIONS.cadence);
    const projectionHorizonMonths = toWholeMonthCount(safeInput.projectionHorizonMonths);
    let resolvedProjectionHorizonMonths = projectionHorizonMonths;

    if (projectionHorizonMonths == null || projectionHorizonMonths <= 0) {
      resolvedProjectionHorizonMonths = DEFAULT_PROJECTION_HORIZON_MONTHS;
      warnings.push(makeIssue(
        "projection-horizon-defaulted",
        "Projection horizon was missing or invalid and defaulted to the v1 horizon.",
        ["projectionHorizonMonths"],
        { defaultProjectionHorizonMonths: DEFAULT_PROJECTION_HORIZON_MONTHS }
      ));
    }

    return {
      cadence: requestedCadence || MONTHLY_CADENCE,
      preserveSignedResources: safeOptions.preserveSignedResources === false
        ? false
        : DEFAULT_OPTIONS.preserveSignedResources,
      projectionHorizonMonths: resolvedProjectionHorizonMonths
    };
  }

  function normalizeStartingResources(startingResources, dataGaps, trace) {
    const amount = toOptionalNumber(
      isPlainObject(startingResources) ? startingResources.value : startingResources
    );
    const sourcePaths = getSourcePaths(startingResources, "startingResources.value");
    appendUnique(trace.sourcePaths, sourcePaths);

    if (amount == null) {
      dataGaps.push(makeIssue(
        "missing-starting-resources-from-layer-2",
        "Starting resources from the event availability layer are required.",
        sourcePaths
      ));
      return {
        value: null,
        status: "missing",
        sourcePaths,
        trace: isPlainObject(startingResources?.trace) ? clonePlainValue(startingResources.trace) : {}
      };
    }

    return {
      value: roundMoney(amount),
      status: normalizeString(startingResources?.status) || "available",
      sourcePaths,
      trace: isPlainObject(startingResources?.trace) ? clonePlainValue(startingResources.trace) : {}
    };
  }

  function normalizeIncomeStreams(streams, dataGaps, trace) {
    const safeStreams = Array.isArray(streams) ? streams : [];
    const normalizedStreams = [];

    if (!safeStreams.length) {
      dataGaps.push(makeIssue(
        "missing-mature-net-survivor-income",
        "No mature net survivor income stream was supplied.",
        ["survivorIncomeStreams"]
      ));
    }

    safeStreams.forEach(function (stream, index) {
      const sourcePaths = getSourcePaths(stream, `survivorIncomeStreams.${index}`);
      appendUnique(trace.sourcePaths, sourcePaths);

      if (isExcludedStatus(stream?.status)) {
        trace.streamNormalization.incomeStreams.push({
          id: normalizeString(stream?.id) || `survivor-income-${index + 1}`,
          status: normalizeString(stream?.status),
          normalized: false,
          reason: "excluded-status",
          sourcePaths
        });
        return;
      }

      if (isGrossIncomeStream(stream)) {
        dataGaps.push(makeIssue(
          "unsafe-gross-income-excluded",
          "Gross survivor income was supplied without a mature net-income value and was excluded.",
          sourcePaths
        ));
        trace.streamNormalization.incomeStreams.push({
          id: normalizeString(stream?.id) || `survivor-income-${index + 1}`,
          status: normalizeString(stream?.status),
          normalized: false,
          reason: "gross-income-excluded",
          sourcePaths
        });
        return;
      }

      if (!isNetIncomeStream(stream)) {
        dataGaps.push(makeIssue(
          "missing-mature-net-survivor-income",
          "Survivor income stream was excluded because it was not identified as mature net income.",
          sourcePaths
        ));
        trace.streamNormalization.incomeStreams.push({
          id: normalizeString(stream?.id) || `survivor-income-${index + 1}`,
          status: normalizeString(stream?.status),
          normalized: false,
          reason: "not-net-income",
          sourcePaths
        });
        return;
      }

      const amount = toOptionalNumber(stream?.amount);
      if (amount == null) {
        dataGaps.push(makeIssue(
          "missing-survivor-income-amount",
          "Survivor income stream amount was missing or invalid.",
          sourcePaths
        ));
        return;
      }

      const frequency = normalizeFrequency(stream?.frequency);
      const monthlyAmount = amountForFrequency(amount, frequency);
      const normalizedStream = {
        id: normalizeString(stream?.id) || `survivor-income-${index + 1}`,
        label: normalizeString(stream?.label) || "Survivor income",
        amount: roundMoney(amount),
        monthlyAmount: roundMoney(monthlyAmount),
        frequency,
        status: normalizeString(stream?.status),
        startDelayMonths: toWholeMonthCount(stream?.startDelayMonths) || 0,
        startDate: normalizeDateOnly(stream?.startDate),
        endDate: normalizeDateOnly(stream?.endDate),
        termMonths: toWholeMonthCount(stream?.termMonths),
        incomeType: "net",
        sourcePaths,
        trace: isPlainObject(stream?.trace) ? clonePlainValue(stream.trace) : {}
      };
      normalizedStreams.push(normalizedStream);
      trace.streamNormalization.incomeStreams.push({
        id: normalizedStream.id,
        monthlyAmount: normalizedStream.monthlyAmount,
        frequency: normalizedStream.frequency,
        startDelayMonths: normalizedStream.startDelayMonths,
        termMonths: normalizedStream.termMonths,
        normalized: true,
        sourcePaths
      });
    });

    if (safeStreams.length && !normalizedStreams.length) {
      dataGaps.push(makeIssue(
        "missing-mature-net-survivor-income",
        "No supplied survivor income stream was usable as mature net income.",
        ["survivorIncomeStreams"]
      ));
    }

    return normalizedStreams;
  }

  function normalizeNeedStreams(streams, dataGaps, warnings, trace) {
    const safeStreams = Array.isArray(streams) ? streams : [];
    const normalizedStreams = [];
    let hasEssentialNeed = false;

    if (!safeStreams.length) {
      dataGaps.push(makeIssue(
        "missing-essential-needs",
        "No survivor need streams were supplied.",
        ["survivorNeedStreams"]
      ));
    }

    safeStreams.forEach(function (stream, index) {
      const sourcePaths = getSourcePaths(stream, `survivorNeedStreams.${index}`);
      appendUnique(trace.sourcePaths, sourcePaths);

      if (isExcludedStatus(stream?.status)) {
        return;
      }

      const amount = toOptionalNumber(stream?.amount);
      if (amount == null) {
        dataGaps.push(makeIssue(
          "missing-survivor-need-amount",
          "Survivor need stream amount was missing or invalid.",
          sourcePaths
        ));
        return;
      }

      const needType = normalizeStatus(stream?.needType || stream?.category || "essential");
      const normalizedNeedType = ["essential", "discretionary", "healthcare", "education"].includes(needType)
        ? needType
        : "essential";
      if (normalizedNeedType === "essential") {
        hasEssentialNeed = true;
      }
      if (normalizedNeedType === "healthcare" || normalizedNeedType === "education") {
        warnings.push(makeIssue(
          `${normalizedNeedType}-stream-explicit-v1`,
          `${normalizedNeedType} need stream was included only because it was explicitly supplied.`,
          sourcePaths
        ));
      }

      const frequency = normalizeFrequency(stream?.frequency);
      const monthlyAmount = amountForFrequency(amount, frequency);
      const normalizedStream = {
        id: normalizeString(stream?.id) || `survivor-need-${index + 1}`,
        label: normalizeString(stream?.label) || "Survivor need",
        amount: roundMoney(amount),
        monthlyAmount: roundMoney(monthlyAmount),
        frequency,
        needType: normalizedNeedType,
        status: normalizeString(stream?.status),
        startDate: normalizeDateOnly(stream?.startDate),
        endDate: normalizeDateOnly(stream?.endDate),
        termMonths: toWholeMonthCount(stream?.termMonths),
        sourcePaths,
        trace: isPlainObject(stream?.trace) ? clonePlainValue(stream.trace) : {}
      };
      normalizedStreams.push(normalizedStream);
      trace.streamNormalization.needStreams.push({
        id: normalizedStream.id,
        monthlyAmount: normalizedStream.monthlyAmount,
        frequency: normalizedStream.frequency,
        needType: normalizedStream.needType,
        termMonths: normalizedStream.termMonths,
        normalized: true,
        sourcePaths
      });
    });

    if (safeStreams.length && !hasEssentialNeed) {
      dataGaps.push(makeIssue(
        "missing-essential-needs",
        "No essential survivor need stream was supplied.",
        ["survivorNeedStreams.needType"]
      ));
    }

    return normalizedStreams;
  }

  function normalizeScheduledObligations(obligations, dataGaps, warnings, trace) {
    const safeObligations = Array.isArray(obligations) ? obligations : [];
    const normalizedObligations = [];

    safeObligations.forEach(function (obligation, index) {
      const sourcePaths = getSourcePaths(obligation, `scheduledObligations.${index}`);
      appendUnique(trace.sourcePaths, sourcePaths);
      const id = normalizeString(obligation?.id) || `scheduled-obligation-${index + 1}`;
      const category = normalizeString(obligation?.category);

      if (isExcludedStatus(obligation?.status)) {
        return;
      }

      if (obligation?.alreadyIncludedInNeeds === true) {
        const skipped = {
          id,
          category,
          reason: "already-included-in-needs",
          sourcePaths
        };
        trace.skippedScheduledObligations.push(skipped);
        warnings.push(makeIssue(
          "scheduled-obligation-already-included-in-needs",
          "Scheduled obligation was skipped because it was already represented in survivor needs.",
          sourcePaths,
          { id, category }
        ));
        return;
      }

      const isMortgagePayoff = containsNormalizedTerm(obligation, "mortgage")
        && containsNormalizedTerm(obligation, "payoff");
      if (isMortgagePayoff) {
        trace.skippedScheduledObligations.push({
          id,
          category,
          reason: "mortgage-payoff-belongs-to-prior-layer",
          sourcePaths
        });
        dataGaps.push(makeIssue(
          "mortgage-payoff-not-layer-3",
          "Mortgage payoff was supplied to the survivor runway layer and was excluded.",
          sourcePaths,
          { id, category }
        ));
        return;
      }

      const isMortgageSupport = containsNormalizedTerm(obligation, "mortgage")
        && (containsNormalizedTerm(obligation, "support") || containsNormalizedTerm(obligation, "continue"));
      const termMonths = toWholeMonthCount(obligation?.termMonths);
      const endDate = normalizeDateOnly(obligation?.endDate);
      if (isMortgageSupport && termMonths == null && !endDate) {
        dataGaps.push(makeIssue(
          "mortgage-support-schedule-missing",
          "Mortgage support was supplied without a term or end date and was excluded.",
          sourcePaths,
          { id, category }
        ));
        trace.skippedScheduledObligations.push({
          id,
          category,
          reason: "missing-mortgage-support-schedule",
          sourcePaths
        });
        return;
      }

      const amount = toOptionalNumber(obligation?.amount);
      if (amount == null) {
        dataGaps.push(makeIssue(
          "missing-scheduled-obligation-amount",
          "Scheduled obligation amount was missing or invalid.",
          sourcePaths
        ));
        return;
      }

      const frequency = normalizeFrequency(obligation?.frequency);
      const monthlyAmount = amountForFrequency(amount, frequency);
      const normalizedObligation = {
        id,
        label: normalizeString(obligation?.label) || "Scheduled obligation",
        amount: roundMoney(amount),
        monthlyAmount: roundMoney(monthlyAmount),
        frequency,
        startDate: normalizeDateOnly(obligation?.startDate),
        startDelayMonths: toWholeMonthCount(obligation?.startDelayMonths) || 0,
        endDate,
        termMonths,
        category,
        status: normalizeString(obligation?.status),
        sourcePaths,
        trace: isPlainObject(obligation?.trace) ? clonePlainValue(obligation.trace) : {}
      };
      normalizedObligations.push(normalizedObligation);
      trace.streamNormalization.scheduledObligations.push({
        id: normalizedObligation.id,
        monthlyAmount: normalizedObligation.monthlyAmount,
        frequency: normalizedObligation.frequency,
        category: normalizedObligation.category,
        startDelayMonths: normalizedObligation.startDelayMonths,
        termMonths: normalizedObligation.termMonths,
        normalized: true,
        sourcePaths
      });
    });

    return normalizedObligations;
  }

  function isStreamActive(stream, monthIndex, periodStart) {
    const delayMonths = stream.startDelayMonths || 0;
    if (monthIndex <= delayMonths) {
      return false;
    }

    const activeMonthNumber = monthIndex - delayMonths;
    if (stream.termMonths != null && activeMonthNumber > stream.termMonths) {
      return false;
    }

    if (stream.startDate?.date && periodStart < stream.startDate.date) {
      return false;
    }

    if (stream.endDate?.date && periodStart > stream.endDate.date) {
      return false;
    }

    if (stream.frequency === "oneTime") {
      return stream.startDate?.date ? isSameYearMonth(stream.startDate.date, periodStart) : activeMonthNumber === 1;
    }

    return true;
  }

  function sumMonthlyAmounts(streams, monthIndex, periodStart, trace, kind) {
    return roundMoney(streams.reduce(function (total, stream) {
      const active = isStreamActive(stream, monthIndex, periodStart);
      if (kind === "scheduledObligations") {
        trace.scheduledObligationWindows.push({
          id: stream.id,
          monthIndex,
          active,
          amount: active ? stream.monthlyAmount : 0,
          sourcePaths: stream.sourcePaths
        });
      }
      return total + (active ? (toOptionalNumber(stream.monthlyAmount) || 0) : 0);
    }, 0));
  }

  function createBaseTrace(options) {
    return {
      calculationMethod: CALCULATION_METHOD,
      cadence: options.cadence,
      timingPolicy: "monthly-end-of-period-cash-flow",
      sourcePaths: [],
      streamNormalization: {
        incomeStreams: [],
        needStreams: [],
        scheduledObligations: []
      },
      scheduledObligationWindows: [],
      skippedScheduledObligations: [],
      depletionFormula: "first month where endingResources <= 0",
      scopeStatement: "Layer 3 applies only survivor income, survivor needs, and scheduled obligations; prior-layer resource conversion is not recalculated here.",
      explicitStreamPolicy: "Education and healthcare streams are used only when explicitly supplied."
    };
  }

  function createBaseOutput(input, options, startDate, startingResources, warnings, dataGaps, trace) {
    return {
      status: "not-available",
      startDate: startDate?.normalizedDate || normalizeString(input?.startDate),
      projectionHorizonMonths: options.projectionHorizonMonths,
      startingResources,
      depletion: {
        depleted: false,
        depletionDate: null,
        depletionMonthIndex: null,
        monthsCovered: null,
        precision: "monthly"
      },
      summary: {
        totalSurvivorIncome: 0,
        totalEssentialNeeds: 0,
        totalDiscretionaryNeeds: 0,
        totalSurvivorNeeds: 0,
        totalScheduledObligations: 0,
        totalNetUse: 0,
        endingResources: startingResources.value == null ? null : startingResources.value,
        accumulatedUnmetNeed: startingResources.value == null
          ? null
          : Math.max(0, roundMoney(-startingResources.value))
      },
      points: [],
      warnings,
      dataGaps,
      trace
    };
  }

  function calculateHouseholdSurvivorRunway(input) {
    const safeInput = isPlainObject(input) ? input : {};
    const warnings = [];
    const dataGaps = [];
    const options = normalizeOptions(safeInput, warnings);
    const trace = createBaseTrace(options);
    const startDate = normalizeDateOnly(safeInput.startDate);

    if (options.cadence !== MONTHLY_CADENCE) {
      dataGaps.push(makeIssue(
        "unsupported-cadence",
        "Only monthly cadence is supported in survivor runway v1.",
        ["options.cadence", "cadence"]
      ));
    }

    if (!startDate) {
      dataGaps.push(makeIssue("missing-start-date", "A valid startDate is required.", ["startDate"]));
    }

    const startingResources = normalizeStartingResources(safeInput.startingResources, dataGaps, trace);
    const output = createBaseOutput(safeInput, options, startDate, startingResources, warnings, dataGaps, trace);

    if (!startDate || startingResources.value == null || options.cadence !== MONTHLY_CADENCE) {
      output.status = "partial";
      output.dataGaps = dataGaps;
      output.warnings = warnings;
      output.trace.sourcePaths = uniqueStrings(trace.sourcePaths);
      return output;
    }

    const incomeStreams = normalizeIncomeStreams(safeInput.survivorIncomeStreams, dataGaps, trace);
    const needStreams = normalizeNeedStreams(safeInput.survivorNeedStreams, dataGaps, warnings, trace);
    const obligations = normalizeScheduledObligations(safeInput.scheduledObligations, dataGaps, warnings, trace);
    const points = [];
    let endingResources = startingResources.value;
    let depletion = {
      depleted: endingResources <= 0,
      depletionDate: endingResources <= 0 ? startDate.normalizedDate : null,
      depletionMonthIndex: endingResources <= 0 ? 0 : null,
      monthsCovered: endingResources <= 0 ? 0 : null,
      precision: "monthly"
    };
    let totalSurvivorIncome = 0;
    let totalEssentialNeeds = 0;
    let totalDiscretionaryNeeds = 0;
    let totalSurvivorNeeds = 0;
    let totalScheduledObligations = 0;
    let totalNetUse = 0;

    for (let monthIndex = 1; monthIndex <= options.projectionHorizonMonths; monthIndex += 1) {
      const periodStart = addMonths(startDate.date, monthIndex - 1);
      const pointDate = addMonths(startDate.date, monthIndex);
      const pointStartingResources = endingResources;
      const survivorIncome = sumMonthlyAmounts(incomeStreams, monthIndex, periodStart, trace, "income");
      const activeNeedStreams = needStreams.filter(function (stream) {
        return isStreamActive(stream, monthIndex, periodStart);
      });
      const essentialNeeds = roundMoney(activeNeedStreams.reduce(function (total, stream) {
        return total + (stream.needType === "essential" ? stream.monthlyAmount : 0);
      }, 0));
      const discretionaryNeeds = roundMoney(activeNeedStreams.reduce(function (total, stream) {
        return total + (stream.needType === "discretionary" ? stream.monthlyAmount : 0);
      }, 0));
      const survivorNeeds = roundMoney(activeNeedStreams.reduce(function (total, stream) {
        return total + (toOptionalNumber(stream.monthlyAmount) || 0);
      }, 0));
      const scheduledObligations = sumMonthlyAmounts(obligations, monthIndex, periodStart, trace, "scheduledObligations");
      const netUse = roundMoney(survivorNeeds + scheduledObligations - survivorIncome);

      endingResources = roundMoney(pointStartingResources + survivorIncome - survivorNeeds - scheduledObligations);
      if (!options.preserveSignedResources) {
        endingResources = Math.max(0, endingResources);
      }

      const accumulatedUnmetNeed = roundMoney(Math.max(0, -endingResources));
      const availableResources = roundMoney(Math.max(0, endingResources));
      let status = "available";
      if (endingResources <= 0) {
        status = "depleted";
      }

      if (!depletion.depleted && endingResources <= 0) {
        depletion = {
          depleted: true,
          depletionDate: formatDateOnly(pointDate),
          depletionMonthIndex: monthIndex,
          monthsCovered: monthIndex,
          precision: "monthly"
        };
        warnings.push(makeIssue(
          "negative-resources-accumulated-as-unmet-need",
          "Resources fell to or below zero; signed resources and accumulated unmet need were preserved.",
          ["points.endingResources"]
        ));
      }

      totalSurvivorIncome = roundMoney(totalSurvivorIncome + survivorIncome);
      totalEssentialNeeds = roundMoney(totalEssentialNeeds + essentialNeeds);
      totalDiscretionaryNeeds = roundMoney(totalDiscretionaryNeeds + discretionaryNeeds);
      totalSurvivorNeeds = roundMoney(totalSurvivorNeeds + survivorNeeds);
      totalScheduledObligations = roundMoney(totalScheduledObligations + scheduledObligations);
      totalNetUse = roundMoney(totalNetUse + netUse);

      points.push({
        date: formatDateOnly(pointDate),
        monthIndex,
        startingResources: roundMoney(pointStartingResources),
        survivorIncome,
        essentialNeeds,
        discretionaryNeeds,
        survivorNeeds,
        scheduledObligations,
        netUse,
        endingResources,
        availableResources,
        accumulatedUnmetNeed,
        status,
        sourcePaths: uniqueStrings(trace.sourcePaths),
        trace: {
          calculationMethod: CALCULATION_METHOD,
          cadence: options.cadence,
          activeIncomeStreamIds: incomeStreams.filter(function (stream) {
            return isStreamActive(stream, monthIndex, periodStart);
          }).map(function (stream) { return stream.id; }),
          activeNeedStreamIds: activeNeedStreams.map(function (stream) { return stream.id; }),
          activeScheduledObligationIds: obligations.filter(function (stream) {
            return isStreamActive(stream, monthIndex, periodStart);
          }).map(function (stream) { return stream.id; })
        }
      });
    }

    output.status = dataGaps.length ? "partial" : "complete";
    output.depletion = depletion;
    output.summary = {
      totalSurvivorIncome,
      totalEssentialNeeds,
      totalDiscretionaryNeeds,
      totalSurvivorNeeds,
      totalScheduledObligations,
      totalNetUse,
      endingResources: points.length ? points[points.length - 1].endingResources : startingResources.value,
      accumulatedUnmetNeed: points.length ? points[points.length - 1].accumulatedUnmetNeed : Math.max(0, -startingResources.value)
    };
    output.points = points;
    output.warnings = warnings;
    output.dataGaps = dataGaps;
    output.trace = {
      ...trace,
      sourcePaths: uniqueStrings(trace.sourcePaths)
    };

    return output;
  }

  lensAnalysis.calculateHouseholdSurvivorRunway = calculateHouseholdSurvivorRunway;
})(typeof globalThis !== "undefined" ? globalThis : this);
