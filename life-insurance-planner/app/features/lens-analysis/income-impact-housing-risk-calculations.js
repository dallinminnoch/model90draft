(function (global) {
  const root = global.LensApp = global.LensApp || {};
  const lensAnalysis = root.lensAnalysis = root.lensAnalysis || {};

  const VERSION = "income-impact-housing-risk-v1";
  const SOURCE = "income-impact-housing-risk-calculations";

  const EVIDENCE_LEVELS = Object.freeze({
    calculated: "calculated",
    traceBacked: "trace-backed",
    assumptionBacked: "assumption-backed",
    estimated: "estimated",
    dataGap: "data-gap",
    insufficientData: "insufficient-data"
  });

  const OBLIGATION_TYPES = Object.freeze({
    mortgage: "mortgage",
    rent: "rent",
    housing: "housing",
    unknown: "unknown"
  });

  const TREATMENTS = Object.freeze({
    continuePayments: "continuePayments",
    support: "support",
    payOffMortgage: "payOffMortgage",
    paidOff: "paidOff",
    unknown: "unknown"
  });

  const EVENT_TYPES = Object.freeze({
    housingCostsRemainCovered: "housing-costs-remain-covered",
    housingCostsBeginPressuringPlan: "housing-costs-begin-pressuring-plan",
    housingStabilityAtRisk: "housing-stability-at-risk",
    housingCostsBecomeUnsupported: "housing-costs-become-unsupported",
    mortgagePaymentStaysCurrent: "mortgage-payment-stays-current",
    mortgagePaymentPressureBegins: "mortgage-payment-pressure-begins",
    mortgagePaymentAtRisk: "mortgage-payment-at-risk",
    mortgagePaymentBecomesUnsupported: "mortgage-payment-becomes-unsupported",
    rentPaymentStaysCurrent: "rent-payment-stays-current",
    rentPaymentPressureBegins: "rent-payment-pressure-begins",
    rentPaymentAtRisk: "rent-payment-at-risk",
    rentPaymentBecomesUnsupported: "rent-payment-becomes-unsupported",
    housingRiskUnknown: "housing-risk-unknown"
  });

  const EVENT_PRIORITY = Object.freeze({
    [EVENT_TYPES.housingCostsRemainCovered]: 10,
    [EVENT_TYPES.mortgagePaymentStaysCurrent]: 10,
    [EVENT_TYPES.rentPaymentStaysCurrent]: 10,
    [EVENT_TYPES.housingCostsBeginPressuringPlan]: 20,
    [EVENT_TYPES.mortgagePaymentPressureBegins]: 20,
    [EVENT_TYPES.rentPaymentPressureBegins]: 20,
    [EVENT_TYPES.mortgagePaymentAtRisk]: 30,
    [EVENT_TYPES.rentPaymentAtRisk]: 30,
    [EVENT_TYPES.housingStabilityAtRisk]: 40,
    [EVENT_TYPES.housingCostsBecomeUnsupported]: 50,
    [EVENT_TYPES.mortgagePaymentBecomesUnsupported]: 50,
    [EVENT_TYPES.rentPaymentBecomesUnsupported]: 50,
    [EVENT_TYPES.housingRiskUnknown]: 90
  });

  function isPlainObject(value) {
    return Boolean(value && typeof value === "object" && !Array.isArray(value));
  }

  function clonePlainValue(value) {
    if (Array.isArray(value)) {
      return value.map(clonePlainValue);
    }
    if (isPlainObject(value)) {
      return Object.keys(value).reduce(function (output, key) {
        output[key] = clonePlainValue(value[key]);
        return output;
      }, {});
    }
    return value;
  }

  function normalizeString(value) {
    return String(value == null ? "" : value).trim();
  }

  function normalizeKey(value) {
    return normalizeString(value).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
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

  function roundMoney(value) {
    const number = toOptionalNumber(value);
    return number == null ? null : Math.round(number * 100) / 100;
  }

  function roundMonth(value) {
    const number = toOptionalNumber(value);
    return number == null ? null : Math.round(number * 1000) / 1000;
  }

  function getPath(source, path) {
    const normalizedPath = normalizeString(path);
    if (!normalizedPath) {
      return undefined;
    }
    return normalizedPath.split(".").reduce(function (cursor, key) {
      if (cursor == null) {
        return undefined;
      }
      if (Array.isArray(cursor) && /^\d+$/.test(key)) {
        return cursor[Number(key)];
      }
      return cursor[key];
    }, source);
  }

  function uniqueStrings(values) {
    return Array.from(new Set((Array.isArray(values) ? values : [])
      .map(normalizeString)
      .filter(Boolean)));
  }

  function compactObjects(values) {
    return (Array.isArray(values) ? values : []).filter(isPlainObject);
  }

  function makeWarning(id, message, sourcePath, details) {
    const warning = {
      id,
      message,
      sourcePath: sourcePath || null
    };
    if (isPlainObject(details)) {
      warning.details = clonePlainValue(details);
    }
    return warning;
  }

  function normalizeEvidenceLevel(value, fallback) {
    const normalized = normalizeString(value);
    if (Object.values(EVIDENCE_LEVELS).includes(normalized)) {
      return normalized;
    }
    return fallback || EVIDENCE_LEVELS.assumptionBacked;
  }

  function normalizeObligationType(value, fallbackText) {
    const key = normalizeKey(value || fallbackText);
    if (/(mortgage|heloc|home-equity-loan)/.test(key)) {
      return OBLIGATION_TYPES.mortgage;
    }
    if (/(rent|renter|lease)/.test(key)) {
      return OBLIGATION_TYPES.rent;
    }
    if (/(housing|home|residence)/.test(key)) {
      return OBLIGATION_TYPES.housing;
    }
    return OBLIGATION_TYPES.unknown;
  }

  function normalizeTreatment(value, fallbackText) {
    const key = normalizeKey(value || fallbackText);
    if (/(pay-off|payoff|paid-off|paid)/.test(key)) {
      return TREATMENTS.payOffMortgage;
    }
    if (/(continue|payment|payments|support|scheduled)/.test(key)) {
      return TREATMENTS.continuePayments;
    }
    return TREATMENTS.unknown;
  }

  function firstNumberAtPath(source, paths) {
    for (let index = 0; index < paths.length; index += 1) {
      const path = paths[index];
      const value = toOptionalNumber(getPath(source, path));
      if (value != null) {
        return {
          value,
          sourcePath: path
        };
      }
    }
    return null;
  }

  function firstValueAtPath(source, paths) {
    for (let index = 0; index < paths.length; index += 1) {
      const path = paths[index];
      const value = getPath(source, path);
      if (value != null && value !== "") {
        return {
          value,
          sourcePath: path
        };
      }
    }
    return null;
  }

  function normalizeDateOnly(value) {
    const text = normalizeString(value);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) {
      return null;
    }
    const date = new Date(`${text}T00:00:00Z`);
    return Number.isNaN(date.getTime()) ? null : text;
  }

  function daysInMonth(year, monthIndex) {
    return new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
  }

  function addMonthsToDateOnly(dateText, monthOffset) {
    const normalized = normalizeDateOnly(dateText);
    const months = toOptionalNumber(monthOffset);
    if (!normalized || months == null) {
      return null;
    }
    const wholeMonths = Math.round(months);
    const parts = normalized.split("-").map(Number);
    const targetMonth = parts[1] - 1 + wholeMonths;
    const targetYear = parts[0] + Math.floor(targetMonth / 12);
    const normalizedMonth = ((targetMonth % 12) + 12) % 12;
    const targetDay = Math.min(parts[2], daysInMonth(targetYear, normalizedMonth));
    return [
      String(targetYear).padStart(4, "0"),
      String(normalizedMonth + 1).padStart(2, "0"),
      String(targetDay).padStart(2, "0")
    ].join("-");
  }

  function resolveDeathDate(input) {
    return normalizeDateOnly(
      input?.options?.selectedDeathDate
        || input?.scenario?.scenario?.selectedDeathDate
        || input?.scenario?.deathEvent?.date
        || input?.postDeathSeries?.startDate
    );
  }

  function normalizeObligation(rawObligation, index, sourcePathPrefix, defaults) {
    const raw = isPlainObject(rawObligation) ? rawObligation : {};
    const safeDefaults = isPlainObject(defaults) ? defaults : {};
    const type = normalizeObligationType(raw.type || raw.category, [raw.id, raw.label, raw.name, raw.category].join(" "));
    const treatment = normalizeTreatment(
      raw.treatment || raw.mortgageTreatment || raw.treatmentMode || raw.mortgageTreatmentMode || safeDefaults.treatment,
      [raw.id, raw.label, raw.status, raw.category].join(" ")
    );
    const monthlyPayment = roundMoney(
      raw.monthlyPayment
        ?? raw.monthlyAmount
        ?? raw.amount
        ?? raw.payment
        ?? raw.monthlyRentOrHousingPayment
    );
    const remainingMonths = toOptionalNumber(
      raw.remainingMonths
        ?? raw.termMonths
        ?? raw.supportMonths
        ?? raw.supportMonthsUsed
        ?? raw.durationMonths
    );
    const balance = roundMoney(raw.balance ?? raw.payoffAmount ?? raw.amountToPayoff ?? raw.mortgageBalance);
    const sourcePath = normalizeString(raw.sourcePath)
      || uniqueStrings(raw.sourcePaths)[0]
      || `${sourcePathPrefix}.${index}`;
    const warnings = [];

    if ((type === OBLIGATION_TYPES.mortgage || type === OBLIGATION_TYPES.rent || type === OBLIGATION_TYPES.housing)
      && treatment !== TREATMENTS.payOffMortgage
      && (monthlyPayment == null || monthlyPayment <= 0)) {
      warnings.push(makeWarning(
        "missing-housing-payment",
        "Housing obligation is missing a positive monthly payment.",
        sourcePath
      ));
    }
    if (type === OBLIGATION_TYPES.mortgage
      && treatment === TREATMENTS.payOffMortgage
      && (balance == null || balance <= 0)) {
      warnings.push(makeWarning(
        "missing-mortgage-payoff-balance",
        "Mortgage payoff treatment requires a positive balance or payoff amount.",
        sourcePath
      ));
    }
    if (type === OBLIGATION_TYPES.unknown) {
      warnings.push(makeWarning(
        "unknown-housing-obligation-type",
        "Housing obligation type could not be classified.",
        sourcePath
      ));
    }

    return {
      id: normalizeString(raw.id) || `${type}-${index + 1}`,
      type,
      label: normalizeString(raw.label || raw.name) || (type === OBLIGATION_TYPES.rent ? "Rent payment" : "Housing payment"),
      monthlyPayment,
      remainingMonths: remainingMonths == null ? null : Math.max(0, Math.round(remainingMonths)),
      balance,
      treatment,
      included: raw.included === false ? false : type !== OBLIGATION_TYPES.unknown,
      sourcePath,
      evidenceLevel: normalizeEvidenceLevel(raw.evidenceLevel, safeDefaults.evidenceLevel || EVIDENCE_LEVELS.assumptionBacked),
      warnings
    };
  }

  function getScheduledMortgageRows(input) {
    const candidates = [
      {
        value: getPath(input, "scenario.postDeathSeries.layer3.trace.streamNormalization.scheduledObligations"),
        sourcePath: "scenario.postDeathSeries.layer3.trace.streamNormalization.scheduledObligations"
      },
      {
        value: getPath(input, "scenario.postDeathSeries.layer3.scheduledObligations"),
        sourcePath: "scenario.postDeathSeries.layer3.scheduledObligations"
      },
      {
        value: getPath(input, "scenario.postDeathSeries.layer3.input.scheduledObligations"),
        sourcePath: "scenario.postDeathSeries.layer3.input.scheduledObligations"
      },
      {
        value: getPath(input, "postDeathSeries.layer3.trace.streamNormalization.scheduledObligations"),
        sourcePath: "postDeathSeries.layer3.trace.streamNormalization.scheduledObligations"
      }
    ];
    const seen = new Set();
    const rows = [];
    candidates.forEach(function (candidate) {
      if (!Array.isArray(candidate.value)) {
        return;
      }
      candidate.value.forEach(function (row, index) {
        if (!isPlainObject(row)) {
          return;
        }
        const key = normalizeString(row.id) || `${candidate.sourcePath}.${index}`;
        if (seen.has(key)) {
          return;
        }
        seen.add(key);
        rows.push({
          row,
          sourcePath: `${candidate.sourcePath}.${index}`
        });
      });
    });
    return rows;
  }

  function deriveObligations(input, warnings, trace) {
    const explicit = Array.isArray(input?.housingObligations) ? input.housingObligations : [];
    const mortgageTreatment = input?.mortgageTreatment;
    const normalizedTreatment = isPlainObject(mortgageTreatment)
      ? normalizeTreatment(mortgageTreatment.mode || mortgageTreatment.treatment)
      : normalizeTreatment(mortgageTreatment);

    if (explicit.length) {
      trace.obligationSourceSummary.mode = "explicit";
      return explicit.map(function (obligation, index) {
        return normalizeObligation(obligation, index, "housingObligations", {
          treatment: normalizedTreatment,
          evidenceLevel: EVIDENCE_LEVELS.assumptionBacked
        });
      });
    }

    const scheduledRows = getScheduledMortgageRows(input);
    if (scheduledRows.length) {
      trace.obligationSourceSummary.mode = "scheduled-obligations";
      return scheduledRows.map(function (item, index) {
        return normalizeObligation(Object.assign({}, item.row, {
          id: item.row.id || `derived-mortgage-support-${index + 1}`,
          type: item.row.type || "mortgage",
          treatment: item.row.treatment || item.row.treatmentMode || "continuePayments",
          monthlyPayment: item.row.monthlyPayment ?? item.row.monthlyAmount ?? item.row.amount,
          remainingMonths: item.row.remainingMonths ?? item.row.termMonths,
          sourcePath: uniqueStrings(item.row.sourcePaths)[0] || item.sourcePath,
          evidenceLevel: EVIDENCE_LEVELS.traceBacked
        }), index, "derivedHousingObligations", {
          evidenceLevel: EVIDENCE_LEVELS.traceBacked
        });
      });
    }

    const currentHousingPayment = firstNumberAtPath(input, [
      "scenario.trace.layer3.input.ongoingSupport.monthlyHousingSupportCost",
      "scenario.lensModel.ongoingSupport.monthlyHousingSupportCost",
      "financialRunway.monthlyHousingSupportCost",
      "options.monthlyHousingPayment"
    ]);
    if (currentHousingPayment && currentHousingPayment.value > 0) {
      warnings.push(makeWarning(
        "aggregate-housing-payment-only",
        "Only an aggregate housing payment was available, so mortgage/rent treatment could not be classified.",
        currentHousingPayment.sourcePath
      ));
      trace.obligationSourceSummary.mode = "aggregate";
      return [
        normalizeObligation({
          id: "aggregate-housing-payment",
          type: OBLIGATION_TYPES.housing,
          label: "Housing payment",
          monthlyPayment: currentHousingPayment.value,
          sourcePath: currentHousingPayment.sourcePath,
          evidenceLevel: EVIDENCE_LEVELS.estimated
        }, 0, "derivedHousingObligations", {
          evidenceLevel: EVIDENCE_LEVELS.estimated
        })
      ];
    }

    trace.obligationSourceSummary.mode = "missing";
    warnings.push(makeWarning(
      "missing-housing-payment-source",
      "No reliable mortgage, rent, or monthly housing payment source was available.",
      "housingObligations"
    ));
    return [];
  }

  function normalizeBoolean(value) {
    if (value === true || value === false) {
      return value;
    }
    const text = normalizeString(value).toLowerCase();
    if (["true", "yes", "y", "1", "depleted"].includes(text)) {
      return true;
    }
    if (["false", "no", "n", "0", "funded", "not-depleted"].includes(text)) {
      return false;
    }
    return null;
  }

  function firstBooleanAtPath(source, paths) {
    for (let index = 0; index < paths.length; index += 1) {
      const path = paths[index];
      const value = normalizeBoolean(getPath(source, path));
      if (value != null) {
        return {
          value,
          sourcePath: path
        };
      }
    }
    return null;
  }

  function getPostDeathPoints(input) {
    const candidates = [
      {
        value: getPath(input, "scenario.postDeathSeries.layer3.points"),
        sourcePath: "scenario.postDeathSeries.layer3.points"
      },
      {
        value: getPath(input, "scenario.postDeathSeries.points"),
        sourcePath: "scenario.postDeathSeries.points"
      },
      {
        value: getPath(input, "postDeathSeries.layer3.points"),
        sourcePath: "postDeathSeries.layer3.points"
      },
      {
        value: getPath(input, "postDeathSeries.points"),
        sourcePath: "postDeathSeries.points"
      }
    ];
    for (let index = 0; index < candidates.length; index += 1) {
      const candidate = candidates[index];
      if (Array.isArray(candidate.value) && candidate.value.length) {
        return {
          points: candidate.value,
          sourcePath: candidate.sourcePath
        };
      }
    }
    return {
      points: [],
      sourcePath: null
    };
  }

  function resolveModeledHorizonMonth(input, pointsInfo) {
    const explicit = firstNumberAtPath(input, [
      "options.modeledHorizonMonths",
      "options.displayHorizonMonths",
      "scenario.postDeathSeries.projectionHorizonMonths",
      "scenario.postDeathSeries.horizonMonths",
      "scenario.postDeathSeries.displayHorizonMonths",
      "scenario.timelineFacts.displayHorizonMonths",
      "scenario.timelineFacts.modeledHorizonMonths",
      "postDeathSeries.projectionHorizonMonths",
      "postDeathSeries.horizonMonths",
      "postDeathSeries.displayHorizonMonths"
    ]);
    const pointMonths = (pointsInfo.points || [])
      .map(function (point, index) {
        const month = toOptionalNumber(point?.monthIndex ?? point?.monthOffset ?? point?.month);
        return month == null ? index + 1 : month;
      })
      .filter(function (month) {
        return month != null && Number.isFinite(month);
      });
    const pointHorizon = pointMonths.length ? Math.max.apply(null, pointMonths) : null;
    if (explicit || pointHorizon != null) {
      const explicitValue = explicit ? Math.max(0, explicit.value) : null;
      return {
        value: explicitValue == null ? pointHorizon : Math.max(explicitValue, pointHorizon || 0),
        sourcePath: explicit?.sourcePath || pointsInfo.sourcePath,
        evidenceLevel: explicit ? EVIDENCE_LEVELS.calculated : EVIDENCE_LEVELS.traceBacked
      };
    }
    return null;
  }

  function findUnsupportedMonthFromPoints(pointsInfo) {
    const points = Array.isArray(pointsInfo.points) ? pointsInfo.points : [];
    for (let index = 0; index < points.length; index += 1) {
      const point = points[index];
      const status = normalizeKey(point?.status || point?.resourceStatus || point?.state);
      const endingResources = toOptionalNumber(
        point?.endingResources
          ?? point?.availableResources
          ?? point?.resourcesRemaining
          ?? point?.remainingResources
      );
      if (status === "depleted" || status === "runout" || status === "run-out" || (endingResources != null && endingResources <= 0)) {
        const month = toOptionalNumber(point?.monthIndex ?? point?.monthOffset ?? point?.month);
        return {
          value: Math.max(0, month == null ? index + 1 : month),
          sourcePath: `${pointsInfo.sourcePath || "postDeathSeries.points"}.${index}`,
          evidenceLevel: EVIDENCE_LEVELS.traceBacked
        };
      }
    }
    return null;
  }

  function resolveBaselineSupport(input, trace) {
    const pointsInfo = getPostDeathPoints(input);
    const horizon = resolveModeledHorizonMonth(input, pointsInfo);
    const depletionFlag = firstBooleanAtPath(input, [
      "scenario.postDeathSeries.depletion.depleted",
      "scenario.postDeathSeries.depletion.isDepleted",
      "postDeathSeries.depletion.depleted",
      "postDeathSeries.depletion.isDepleted"
    ]);
    const explicitDepletion = firstNumberAtPath(input, [
      "scenario.postDeathSeries.depletion.depletionMonthIndex",
      "scenario.postDeathSeries.depletion.monthsCovered",
      "scenario.timelineFacts.monthsCovered",
      "postDeathSeries.depletion.depletionMonthIndex",
      "postDeathSeries.depletion.monthsCovered"
    ]);
    const pointDepletion = findUnsupportedMonthFromPoints(pointsInfo);
    const depleted = depletionFlag ? depletionFlag.value : Boolean(pointDepletion);
    const unsupportedMonth = depleted
      ? {
        value: roundMonth(explicitDepletion?.value ?? pointDepletion?.value),
        sourcePath: explicitDepletion?.sourcePath || pointDepletion?.sourcePath || depletionFlag?.sourcePath,
        evidenceLevel: explicitDepletion ? EVIDENCE_LEVELS.calculated : (pointDepletion?.evidenceLevel || EVIDENCE_LEVELS.traceBacked)
      }
      : null;

    trace.baselineSupport = {
      baselineIncludesHousing: true,
      housingPaymentPriority: "baseline-with-other-expenses",
      unsupportedMonth: unsupportedMonth ? unsupportedMonth.value : null,
      unsupportedMonthSourcePath: unsupportedMonth ? unsupportedMonth.sourcePath : null,
      modeledHorizonMonth: horizon ? horizon.value : null,
      modeledHorizonSourcePath: horizon ? horizon.sourcePath : null,
      pointsSourcePath: pointsInfo.sourcePath,
      depletionFlagSourcePath: depletionFlag ? depletionFlag.sourcePath : null
    };
    trace.assumptions.push("Housing timing uses the survivor runway baseline, with housing inside the same monthly need/obligation model as expenses and debt.");

    if (unsupportedMonth && unsupportedMonth.value == null) {
      return {
        usable: false,
        reason: "baseline-unsupported-month-unavailable",
        warning: makeWarning(
          "baseline-housing-unsupported-month-unavailable",
          "Housing support could not be evaluated because survivor runway depletion was flagged without a usable depletion month.",
          unsupportedMonth.sourcePath || "postDeathSeries.depletion"
        )
      };
    }

    if (!unsupportedMonth && !horizon) {
      return {
        usable: false,
        reason: "baseline-horizon-unavailable",
        warning: makeWarning(
          "baseline-housing-support-unavailable",
          "Housing support could not be evaluated because no survivor runway depletion or modeled horizon was available.",
          "postDeathSeries"
        )
      };
    }

    return {
      usable: true,
      unsupportedMonth,
      horizon
    };
  }

  function classifyHousingSupport(baselineSupport) {
    if (!baselineSupport || baselineSupport.usable !== true) {
      return null;
    }
    const unsupportedMonth = baselineSupport.unsupportedMonth?.value;
    if (unsupportedMonth == null) {
      return {
        tone: "stable",
        monthOffset: baselineSupport.horizon?.value ?? 0,
        evidenceLevel: baselineSupport.horizon?.evidenceLevel || EVIDENCE_LEVELS.traceBacked,
        timingSourcePath: baselineSupport.horizon?.sourcePath || null
      };
    }
    if (unsupportedMonth <= 12) {
      return {
        tone: "critical",
        monthOffset: unsupportedMonth,
        evidenceLevel: baselineSupport.unsupportedMonth.evidenceLevel,
        timingSourcePath: baselineSupport.unsupportedMonth.sourcePath
      };
    }
    if (unsupportedMonth <= 24) {
      return {
        tone: "at-risk",
        monthOffset: unsupportedMonth,
        evidenceLevel: baselineSupport.unsupportedMonth.evidenceLevel,
        timingSourcePath: baselineSupport.unsupportedMonth.sourcePath
      };
    }
    return {
      tone: "caution",
      monthOffset: unsupportedMonth,
      evidenceLevel: baselineSupport.unsupportedMonth.evidenceLevel,
      timingSourcePath: baselineSupport.unsupportedMonth.sourcePath
    };
  }

  function eventTypeForHousingTone(obligationType, tone) {
    if (obligationType === OBLIGATION_TYPES.mortgage) {
      if (tone === "stable") {
        return EVENT_TYPES.mortgagePaymentStaysCurrent;
      }
      if (tone === "caution") {
        return EVENT_TYPES.mortgagePaymentPressureBegins;
      }
      if (tone === "critical") {
        return EVENT_TYPES.mortgagePaymentBecomesUnsupported;
      }
      return EVENT_TYPES.mortgagePaymentAtRisk;
    }
    if (obligationType === OBLIGATION_TYPES.rent) {
      if (tone === "stable") {
        return EVENT_TYPES.rentPaymentStaysCurrent;
      }
      if (tone === "caution") {
        return EVENT_TYPES.rentPaymentPressureBegins;
      }
      if (tone === "critical") {
        return EVENT_TYPES.rentPaymentBecomesUnsupported;
      }
      return EVENT_TYPES.rentPaymentAtRisk;
    }
    if (tone === "stable") {
      return EVENT_TYPES.housingCostsRemainCovered;
    }
    if (tone === "caution") {
      return EVENT_TYPES.housingCostsBeginPressuringPlan;
    }
    if (tone === "critical") {
      return EVENT_TYPES.housingCostsBecomeUnsupported;
    }
    return EVENT_TYPES.housingStabilityAtRisk;
  }

  function eventLabelForType(eventType) {
    switch (eventType) {
      case EVENT_TYPES.housingCostsRemainCovered:
        return "Housing Costs Remain Covered";
      case EVENT_TYPES.housingCostsBeginPressuringPlan:
        return "Housing Costs Begin Pressuring the Plan";
      case EVENT_TYPES.housingStabilityAtRisk:
        return "Housing Stability Is At Risk";
      case EVENT_TYPES.housingCostsBecomeUnsupported:
        return "Housing Costs Become Unsupported";
      case EVENT_TYPES.mortgagePaymentStaysCurrent:
        return "Mortgage Payment Stays Current";
      case EVENT_TYPES.mortgagePaymentPressureBegins:
        return "Mortgage Payment Pressure Begins";
      case EVENT_TYPES.mortgagePaymentAtRisk:
        return "Mortgage Payment Is At Risk";
      case EVENT_TYPES.mortgagePaymentBecomesUnsupported:
        return "Mortgage Payment Becomes Unsupported";
      case EVENT_TYPES.rentPaymentStaysCurrent:
        return "Rent Payment Stays Current";
      case EVENT_TYPES.rentPaymentPressureBegins:
        return "Rent Payment Pressure Begins";
      case EVENT_TYPES.rentPaymentAtRisk:
        return "Rent Payment Is At Risk";
      case EVENT_TYPES.rentPaymentBecomesUnsupported:
        return "Rent Payment Becomes Unsupported";
      default:
        return "Housing Risk Unknown";
    }
  }

  function makeRiskEvent(config) {
    const safeConfig = isPlainObject(config) ? config : {};
    const obligation = safeConfig.obligation;
    const monthOffset = roundMonth(safeConfig.monthOffset);
    const date = safeConfig.deathDate && monthOffset != null
      ? addMonthsToDateOnly(safeConfig.deathDate, monthOffset)
      : null;
    const amount = roundMoney(safeConfig.amount);
    const eventType = normalizeString(safeConfig.eventType) || EVENT_TYPES.housingRiskUnknown;
    const sourcePath = normalizeString(safeConfig.sourcePath || obligation?.sourcePath);
    const requiredEvidence = eventType === EVENT_TYPES.housingRiskUnknown
      ? false
      : amount != null && amount > 0 && sourcePath && (monthOffset != null || date);
    const safeToRender = safeConfig.safeToRender === true && requiredEvidence;
    return {
      id: normalizeString(safeConfig.id) || `${obligation?.id || "housing"}.${eventType}`,
      family: "housing-risk",
      eventType,
      displayLabel: normalizeString(safeConfig.displayLabel) || eventLabelForType(eventType),
      monthOffset,
      date,
      amount,
      evidenceLevel: normalizeEvidenceLevel(safeConfig.evidenceLevel, EVIDENCE_LEVELS.insufficientData),
      safeToRender,
      sourcePath: sourcePath || null,
      trace: clonePlainValue(safeConfig.trace || {}),
      warnings: compactObjects(safeConfig.warnings).map(clonePlainValue)
    };
  }

  function buildEventsForObligation(obligation, context) {
    if (!obligation.included) {
      return [];
    }
    const events = [];
    const deathDate = context.deathDate;
    const baselineSupport = context.baselineSupport;
    const classification = classifyHousingSupport(baselineSupport);
    const payment = toOptionalNumber(obligation.monthlyPayment);
    if (obligation.treatment === TREATMENTS.payOffMortgage || obligation.treatment === TREATMENTS.paidOff) {
      return events;
    }
    if (payment == null || payment <= 0) {
      return events;
    }
    if (!classification) {
      return events;
    }

    const eventType = eventTypeForHousingTone(obligation.type, classification.tone);
    events.push(makeRiskEvent({
      obligation,
      eventType,
      monthOffset: classification.monthOffset,
      deathDate,
      amount: payment,
      evidenceLevel: classification.evidenceLevel,
      safeToRender: true,
      sourcePath: obligation.sourcePath,
      trace: {
        obligationId: obligation.id,
        treatment: obligation.treatment,
        housingSourceType: obligation.type,
        housingPaymentSourcePath: obligation.sourcePath,
        baselineIncludesHousing: true,
        housingPaymentPriority: "baseline-with-other-expenses",
        unsupportedMonth: baselineSupport.unsupportedMonth?.value ?? null,
        modeledHorizonMonth: baselineSupport.horizon?.value ?? null,
        timingSourcePath: classification.timingSourcePath
      }
    }));
    return events;
  }

  function sortEvents(events) {
    return events.slice().sort(function (left, right) {
      return (left.monthOffset ?? 999999) - (right.monthOffset ?? 999999)
        || (EVENT_PRIORITY[left.eventType] || 999) - (EVENT_PRIORITY[right.eventType] || 999)
        || left.id.localeCompare(right.id);
    });
  }

  function summarizeObligations(obligations, trace) {
    const countsByType = {};
    obligations.forEach(function (obligation) {
      countsByType[obligation.type] = (countsByType[obligation.type] || 0) + 1;
    });
    trace.obligationSourceSummary.totalObligations = obligations.length;
    trace.obligationSourceSummary.includedObligations = obligations.filter(function (obligation) {
      return obligation.included;
    }).length;
    trace.obligationSourceSummary.countsByType = countsByType;
  }

  function buildIncomeImpactHousingRisk(input) {
    const safeInput = isPlainObject(input) ? input : {};
    const warnings = [];
    const trace = {
      source: SOURCE,
      obligationSourceSummary: {},
      assumptions: []
    };

    const obligations = deriveObligations(safeInput, warnings, trace);
    obligations.forEach(function (obligation) {
      obligation.warnings.forEach(function (warning) {
        warnings.push(warning);
      });
    });
    summarizeObligations(obligations, trace);

    const context = {
      deathDate: resolveDeathDate(safeInput),
      baselineSupport: resolveBaselineSupport(safeInput, trace)
    };
    if (context.baselineSupport?.warning) {
      warnings.push(context.baselineSupport.warning);
    }

    const events = sortEvents(obligations.flatMap(function (obligation) {
      return buildEventsForObligation(obligation, context);
    }));

    const forbiddenPattern = /\b(foreclosure|eviction|bankruptcy|credit crisis|forced (home )?sale)\b/i;
    const safeEvents = events.filter(function (event) {
      return !forbiddenPattern.test(event.displayLabel) && !forbiddenPattern.test(event.eventType);
    });

    return {
      version: VERSION,
      obligations,
      riskEvents: safeEvents,
      timelineEvents: safeEvents,
      warnings,
      trace
    };
  }

  lensAnalysis.buildIncomeImpactHousingRisk = buildIncomeImpactHousingRisk;
  lensAnalysis.incomeImpactHousingRiskEvidenceLevels = EVIDENCE_LEVELS;
  lensAnalysis.incomeImpactHousingRiskEventTypes = EVENT_TYPES;
  lensAnalysis.incomeImpactHousingRiskObligationTypes = OBLIGATION_TYPES;

  if (typeof module !== "undefined" && module.exports) {
    module.exports = {
      buildIncomeImpactHousingRisk,
      INCOME_IMPACT_HOUSING_RISK_VERSION: VERSION,
      INCOME_IMPACT_HOUSING_RISK_SOURCE: SOURCE,
      INCOME_IMPACT_HOUSING_RISK_EVIDENCE_LEVELS: EVIDENCE_LEVELS,
      INCOME_IMPACT_HOUSING_RISK_EVENT_TYPES: EVENT_TYPES,
      INCOME_IMPACT_HOUSING_RISK_OBLIGATION_TYPES: OBLIGATION_TYPES,
      INCOME_IMPACT_HOUSING_RISK_TREATMENTS: TREATMENTS
    };
  }
})(typeof window !== "undefined" ? window : globalThis);
