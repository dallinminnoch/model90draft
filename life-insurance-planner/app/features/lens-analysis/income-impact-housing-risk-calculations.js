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
    housingPaymentPressureBegins: "housing-payment-pressure-begins",
    housingPaymentAtRisk: "housing-payment-at-risk",
    housingStabilityAtRisk: "housing-stability-at-risk",
    mortgagePaymentsContinue: "mortgage-payments-continue",
    mortgagePaidOff: "mortgage-paid-off",
    rentPaymentPressureBegins: "rent-payment-pressure-begins",
    housingRiskUnknown: "housing-risk-unknown"
  });

  const EVENT_PRIORITY = Object.freeze({
    [EVENT_TYPES.mortgagePaidOff]: 5,
    [EVENT_TYPES.mortgagePaymentsContinue]: 10,
    [EVENT_TYPES.housingPaymentPressureBegins]: 20,
    [EVENT_TYPES.rentPaymentPressureBegins]: 20,
    [EVENT_TYPES.housingPaymentAtRisk]: 30,
    [EVENT_TYPES.housingStabilityAtRisk]: 40,
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
      "missing-housing-obligations",
      "No explicit housing obligations or clear scheduled housing support facts were available.",
      "housingObligations"
    ));
    return [];
  }

  function resolveMonthlyShortfall(input, trace) {
    const explicit = firstNumberAtPath(input, [
      "options.monthlyShortfall",
      "financialRunway.monthlyShortfall",
      "scenario.postDeathSeries.summary.monthlyShortfall",
      "scenario.postDeathSeries.layer3.summary.monthlyShortfall"
    ]);
    if (explicit) {
      trace.assumptions.push("Monthly shortfall was read from an explicit shortfall field.");
      return {
        value: explicit.value,
        evidenceLevel: EVIDENCE_LEVELS.calculated,
        sourcePath: explicit.sourcePath
      };
    }

    const annual = firstNumberAtPath(input, [
      "options.annualShortfall",
      "financialRunway.annualShortfall",
      "scenario.postDeathSeries.summary.annualShortfall",
      "scenario.postDeathSeries.layer3.summary.annualShortfall",
      "scenario.timelineFacts.annualShortfall"
    ]);
    if (annual) {
      trace.assumptions.push("Monthly shortfall was derived from annual shortfall divided by 12.");
      return {
        value: annual.value / 12,
        evidenceLevel: EVIDENCE_LEVELS.calculated,
        sourcePath: annual.sourcePath
      };
    }

    const points = Array.isArray(input?.postDeathSeries?.points)
      ? input.postDeathSeries.points
      : (Array.isArray(input?.scenario?.postDeathSeries?.points) ? input.scenario.postDeathSeries.points : []);
    const point = points.find(function (item) {
      return toOptionalNumber(item?.netUse) != null && toOptionalNumber(item.netUse) > 0;
    });
    if (point) {
      trace.assumptions.push("Monthly shortfall was estimated from the first positive post-death netUse point.");
      return {
        value: toOptionalNumber(point.netUse),
        evidenceLevel: EVIDENCE_LEVELS.estimated,
        sourcePath: "postDeathSeries.points.netUse"
      };
    }
    return null;
  }

  function resolveDepletionMonth(input, trace) {
    const depletion = firstNumberAtPath(input, [
      "options.depletionMonthOffset",
      "financialRunway.totalMonthsOfSecurity",
      "scenario.timelineFacts.monthsCovered",
      "scenario.postDeathSeries.depletion.depletionMonthIndex",
      "scenario.postDeathSeries.depletion.monthsCovered",
      "postDeathSeries.depletion.depletionMonthIndex",
      "postDeathSeries.depletion.monthsCovered"
    ]);
    if (!depletion) {
      return null;
    }
    trace.assumptions.push("Housing risk timing used the survivor runway depletion month.");
    return {
      value: depletion.value,
      evidenceLevel: EVIDENCE_LEVELS.calculated,
      sourcePath: depletion.sourcePath
    };
  }

  function eventLabelForType(eventType) {
    switch (eventType) {
      case EVENT_TYPES.mortgagePaidOff:
        return "Mortgage Is Paid Off";
      case EVENT_TYPES.mortgagePaymentsContinue:
        return "Mortgage Payments Continue";
      case EVENT_TYPES.housingPaymentPressureBegins:
        return "Housing Payment Pressure Begins";
      case EVENT_TYPES.housingPaymentAtRisk:
        return "Housing Payment At Risk";
      case EVENT_TYPES.housingStabilityAtRisk:
        return "Housing Stability At Risk";
      case EVENT_TYPES.rentPaymentPressureBegins:
        return "Rent Payment Pressure Begins";
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

  function makeUnknownEvent(obligation, reason, deathDate) {
    return makeRiskEvent({
      obligation,
      eventType: EVENT_TYPES.housingRiskUnknown,
      displayLabel: "Housing Risk Unknown",
      monthOffset: 0,
      deathDate,
      amount: obligation?.monthlyPayment,
      evidenceLevel: EVIDENCE_LEVELS.dataGap,
      safeToRender: false,
      sourcePath: obligation?.sourcePath,
      warnings: [makeWarning("housing-risk-data-gap", reason, obligation?.sourcePath)]
    });
  }

  function buildEventsForObligation(obligation, context) {
    if (!obligation.included) {
      return [];
    }
    const events = [];
    const deathDate = context.deathDate;
    const shortfall = context.shortfall;
    const depletion = context.depletion;
    const isMortgage = obligation.type === OBLIGATION_TYPES.mortgage;
    const isRent = obligation.type === OBLIGATION_TYPES.rent;
    const payment = toOptionalNumber(obligation.monthlyPayment);
    const balance = toOptionalNumber(obligation.balance);

    if (isMortgage && obligation.treatment === TREATMENTS.payOffMortgage) {
      if (balance != null && balance > 0) {
        events.push(makeRiskEvent({
          obligation,
          eventType: EVENT_TYPES.mortgagePaidOff,
          monthOffset: 0,
          deathDate,
          amount: balance,
          evidenceLevel: obligation.evidenceLevel,
          safeToRender: true,
          sourcePath: obligation.sourcePath,
          trace: {
            obligationId: obligation.id,
            treatment: obligation.treatment
          }
        }));
      } else {
        events.push(makeUnknownEvent(obligation, "Mortgage payoff treatment was present without a payoff balance.", deathDate));
      }
      return events;
    }

    if (payment == null || payment <= 0) {
      events.push(makeUnknownEvent(obligation, "Housing payment is missing, so payment risk timing cannot be rendered safely.", deathDate));
      return events;
    }

    if (isMortgage && (
      obligation.treatment === TREATMENTS.continuePayments
        || obligation.treatment === TREATMENTS.support
    )) {
      events.push(makeRiskEvent({
        obligation,
        eventType: EVENT_TYPES.mortgagePaymentsContinue,
        monthOffset: 0,
        deathDate,
        amount: payment,
        evidenceLevel: obligation.evidenceLevel,
        safeToRender: true,
        sourcePath: obligation.sourcePath,
        trace: {
          obligationId: obligation.id,
          treatment: obligation.treatment
        }
      }));
    }

    if (shortfall && shortfall.value > 0) {
      events.push(makeRiskEvent({
        obligation,
        eventType: isRent ? EVENT_TYPES.rentPaymentPressureBegins : EVENT_TYPES.housingPaymentPressureBegins,
        monthOffset: 1,
        deathDate,
        amount: payment,
        evidenceLevel: shortfall.evidenceLevel,
        safeToRender: true,
        sourcePath: obligation.sourcePath,
        trace: {
          obligationId: obligation.id,
          shortfallSourcePath: shortfall.sourcePath,
          monthlyShortfall: roundMoney(shortfall.value)
        }
      }));
    }

    if (
      depletion
      && depletion.value != null
      && depletion.value >= 0
      && obligation.remainingMonths != null
      && obligation.remainingMonths > depletion.value
    ) {
      events.push(makeRiskEvent({
        obligation,
        eventType: EVENT_TYPES.housingPaymentAtRisk,
        monthOffset: depletion.value,
        deathDate,
        amount: payment,
        evidenceLevel: depletion.evidenceLevel,
        safeToRender: true,
        sourcePath: obligation.sourcePath,
        trace: {
          obligationId: obligation.id,
          depletionSourcePath: depletion.sourcePath,
          remainingMonths: obligation.remainingMonths
        }
      }));
      events.push(makeRiskEvent({
        obligation,
        eventType: EVENT_TYPES.housingStabilityAtRisk,
        monthOffset: depletion.value,
        deathDate,
        amount: payment,
        evidenceLevel: depletion.evidenceLevel,
        safeToRender: true,
        sourcePath: obligation.sourcePath,
        trace: {
          obligationId: obligation.id,
          depletionSourcePath: depletion.sourcePath,
          remainingMonths: obligation.remainingMonths
        }
      }));
    }

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
      shortfall: resolveMonthlyShortfall(safeInput, trace),
      depletion: resolveDepletionMonth(safeInput, trace)
    };

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
