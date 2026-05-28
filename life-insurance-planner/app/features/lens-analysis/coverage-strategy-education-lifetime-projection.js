// Coverage Strategy education lifetime projection engine.
// Future home after folder reorganization:
// app/features/lens-analysis/coverage-strategy/projections/education-lifetime-projection.js
// Backend-ready pure calculation engine: accepts education support facts, dependent timing inputs, and explicit assumptions; returns serializable projection output.
// Owns Coverage Strategy-specific death-year remaining education obligation projection.
// Does not own PMI intake, Needs/LENS aggregate education math, education savings offsets, resource spending, storage, DOM, or display rendering.
(function (global) {
  const root = global.LensApp || (global.LensApp = {});
  const lensAnalysis = root.lensAnalysis || (root.lensAnalysis = {});

  const COVERAGE_STRATEGY_EDUCATION_LIFETIME_PROJECTION_VERSION =
    "coverage-strategy-education-lifetime-projection-v1";
  const DEFAULT_EDUCATION_START_AGE = 18;
  const DEFAULT_PAYMENT_YEARS = 4;

  function isPlainObject(value) {
    return Boolean(value && typeof value === "object" && !Array.isArray(value));
  }

  function clonePlainValue(value) {
    if (value == null) {
      return value;
    }
    return JSON.parse(JSON.stringify(value));
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
    const normalized = String(value).replace(/[$,%\s,]/g, "").trim();
    if (!normalized) {
      return null;
    }
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : null;
  }

  function roundMoney(value) {
    return Number.isFinite(value) ? Number(value.toFixed(2)) : 0;
  }

  function roundRatio(value) {
    return Number.isFinite(value) ? Number(value.toFixed(8)) : 0;
  }

  function createIssue(code, message, details) {
    return {
      code,
      message,
      details: isPlainObject(details) ? clonePlainValue(details) : {}
    };
  }

  function addIssue(target, code, message, details) {
    if (!Array.isArray(target)) {
      return null;
    }
    const issue = createIssue(code, message, details);
    target.push(issue);
    return issue;
  }

  function normalizeDateOnly(value) {
    const raw = normalizeString(value);
    const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!match) {
      return null;
    }
    const year = Number(match[1]);
    const monthIndex = Number(match[2]) - 1;
    const day = Number(match[3]);
    const date = new Date(Date.UTC(year, monthIndex, day));
    if (
      Number.isNaN(date.getTime())
      || date.getUTCFullYear() !== year
      || date.getUTCMonth() !== monthIndex
      || date.getUTCDate() !== day
    ) {
      return null;
    }
    return {
      date,
      normalizedDate: [
        String(year).padStart(4, "0"),
        String(monthIndex + 1).padStart(2, "0"),
        String(day).padStart(2, "0")
      ].join("-"),
      calendarYear: year
    };
  }

  function addCalendarYears(dateResult, years) {
    if (!dateResult || !(dateResult.date instanceof Date)) {
      return null;
    }
    const date = new Date(dateResult.date.getTime());
    date.setUTCFullYear(date.getUTCFullYear() + years);
    return {
      date,
      normalizedDate: [
        String(date.getUTCFullYear()).padStart(4, "0"),
        String(date.getUTCMonth() + 1).padStart(2, "0"),
        String(date.getUTCDate()).padStart(2, "0")
      ].join("-"),
      calendarYear: date.getUTCFullYear()
    };
  }

  function calculateAge(dateOfBirth, valuationDate) {
    const birth = normalizeDateOnly(dateOfBirth);
    const valuation = normalizeDateOnly(valuationDate);
    if (!birth || !valuation || birth.date > valuation.date) {
      return null;
    }
    let age = valuation.date.getUTCFullYear() - birth.date.getUTCFullYear();
    const monthDelta = valuation.date.getUTCMonth() - birth.date.getUTCMonth();
    if (monthDelta < 0 || (monthDelta === 0 && valuation.date.getUTCDate() < birth.date.getUTCDate())) {
      age -= 1;
    }
    return age >= 0 ? age : null;
  }

  function normalizePercentRate(value, warnings) {
    const parsed = toOptionalNumber(value);
    if (parsed == null || parsed < 0) {
      if (value != null && value !== "") {
        addIssue(
          warnings,
          "invalid-education-inflation-rate-current-dollar",
          "Education inflation rate was invalid; Coverage Strategy education projection used current dollars.",
          { received: value }
        );
      }
      return {
        annualRate: 0,
        sourceValue: value,
        applied: false
      };
    }
    let annualRate;
    if (parsed > 1) {
      annualRate = parsed / 100;
    } else if (parsed >= 0.1) {
      annualRate = parsed / 100;
    } else {
      annualRate = parsed;
    }
    return {
      annualRate: Math.max(0, annualRate),
      sourceValue: value,
      applied: annualRate > 0
    };
  }

  function normalizeEducationStartAge(value, warnings) {
    const parsed = toOptionalNumber(value);
    if (parsed == null || parsed < 0 || parsed > 120) {
      if (value != null && value !== "") {
        addIssue(
          warnings,
          "invalid-education-start-age-defaulted",
          "Education start age was invalid; Coverage Strategy used age 18.",
          { received: value, fallback: DEFAULT_EDUCATION_START_AGE }
        );
      }
      return DEFAULT_EDUCATION_START_AGE;
    }
    return Math.round(parsed);
  }

  function getNeedPoints(input) {
    return Array.isArray(input?.needPoints) ? input.needPoints : [];
  }

  function getPointCalendarYear(point, valuationYear) {
    const calendarYear = toOptionalNumber(point?.calendarYear);
    if (calendarYear != null) {
      return Math.round(calendarYear);
    }
    const yearIndex = toOptionalNumber(point?.yearIndex);
    if (valuationYear != null && yearIndex != null) {
      return valuationYear + Math.round(yearIndex);
    }
    return null;
  }

  function getDependentId(dependent, index, prefix) {
    const id = normalizeString(dependent?.id || dependent?.dependentId || dependent?.expenseFactId);
    return id || `${prefix || "dependent"}-${index + 1}`;
  }

  function getDependentDateOfBirth(dependent) {
    return normalizeString(dependent?.dateOfBirth ?? dependent?.birthDate ?? "");
  }

  function collectCurrentDependents(input) {
    const educationSupport = isPlainObject(input.educationSupport) ? input.educationSupport : {};
    const candidates = [];
    if (Array.isArray(input.profileDependents)) {
      candidates.push(...input.profileDependents);
    }
    if (Array.isArray(educationSupport.currentDependentDetails)) {
      candidates.push(...educationSupport.currentDependentDetails);
    }
    const seen = new Set();
    return candidates.filter(function (dependent, index) {
      if (!isPlainObject(dependent)) {
        return false;
      }
      const stableId = normalizeString(dependent.id || dependent.dependentId);
      const stableDob = getDependentDateOfBirth(dependent);
      const key = stableId || stableDob
        ? [stableId, stableDob].join("|")
        : `current-dependent-index-${index}`;
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
  }

  function getFundingTargetTrace(educationAssumptions) {
    const fundingTargetPercent = toOptionalNumber(educationAssumptions?.fundingTargetPercent);
    return {
      fundingTargetPercent: fundingTargetPercent == null ? null : fundingTargetPercent,
      fundingTargetPercentApplied: false,
      fundingTargetTreatment: "preserved-current-needs-aggregate-behavior"
    };
  }

  function resolvePerCurrentDependentFunding(educationSupport, currentDependentCount) {
    const direct = toOptionalNumber(educationSupport.perLinkedDependentEducationFunding);
    if (direct != null && direct >= 0) {
      return {
        amount: direct,
        source: "educationSupport.perLinkedDependentEducationFunding"
      };
    }
    const total = toOptionalNumber(educationSupport.linkedDependentEducationFundingNeed);
    if (total != null && total >= 0 && currentDependentCount > 0) {
      return {
        amount: total / currentDependentCount,
        source: "educationSupport.linkedDependentEducationFundingNeed/currentDependentCount"
      };
    }
    return {
      amount: 0,
      source: "missing-current-dependent-funding"
    };
  }

  function resolvePerProjectedDependentFunding(educationSupport, projectedCount) {
    const direct = toOptionalNumber(educationSupport.perDesiredAdditionalDependentEducationFunding);
    if (direct != null && direct >= 0) {
      return {
        amount: direct,
        source: "educationSupport.perDesiredAdditionalDependentEducationFunding"
      };
    }
    const total = toOptionalNumber(educationSupport.desiredAdditionalDependentEducationFundingNeed);
    if (total != null && total >= 0 && projectedCount > 0) {
      return {
        amount: total / projectedCount,
        source: "educationSupport.desiredAdditionalDependentEducationFundingNeed/projectedCount"
      };
    }
    return {
      amount: 0,
      source: "missing-projected-dependent-funding"
    };
  }

  function getInflationFactor(context, paymentYear) {
    if (!context.applyEducationInflation || !(context.educationInflationAnnualRate > 0)) {
      return 1;
    }
    const elapsedYears = Math.max(0, paymentYear - context.valuationYear);
    return Math.pow(1 + context.educationInflationAnnualRate, elapsedYears);
  }

  function createPaymentSchedule(dependent, context, options) {
    const paymentYearCount = Math.max(1, Math.round(toOptionalNumber(context.paymentYearCount) || DEFAULT_PAYMENT_YEARS));
    const baseTotal = Math.max(0, toOptionalNumber(options.baseTotal) || 0);
    const basePayment = baseTotal / paymentYearCount;
    const dateOfBirth = options.dateOfBirth;
    const birth = normalizeDateOnly(dateOfBirth);
    const educationStartDate = addCalendarYears(birth, context.educationStartAge);
    const educationStartYear = educationStartDate ? educationStartDate.calendarYear : null;
    const payments = [];
    for (let offset = 0; offset < paymentYearCount; offset += 1) {
      const paymentYear = educationStartYear == null ? null : educationStartYear + offset;
      const inflationFactor = paymentYear == null ? 1 : getInflationFactor(context, paymentYear);
      payments.push({
        paymentIndex: offset + 1,
        paymentYear,
        baseAmount: roundMoney(basePayment),
        amount: roundMoney(basePayment * inflationFactor),
        inflationFactor: roundRatio(inflationFactor),
        inflationApplied: context.applyEducationInflation && context.educationInflationAnnualRate > 0,
        remainingRule: "calendarYear<=paymentYear"
      });
    }
    return {
      id: options.id,
      kind: options.kind,
      dateOfBirth,
      birthYear: birth ? birth.calendarYear : null,
      currentAge: calculateAge(dateOfBirth, context.valuationDate),
      educationStartAge: context.educationStartAge,
      educationStartYear,
      baseTotal: roundMoney(baseTotal),
      paymentYearCount,
      payments,
      sourcePath: options.sourcePath || null,
      trace: {
        source: "coverage-strategy-education-lifetime-projection",
        scheduleMode: "four-equal-annual-payments",
        annualPointRule: "annual-calendar-year-basis",
        fundingSource: options.fundingSource,
        fundingTargetPercentApplied: false
      }
    };
  }

  function remainingScheduleAmount(schedule, pointCalendarYear) {
    if (pointCalendarYear == null) {
      return 0;
    }
    return roundMoney(schedule.payments.reduce(function (sum, payment) {
      if (payment.paymentYear != null && pointCalendarYear <= payment.paymentYear) {
        return sum + Math.max(0, toOptionalNumber(payment.amount) || 0);
      }
      return sum;
    }, 0));
  }

  function buildCurrentDependentSchedules(input, context, warnings, dataGaps) {
    const educationSupport = isPlainObject(input.educationSupport) ? input.educationSupport : {};
    const dependents = collectCurrentDependents(input);
    const funding = resolvePerCurrentDependentFunding(educationSupport, dependents.length);
    const schedules = [];
    const excluded = [];
    dependents.forEach(function (dependent, index) {
      const id = getDependentId(dependent, index, "current-dependent");
      const dateOfBirth = getDependentDateOfBirth(dependent);
      const sourcePath = dependent.sourcePath || `educationSupport.currentDependentDetails[${index}]`;
      if (!normalizeDateOnly(dateOfBirth)) {
        const issue = createIssue(
          "current-dependent-education-dob-missing",
          "Current dependent education timing requires a valid dateOfBirth; no fake timing was created.",
          { id, sourcePath, dateOfBirth: dateOfBirth || null }
        );
        warnings.push(issue);
        dataGaps.push(issue);
        excluded.push({
          id,
          kind: "currentDependent",
          sourcePath,
          exclusionCode: issue.code,
          exclusionReason: issue.message,
          trace: issue.details
        });
        return;
      }
      schedules.push(createPaymentSchedule(dependent, context, {
        id,
        kind: "currentDependent",
        dateOfBirth,
        baseTotal: funding.amount,
        fundingSource: funding.source,
        sourcePath
      }));
    });
    return {
      schedules,
      excluded,
      funding
    };
  }

  function normalizeBirthYear(value) {
    const parsed = toOptionalNumber(value);
    if (parsed == null) {
      return null;
    }
    const rounded = Math.round(parsed);
    return rounded >= 1900 && rounded <= 2200 ? rounded : null;
  }

  function buildProjectedDependentSchedules(input, context, warnings) {
    const educationSupport = isPlainObject(input.educationSupport) ? input.educationSupport : {};
    const projectedDependents = Array.isArray(input.projectedDependents) ? input.projectedDependents : [];
    const aggregateCount = Math.max(0, Math.round(toOptionalNumber(
      educationSupport.desiredAdditionalDependentCount
      ?? educationSupport.projectedDependentsCount
    ) || 0));
    const funding = resolvePerProjectedDependentFunding(educationSupport, aggregateCount || projectedDependents.length);
    const timedSchedules = [];
    const excluded = [];
    projectedDependents.forEach(function (dependent, index) {
      if (!isPlainObject(dependent)) {
        return;
      }
      const id = getDependentId(dependent, index, "projected-dependent");
      const birthYear = normalizeBirthYear(
        dependent.expectedBirthYear
        ?? dependent.birthYear
        ?? dependent.projectedBirthYear
      );
      const sourcePath = dependent.sourcePath || `projectedDependents[${index}]`;
      if (birthYear == null) {
        excluded.push({
          id,
          kind: "projectedDependent",
          sourcePath,
          exclusionCode: "projected-dependent-birth-year-missing",
          exclusionReason: "Projected dependent has no birth year timing anchor.",
          trace: {
            keptAsUntimedAggregateCandidate: true
          }
        });
        return;
      }
      const warning = createIssue(
        "projected-dependent-birth-year-defaulted-to-jan-1",
        "Projected dependent birth year was converted to a January 1 DOB for annual Coverage Strategy scheduling.",
        { id, birthYear, assumedDateOfBirth: `${birthYear}-01-01`, sourcePath }
      );
      warnings.push(warning);
      timedSchedules.push(createPaymentSchedule(dependent, context, {
        id,
        kind: "projectedDependent",
        dateOfBirth: `${birthYear}-01-01`,
        baseTotal: toOptionalNumber(dependent.educationFundingAmount) ?? funding.amount,
        fundingSource: dependent.educationFundingAmount == null
          ? funding.source
          : "projectedDependents.educationFundingAmount",
        sourcePath
      }));
    });
    return {
      timedSchedules,
      excluded,
      aggregateCount,
      funding
    };
  }

  function resolveUntimedProjectedDependentNeed(educationSupport, projectedModel, educationAssumptions, warnings) {
    const includeProjectedDependents = educationAssumptions.includeProjectedDependents !== false;
    const aggregateTotal = Math.max(0, toOptionalNumber(
      educationSupport.desiredAdditionalDependentEducationFundingNeed
      ?? educationSupport.projectedDependentEducationFundingNeed
    ) || 0);
    const timedTotal = roundMoney(projectedModel.timedSchedules.reduce(function (sum, schedule) {
      return sum + Math.max(0, toOptionalNumber(schedule.baseTotal) || 0);
    }, 0));
    if (!includeProjectedDependents) {
      if (aggregateTotal > 0 || projectedModel.timedSchedules.length) {
        warnings.push(createIssue(
          "projected-dependent-education-excluded-by-setting",
          "Projected dependent education funding was excluded by the education assumptions.",
          { aggregateTotal, timedProjectedDependentCount: projectedModel.timedSchedules.length }
        ));
      }
      return {
        amount: 0,
        status: aggregateTotal > 0 ? "excluded-by-setting" : "not-present",
        count: 0,
        traceCode: "projected-dependent-education-excluded-by-setting"
      };
    }
    const untimedAmount = roundMoney(Math.max(0, aggregateTotal - timedTotal));
    if (untimedAmount > 0) {
      warnings.push(createIssue(
        "projected-dependent-education-kept-through-horizon",
        "Projected dependent education funding has no timing anchor; Coverage Strategy kept it through the projection horizon.",
        {
          untimedProjectedDependentNeedAmount: untimedAmount,
          projectedDependentCount: projectedModel.aggregateCount
        }
      ));
    }
    return {
      amount: untimedAmount,
      status: untimedAmount > 0 ? "kept-through-horizon" : "not-present",
      count: untimedAmount > 0 ? Math.max(0, projectedModel.aggregateCount - projectedModel.timedSchedules.length) : 0,
      traceCode: untimedAmount > 0
        ? "projected-dependent-education-kept-through-horizon"
        : "projected-dependent-education-not-present"
    };
  }

  function createPointScheduleRecord(schedule, amount, pointCalendarYear) {
    return {
      id: schedule.id,
      kind: schedule.kind,
      amount,
      educationStartYear: schedule.educationStartYear,
      sourcePath: schedule.sourcePath,
      unpaidPayments: schedule.payments.filter(function (payment) {
        return payment.paymentYear != null && amount > 0 && pointCalendarYear <= payment.paymentYear;
      }).map(clonePlainValue)
    };
  }

  function buildCoverageStrategyEducationLifetimeProjection(input) {
    const safeInput = isPlainObject(input) ? input : {};
    const educationSupport = isPlainObject(safeInput.educationSupport) ? safeInput.educationSupport : {};
    const educationAssumptions = isPlainObject(safeInput.educationAssumptions) ? safeInput.educationAssumptions : {};
    const needPoints = getNeedPoints(safeInput);
    const warnings = [];
    const dataGaps = [];
    const valuationDateResult = normalizeDateOnly(safeInput.valuationDate);
    if (!valuationDateResult) {
      addIssue(
        dataGaps,
        "education-lifetime-valuation-date-missing",
        "Coverage Strategy education lifetime projection needs a valid valuationDate for dependent timing.",
        { valuationDate: safeInput.valuationDate || null }
      );
    }
    const rateResult = normalizePercentRate(safeInput.educationInflationRatePercent, warnings);
    const includeEducationFunding = educationAssumptions.includeEducationFunding !== false;
    const educationStartAge = normalizeEducationStartAge(educationAssumptions.educationStartAge, warnings);
    const context = {
      valuationDate: valuationDateResult ? valuationDateResult.normalizedDate : null,
      valuationYear: valuationDateResult ? valuationDateResult.calendarYear : null,
      educationStartAge,
      paymentYearCount: toOptionalNumber(safeInput.options?.paymentYearCount) || DEFAULT_PAYMENT_YEARS,
      applyEducationInflation: includeEducationFunding
        && educationAssumptions.applyEducationInflation === true
        && rateResult.annualRate > 0,
      educationInflationAnnualRate: rateResult.annualRate
    };

    if (!includeEducationFunding) {
      return {
        projectionVersion: COVERAGE_STRATEGY_EDUCATION_LIFETIME_PROJECTION_VERSION,
        status: "complete",
        educationPoints: needPoints.map(function (point) {
          return {
            yearIndex: Math.max(0, Math.round(toOptionalNumber(point?.yearIndex) || 0)),
            date: point?.date || null,
            calendarYear: point?.calendarYear ?? null,
            clientAge: point?.age ?? null,
            educationNeedAmount: 0,
            currentDependentNeedAmount: 0,
            projectedDependentNeedAmount: 0,
            untimedProjectedDependentNeedAmount: 0,
            includedDependentCount: 0,
            excludedDependentCount: 0,
            warnings: [],
            dataGaps: [],
            trace: {
              source: "coverage-strategy-education-lifetime-projection",
              projectionMode: "education-funding-excluded-by-setting"
            }
          };
        }),
        currentDependentSchedules: [],
        projectedDependentSchedules: [],
        untimedProjectedDependents: [],
        includedDependents: [],
        excludedDependents: [],
        assumptionsUsed: {
          includeEducationFunding: false,
          educationSavingsOffsetApplied: false,
          resourceSpendingApplied: false
        },
        warnings,
        dataGaps,
        trace: {
          source: "coverage-strategy-education-lifetime-projection",
          displayHtmlUsed: false,
          storageUsed: false,
          inputMutated: false
        }
      };
    }

    const currentModel = buildCurrentDependentSchedules(safeInput, context, warnings, dataGaps);
    const projectedModel = buildProjectedDependentSchedules(safeInput, context, warnings);
    const untimedProjected = resolveUntimedProjectedDependentNeed(
      educationSupport,
      projectedModel,
      educationAssumptions,
      warnings
    );
    const timedSchedules = currentModel.schedules.concat(
      educationAssumptions.includeProjectedDependents === false ? [] : projectedModel.timedSchedules
    );
    const excludedDependents = currentModel.excluded.concat(projectedModel.excluded);
    const includedDependents = timedSchedules.map(function (schedule) {
      return {
        id: schedule.id,
        kind: schedule.kind,
        dateOfBirth: schedule.dateOfBirth,
        educationStartYear: schedule.educationStartYear,
        baseTotal: schedule.baseTotal,
        sourcePath: schedule.sourcePath
      };
    });
    const untimedProjectedDependents = untimedProjected.amount > 0
      ? [{
          id: "projected-dependent-untimed-aggregate",
          kind: "projectedDependentAggregate",
          amount: untimedProjected.amount,
          count: untimedProjected.count,
          sourcePath: "educationSupport.desiredAdditionalDependentEducationFundingNeed",
          trace: {
            code: untimedProjected.traceCode,
            inflationSource: "projected-dependent-untimed-current-dollar"
          }
        }]
      : [];

    if (!timedSchedules.length && !(untimedProjected.amount > 0) && (toOptionalNumber(educationSupport.totalEducationFundingNeed) || 0) > 0) {
      addIssue(
        dataGaps,
        "education-lifetime-schedule-unavailable",
        "Coverage Strategy could not build a timed education lifetime schedule from available education facts.",
        { totalEducationFundingNeed: educationSupport.totalEducationFundingNeed }
      );
    }

    const educationPoints = needPoints.map(function (point) {
      const yearIndex = Math.max(0, Math.round(toOptionalNumber(point?.yearIndex) || 0));
      const pointCalendarYear = getPointCalendarYear(point, context.valuationYear);
      const currentPointRecords = [];
      const projectedPointRecords = [];
      let currentDependentNeedAmount = 0;
      let timedProjectedNeedAmount = 0;
      timedSchedules.forEach(function (schedule) {
        const amount = remainingScheduleAmount(schedule, pointCalendarYear);
        if (schedule.kind === "currentDependent") {
          currentDependentNeedAmount = roundMoney(currentDependentNeedAmount + amount);
          if (amount > 0) {
            currentPointRecords.push(createPointScheduleRecord(schedule, amount, pointCalendarYear));
          }
          return;
        }
        timedProjectedNeedAmount = roundMoney(timedProjectedNeedAmount + amount);
        if (amount > 0) {
          projectedPointRecords.push(createPointScheduleRecord(schedule, amount, pointCalendarYear));
        }
      });
      const untimedProjectedDependentNeedAmount = untimedProjected.amount;
      const projectedDependentNeedAmount = roundMoney(timedProjectedNeedAmount + untimedProjectedDependentNeedAmount);
      const educationNeedAmount = roundMoney(currentDependentNeedAmount + projectedDependentNeedAmount);
      return {
        yearIndex,
        date: point?.date || null,
        calendarYear: point?.calendarYear ?? null,
        clientAge: point?.age ?? null,
        educationNeedAmount,
        currentDependentNeedAmount,
        projectedDependentNeedAmount,
        untimedProjectedDependentNeedAmount,
        includedDependentCount: currentPointRecords.length + projectedPointRecords.length + untimedProjectedDependents.length,
        excludedDependentCount: excludedDependents.length,
        includedRecords: currentPointRecords.concat(projectedPointRecords).concat(untimedProjectedDependents.map(clonePlainValue)),
        excludedDependents: excludedDependents.map(clonePlainValue),
        warnings: [],
        dataGaps: [],
        trace: {
          source: "coverage-strategy-education-lifetime-projection",
          projectionMode: "record-level-education-obligation-schedule",
          annualPointRule: "annual-calendar-year-basis",
          fourYearPaymentScheduleUsed: true,
          educationSavingsOffsetApplied: false,
          resourceSpendingApplied: false,
          untimedProjectedDependentStatus: untimedProjected.status
        }
      };
    });

    return {
      projectionVersion: COVERAGE_STRATEGY_EDUCATION_LIFETIME_PROJECTION_VERSION,
      status: educationPoints.length ? "complete" : "unavailable",
      educationPoints,
      currentDependentSchedules: currentModel.schedules.map(clonePlainValue),
      projectedDependentSchedules: projectedModel.timedSchedules.map(clonePlainValue),
      untimedProjectedDependents: untimedProjectedDependents.map(clonePlainValue),
      includedDependents,
      excludedDependents,
      assumptionsUsed: {
        valuationDate: context.valuationDate,
        educationStartAge,
        paymentYearCount: context.paymentYearCount,
        includeEducationFunding,
        includeProjectedDependents: educationAssumptions.includeProjectedDependents !== false,
        applyEducationInflation: educationAssumptions.applyEducationInflation === true,
        educationInflationRateInput: rateResult.sourceValue,
        educationInflationAnnualRate: roundRatio(rateResult.annualRate),
        educationInflationApplied: context.applyEducationInflation,
        annualPointRule: "annual-calendar-year-basis",
        projectedDependentUntimedRule: "keep-through-coverage-strategy-projection-horizon",
        educationSavingsOffsetApplied: false,
        resourceSpendingApplied: false,
        educationSpecificSavingsConsumed: false,
        fundingTarget: getFundingTargetTrace(educationAssumptions)
      },
      warnings,
      dataGaps,
      trace: {
        source: "coverage-strategy-education-lifetime-projection",
        currentDependentScheduleCount: currentModel.schedules.length,
        projectedDependentScheduleCount: projectedModel.timedSchedules.length,
        untimedProjectedDependentCount: untimedProjectedDependents.length,
        excludedDependentCount: excludedDependents.length,
        pointCount: educationPoints.length,
        displayHtmlUsed: false,
        storageUsed: false,
        inputMutated: false
      }
    };
  }

  lensAnalysis.COVERAGE_STRATEGY_EDUCATION_LIFETIME_PROJECTION_VERSION =
    COVERAGE_STRATEGY_EDUCATION_LIFETIME_PROJECTION_VERSION;
  lensAnalysis.buildCoverageStrategyEducationLifetimeProjection =
    buildCoverageStrategyEducationLifetimeProjection;

  if (typeof module !== "undefined" && module.exports) {
    module.exports = {
      COVERAGE_STRATEGY_EDUCATION_LIFETIME_PROJECTION_VERSION,
      buildCoverageStrategyEducationLifetimeProjection
    };
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
