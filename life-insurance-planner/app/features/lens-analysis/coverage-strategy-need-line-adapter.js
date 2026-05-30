(function (global) {
  const root = global.LensApp || (global.LensApp = {});
  const lensAnalysis = root.lensAnalysis || (root.lensAnalysis = {});

  // Owner: Lens analysis Coverage Strategy data adapters.
  // Purpose: convert a completed Needs/LENS result plus prepared Lens model
  // facts into annual gross need points for the future Coverage Strategy board.
  // Non-goals: no DOM, storage, graph rendering, resource offsets, existing
  // coverage offsets, policy-layer math, AI, or method formula changes.
  const COVERAGE_STRATEGY_NEED_LINE_ADAPTER_VERSION = "coverage-strategy-need-line-adapter-v1";
  const DEFAULT_HORIZON_YEARS = 30;
  const DEFAULT_VALUATION_MONTH_DAY = "01-01";
  const DEFAULT_FINAL_EXPENSE_TIMING = "death-year-obligation";
  const DEFAULT_TRANSITION_TIMING = "death-year-obligation";

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

    const normalized = String(value)
      .replace(/[$,%\s,]/g, "")
      .trim();
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
    return Number.isFinite(value) ? Number(value.toFixed(6)) : 0;
  }

  function createIssue(code, message, details) {
    return {
      code,
      message,
      details: isPlainObject(details) ? clonePlainValue(details) : {}
    };
  }

  function addUniqueIssue(target, code, message, details) {
    if (!Array.isArray(target)) {
      return null;
    }
    const existing = target.find(function (issue) {
      return issue && issue.code === code;
    });
    if (existing) {
      return existing;
    }
    const issue = createIssue(code, message, details);
    target.push(issue);
    return issue;
  }

  function getPath(source, path) {
    const parts = normalizeString(path).split(".").filter(Boolean);
    let current = source;
    for (let index = 0; index < parts.length; index += 1) {
      if (!isPlainObject(current) && !Array.isArray(current)) {
        return undefined;
      }
      current = current[parts[index]];
    }
    return current;
  }

  function normalizeMortgageProjectionMode(value) {
    const raw = normalizeString(value);
    const key = raw.toLowerCase().replace(/[\s_-]/g, "");
    if (!key) {
      return "";
    }
    if (
      key === "payoff"
      || key === "payoffmortgage"
      || key === "payoffprimarymortgage"
      || key === "payoffprimaryresidencemortgage"
    ) {
      return "payOff";
    }
    if (
      key === "support"
      || key === "continuepayment"
      || key === "continuepayments"
      || key === "continuemortgagepayment"
      || key === "continuemortgagepayments"
    ) {
      return "continuePayments";
    }
    if (key === "unavailable") {
      return "unavailable";
    }
    return "unavailable";
  }

  function hasReliableMortgageProjectionFacts(facts) {
    const safeFacts = isPlainObject(facts) ? facts : {};
    const currentBalance = toOptionalNumber(safeFacts.currentBalance);
    const currentPayoffAmount = toOptionalNumber(safeFacts.currentPayoffAmount);
    const monthlyPayment = toOptionalNumber(safeFacts.monthlyPayment);
    const remainingTermMonths = toOptionalNumber(safeFacts.remainingTermMonths);
    const annualInterestRate = toOptionalNumber(safeFacts.annualInterestRate);
    return Boolean(
      currentBalance != null
      && currentBalance > 0
      && currentPayoffAmount != null
      && currentPayoffAmount > 0
      && monthlyPayment != null
      && monthlyPayment > 0
      && remainingTermMonths != null
      && remainingTermMonths > 0
      && annualInterestRate != null
      && annualInterestRate >= 0
    );
  }

  function resolveEffectiveMortgagePayoffPercent(mortgagePlan, normalizedMode, originalBalance, explicitMortgageAmount) {
    const rawPayoffPercent = toOptionalNumber(mortgagePlan?.rawPayoffPercent)
      ?? toOptionalNumber(mortgagePlan?.trace?.calculationInputs?.rawPayoffPercent)
      ?? toOptionalNumber(mortgagePlan?.trace?.calculationInputs?.payoffPercent)
      ?? toOptionalNumber(mortgagePlan?.payoffPercent);
    const planEffectivePayoffPercent = toOptionalNumber(mortgagePlan?.effectivePayoffPercent)
      ?? toOptionalNumber(mortgagePlan?.trace?.calculationInputs?.effectivePayoffPercent);
    const inferredPayoffPercent = originalBalance && originalBalance > 0 && explicitMortgageAmount != null
      ? (explicitMortgageAmount / originalBalance) * 100
      : null;

    if (normalizedMode === "payOff") {
      return {
        rawPayoffPercent,
        effectivePayoffPercent: 100,
        partialPayoffAllowed: false,
        invariantCorrectionApplied: rawPayoffPercent != null && rawPayoffPercent !== 100,
        correctionCode: rawPayoffPercent != null && rawPayoffPercent !== 100
          ? "payoff-mode-forced-full-payoff"
          : null
      };
    }

    const candidate = planEffectivePayoffPercent ?? rawPayoffPercent ?? inferredPayoffPercent;
    const effectivePayoffPercent = candidate == null
      ? null
      : Math.min(100, Math.max(0, candidate));
    return {
      rawPayoffPercent,
      effectivePayoffPercent,
      partialPayoffAllowed: normalizedMode === "continuePayments",
      invariantCorrectionApplied: mortgagePlan?.invariantCorrectionApplied === true,
      correctionCode: mortgagePlan?.correctionCode || null
    };
  }

  function resolveMortgageProjectionDecision(normalizedMode, rawMode, facts) {
    const reliableFactsAvailable = hasReliableMortgageProjectionFacts(facts);
    if (normalizedMode === "payOff") {
      return {
        decision: "used",
        reason: "payoff-mode",
        reliableFactsAvailable
      };
    }
    if (normalizedMode === "continuePayments") {
      return {
        decision: "skipped-by-support-mode",
        reason: "support-or-continue-payments-mode",
        reliableFactsAvailable
      };
    }
    if (reliableFactsAvailable) {
      return {
        decision: "used-payoff-facts-override-unavailable-mode",
        reason: "unavailable-mode-with-reliable-payoff-facts",
        reliableFactsAvailable
      };
    }
    return {
      decision: "skipped-missing-facts",
      reason: normalizeString(rawMode) || "mortgage-mode-missing-or-unavailable",
      reliableFactsAvailable
    };
  }

  function findTraceRow(needsResult, key) {
    const trace = Array.isArray(needsResult?.trace) ? needsResult.trace : [];
    return trace.find(function (row) {
      return row && row.key === key;
    }) || null;
  }

  function normalizeDateOnly(value) {
    const raw = normalizeString(value);
    const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
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
      normalizedDate: raw,
      calendarYear: year
    };
  }

  function addYears(dateResult, years) {
    if (!dateResult || !(dateResult.date instanceof Date)) {
      return null;
    }
    const target = new Date(dateResult.date.getTime());
    target.setUTCFullYear(target.getUTCFullYear() + years);
    return [
      String(target.getUTCFullYear()).padStart(4, "0"),
      String(target.getUTCMonth() + 1).padStart(2, "0"),
      String(target.getUTCDate()).padStart(2, "0")
    ].join("-");
  }

  function buildAnnualPointSpine(valuationDateResult, currentAgeResult, horizonYears) {
    const safeHorizonYears = Math.max(0, Math.round(toOptionalNumber(horizonYears) || 0));
    return Array.from({ length: safeHorizonYears + 1 }, function (_unused, yearIndex) {
      const date = valuationDateResult
        ? addYears(valuationDateResult, yearIndex)
        : null;
      const calendarYear = date
        ? toOptionalNumber(date.slice(0, 4))
        : null;
      const age = currentAgeResult?.currentAge == null
        ? null
        : currentAgeResult.currentAge + yearIndex;
      return {
        yearIndex,
        date,
        calendarYear,
        age
      };
    });
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
    return age;
  }

  function normalizeRatePercent(value) {
    const parsed = toOptionalNumber(value);
    if (parsed == null) {
      return null;
    }
    return Math.max(-100, parsed) / 100;
  }

  function buildCurrentDollarAnnualValues(amount, durationYears) {
    const safeAmount = Math.max(0, toOptionalNumber(amount) || 0);
    const safeDuration = Math.max(0, toOptionalNumber(durationYears) || 0);
    const fullYears = Math.floor(safeDuration);
    const partialYear = safeDuration - fullYears;
    const values = [];

    for (let year = 1; year <= fullYears; year += 1) {
      values.push({
        year,
        yearFraction: 1,
        inflationFactor: 1,
        annualizedAmount: safeAmount,
        amount: safeAmount
      });
    }

    if (partialYear > 0) {
      values.push({
        year: fullYears + 1,
        yearFraction: partialYear,
        inflationFactor: 1,
        annualizedAmount: safeAmount,
        amount: safeAmount * partialYear
      });
    }

    return values;
  }

  function buildInflatedAnnualValues(amount, durationYears, ratePercent, applied) {
    const annualValues = buildCurrentDollarAnnualValues(amount, durationYears);
    const rateDecimal = normalizeRatePercent(ratePercent);
    if (applied !== true || rateDecimal == null || rateDecimal === 0) {
      return annualValues;
    }

    return annualValues.map(function (entry, index) {
      const factor = Math.pow(1 + rateDecimal, index + 1);
      return {
        ...entry,
        inflationFactor: roundRatio(factor),
        annualizedAmount: roundMoney(entry.annualizedAmount * factor),
        amount: roundMoney(entry.amount * factor)
      };
    });
  }

  function scaleAnnualValuesToTotal(annualValues, targetTotal) {
    const safeValues = Array.isArray(annualValues) ? annualValues : [];
    const total = safeValues.reduce(function (sum, entry) {
      return sum + Math.max(0, toOptionalNumber(entry?.amount) || 0);
    }, 0);
    const safeTarget = toOptionalNumber(targetTotal);
    if (!(total > 0) || safeTarget == null || safeTarget < 0) {
      return safeValues;
    }
    const scale = safeTarget / total;
    return safeValues.map(function (entry) {
      return {
        ...entry,
        amount: roundMoney(Math.max(0, (toOptionalNumber(entry?.amount) || 0) * scale)),
        annualizedAmount: roundMoney(Math.max(0, (toOptionalNumber(entry?.annualizedAmount) || 0) * scale)),
        scaleApplied: roundRatio(scale)
      };
    });
  }

  function sumRemainingAnnualValues(annualValues, yearIndex) {
    const safeYearIndex = Math.max(0, Math.round(toOptionalNumber(yearIndex) || 0));
    const safeValues = Array.isArray(annualValues) ? annualValues : [];
    return roundMoney(
      safeValues.reduce(function (sum, entry, index) {
        if (index < safeYearIndex) {
          return sum;
        }
        return sum + Math.max(0, toOptionalNumber(entry?.amount) || 0);
      }, 0)
    );
  }

  function resolveValuationDate(input, needsResult, analysisSettings, warnings, dataGaps) {
    const direct = normalizeString(input?.valuationDate);
    const resultDate = normalizeString(needsResult?.assumptions?.valuationDate);
    const settingsDate = normalizeString(analysisSettings?.valuationDate);
    const raw = direct || resultDate || settingsDate;
    const parsed = normalizeDateOnly(raw);
    if (parsed) {
      return parsed;
    }

    addUniqueIssue(
      dataGaps,
      "missing-valuation-date",
      "A valid valuationDate is required for dated Coverage Strategy need points.",
      { valuationDate: raw || null }
    );
    addUniqueIssue(
      warnings,
      "valuation-date-defaulted-for-structure",
      "valuationDate was missing or invalid; dates were emitted as null where exact dates could not be derived.",
      { valuationDate: raw || null }
    );
    return null;
  }

  function resolveCurrentAge(input, lensModel, valuationDateResult, warnings, dataGaps) {
    const directAge = toOptionalNumber(input?.client?.currentAge);
    if (directAge != null && directAge >= 0) {
      return {
        currentAge: directAge,
        source: "input.client.currentAge",
        dateOfBirth: normalizeString(input?.client?.dateOfBirth || getPath(lensModel, "profileFacts.clientDateOfBirth")) || null
      };
    }

    const dateOfBirth = normalizeString(input?.client?.dateOfBirth || getPath(lensModel, "profileFacts.clientDateOfBirth"));
    const valuationDate = valuationDateResult?.normalizedDate || null;
    const age = calculateAge(dateOfBirth, valuationDate);
    if (age != null) {
      return {
        currentAge: age,
        source: "profileFacts.clientDateOfBirth",
        dateOfBirth
      };
    }

    addUniqueIssue(
      dataGaps,
      "missing-client-age",
      "Client age could not be derived from currentAge or a valid date of birth.",
      {
        currentAge: directAge,
        dateOfBirth: dateOfBirth || null,
        valuationDate
      }
    );
    return {
      currentAge: null,
      source: "missing",
      dateOfBirth: dateOfBirth || null
    };
  }

  function resolveSupportDuration(needsResult, analysisSettings) {
    return toOptionalNumber(needsResult?.assumptions?.needsSupportDurationYears)
      ?? toOptionalNumber(analysisSettings?.needsSupportDurationYears)
      ?? null;
  }

  function resolveTraceInput(traceRow, fieldName) {
    if (!isPlainObject(traceRow?.inputs)) {
      return null;
    }
    return toOptionalNumber(traceRow.inputs[fieldName]);
  }

  function resolveGrossSupportModel(needsResult, analysisSettings, warnings, dataGaps) {
    const supportRow = findTraceRow(needsResult, "essentialSupport");
    const supportInflationRow = findTraceRow(needsResult, "essentialSupportInflation");
    const assumptions = isPlainObject(needsResult?.assumptions) ? needsResult.assumptions : {};
    const supportInputs = isPlainObject(supportRow?.inputs) ? supportRow.inputs : {};
    const inflationInputs = isPlainObject(supportInflationRow?.inputs)
      ? supportInflationRow.inputs
      : (isPlainObject(supportInputs.inflation) ? supportInputs.inflation : {});
    const supportDurationYears = resolveSupportDuration(needsResult, analysisSettings);
    const adjustedSupportTotal = toOptionalNumber(needsResult?.components?.essentialSupport)
      ?? toOptionalNumber(supportRow?.value)
      ?? null;
    const explicitGrossSupport = toOptionalNumber(supportInputs.essentialSupportPreExclusionAmount)
      ?? toOptionalNumber(supportInputs.grossSupportNeed)
      ?? toOptionalNumber(inflationInputs.projectedTotal)
      ?? null;
    const survivorIncomeOffset = toOptionalNumber(needsResult?.commonOffsets?.survivorIncomeOffset)
      ?? resolveTraceInput(findTraceRow(needsResult, "survivorIncomeOffset"), "survivorIncomeOffset")
      ?? null;
    let grossSupportTotal = explicitGrossSupport;
    let reconstructionStatus = "explicit-gross-support";

    if (grossSupportTotal == null && adjustedSupportTotal != null && survivorIncomeOffset != null) {
      grossSupportTotal = adjustedSupportTotal + survivorIncomeOffset;
      reconstructionStatus = "reconstructed-from-adjusted-plus-survivor-offset";
    }

    if (grossSupportTotal == null && adjustedSupportTotal != null) {
      grossSupportTotal = adjustedSupportTotal;
      reconstructionStatus = "adjusted-support-fallback";
      addUniqueIssue(
        dataGaps,
        "gross-support-unavailable-adjusted-support-used",
        "Gross support before survivor income could not be reconstructed; adjusted support was used only with an explicit data gap.",
        {
          adjustedSupportTotal,
          survivorIncomeOffset
        }
      );
    }

    if (grossSupportTotal == null) {
      addUniqueIssue(
        dataGaps,
        "missing-essential-support-gross-amount",
        "Essential support gross amount was missing and could not be reconstructed.",
        {}
      );
      grossSupportTotal = 0;
      reconstructionStatus = "missing-default-zero";
    }

    const annualBase = toOptionalNumber(inflationInputs.baseAnnualAmount)
      ?? toOptionalNumber(supportInputs.annualTotalEssentialSupportCost)
      ?? (supportDurationYears && supportDurationYears > 0 ? grossSupportTotal / supportDurationYears : null);

    if (!(supportDurationYears > 0)) {
      addUniqueIssue(
        dataGaps,
        "missing-support-duration",
        "Support duration was missing or invalid; essential support was not projected beyond available aggregate values.",
        { supportDurationYears }
      );
    }

    if (!(annualBase > 0) && grossSupportTotal > 0) {
      addUniqueIssue(
        dataGaps,
        "missing-support-annual-basis",
        "Gross support exists but no reliable annual support basis was available for an annual need curve.",
        { grossSupportTotal }
      );
    }

    const annualValues = annualBase == null || !(supportDurationYears > 0)
      ? []
      : scaleAnnualValuesToTotal(
          buildInflatedAnnualValues(
            annualBase,
            supportDurationYears,
            inflationInputs.ratePercent,
            inflationInputs.inflationApplied ?? inflationInputs.applied
          ),
          grossSupportTotal
        );
    const adjustedAnnualValues = adjustedSupportTotal == null || !(supportDurationYears > 0) || !annualValues.length
      ? []
      : scaleAnnualValuesToTotal(annualValues, adjustedSupportTotal);

    return {
      componentKey: "essentialSupport",
      grossSupportTotal: roundMoney(grossSupportTotal),
      adjustedSupportTotal: adjustedSupportTotal == null ? null : roundMoney(Math.max(0, adjustedSupportTotal)),
      survivorIncomeOffset: survivorIncomeOffset == null ? 0 : roundMoney(Math.max(0, survivorIncomeOffset)),
      supportDurationYears: supportDurationYears == null ? null : supportDurationYears,
      annualBase: annualBase == null ? null : roundMoney(Math.max(0, annualBase)),
      annualValues,
      adjustedAnnualValues,
      reconstructionStatus,
      survivorIncomeAppliedInsideNeeds: assumptions.survivorIncomeAppliedInsideSupport === true,
      trace: {
        source: "needsResult.trace.essentialSupport",
        supportRowKey: supportRow?.key || null,
        supportInflationRowKey: supportInflationRow?.key || null,
        includeSurvivorIncomeOffset: assumptions.includeSurvivorIncomeOffset === true,
        survivorIncomeOffsetPreservedOnly: true,
        sourcePaths: Array.isArray(supportRow?.sourcePaths) ? supportRow.sourcePaths.slice() : []
      }
    };
  }

  function getMortgageAdjustedSupportSourcePath(supportModel) {
    const sourcePaths = Array.isArray(supportModel?.trace?.sourcePaths)
      ? supportModel.trace.sourcePaths
      : [];
    return sourcePaths.find(function (sourcePath) {
      return normalizeString(sourcePath).indexOf("treatedOngoingSupport.mortgageAdjusted.") >= 0;
    }) || null;
  }

  function resolveMortgageSupportOwnershipModel(supportModel, debtModel, dataGaps) {
    const mortgageComponentOwnsPaymentSupport = debtModel?.mortgageTiming === "time-bounded-payment-stream"
      && Array.isArray(debtModel?.mortgageAnnualValues)
      && debtModel.mortgageAnnualValues.length > 0;
    const mortgageComponentOwnsImmediatePayoff = Boolean(
      (debtModel?.mortgageImmediatePayoffAmount || 0) > 0
      || (
        (
          debtModel?.trace?.normalizedMortgageMode === "payOff"
          || debtModel?.trace?.mortgageProjectionDecision === "used-payoff-facts-override-unavailable-mode"
        )
        && (debtModel?.mortgageAmount || 0) > 0
      )
    );
    const mortgageOwnedSupportActive = mortgageComponentOwnsPaymentSupport;
    const mortgagePaymentAlreadyInNeeds = debtModel?.trace?.mortgagePaymentAlreadyInNeeds === true;
    const mortgagePaymentAlreadyInNeedsSource = debtModel?.trace?.mortgagePaymentAlreadyInNeedsSource || null;
    const sourcePath = getMortgageAdjustedSupportSourcePath(supportModel);
    const supportHasPositiveAmount = (supportModel?.grossSupportTotal || 0) > 0
      || (supportModel?.adjustedSupportTotal || 0) > 0
      || (Array.isArray(supportModel?.annualValues) && supportModel.annualValues.length > 0);
    const essentialSupportIncludedMortgageSupport = Boolean(
      supportHasPositiveAmount
      && (
        (mortgageComponentOwnsPaymentSupport && (sourcePath || mortgagePaymentAlreadyInNeeds))
        || mortgagePaymentAlreadyInNeeds
      )
    );
    const adjustmentBasis = sourcePath
      ? "treated-ongoing-support-mortgage-adjusted-source"
      : (mortgageComponentOwnsPaymentSupport && mortgagePaymentAlreadyInNeeds
        ? "treated-mortgage-payment-plan-mortgage-payment-already-in-needs"
        : "not-applied");

    if (essentialSupportIncludedMortgageSupport && !mortgageComponentOwnsPaymentSupport) {
      addUniqueIssue(
        dataGaps,
        "mortgage-support-ownership-payoff-mode-embedded-support-unadjusted",
        "Mortgage payment support appears embedded in Needs while Payoff Mortgage owns the immediate payoff; Coverage Strategy did not guess a safe essential support subtraction without a mortgage-owned payment stream.",
        {
          mortgageSupportOwnership: mortgageComponentOwnsImmediatePayoff ? "mortgage-component" : "not-active",
          mortgagePaymentAlreadyInNeeds,
          mortgagePaymentAlreadyInNeedsSource,
          originalMonthlyMortgagePayment: debtModel?.trace?.originalMonthlyMortgagePayment ?? null,
          finalMonthlyMortgagePayment: debtModel?.trace?.finalMonthlyMortgagePayment ?? null,
          effectiveMortgageMode: debtModel?.trace?.normalizedMortgageMode || null,
          effectivePayoffPercent: debtModel?.trace?.effectivePayoffPercent ?? null,
          mortgageImmediatePayoffAmount: debtModel?.mortgageImmediatePayoffAmount || 0,
          sourcePath
        }
      );
    } else if (mortgageOwnedSupportActive && supportHasPositiveAmount && !essentialSupportIncludedMortgageSupport) {
      addUniqueIssue(
        dataGaps,
        "mortgage-support-ownership-essential-support-source-unproven",
        "Mortgage support was owned by the mortgage component, but essential support source paths did not prove whether mortgage support was embedded; no essential support subtraction was guessed.",
        {
          mortgageSupportOwnership: "mortgage-component",
          sourcePaths: Array.isArray(supportModel?.trace?.sourcePaths)
            ? supportModel.trace.sourcePaths.slice()
            : [],
          mortgageTiming: debtModel?.mortgageTiming || null
        }
      );
    }

    return {
      mortgageSupportOwnership: mortgageComponentOwnsImmediatePayoff || mortgageComponentOwnsPaymentSupport
        ? "mortgage-component"
        : "not-active",
      mortgageOwnedSupportActive,
      mortgageComponentOwnsImmediatePayoff,
      mortgageComponentOwnsPaymentSupport,
      mortgagePaymentAlreadyInNeeds,
      mortgagePaymentAlreadyInNeedsSource,
      originalMonthlyMortgagePayment: debtModel?.trace?.originalMonthlyMortgagePayment ?? null,
      finalMonthlyMortgagePayment: debtModel?.trace?.finalMonthlyMortgagePayment ?? null,
      effectiveMortgageMode: debtModel?.trace?.normalizedMortgageMode || null,
      effectivePayoffPercent: debtModel?.trace?.effectivePayoffPercent ?? null,
      mortgageImmediatePayoffAmount: debtModel?.mortgageImmediatePayoffAmount || 0,
      essentialSupportIncludedMortgageSupport,
      essentialSupportMortgageAdjustmentApplied: false,
      mortgageSupportAmountRemovedFromEssentialSupport: 0,
      mortgageSupportAmountOwnedByMortgageComponent: 0,
      adjustmentBasis,
      sourcePath,
      noDoubleCountProof: false,
      noDoubleCountProofStatus: "unproven",
      dataGapCode: essentialSupportIncludedMortgageSupport && !mortgageComponentOwnsPaymentSupport
        ? "mortgage-support-ownership-payoff-mode-embedded-support-unadjusted"
        : (mortgageOwnedSupportActive && supportHasPositiveAmount && !essentialSupportIncludedMortgageSupport
          ? "mortgage-support-ownership-essential-support-source-unproven"
          : null),
      traceVersion: "mortgage-support-ownership-v1"
    };
  }

  function resolveMortgageSupportOwnershipForPoint(ownershipModel, pointInput) {
    const rawEssentialSupport = Math.max(0, toOptionalNumber(pointInput?.rawEssentialSupport) || 0);
    const rawAdjustedSupportNeed = Math.max(0, toOptionalNumber(pointInput?.rawAdjustedSupportNeed) || 0);
    const mortgageOwnedSupportAmount = Math.max(0, toOptionalNumber(pointInput?.mortgageOwnedSupportAmount) || 0);
    const ownershipProofRelevant = Boolean(
      rawEssentialSupport > 0
      || rawAdjustedSupportNeed > 0
      || mortgageOwnedSupportAmount > 0
      || (ownershipModel?.mortgageComponentOwnsImmediatePayoff && pointInput?.yearIndex === 0)
    );
    const adjustmentApplied = Boolean(
      ownershipModel?.mortgageComponentOwnsPaymentSupport
      && ownershipModel?.essentialSupportIncludedMortgageSupport
      && mortgageOwnedSupportAmount > 0
    );
    const removedAmount = adjustmentApplied
      ? roundMoney(Math.min(rawEssentialSupport, mortgageOwnedSupportAmount))
      : 0;
    const adjustedRemovedAmount = adjustmentApplied
      ? roundMoney(Math.min(rawAdjustedSupportNeed, mortgageOwnedSupportAmount))
      : 0;
    const essentialSupport = roundMoney(Math.max(0, rawEssentialSupport - removedAmount));
    const adjustedSupportNeed = roundMoney(Math.max(0, rawAdjustedSupportNeed - adjustedRemovedAmount));
    const noDoubleCountProof = ownershipProofRelevant
      ? (adjustmentApplied
        ? removedAmount === mortgageOwnedSupportAmount
        : !ownershipModel?.essentialSupportIncludedMortgageSupport)
      : false;
    const noDoubleCountProofStatus = ownershipProofRelevant
      ? (noDoubleCountProof ? "complete" : "unproven")
      : "not-applicable";

    return {
      essentialSupport,
      adjustedSupportNeed,
      trace: {
        ...clonePlainValue(ownershipModel || {}),
        yearIndex: pointInput?.yearIndex ?? null,
        mortgageSupportAmountOwnedByMortgageComponent: mortgageOwnedSupportAmount,
        mortgageSupportAmountRemovedFromEssentialSupport: removedAmount,
        essentialSupportMortgageAdjustmentApplied: adjustmentApplied,
        essentialSupportBeforeMortgageOwnershipAdjustment: rawEssentialSupport,
        essentialSupportAfterMortgageOwnershipAdjustment: essentialSupport,
        adjustedSupportBeforeMortgageOwnershipAdjustment: rawAdjustedSupportNeed,
        adjustedSupportAfterMortgageOwnershipAdjustment: adjustedSupportNeed,
        dataGapCode: ownershipProofRelevant ? ownershipModel?.dataGapCode || null : null,
        ownershipProofRelevant,
        noDoubleCountProof,
        noDoubleCountProofStatus
      }
    };
  }

  function resolveDiscretionarySupportModel(needsResult, analysisSettings, warnings) {
    const assumptions = isPlainObject(needsResult?.assumptions) ? needsResult.assumptions : {};
    const included = assumptions.includeDiscretionarySupport === true
      || (toOptionalNumber(needsResult?.components?.discretionarySupport) || 0) > 0;
    const row = findTraceRow(needsResult, "discretionarySupport");
    const inflationRow = findTraceRow(needsResult, "discretionarySupportInflation");
    const inflationInputs = isPlainObject(inflationRow?.inputs) ? inflationRow.inputs : {};
    const total = toOptionalNumber(needsResult?.components?.discretionarySupport)
      ?? toOptionalNumber(row?.value)
      ?? 0;
    const duration = resolveSupportDuration(needsResult, analysisSettings);
    const baseAnnual = toOptionalNumber(inflationInputs.baseAnnualAmount)
      ?? toOptionalNumber(row?.inputs?.annualDiscretionaryPersonalSpending)
      ?? (duration && duration > 0 ? total / duration : null);

    if (!included && total > 0) {
      addUniqueIssue(
        warnings,
        "discretionary-support-inclusion-unclear",
        "Discretionary support has a value but the inclusion setting was not clearly true.",
        { total }
      );
    }

    const annualValues = included && baseAnnual != null && duration > 0
      ? scaleAnnualValuesToTotal(
          buildInflatedAnnualValues(
            baseAnnual,
            duration,
            inflationInputs.ratePercent,
            inflationInputs.inflationApplied ?? inflationInputs.applied
          ),
          total
        )
      : [];

    return {
      included,
      total: roundMoney(Math.max(0, total || 0)),
      annualValues,
      trace: {
        source: row ? "needsResult.trace.discretionarySupport" : "needsResult.components.discretionarySupport",
        included,
        supportDurationYears: duration == null ? null : duration
      }
    };
  }

  function resolveDebtAndMortgageModel(lensModel, needsResult, warnings, dataGaps) {
    const debtRow = findTraceRow(needsResult, "debtPayoff");
    const inputs = isPlainObject(debtRow?.inputs) ? debtRow.inputs : {};
    const totalDebt = toOptionalNumber(needsResult?.components?.debtPayoff)
      ?? toOptionalNumber(debtRow?.value)
      ?? 0;
    const mortgagePlan = isPlainObject(lensModel?.treatedMortgagePaymentPlan)
      ? lensModel.treatedMortgagePaymentPlan
      : {};
    const rawMortgageMode = normalizeString(mortgagePlan.mode || inputs.treatedMortgagePaymentPlanMode || "");
    const mortgageMode = normalizeMortgageProjectionMode(rawMortgageMode);
    const preliminaryMortgageAmount = toOptionalNumber(inputs.preparedMortgagePayoffAmount)
      ?? toOptionalNumber(inputs.rawMortgageAmount)
      ?? toOptionalNumber(getPath(lensModel, "treatedDebtPayoff.needs.mortgagePayoffAmount"))
      ?? toOptionalNumber(mortgagePlan.immediatePayoffAmount)
      ?? 0;
    const originalMortgageBalance = toOptionalNumber(mortgagePlan.originalBalance)
      ?? toOptionalNumber(getPath(lensModel, "debtPayoff.mortgageBalance"))
      ?? toOptionalNumber(inputs.rawMortgageAmount)
      ?? toOptionalNumber(inputs.preparedMortgagePayoffAmount)
      ?? null;
    const originalMonthlyMortgagePayment = toOptionalNumber(mortgagePlan.originalMonthlyMortgagePayment)
      ?? toOptionalNumber(getPath(lensModel, "ongoingSupport.monthlyMortgagePayment"));
    const originalRemainingTermMonths = toOptionalNumber(mortgagePlan.originalRemainingTermMonths)
      ?? toOptionalNumber(getPath(lensModel, "ongoingSupport.mortgageRemainingTermMonths"));
    const interestRatePercent = toOptionalNumber(mortgagePlan.interestRatePercent)
      ?? toOptionalNumber(getPath(lensModel, "ongoingSupport.mortgageInterestRatePercent"));
    const payoffPercentResolution = resolveEffectiveMortgagePayoffPercent(
      mortgagePlan,
      mortgageMode,
      originalMortgageBalance,
      preliminaryMortgageAmount
    );
    const payoffPercent = payoffPercentResolution.effectivePayoffPercent;
    const explicitMortgageAmount = mortgageMode === "payOff" && originalMortgageBalance != null
      ? roundMoney(originalMortgageBalance)
      : preliminaryMortgageAmount;
    const mortgageLifetimeProjectionFacts = {
      currentBalance: originalMortgageBalance,
      currentPayoffAmount: explicitMortgageAmount,
      annualInterestRate: interestRatePercent,
      monthlyPayment: originalMonthlyMortgagePayment,
      remainingTermMonths: originalRemainingTermMonths,
      payoffPercent,
      rawPayoffPercent: payoffPercentResolution.rawPayoffPercent,
      effectivePayoffPercent: payoffPercent,
      partialPayoffAllowed: payoffPercentResolution.partialPayoffAllowed,
      invariantCorrectionApplied: payoffPercentResolution.invariantCorrectionApplied,
      correctionCode: payoffPercentResolution.correctionCode
    };
    const mortgageProjectionDecision = resolveMortgageProjectionDecision(
      mortgageMode,
      rawMortgageMode,
      mortgageLifetimeProjectionFacts
    );
    const nonMortgageAmount = toOptionalNumber(inputs.preparedNonMortgageDebtAmount)
      ?? toOptionalNumber(inputs.rawNonMortgageDebtAmount)
      ?? Math.max(0, totalDebt - explicitMortgageAmount);
    const nonMortgageDebtProjectionFacts = resolveNonMortgageDebtProjectionFacts(lensModel);
    let mortgageTiming = "point-in-time-payoff";
    let mortgageAmount = explicitMortgageAmount;
    let mortgageAnnualValues = [];
    let mortgageImmediatePayoffAmount = mortgageMode === "payOff"
      || mortgageProjectionDecision.decision === "used-payoff-facts-override-unavailable-mode"
      ? roundMoney(Math.max(0, explicitMortgageAmount || 0))
      : 0;
    const finalMonthlyMortgagePayment = toOptionalNumber(mortgagePlan.finalMonthlyMortgagePayment);
    const mortgagePaymentAlreadyInNeeds = mortgagePlan.mortgagePaymentAlreadyInNeeds === true;
    const mortgagePaymentAlreadyInNeedsSource =
      Object.prototype.hasOwnProperty.call(mortgagePlan, "mortgagePaymentAlreadyInNeeds")
        ? "treatedMortgagePaymentPlan.mortgagePaymentAlreadyInNeeds"
        : null;

    if (mortgageMode === "continuePayments") {
      const monthlyPayment = finalMonthlyMortgagePayment;
      const finalRemainingTermMonths = toOptionalNumber(mortgagePlan.finalRemainingTermMonths);
      mortgageImmediatePayoffAmount = roundMoney(Math.max(0, toOptionalNumber(mortgagePlan.immediatePayoffAmount) || 0));
      if (monthlyPayment != null && monthlyPayment >= 0 && finalRemainingTermMonths != null && finalRemainingTermMonths >= 0) {
        mortgageTiming = "time-bounded-payment-stream";
        const fullYears = Math.ceil(finalRemainingTermMonths / 12);
        mortgageAnnualValues = Array.from({ length: fullYears }, function (_, index) {
          const remainingMonths = Math.max(0, finalRemainingTermMonths - index * 12);
          const monthsInYear = Math.min(12, remainingMonths);
          return {
            year: index + 1,
            yearFraction: monthsInYear / 12,
            annualizedAmount: roundMoney(monthlyPayment * 12),
            amount: roundMoney(monthlyPayment * monthsInYear)
          };
        });
        mortgageAmount = roundMoney(mortgageAnnualValues.reduce(function (sum, entry) {
          return sum + entry.amount;
        }, mortgageImmediatePayoffAmount));
      } else {
        addUniqueIssue(
          dataGaps,
          "mortgage-support-timing-incomplete",
          "Mortgage support mode was detected, but payment or remaining-term facts were incomplete.",
          {
            mode: mortgageMode,
            finalMonthlyMortgagePayment: mortgagePlan.finalMonthlyMortgagePayment ?? null,
            finalRemainingTermMonths: mortgagePlan.finalRemainingTermMonths ?? null
          }
        );
      }
    } else if (rawMortgageMode && mortgageMode === "unavailable" && rawMortgageMode !== "unavailable") {
      addUniqueIssue(
        warnings,
        "mortgage-treatment-mode-unrecognized",
        "Mortgage treatment mode was not recognized by the need-line adapter; projection decision trace records whether reliable payoff facts were used or projection was skipped.",
        {
          mode: rawMortgageMode,
          normalizedMortgageMode: mortgageMode,
          projectionDecision: mortgageProjectionDecision.decision
        }
      );
    }

    if (totalDebt > 0 && !debtRow) {
      addUniqueIssue(
        dataGaps,
        "debt-trace-missing",
        "Debt payoff component exists but the Needs trace row was missing; debt was treated as an aggregate point-in-time obligation.",
        { totalDebt }
      );
    }

    return {
      totalDebt: roundMoney(Math.max(0, totalDebt)),
      nonMortgageAmount: roundMoney(Math.max(0, nonMortgageAmount || 0)),
      mortgageAmount: roundMoney(Math.max(0, mortgageAmount || 0)),
      mortgageImmediatePayoffAmount,
      mortgageAnnualValues,
      mortgageTiming,
      mortgageLifetimeProjectionFacts,
      nonMortgageDebtProjectionFacts,
      trace: {
        source: debtRow ? "needsResult.trace.debtPayoff" : "needsResult.components.debtPayoff",
        rawMortgageMode: rawMortgageMode || null,
        normalizedMortgageMode: mortgageMode || null,
        mortgageMode: mortgageMode || null,
        mortgagePaymentPlanVersion: mortgagePlan.version || null,
        mortgageLifetimeProjectionSource: "coverage-strategy-mortgage-lifetime-projection",
        mortgageProjectionDecision: mortgageProjectionDecision.decision,
        mortgageProjectionDecisionReason: mortgageProjectionDecision.reason,
        mortgageProjectionReliableFactsAvailable: mortgageProjectionDecision.reliableFactsAvailable === true,
        mortgageProjectionFactsUsed: clonePlainValue(mortgageLifetimeProjectionFacts),
        mortgageImmediatePayoffAmount,
        mortgageOwnedPaymentStreamTotal: roundMoney(Math.max(0, (mortgageAmount || 0) - mortgageImmediatePayoffAmount)),
        mortgagePaymentAlreadyInNeeds,
        mortgagePaymentAlreadyInNeedsSource,
        originalMonthlyMortgagePayment: originalMonthlyMortgagePayment ?? null,
        finalMonthlyMortgagePayment: finalMonthlyMortgagePayment ?? null,
        rawPayoffPercent: payoffPercentResolution.rawPayoffPercent,
        effectivePayoffPercent: payoffPercent,
        partialPayoffAllowed: payoffPercentResolution.partialPayoffAllowed,
        invariantCorrectionApplied: payoffPercentResolution.invariantCorrectionApplied,
        correctionCode: payoffPercentResolution.correctionCode,
        nonMortgageAmortizationMode: nonMortgageDebtProjectionFacts.length
          ? "coverage-strategy-debt-lifetime-projection"
          : "not-invented",
        sourcePaths: Array.isArray(debtRow?.sourcePaths) ? debtRow.sourcePaths.slice() : []
      }
    };
  }

  function isMortgageDebtProjectionFact(debt) {
    if (!isPlainObject(debt)) {
      return false;
    }
    if (debt.isMortgage === true) {
      return true;
    }
    return [
      debt.categoryKey,
      debt.typeKey,
      debt.sourceKey,
      debt.label
    ].some(function (value) {
      const normalized = normalizeString(value).toLowerCase();
      return normalized === "mortgagebalance"
        || normalized === "primaryresidencemortgage"
        || normalized === "primary residence mortgage"
        || normalized === "mortgage";
    });
  }

  function debtFactKey(debt) {
    return [
      normalizeString(debt?.debtFactId),
      normalizeString(debt?.debtId),
      normalizeString(debt?.id),
      normalizeString(debt?.sourceKey),
      normalizeString(debt?.typeKey)
    ].filter(Boolean);
  }

  function buildRawDebtFactLookup(lensModel) {
    const lookup = new Map();
    const rawDebts = Array.isArray(getPath(lensModel, "debtFacts.debts"))
      ? getPath(lensModel, "debtFacts.debts")
      : [];
    rawDebts.forEach(function (debt) {
      debtFactKey(debt).forEach(function (key) {
        if (!lookup.has(key)) {
          lookup.set(key, debt);
        }
      });
    });
    return lookup;
  }

  function findRawDebtFact(lookup, treatedDebt) {
    const keys = debtFactKey(treatedDebt);
    for (let index = 0; index < keys.length; index += 1) {
      if (lookup.has(keys[index])) {
        return lookup.get(keys[index]);
      }
    }
    return null;
  }

  function mergeDebtProjectionFact(treatedDebt, rawDebt) {
    const rawBalance = toOptionalNumber(treatedDebt?.rawBalance)
      ?? toOptionalNumber(rawDebt?.currentBalance)
      ?? toOptionalNumber(treatedDebt?.currentBalance);
    const treatedAmount = toOptionalNumber(treatedDebt?.treatedAmount);
    const payoffPercent = toOptionalNumber(treatedDebt?.payoffPercent)
      ?? (rawBalance != null && rawBalance > 0 && treatedAmount != null
        ? (treatedAmount / rawBalance) * 100
        : null);

    return {
      debtFactId: normalizeString(treatedDebt?.debtFactId || rawDebt?.debtFactId || rawDebt?.debtId || rawDebt?.id),
      categoryKey: normalizeString(treatedDebt?.categoryKey || rawDebt?.categoryKey),
      typeKey: normalizeString(treatedDebt?.typeKey || rawDebt?.typeKey),
      label: normalizeString(treatedDebt?.label || rawDebt?.label),
      sourceKey: normalizeString(treatedDebt?.sourceKey || rawDebt?.sourceKey),
      isMortgage: treatedDebt?.isMortgage === true || rawDebt?.isMortgage === true,
      included: treatedDebt?.included,
      treatmentMode: treatedDebt?.treatmentMode,
      rawBalance,
      currentBalance: rawBalance,
      treatedAmount,
      payoffPercent,
      monthlyPayment: toOptionalNumber(rawDebt?.monthlyPayment)
        ?? toOptionalNumber(rawDebt?.minimumMonthlyPayment),
      minimumMonthlyPayment: toOptionalNumber(rawDebt?.minimumMonthlyPayment),
      paymentFrequency: rawDebt?.paymentFrequency || rawDebt?.minimumPaymentFrequency || "monthly",
      interestRatePercent: toOptionalNumber(rawDebt?.interestRatePercent),
      remainingTermMonths: toOptionalNumber(rawDebt?.remainingTermMonths),
      enteredRemainingTermMonths: toOptionalNumber(rawDebt?.enteredRemainingTermMonths),
      calculatedAmortizedTermMonths: toOptionalNumber(rawDebt?.calculatedAmortizedTermMonths)
        ?? toOptionalNumber(rawDebt?.calculatedRemainingTermMonths),
      paymentTermMismatch: rawDebt?.paymentTermMismatch === true,
      payoffAmount: toOptionalNumber(rawDebt?.payoffAmount),
      sourcePath: normalizeString(treatedDebt?.sourcePath || rawDebt?.sourcePath),
      metadata: isPlainObject(rawDebt?.metadata) ? clonePlainValue(rawDebt.metadata) : {}
    };
  }

  function resolveNonMortgageDebtProjectionFacts(lensModel) {
    const rawLookup = buildRawDebtFactLookup(lensModel);
    const treatedDebts = Array.isArray(getPath(lensModel, "treatedDebtPayoff.debts"))
      ? getPath(lensModel, "treatedDebtPayoff.debts")
      : [];

    if (treatedDebts.length) {
      return treatedDebts
        .filter(function (debt) {
          return !isMortgageDebtProjectionFact(debt);
        })
        .map(function (debt) {
          return mergeDebtProjectionFact(debt, findRawDebtFact(rawLookup, debt));
        });
    }

    const rawDebts = Array.isArray(getPath(lensModel, "debtFacts.debts"))
      ? getPath(lensModel, "debtFacts.debts")
      : [];
    return rawDebts
      .filter(function (debt) {
        return !isMortgageDebtProjectionFact(debt);
      })
      .map(function (debt) {
        return mergeDebtProjectionFact(debt, debt);
      });
  }

  function resolveMortgageLifetimeProjection(debtModel, pointSpine, valuationDateResult, warnings, dataGaps) {
    const projectionDecision = debtModel?.trace?.mortgageProjectionDecision || "skipped-missing-facts";
    if (!debtModel || (
      projectionDecision !== "used"
      && projectionDecision !== "used-payoff-facts-override-unavailable-mode"
    )) {
      if (debtModel?.mortgageAmount > 0 && projectionDecision === "skipped-missing-facts") {
        addUniqueIssue(
          dataGaps,
          "mortgage-projection-skipped-missing-facts",
          "Mortgage projection was skipped because payoff mode or reliable balance, payment, rate, and term facts were unavailable.",
          {
            rawMortgageMode: debtModel?.trace?.rawMortgageMode || null,
            normalizedMortgageMode: debtModel?.trace?.normalizedMortgageMode || null,
            projectionDecision,
            factsUsed: debtModel?.trace?.mortgageProjectionFactsUsed || {}
          }
        );
      }
      return null;
    }
    if (projectionDecision === "used-payoff-facts-override-unavailable-mode") {
      addUniqueIssue(
        warnings,
        "mortgage-projection-unavailable-mode-reliable-facts-used",
        "Mortgage mode was unavailable, but reliable payoff facts were present, so payoff projection was used for Coverage Strategy.",
        {
          rawMortgageMode: debtModel.trace?.rawMortgageMode || null,
          normalizedMortgageMode: debtModel.trace?.normalizedMortgageMode || null,
          projectionDecision,
          factsUsed: debtModel.trace?.mortgageProjectionFactsUsed || {}
        }
      );
    }
    const builder = lensAnalysis.buildMortgageLifetimeProjection;
    if (typeof builder !== "function") {
      addUniqueIssue(
        dataGaps,
        "mortgage-lifetime-projection-helper-missing",
        "Mortgage payoff was treated as a flat point-in-time obligation because the lifetime projection helper was unavailable.",
        {}
      );
      return null;
    }
    const facts = isPlainObject(debtModel.mortgageLifetimeProjectionFacts)
      ? debtModel.mortgageLifetimeProjectionFacts
      : {};
    const projection = builder({
      currentBalance: facts.currentBalance,
      currentPayoffAmount: facts.currentPayoffAmount,
      annualInterestRate: facts.annualInterestRate,
      monthlyPayment: facts.monthlyPayment,
      remainingTermMonths: facts.remainingTermMonths,
      payoffPercent: facts.payoffPercent,
      valuationDate: valuationDateResult?.normalizedDate,
      needPoints: pointSpine
    });
    (Array.isArray(projection?.warnings) ? projection.warnings : []).forEach(function (warning) {
      if (warning?.code) {
        addUniqueIssue(warnings, warning.code, warning.message || "Mortgage projection warning.", warning.details || {});
      }
    });
    (Array.isArray(projection?.dataGaps) ? projection.dataGaps : []).forEach(function (gap) {
      if (gap?.code) {
        addUniqueIssue(dataGaps, gap.code, gap.message || "Mortgage projection data gap.", gap.details || {});
      }
    });
    return projection;
  }

  function resolveDebtLifetimeProjection(debtModel, pointSpine, valuationDateResult, warnings, dataGaps) {
    if (!debtModel || debtModel.nonMortgageAmount <= 0) {
      return null;
    }
    const builder = lensAnalysis.calculateCoverageStrategyNonMortgageDebtLifetimeProjection
      || lensAnalysis.buildNonMortgageDebtLifetimeProjection
      || lensAnalysis.buildDebtLifetimeProjection;
    if (typeof builder !== "function") {
      addUniqueIssue(
        dataGaps,
        "debt-lifetime-projection-helper-missing",
        "Non-mortgage debt was treated as a flat point-in-time obligation because the lifetime projection helper was unavailable.",
        {}
      );
      return null;
    }
    const facts = Array.isArray(debtModel.nonMortgageDebtProjectionFacts)
      ? debtModel.nonMortgageDebtProjectionFacts
      : [];
    if (!facts.length) {
      addUniqueIssue(
        dataGaps,
        "debt-lifetime-projection-facts-missing",
        "Non-mortgage debt was treated as a flat point-in-time obligation because normalized debt records were unavailable.",
        { nonMortgageAmount: debtModel.nonMortgageAmount }
      );
      return null;
    }
    const projection = builder({
      debts: facts,
      valuationDate: valuationDateResult?.normalizedDate,
      needPoints: pointSpine
    });
    (Array.isArray(projection?.warnings) ? projection.warnings : []).forEach(function (warning) {
      if (warning?.code) {
        addUniqueIssue(warnings, warning.code, warning.message || "Debt projection warning.", warning.details || {});
      }
    });
    (Array.isArray(projection?.dataGaps) ? projection.dataGaps : []).forEach(function (gap) {
      if (gap?.code) {
        addUniqueIssue(dataGaps, gap.code, gap.message || "Debt projection data gap.", gap.details || {});
      }
    });
    return projection;
  }

  function resolveEducationModel(lensModel, needsResult) {
    const educationTotal = toOptionalNumber(needsResult?.components?.education) || 0;
    const row = findTraceRow(needsResult, "educationFundingInflation");
    const inputs = isPlainObject(row?.inputs) ? row.inputs : {};
    const childRows = Array.isArray(inputs.childRows) ? inputs.childRows : [];
    const plannedAmount = toOptionalNumber(inputs.plannedDependentEducationIncludedAmount) || 0;
    const windowedRows = childRows
      .filter(function (child) {
        return isPlainObject(child) && toOptionalNumber(child.yearsUntilEducationStart) != null;
      })
      .map(function (child) {
        const yearsUntilEducationStart = Math.max(0, toOptionalNumber(child.yearsUntilEducationStart) || 0);
        return {
          id: normalizeString(child.id) || `child-${child.index ?? "unknown"}`,
          yearsUntilEducationStart,
          endYearIndex: Math.ceil(yearsUntilEducationStart),
          amount: roundMoney(Math.max(0, toOptionalNumber(child.projectedAmount) || 0)),
          baseAmount: roundMoney(Math.max(0, toOptionalNumber(child.baseAmount) || 0)),
          currentAge: toOptionalNumber(child.currentAge),
          dateOfBirth: normalizeString(child.dateOfBirth) || null
        };
      });

    const windowedTotal = roundMoney(windowedRows.reduce(function (sum, child) {
      return sum + child.amount;
    }, 0));

    return {
      educationTotal: roundMoney(Math.max(0, educationTotal)),
      windowedRows,
      plannedDependentEducationIncludedAmount: plannedAmount,
      windowedTotal,
      trace: {
        source: row ? "needsResult.trace.educationFundingInflation" : "needsResult.components.education",
        currentDependentDetailsCount: Array.isArray(getPath(lensModel, "educationSupport.currentDependentDetails"))
          ? getPath(lensModel, "educationSupport.currentDependentDetails").length
          : null,
        windowedChildCount: windowedRows.length,
        plannedDependentTimingStatus: plannedAmount > 0 ? "aggregate-only" : "not-present",
        needsEducationTraceInputs: clonePlainValue(inputs)
      }
    };
  }

  function resolveHealthcareModel(needsResult, warnings, dataGaps) {
    const amount = toOptionalNumber(needsResult?.components?.healthcareExpenses) || 0;
    const row = findTraceRow(needsResult, "healthcareExpenses");
    const inputs = isPlainObject(row?.inputs) ? row.inputs : {};
    const projectionYears = toOptionalNumber(inputs.projectionYears);
    if (amount > 0 && projectionYears == null) {
      addUniqueIssue(
        dataGaps,
        "healthcare-projection-years-missing",
        "Healthcare expenses are aggregate-only; no projectionYears value was available for annual timing.",
        { amount }
      );
    }
    return {
      amount: roundMoney(Math.max(0, amount)),
      projectionYears: projectionYears == null ? null : Math.max(0, projectionYears),
      trace: {
        source: row ? "needsResult.trace.healthcareExpenses" : "needsResult.components.healthcareExpenses",
        projectionYears: projectionYears == null ? null : projectionYears
      }
    };
  }

  function resolveHorizonYears(input, lensModel, needsResult, supportModel, debtModel, educationModel, healthcareModel, currentAgeResult, warnings) {
    const explicit = toOptionalNumber(input?.horizonYears);
    if (explicit != null && explicit >= 0) {
      return Math.round(explicit);
    }

    const candidates = [
      supportModel.supportDurationYears,
      toOptionalNumber(getPath(lensModel, "incomeBasis.insuredRetirementHorizonYears")),
      toOptionalNumber(getPath(lensModel, "survivorScenario.survivorRetirementHorizonYears")),
      debtModel.mortgageAnnualValues.length,
      ...educationModel.windowedRows.map(function (row) {
        return row.endYearIndex;
      })
    ].filter(function (value) {
      return value != null && Number.isFinite(value) && value >= 0;
    });

    const finalExpenseTargetAge = toOptionalNumber(
      findTraceRow(needsResult, "finalExpenses")?.inputs?.finalExpenseTargetAge
      ?? findTraceRow(needsResult, "finalExpenses")?.inputs?.targetAge
    );
    if (finalExpenseTargetAge != null && currentAgeResult.currentAge != null) {
      candidates.push(Math.max(0, finalExpenseTargetAge - currentAgeResult.currentAge));
    }

    if (candidates.length) {
      return Math.max(0, Math.ceil(Math.max(...candidates)));
    }

    addUniqueIssue(
      warnings,
      "horizon-years-defaulted",
      "horizonYears was missing and no component horizon was available; the adapter used an explicit fallback horizon.",
      { fallbackHorizonYears: DEFAULT_HORIZON_YEARS }
    );
    return DEFAULT_HORIZON_YEARS;
  }

  function componentPoint(componentKey, yearIndex, amount, trace) {
    return {
      componentKey,
      yearIndex,
      amount: roundMoney(Math.max(0, amount || 0)),
      trace: isPlainObject(trace) ? clonePlainValue(trace) : {}
    };
  }

  function getHealthcareInflationRate(analysisSettings, needsResult) {
    return getPath(analysisSettings, "inflationAssumptions.healthcareInflationRatePercent")
      ?? findTraceRow(needsResult, "healthcareExpenses")?.inputs?.healthcareInflationRatePercent
      ?? findTraceRow(needsResult, "finalExpenses")?.inputs?.healthcareInflationRatePercent
      ?? null;
  }

  function getFinalExpenseInflationRate(analysisSettings, needsResult) {
    return getPath(analysisSettings, "inflationAssumptions.finalExpenseInflationRatePercent")
      ?? findTraceRow(needsResult, "finalExpenses")?.inputs?.finalExpenseInflationRatePercent
      ?? null;
  }

  function getEducationInflationRate(analysisSettings, needsResult) {
    return getPath(analysisSettings, "inflationAssumptions.educationInflationRatePercent")
      ?? findTraceRow(needsResult, "educationFundingInflation")?.inputs?.ratePercent
      ?? null;
  }

  function getEducationAssumptions(analysisSettings, needsResult) {
    const settings = isPlainObject(analysisSettings?.educationAssumptions)
      ? clonePlainValue(analysisSettings.educationAssumptions)
      : {};
    const traceInputs = isPlainObject(findTraceRow(needsResult, "educationFundingInflation")?.inputs)
      ? findTraceRow(needsResult, "educationFundingInflation").inputs
      : {};
    return {
      includeEducationFunding: traceInputs.includeEducationFundingSetting ?? settings.includeEducationFunding,
      includeProjectedDependents: traceInputs.includeProjectedDependentsSetting ?? settings.includeProjectedDependents,
      applyEducationInflation: traceInputs.applied === true
        ? true
        : (traceInputs.enabled === true ? settings.applyEducationInflation : settings.applyEducationInflation),
      educationStartAge: traceInputs.educationStartAge ?? settings.educationStartAge,
      fundingTargetPercent: settings.fundingTargetPercent
    };
  }

  function resolveNeedLineScenarioSettings(safeInput, analysisSettings, warnings) {
    if (isPlainObject(safeInput.coverageStrategyScenarioSettings)) {
      return clonePlainValue(safeInput.coverageStrategyScenarioSettings);
    }

    const resolver = lensAnalysis.resolveCoverageStrategyScenarioSettings;
    if (typeof resolver === "function") {
      return resolver({
        profileRecord: safeInput.profileRecord,
        analysisSettings,
        savedScenarioSettings: safeInput.savedScenarioSettings,
        runtimeScenarioSettings: safeInput.runtimeScenarioSettings,
        options: {
          caller: "coverage-strategy-need-line-adapter"
        }
      });
    }

    addUniqueIssue(
      warnings,
      "coverage-strategy-scenario-settings-unavailable",
      "Coverage Strategy scenario settings resolver was unavailable; scenario controls used default behavior.",
      {}
    );
    return {
      version: 1,
      source: "coverage-strategy-defaults",
      persisted: false,
      persistenceStatus: "runtime-default-resolved",
      visibleControlsAdded: false,
      controlsVisible: false,
      education: {
        educationTreatmentMode: "planAsUnfundedNeed",
        effectiveEducationTreatmentMode: "scheduleRemainingNeed",
        educationPaymentScheduleMode: "fourYearAnnual",
        useEducationSavingsOffset: false,
        educationResourceSpendingMode: "off",
        projectedDependentTimingMode: "untimedKeepThroughHorizon",
        projectedDependentTimingRows: [],
        projectedDependentTimingMetadata: {
          projectedDependentDefaultTimingMode: "untimedKeepThroughHorizon",
          projectedDependentRowTimingOverridesApplied: false,
          projectedDependentTimedRowCount: 0,
          projectedDependentUntimedRowCount: 0,
          projectedDependentInvalidRowCount: 0,
          effectiveProjectedDependentTimingSummary: "Default mode keeps untimed projected dependents through the horizon; no row-level expected birth year overrides were applied.",
          rowTimingTrace: []
        }
      },
      trace: {
        source: "coverage-strategy-need-line-adapter-fallback",
        fieldSources: {
          "education.useEducationSavingsOffset": "coverage-strategy-defaults.education.useEducationSavingsOffset"
        },
        visibleControlsAdded: false,
        storageRead: false,
        storageWritten: false
      }
    };
  }

  function appendIssues(target, issues) {
    if (!Array.isArray(target) || !Array.isArray(issues)) {
      return;
    }
    issues.forEach(function (issue) {
      if (!isPlainObject(issue)) {
        return;
      }
      target.push(clonePlainValue(issue));
    });
  }

  function firstDefinedCandidate(candidates) {
    for (let index = 0; index < candidates.length; index += 1) {
      const candidate = candidates[index];
      if (!candidate) {
        continue;
      }
      const value = candidate.value;
      if (value != null && value !== "") {
        return {
          value,
          sourcePath: candidate.sourcePath || null
        };
      }
    }
    return {
      value: null,
      sourcePath: null
    };
  }

  function resolveProjectedDependentCount(lensModel) {
    const educationSupport = isPlainObject(getPath(lensModel, "educationSupport"))
      ? getPath(lensModel, "educationSupport")
      : {};
    const explicitCount = toOptionalNumber(
      educationSupport.desiredAdditionalDependentCount
      ?? educationSupport.projectedDependentsCount
    );
    if (explicitCount != null) {
      return Math.max(0, Math.round(explicitCount));
    }
    return Array.isArray(educationSupport.projectedDependentDetails)
      ? educationSupport.projectedDependentDetails.length
      : 0;
  }

  function resolveScenarioProjectedDependents(lensModel, coverageStrategyScenarioSettings) {
    const rows = Array.isArray(coverageStrategyScenarioSettings?.education?.projectedDependentTimingRows)
      ? coverageStrategyScenarioSettings.education.projectedDependentTimingRows
      : [];
    if (!rows.length) {
      return getPath(lensModel, "educationSupport.projectedDependentDetails");
    }
    const projectedDependentCount = resolveProjectedDependentCount(lensModel);
    if (!projectedDependentCount) {
      return [];
    }
    return rows.slice(0, projectedDependentCount).map(function (row, index) {
      const safeRow = isPlainObject(row) ? row : {};
      return {
        id: normalizeString(safeRow.id) || `projected-dependent-${index + 1}`,
        label: normalizeString(safeRow.label) || `Projected dependent ${index + 1}`,
        included: safeRow.included === false ? false : true,
        timingMode: safeRow.timingMode || null,
        expectedBirthYear: safeRow.validationStatus === "invalid"
          ? null
          : (safeRow.expectedBirthYear ?? safeRow.birthYear ?? null),
        rawExpectedBirthYear: safeRow.rawExpectedBirthYear ?? null,
        validationStatus: safeRow.validationStatus || null,
        validationCode: safeRow.validationCode || null,
        educationFundingAmount: safeRow.educationFundingAmount ?? null,
        sourcePath: safeRow.sourcePath
          || `coverageStrategyScenarioSettings.education.projectedDependentTimingRows[${index}]`
      };
    });
  }

  function resolveEducationLifetimeProjection(
    educationModel,
    lensModel,
    needsResult,
    analysisSettings,
    pointSpine,
    valuationDateResult,
    coverageStrategyScenarioSettings,
    educationBroaderResourceAllocation,
    warnings,
    dataGaps
  ) {
    const builder = lensAnalysis.buildCoverageStrategyEducationLifetimeProjection;
    if (typeof builder !== "function") {
      if (educationModel.educationTotal > 0) {
        addUniqueIssue(
          dataGaps,
          "education-lifetime-schedule-unavailable",
          "Coverage Strategy education lifetime projection helper was unavailable.",
          { fallbackAmount: educationModel.educationTotal }
        );
        addUniqueIssue(
          warnings,
          "education-aggregate-fallback-used",
          "Coverage Strategy used aggregate Needs education amount because the education lifetime schedule was unavailable.",
          { fallbackAmount: educationModel.educationTotal }
        );
      }
      return null;
    }

    const educationAssumptions = getEducationAssumptions(analysisSettings, needsResult);
    if (!(educationModel.educationTotal > 0)) {
      educationAssumptions.includeEducationFunding = false;
    }

    const projection = builder({
      educationSupport: getPath(lensModel, "educationSupport"),
      profileDependents: getPath(lensModel, "educationSupport.currentDependentDetails"),
      projectedDependents: resolveScenarioProjectedDependents(lensModel, coverageStrategyScenarioSettings),
      assetFacts: getPath(lensModel, "assetFacts"),
      treatedAssetOffsets: getPath(lensModel, "treatedAssetOffsets"),
      needPoints: pointSpine,
      valuationDate: valuationDateResult?.normalizedDate || null,
      educationAssumptions,
      coverageStrategyScenarioSettings,
      educationBroaderResourceAllocation,
      educationInflationRatePercent: getEducationInflationRate(analysisSettings, needsResult),
      options: {
        horizonYears: pointSpine.length ? pointSpine.length - 1 : 0,
        needsEducationTraceInputs: educationModel.trace?.needsEducationTraceInputs || null
      }
    });
    appendIssues(warnings, projection?.warnings);
    appendIssues(dataGaps, projection?.dataGaps);

    const scheduleAvailable = (
      Array.isArray(projection?.currentDependentSchedules)
      && projection.currentDependentSchedules.length > 0
    ) || (
      Array.isArray(projection?.projectedDependentSchedules)
      && projection.projectedDependentSchedules.length > 0
    ) || (
      Array.isArray(projection?.untimedProjectedDependents)
      && projection.untimedProjectedDependents.length > 0
    );
    if (educationModel.educationTotal > 0 && !scheduleAvailable) {
      addUniqueIssue(
        warnings,
        "education-aggregate-fallback-used",
        "Coverage Strategy used aggregate Needs education amount because no education lifetime schedule amounts were available.",
        { fallbackAmount: educationModel.educationTotal }
      );
      addUniqueIssue(
        dataGaps,
        "education-lifetime-schedule-unavailable",
        "Coverage Strategy could not build education lifetime schedule amounts from available education facts.",
        { fallbackAmount: educationModel.educationTotal }
      );
      return {
        ...(isPlainObject(projection) ? projection : {}),
        aggregateFallbackUsed: true
      };
    }

    return {
      ...(isPlainObject(projection) ? projection : {}),
      aggregateFallbackUsed: false
    };
  }

  function resolveHealthcareLifetimeProjection(
    healthcareModel,
    lensModel,
    needsResult,
    analysisSettings,
    pointSpine,
    valuationDateResult,
    warnings,
    dataGaps
  ) {
    const builder = lensAnalysis.buildCoverageStrategyHealthcareLifetimeProjection;
    if (typeof builder !== "function") {
      if (healthcareModel.amount > 0) {
        addUniqueIssue(
          dataGaps,
          "healthcare-lifetime-schedule-unavailable",
          "Coverage Strategy healthcare lifetime projection helper was unavailable.",
          { fallbackAmount: healthcareModel.amount }
        );
        addUniqueIssue(
          warnings,
          "healthcare-aggregate-fallback-used",
          "Coverage Strategy used aggregate Needs healthcare amount because the healthcare lifetime schedule was unavailable.",
          { fallbackAmount: healthcareModel.amount, projectionYears: healthcareModel.projectionYears }
        );
        addUniqueIssue(
          warnings,
          "healthcare-year-level-projection-limited",
          "Healthcare expense projection is available only as an aggregate fallback; annual need-line allocation is conservative.",
          { amount: healthcareModel.amount, projectionYears: healthcareModel.projectionYears }
        );
      }
      return null;
    }

    const projection = builder({
      expenseFacts: getPath(lensModel, "expenseFacts"),
      needPoints: pointSpine,
      valuationDate: valuationDateResult?.normalizedDate || null,
      clientDateOfBirth: getPath(lensModel, "profileFacts.clientDateOfBirth"),
      healthcareInflationRatePercent: getHealthcareInflationRate(analysisSettings, needsResult),
      options: {
        horizonYears: pointSpine.length ? pointSpine.length - 1 : 0
      }
    });
    appendIssues(warnings, projection?.warnings);
    appendIssues(dataGaps, projection?.dataGaps);

    const healthcarePoints = Array.isArray(projection?.healthcarePoints)
      ? projection.healthcarePoints
      : [];
    const includedRecords = Array.isArray(projection?.includedRecords)
      ? projection.includedRecords
      : [];
    if (includedRecords.length && healthcarePoints.length) {
      return projection;
    }

    if (healthcareModel.amount > 0) {
      addUniqueIssue(
        dataGaps,
        "healthcare-lifetime-schedule-unavailable",
        "Coverage Strategy could not build a healthcare lifetime schedule from normalized expense facts.",
        {
          fallbackAmount: healthcareModel.amount,
          inputExpenseFactCount: projection?.trace?.inputExpenseFactCount ?? null,
          includedRecordCount: includedRecords.length
        }
      );
      addUniqueIssue(
        warnings,
        "healthcare-aggregate-fallback-used",
        "Coverage Strategy used aggregate Needs healthcare amount because no record-level healthcare schedule was available.",
        { fallbackAmount: healthcareModel.amount, projectionYears: healthcareModel.projectionYears }
      );
      addUniqueIssue(
        warnings,
        "healthcare-year-level-projection-limited",
        "Healthcare expense projection is available only as an aggregate fallback; annual need-line allocation is conservative.",
        { amount: healthcareModel.amount, projectionYears: healthcareModel.projectionYears }
      );
      return {
        ...projection,
        aggregateFallbackUsed: true
      };
    }

    return projection;
  }

  function resolveFinalExpenseLifetimeProjection(
    finalExpenseAmount,
    lensModel,
    needsResult,
    analysisSettings,
    pointSpine,
    valuationDateResult,
    warnings,
    dataGaps
  ) {
    const builder = lensAnalysis.buildCoverageStrategyFinalExpenseLifetimeProjection;
    if (typeof builder !== "function") {
      if (finalExpenseAmount > 0) {
        addUniqueIssue(
          dataGaps,
          "final-expense-lifetime-schedule-unavailable",
          "Coverage Strategy final expense lifetime projection helper was unavailable.",
          { fallbackAmount: finalExpenseAmount }
        );
        addUniqueIssue(
          warnings,
          "final-expense-static-fallback-used",
          "Coverage Strategy used the static Needs final expense amount because the final expense lifetime schedule was unavailable.",
          { fallbackAmount: finalExpenseAmount }
        );
      }
      return null;
    }

    const projection = builder({
      expenseFacts: getPath(lensModel, "expenseFacts"),
      finalExpenseFacts: getPath(lensModel, "finalExpenses"),
      needPoints: pointSpine,
      valuationDate: valuationDateResult?.normalizedDate || null,
      finalExpenseInflationRatePercent: getFinalExpenseInflationRate(analysisSettings, needsResult),
      healthcareInflationRatePercent: getHealthcareInflationRate(analysisSettings, needsResult),
      options: {
        horizonYears: pointSpine.length ? pointSpine.length - 1 : 0
      }
    });
    appendIssues(warnings, projection?.warnings);
    appendIssues(dataGaps, projection?.dataGaps);

    const finalExpensePoints = Array.isArray(projection?.finalExpensePoints)
      ? projection.finalExpensePoints
      : [];
    const includedRecords = Array.isArray(projection?.includedRecords)
      ? projection.includedRecords
      : [];
    if (includedRecords.length && finalExpensePoints.length) {
      return projection;
    }

    if (finalExpenseAmount > 0) {
      addUniqueIssue(
        dataGaps,
        "final-expense-lifetime-schedule-unavailable",
        "Coverage Strategy could not build a final expense lifetime schedule from normalized final expense facts.",
        {
          fallbackAmount: finalExpenseAmount,
          inputExpenseFactCount: projection?.trace?.inputExpenseFactCount ?? null,
          includedRecordCount: includedRecords.length
        }
      );
      addUniqueIssue(
        warnings,
        "final-expense-static-fallback-used",
        "Coverage Strategy used the static Needs final expense amount because no record-level final expense schedule was available.",
        { fallbackAmount: finalExpenseAmount }
      );
      return {
        ...projection,
        staticFallbackUsed: true
      };
    }

    return projection;
  }

  function resolveTransitionNeedsLifetimeProjection(
    transitionNeeds,
    lensModel,
    needsResult,
    analysisSettings,
    safeInput,
    pointSpine,
    valuationDateResult,
    warnings,
    dataGaps
  ) {
    if (transitionNeeds <= 0) {
      return null;
    }

    const builder = lensAnalysis.calculateCoverageStrategyTransitionNeedsLifetimeProjection
      || lensAnalysis.buildCoverageStrategyTransitionNeedsLifetimeProjection;
    if (typeof builder !== "function") {
      if (transitionNeeds > 0) {
        addUniqueIssue(
          dataGaps,
          "transition-needs-lifetime-projection-helper-unavailable",
          "Coverage Strategy transition needs lifetime projection helper was unavailable.",
          { fallbackAmount: transitionNeeds }
        );
        addUniqueIssue(
          warnings,
          "transition-needs-duration-unavailable-flat-fallback",
          "Transition needs were kept flat because no reliable projection helper was available.",
          { fallbackAmount: transitionNeeds }
        );
      }
      return null;
    }

    const traceRow = findTraceRow(needsResult, "transitionNeeds");
    const traceInputs = isPlainObject(traceRow?.inputs) ? traceRow.inputs : {};
    const sourcePaths = Array.isArray(traceRow?.sourcePaths)
      ? traceRow.sourcePaths
      : ["transitionNeeds.totalTransitionNeed", "settings.includeTransitionNeeds"];
    const transitionConfig = isPlainObject(safeInput.transitionNeedsProjection)
      ? safeInput.transitionNeedsProjection
      : (isPlainObject(safeInput.transitionNeedsLifetimeProjection)
        ? safeInput.transitionNeedsLifetimeProjection
        : {});

    const modeCandidate = firstDefinedCandidate([
      {
        value: transitionConfig.transitionMode ?? transitionConfig.projectionMode ?? transitionConfig.mode,
        sourcePath: "input.transitionNeedsProjection.transitionMode"
      },
      {
        value: safeInput.transitionNeedsMode ?? safeInput.transitionMode,
        sourcePath: "input.transitionNeedsMode"
      },
      {
        value: traceInputs.transitionMode ?? traceInputs.transitionNeedsMode ?? traceInputs.projectionMode,
        sourcePath: "needsResult.trace.transitionNeeds.inputs.transitionMode"
      },
      {
        value: getPath(needsResult, "assumptions.transitionNeedsProjection.transitionMode")
          ?? getPath(needsResult, "assumptions.transitionNeedsMode"),
        sourcePath: "needsResult.assumptions.transitionNeedsProjection.transitionMode"
      },
      {
        value: getPath(analysisSettings, "transitionNeedsAssumptions.transitionMode")
          ?? getPath(analysisSettings, "transitionNeedsAssumptions.projectionMode"),
        sourcePath: "analysisSettings.transitionNeedsAssumptions.transitionMode"
      },
      {
        value: getPath(lensModel, "transitionNeeds.transitionMode")
          ?? getPath(lensModel, "transitionNeeds.projectionMode"),
        sourcePath: "lensModel.transitionNeeds.transitionMode"
      }
    ]);

    const durationMonthsCandidate = firstDefinedCandidate([
      {
        value: transitionConfig.transitionDurationMonths
          ?? transitionConfig.durationMonths
          ?? transitionConfig.bridgeDurationMonths
          ?? transitionConfig.transitionPeriodMonths,
        sourcePath: "input.transitionNeedsProjection.transitionDurationMonths"
      },
      {
        value: traceInputs.transitionDurationMonths
          ?? traceInputs.durationMonths
          ?? traceInputs.bridgeDurationMonths
          ?? traceInputs.transitionPeriodMonths,
        sourcePath: "needsResult.trace.transitionNeeds.inputs.transitionDurationMonths"
      },
      {
        value: getPath(needsResult, "assumptions.transitionNeedsProjection.transitionDurationMonths")
          ?? getPath(needsResult, "assumptions.transitionDurationMonths"),
        sourcePath: "needsResult.assumptions.transitionNeedsProjection.transitionDurationMonths"
      },
      {
        value: getPath(analysisSettings, "transitionNeedsAssumptions.transitionDurationMonths")
          ?? getPath(analysisSettings, "transitionNeedsAssumptions.durationMonths"),
        sourcePath: "analysisSettings.transitionNeedsAssumptions.transitionDurationMonths"
      },
      {
        value: getPath(lensModel, "transitionNeeds.transitionDurationMonths")
          ?? getPath(lensModel, "transitionNeeds.durationMonths"),
        sourcePath: "lensModel.transitionNeeds.transitionDurationMonths"
      }
    ]);

    const durationYearsCandidate = firstDefinedCandidate([
      {
        value: transitionConfig.transitionDurationYears
          ?? transitionConfig.durationYears
          ?? transitionConfig.bridgeDurationYears
          ?? transitionConfig.transitionPeriodYears,
        sourcePath: "input.transitionNeedsProjection.transitionDurationYears"
      },
      {
        value: traceInputs.transitionDurationYears
          ?? traceInputs.durationYears
          ?? traceInputs.bridgeDurationYears
          ?? traceInputs.transitionPeriodYears,
        sourcePath: "needsResult.trace.transitionNeeds.inputs.transitionDurationYears"
      },
      {
        value: getPath(needsResult, "assumptions.transitionNeedsProjection.transitionDurationYears")
          ?? getPath(needsResult, "assumptions.transitionDurationYears"),
        sourcePath: "needsResult.assumptions.transitionNeedsProjection.transitionDurationYears"
      },
      {
        value: getPath(analysisSettings, "transitionNeedsAssumptions.transitionDurationYears")
          ?? getPath(analysisSettings, "transitionNeedsAssumptions.durationYears"),
        sourcePath: "analysisSettings.transitionNeedsAssumptions.transitionDurationYears"
      },
      {
        value: getPath(lensModel, "transitionNeeds.transitionDurationYears")
          ?? getPath(lensModel, "transitionNeeds.durationYears"),
        sourcePath: "lensModel.transitionNeeds.transitionDurationYears"
      }
    ]);

    const projection = builder({
      projectionYears: pointSpine.length ? pointSpine.length - 1 : 0,
      valuationDate: valuationDateResult?.normalizedDate || null,
      annualNeedPoints: pointSpine,
      transitionNeedAmount: transitionNeeds,
      transitionNeedSource: "needsResult.components.transitionNeeds",
      transitionMode: modeCandidate.value,
      transitionDurationMonths: durationMonthsCandidate.value,
      transitionDurationYears: durationYearsCandidate.value,
      sourcePath: "needsResult.components.transitionNeeds",
      sourcePaths,
      trace: {
        transitionModeSource: modeCandidate.sourcePath,
        transitionDurationMonthsSource: durationMonthsCandidate.sourcePath,
        transitionDurationYearsSource: durationYearsCandidate.sourcePath,
        traceRowInputs: traceInputs
      }
    });
    appendIssues(warnings, projection?.warnings);
    appendIssues(dataGaps, projection?.dataGaps);
    return projection;
  }

  function buildCoverageStrategyNeedLine(input) {
    const safeInput = isPlainObject(input) ? input : {};
    const lensModel = isPlainObject(safeInput.lensModel) ? safeInput.lensModel : {};
    const needsResult = isPlainObject(safeInput.needsResult) ? safeInput.needsResult : {};
    const analysisSettings = isPlainObject(safeInput.analysisSettings) ? safeInput.analysisSettings : {};
    const warnings = [];
    const dataGaps = [];

    if (!isPlainObject(safeInput.needsResult)) {
      addUniqueIssue(
        dataGaps,
        "missing-needs-result",
        "A completed Needs/LENS result is required to build Coverage Strategy need points.",
        {}
      );
    }

    const valuationDateResult = resolveValuationDate(safeInput, needsResult, analysisSettings, warnings, dataGaps);
    const currentAgeResult = resolveCurrentAge(safeInput, lensModel, valuationDateResult, warnings, dataGaps);
    const supportModel = resolveGrossSupportModel(needsResult, analysisSettings, warnings, dataGaps);
    const discretionaryModel = resolveDiscretionarySupportModel(needsResult, analysisSettings, warnings);
    const debtModel = resolveDebtAndMortgageModel(lensModel, needsResult, warnings, dataGaps);
    const mortgageSupportOwnershipModel = resolveMortgageSupportOwnershipModel(supportModel, debtModel, dataGaps);
    const educationModel = resolveEducationModel(lensModel, needsResult);
    const healthcareModel = resolveHealthcareModel(needsResult, warnings, dataGaps);
    const horizonYears = resolveHorizonYears(
      safeInput,
      lensModel,
      needsResult,
      supportModel,
      debtModel,
      educationModel,
      healthcareModel,
      currentAgeResult,
      warnings
    );
    const pointSpine = buildAnnualPointSpine(valuationDateResult, currentAgeResult, horizonYears);
    const coverageStrategyScenarioSettings = resolveNeedLineScenarioSettings(
      safeInput,
      analysisSettings,
      warnings
    );
    const educationLifetimeProjection = resolveEducationLifetimeProjection(
      educationModel,
      lensModel,
      needsResult,
      analysisSettings,
      pointSpine,
      valuationDateResult,
      coverageStrategyScenarioSettings,
      safeInput.educationBroaderResourceAllocation || safeInput.educationResourceAllocation || null,
      warnings,
      dataGaps
    );
    const mortgageLifetimeProjection = resolveMortgageLifetimeProjection(
      debtModel,
      pointSpine,
      valuationDateResult,
      warnings,
      dataGaps
    );
    const debtLifetimeProjection = resolveDebtLifetimeProjection(
      debtModel,
      pointSpine,
      valuationDateResult,
      warnings,
      dataGaps
    );
    const healthcareLifetimeProjection = resolveHealthcareLifetimeProjection(
      healthcareModel,
      lensModel,
      needsResult,
      analysisSettings,
      pointSpine,
      valuationDateResult,
      warnings,
      dataGaps
    );
    const finalExpenses = roundMoney(Math.max(0, toOptionalNumber(needsResult?.components?.finalExpenses) || 0));
    const finalExpenseLifetimeProjection = resolveFinalExpenseLifetimeProjection(
      finalExpenses,
      lensModel,
      needsResult,
      analysisSettings,
      pointSpine,
      valuationDateResult,
      warnings,
      dataGaps
    );
    const mortgageProjectionByYear = new Map(
      (Array.isArray(mortgageLifetimeProjection?.mortgagePoints) ? mortgageLifetimeProjection.mortgagePoints : [])
        .map(function (point) {
          return [point.yearIndex, point];
        })
    );
    const debtProjectionByYear = new Map(
      (Array.isArray(debtLifetimeProjection?.debtPoints) ? debtLifetimeProjection.debtPoints : [])
        .map(function (point) {
          return [point.yearIndex, point];
        })
    );
    const educationProjectionByYear = new Map(
      (
        educationLifetimeProjection?.aggregateFallbackUsed === true
          ? []
          : (Array.isArray(educationLifetimeProjection?.educationPoints)
            ? educationLifetimeProjection.educationPoints
            : [])
      ).map(function (point) {
        return [point.yearIndex, point];
      })
    );
    const healthcareProjectionByYear = new Map(
      (
        healthcareLifetimeProjection?.aggregateFallbackUsed === true
          ? []
          : (Array.isArray(healthcareLifetimeProjection?.healthcarePoints)
            ? healthcareLifetimeProjection.healthcarePoints
            : [])
      ).map(function (point) {
        return [point.yearIndex, point];
      })
    );
    const finalExpenseProjectionByYear = new Map(
      (
        finalExpenseLifetimeProjection?.staticFallbackUsed === true
          ? []
          : (Array.isArray(finalExpenseLifetimeProjection?.finalExpensePoints)
            ? finalExpenseLifetimeProjection.finalExpensePoints
            : [])
      ).map(function (point) {
        return [point.yearIndex, point];
      })
    );

    const transitionNeeds = roundMoney(Math.max(0, toOptionalNumber(needsResult?.components?.transitionNeeds) || 0));
    const transitionNeedsLifetimeProjection = resolveTransitionNeedsLifetimeProjection(
      transitionNeeds,
      lensModel,
      needsResult,
      analysisSettings,
      safeInput,
      pointSpine,
      valuationDateResult,
      warnings,
      dataGaps
    );
    const transitionNeedsProjectionByYear = new Map(
      (
        Array.isArray(transitionNeedsLifetimeProjection?.transitionNeedPoints)
          ? transitionNeedsLifetimeProjection.transitionNeedPoints
          : []
      ).map(function (point) {
        return [point.yearIndex, point];
      })
    );
    const componentPoints = [];
    const needPoints = [];
    const mortgageSupportOwnershipPointProofs = [];

    if (debtModel.nonMortgageAmount > 0 && !debtLifetimeProjection) {
      addUniqueIssue(
        warnings,
        "non-mortgage-debt-amortization-not-invented",
        "Non-mortgage debt was treated as a point-in-time death obligation because no reliable amortization schedule was used.",
        { nonMortgageAmount: debtModel.nonMortgageAmount }
      );
    }

    if (finalExpenses > 0 && !finalExpenseProjectionByYear.size) {
      addUniqueIssue(
        warnings,
        "final-expense-treated-as-static-death-year-obligation",
        "Final expenses were included as a static death-year obligation because no record-level final expense lifetime schedule was available.",
        { finalExpenses }
      );
    }

    for (let yearIndex = 0; yearIndex <= horizonYears; yearIndex += 1) {
      const point = pointSpine[yearIndex] || {};
      const date = point.date || null;
      const calendarYear = point.calendarYear ?? null;
      const age = point.age ?? null;
      const rawEssentialSupport = sumRemainingAnnualValues(supportModel.annualValues, yearIndex);
      const rawAdjustedSupportNeed = sumRemainingAnnualValues(supportModel.adjustedAnnualValues, yearIndex);
      const discretionarySupport = discretionaryModel.included
        ? sumRemainingAnnualValues(discretionaryModel.annualValues, yearIndex)
        : 0;
      const mortgageProjectionPoint = mortgageProjectionByYear.get(yearIndex) || null;
      const mortgageOwnedSupportAmount = debtModel.mortgageTiming === "time-bounded-payment-stream"
        ? sumRemainingAnnualValues(debtModel.mortgageAnnualValues, yearIndex)
        : 0;
      const mortgageImmediatePayoffForPoint = debtModel.mortgageTiming === "time-bounded-payment-stream"
        && yearIndex === 0
        ? debtModel.mortgageImmediatePayoffAmount || 0
        : 0;
      const mortgage = mortgageProjectionPoint
        ? mortgageProjectionPoint.payoffObligationAmount
        : (debtModel.mortgageTiming === "time-bounded-payment-stream"
        ? roundMoney(mortgageImmediatePayoffForPoint + mortgageOwnedSupportAmount)
        : debtModel.mortgageAmount);
      if (yearIndex === 0 && mortgageProjectionPoint && mortgageProjectionPoint.payoffObligationAmount > 0) {
        mortgageSupportOwnershipModel.mortgageSupportOwnership = "mortgage-component";
        mortgageSupportOwnershipModel.mortgageComponentOwnsImmediatePayoff = true;
        mortgageSupportOwnershipModel.mortgageImmediatePayoffAmount =
          roundMoney(mortgageProjectionPoint.payoffObligationAmount);
      }
      const mortgageSupportOwnershipForPoint = resolveMortgageSupportOwnershipForPoint(
        mortgageSupportOwnershipModel,
        {
          yearIndex,
          rawEssentialSupport,
          rawAdjustedSupportNeed,
          mortgageOwnedSupportAmount
        }
      );
      if (mortgageSupportOwnershipForPoint.trace.ownershipProofRelevant) {
        mortgageSupportOwnershipPointProofs.push(mortgageSupportOwnershipForPoint.trace.noDoubleCountProof === true);
      }
      if (mortgageSupportOwnershipForPoint.trace.essentialSupportMortgageAdjustmentApplied) {
        mortgageSupportOwnershipModel.essentialSupportMortgageAdjustmentApplied = true;
        mortgageSupportOwnershipModel.mortgageSupportAmountRemovedFromEssentialSupport =
          debtModel.trace?.mortgageOwnedPaymentStreamTotal || 0;
        mortgageSupportOwnershipModel.mortgageSupportAmountOwnedByMortgageComponent =
          debtModel.trace?.mortgageOwnedPaymentStreamTotal || 0;
      }
      const essentialSupport = mortgageSupportOwnershipForPoint.essentialSupport;
      const adjustedSupportNeed = mortgageSupportOwnershipForPoint.adjustedSupportNeed;
      const survivorIncomeOffsetForPoint = supportModel.adjustedAnnualValues.length
        ? roundMoney(Math.max(essentialSupport - adjustedSupportNeed, 0))
        : supportModel.survivorIncomeOffset;
      const debtProjectionPoint = debtProjectionByYear.get(yearIndex) || null;
      const debtPayoff = debtProjectionPoint
        ? debtProjectionPoint.payoffObligationAmount
        : debtModel.nonMortgageAmount;
      const educationProjectionPoint = educationProjectionByYear.get(yearIndex) || null;
      const education = educationProjectionPoint
        ? educationProjectionPoint.educationNeedAmount
        : (educationLifetimeProjection?.aggregateFallbackUsed === true
          ? educationModel.educationTotal
          : roundMoney(
              educationModel.windowedRows.reduce(function (sum, child) {
                return yearIndex <= child.endYearIndex ? sum + child.amount : sum;
              }, 0)
            ));
      const healthcareProjectionPoint = healthcareProjectionByYear.get(yearIndex) || null;
      const healthcareExpenses = healthcareProjectionPoint
        ? healthcareProjectionPoint.healthcareNeedAmount
        : (healthcareModel.amount > 0
        && (healthcareModel.projectionYears == null || yearIndex <= healthcareModel.projectionYears)
        ? healthcareModel.amount
        : 0);
      const finalExpenseProjectionPoint = finalExpenseProjectionByYear.get(yearIndex) || null;
      const finalExpensesForPoint = finalExpenseProjectionPoint
        ? finalExpenseProjectionPoint.finalExpenseNeedAmount
        : finalExpenses;
      const transitionNeedsProjectionPoint = transitionNeedsProjectionByYear.get(yearIndex) || null;
      const transitionNeedsForPoint = transitionNeedsProjectionPoint
        ? transitionNeedsProjectionPoint.transitionNeedAmount
        : transitionNeeds;
      const componentAmounts = {
        debtPayoff,
        mortgage,
        essentialSupport,
        discretionarySupport,
        transitionNeeds: transitionNeedsForPoint,
        education,
        finalExpenses: finalExpensesForPoint,
        healthcareExpenses
      };
      const grossNeedAmount = roundMoney(Object.keys(componentAmounts).reduce(function (sum, key) {
        return sum + componentAmounts[key];
      }, 0));
      const events = [];
      if (supportModel.supportDurationYears != null && yearIndex === Math.ceil(supportModel.supportDurationYears)) {
        events.push({
          id: `essential-support-ends:${yearIndex}`,
          type: "essential-support-ends",
          yearIndex
        });
      }
      educationModel.windowedRows.forEach(function (child) {
        if (yearIndex === child.endYearIndex + 1) {
          events.push({
            id: `education-window-ends:${child.id}:${yearIndex}`,
            type: "education-window-ends",
            yearIndex,
            childId: child.id
          });
        }
      });
      Object.keys(componentAmounts).forEach(function (componentKey) {
        componentPoints.push(componentPoint(componentKey, yearIndex, componentAmounts[componentKey], {
          source: "coverage-strategy-need-line-adapter",
          timing: componentKey === "finalExpenses"
            ? DEFAULT_FINAL_EXPENSE_TIMING
            : (componentKey === "transitionNeeds"
              ? (transitionNeedsProjectionPoint?.projectionMode || DEFAULT_TRANSITION_TIMING)
              : null)
        }));
      });

      needPoints.push({
        yearIndex,
        date,
        calendarYear,
        age,
        needAmount: grossNeedAmount,
        grossNeedAmount,
        componentAmounts,
        offsetTraces: {
          survivorIncomeOffset: survivorIncomeOffsetForPoint,
          survivorIncomeOffsetTotal: supportModel.survivorIncomeOffset,
          treatment: "preserved-for-future-offset-layer",
          subtractedFromNeedLine: false
        },
        supportTrace: {
          grossSupportNeed: essentialSupport,
          survivorIncomeOffset: survivorIncomeOffsetForPoint,
          adjustedSupportNeed: adjustedSupportNeed || null,
          grossSupportTotal: supportModel.grossSupportTotal,
          adjustedSupportTotal: supportModel.adjustedSupportTotal,
          supportDurationYears: supportModel.supportDurationYears,
          reconstructionStatus: supportModel.reconstructionStatus,
          mortgageSupportOwnershipTrace: mortgageSupportOwnershipForPoint.trace
        },
        events,
        warnings: [],
        dataGaps: [],
        trace: {
          adapterVersion: COVERAGE_STRATEGY_NEED_LINE_ADAPTER_VERSION,
          primaryNeedBasis: "gross-household-insurance-need-before-offsets-and-coverage",
          assetOffsetSubtracted: false,
          existingCoverageSubtracted: false,
          netCoverageGapUsedAsNeed: false,
          survivorIncomeSubtractedFromNeedLine: false,
          componentTiming: {
            debtPayoff: debtProjectionPoint
              ? "projected-non-mortgage-debt-payoff"
              : "point-in-time-obligation-no-amortization-invented",
            mortgage: mortgageProjectionPoint
              ? `projected-payoff-${mortgageProjectionPoint.projectionMode}`
              : debtModel.mortgageTiming,
            essentialSupport: "remaining-support-duration",
            discretionarySupport: discretionaryModel.included ? "remaining-support-duration" : "excluded",
            transitionNeeds: transitionNeedsProjectionPoint
              ? `transition-needs-${transitionNeedsProjectionPoint.projectionMode}`
              : DEFAULT_TRANSITION_TIMING,
            education: educationProjectionPoint
              ? "record-level-education-obligation-schedule"
              : (educationLifetimeProjection?.aggregateFallbackUsed === true
                ? "aggregate-static-education-fallback"
                : "current-dependent-education-window-fallback"),
            finalExpenses: finalExpenseProjectionPoint
              ? "record-level-death-year-final-expense-schedule"
              : "static-death-year-fallback",
            healthcareExpenses: healthcareProjectionPoint
              ? "record-level-healthcare-lifetime-schedule"
              : (healthcareModel.projectionYears == null
                ? "aggregate-active-with-data-gap"
                : "aggregate-fallback-bounded-by-healthcare-projection-years")
          },
          mortgageProjection: mortgageProjectionPoint
            ? {
                projectionMode: mortgageProjectionPoint.projectionMode,
                elapsedMonths: mortgageProjectionPoint.elapsedMonths,
                projectedBalance: mortgageProjectionPoint.projectedBalance,
                payoffObligationAmount: mortgageProjectionPoint.payoffObligationAmount,
                remainingTermMonths: mortgageProjectionPoint.remainingTermMonths,
                sourceFactsUsed: mortgageProjectionPoint.trace || {}
              }
            : null,
          mortgageSupportOwnershipTrace: mortgageSupportOwnershipForPoint.trace,
          debtProjection: debtProjectionPoint
            ? {
                projectedDebtBalance: debtProjectionPoint.projectedDebtBalance,
                payoffObligationAmount: debtProjectionPoint.payoffObligationAmount,
                elapsedMonths: debtProjectionPoint.elapsedMonths,
                debtsIncludedCount: debtProjectionPoint.debtsIncludedCount,
                debtsFallbackCount: debtProjectionPoint.debtsFallbackCount,
                projectionModeCounts: debtProjectionPoint.trace?.projectionModeCounts || {},
                sourceFactsUsed: debtProjectionPoint.trace || {}
              }
            : null,
          transitionNeedsProjection: transitionNeedsProjectionPoint
            ? {
                transitionNeedAmount: transitionNeedsProjectionPoint.transitionNeedAmount,
                sourceTransitionNeedAmount: transitionNeedsProjectionPoint.sourceTransitionNeedAmount,
                projectionMode: transitionNeedsProjectionPoint.projectionMode,
                elapsedMonths: transitionNeedsProjectionPoint.elapsedMonths,
                remainingDurationMonths: transitionNeedsProjectionPoint.remainingDurationMonths,
                durationMonths: transitionNeedsProjectionPoint.durationMonths,
                currentBehaviorPreservedByFallback:
                  transitionNeedsProjectionPoint.trace?.currentBehaviorPreservedByFallback === true,
                sourceFactsUsed: transitionNeedsProjectionPoint.trace || {}
              }
            : null,
          educationProjection: educationProjectionPoint
            ? {
                educationNeedAmount: educationProjectionPoint.educationNeedAmount,
                grossEducationNeedAmount: educationProjectionPoint.grossEducationNeedAmount,
                educationSavingsOffsetAmount: educationProjectionPoint.educationSavingsOffsetAmount,
                educationResourceSpendingOffsetAmount: educationProjectionPoint.educationResourceSpendingOffsetAmount,
                broaderEligibleResourceOffsetAmount: educationProjectionPoint.broaderEligibleResourceOffsetAmount,
                remainingEducationNeedAfterEducationSavings:
                  educationProjectionPoint.remainingEducationNeedAfterEducationSavings,
                netEducationNeedAmount: educationProjectionPoint.netEducationNeedAmount,
                currentDependentNeedAmount: educationProjectionPoint.currentDependentNeedAmount,
                projectedDependentNeedAmount: educationProjectionPoint.projectedDependentNeedAmount,
                untimedProjectedDependentNeedAmount: educationProjectionPoint.untimedProjectedDependentNeedAmount,
                grossCurrentDependentNeedAmount: educationProjectionPoint.grossCurrentDependentNeedAmount,
                grossProjectedDependentNeedAmount: educationProjectionPoint.grossProjectedDependentNeedAmount,
                grossUntimedProjectedDependentNeedAmount: educationProjectionPoint.grossUntimedProjectedDependentNeedAmount,
                remainingEducationSavingsOffsetAvailable: educationProjectionPoint.remainingEducationSavingsOffsetAvailable,
                includedDependentCount: educationProjectionPoint.includedDependentCount,
                excludedDependentCount: educationProjectionPoint.excludedDependentCount,
                educationTreatmentMode: educationProjectionPoint.trace?.educationTreatmentMode || null,
                effectiveEducationTreatmentMode:
                  educationProjectionPoint.trace?.effectiveEducationTreatmentMode || null,
                educationTreatmentNeedLineRule: educationProjectionPoint.trace?.educationTreatmentNeedLineRule || null,
                educationNeedDeclineReason: educationProjectionPoint.trace?.educationNeedDeclineReason || null,
                visibleEducationTreatmentControl:
                  educationProjectionPoint.trace?.visibleEducationTreatmentControl === true,
                educationPaymentScheduleMode: educationProjectionPoint.trace?.educationPaymentScheduleMode || null,
                educationPaymentScheduleModeSource: educationProjectionPoint.trace?.educationPaymentScheduleModeSource || null,
                educationResourceSpendingMode: educationProjectionPoint.trace?.educationResourceSpendingMode || null,
                effectiveEducationResourceSpendingMode:
                  educationProjectionPoint.trace?.effectiveEducationResourceSpendingMode || null,
                broaderEligibleResourceStatus: educationProjectionPoint.trace?.broaderEligibleResourceStatus || null,
                broaderEligibleResourceOffsetApplied:
                  educationProjectionPoint.trace?.broaderEligibleResourceOffsetApplied || 0,
                broaderEligibleResourceApplications:
                  educationProjectionPoint.trace?.broaderEligibleResourceApplications || [],
                needLineReductionAmountFromBroaderResources:
                  educationProjectionPoint.trace?.needLineReductionAmountFromBroaderResources || 0,
                resourceLineReductionAmountFromBroaderResources:
                  educationProjectionPoint.trace?.resourceLineReductionAmountFromBroaderResources || 0,
                needLineResourceLineReductionAmountsMatch:
                  educationProjectionPoint.trace?.needLineResourceLineReductionAmountsMatch === true,
                coverageStrategyScenarioSettingsSource: educationProjectionPoint.trace?.coverageStrategyScenarioSettingsSource || coverageStrategyScenarioSettings?.source || null,
                educationSavingsOffsetOwnership: educationProjectionPoint.trace?.educationSavingsOffsetOwnership || null,
                sourceFactsUsed: educationProjectionPoint.trace || {}
              }
            : null,
          healthcareProjection: healthcareProjectionPoint
            ? {
                healthcareNeedAmount: healthcareProjectionPoint.healthcareNeedAmount,
                includedRecordCount: healthcareProjectionPoint.includedRecordCount,
                excludedRecordCount: healthcareProjectionPoint.excludedRecordCount,
                sourceFactsUsed: healthcareProjectionPoint.trace || {}
              }
            : null,
          finalExpenseProjection: finalExpenseProjectionPoint
            ? {
                finalExpenseNeedAmount: finalExpenseProjectionPoint.finalExpenseNeedAmount,
                funeralBurialAmount: finalExpenseProjectionPoint.funeralBurialAmount,
                medicalEndOfLifeAmount: finalExpenseProjectionPoint.medicalEndOfLifeAmount,
                estateSettlementAmount: finalExpenseProjectionPoint.estateSettlementAmount,
                otherFinalExpenseAmount: finalExpenseProjectionPoint.otherFinalExpenseAmount,
                includedRecordCount: finalExpenseProjectionPoint.includedRecordCount,
                excludedRecordCount: finalExpenseProjectionPoint.excludedRecordCount,
                sourceFactsUsed: finalExpenseProjectionPoint.trace || {}
              }
            : null
        }
      });
    }

    const mortgageSupportOwnershipCleanPointCount = mortgageSupportOwnershipPointProofs.filter(Boolean).length;
    if (mortgageSupportOwnershipPointProofs.length > 0) {
      mortgageSupportOwnershipModel.noDoubleCountProof =
        mortgageSupportOwnershipCleanPointCount === mortgageSupportOwnershipPointProofs.length;
      mortgageSupportOwnershipModel.noDoubleCountProofStatus =
        mortgageSupportOwnershipModel.noDoubleCountProof
          ? "complete"
          : (mortgageSupportOwnershipCleanPointCount > 0 ? "partial" : "unproven");
      mortgageSupportOwnershipModel.noDoubleCountProofCleanPointCount = mortgageSupportOwnershipCleanPointCount;
      mortgageSupportOwnershipModel.noDoubleCountProofPointCount = mortgageSupportOwnershipPointProofs.length;
    }

    const needLineResult = {
      adapterVersion: COVERAGE_STRATEGY_NEED_LINE_ADAPTER_VERSION,
      status: dataGaps.length ? "partial" : "complete",
      cadence: "annual",
      valuationDate: valuationDateResult?.normalizedDate || normalizeString(safeInput.valuationDate || needsResult?.assumptions?.valuationDate),
      horizonYears,
      needPoints,
      componentPoints,
      assumptionsUsed: {
        method: "needsAnalysis",
        primaryNeedBasis: "grossNeedAmount",
        valuationDate: valuationDateResult?.normalizedDate || null,
        currentAge: currentAgeResult.currentAge,
        currentAgeSource: currentAgeResult.source,
        coverageStrategyScenarioSettings,
        supportDurationYears: supportModel.supportDurationYears,
        survivorIncomeOffsetPreservedOnly: true,
        assetOffsetsSubtracted: false,
        existingCoverageSubtracted: false,
        netCoverageGapUsedAsNeed: false,
        fallbackDateBasis: valuationDateResult ? null : DEFAULT_VALUATION_MONTH_DAY
      },
      componentModels: {
        coverageStrategyScenarioSettings,
        support: supportModel,
        mortgageSupportOwnershipTrace: {
          ...clonePlainValue(mortgageSupportOwnershipModel),
          mortgageImmediatePayoffAmount:
            mortgageSupportOwnershipModel.mortgageImmediatePayoffAmount || debtModel.mortgageImmediatePayoffAmount || 0,
          mortgageOwnedPaymentStreamTotal: debtModel.trace?.mortgageOwnedPaymentStreamTotal || 0,
          mortgageTiming: debtModel.mortgageTiming || null
        },
        discretionarySupport: discretionaryModel,
        debtAndMortgage: debtModel,
        mortgageLifetimeProjection: mortgageLifetimeProjection
          ? {
              status: mortgageLifetimeProjection.status,
              assumptionsUsed: mortgageLifetimeProjection.assumptionsUsed,
              trace: {
                ...(isPlainObject(mortgageLifetimeProjection.trace) ? clonePlainValue(mortgageLifetimeProjection.trace) : {}),
                rawMortgageMode: debtModel.trace?.rawMortgageMode || null,
                normalizedMortgageMode: debtModel.trace?.normalizedMortgageMode || null,
                projectionDecision: debtModel.trace?.mortgageProjectionDecision || null,
                projectionDecisionReason: debtModel.trace?.mortgageProjectionDecisionReason || null,
                reliableFactsAvailable:
                  debtModel.trace?.mortgageProjectionReliableFactsAvailable === true,
                factsUsed: debtModel.trace?.mortgageProjectionFactsUsed || {},
                rawPayoffPercent: debtModel.trace?.rawPayoffPercent ?? null,
                effectivePayoffPercent: debtModel.trace?.effectivePayoffPercent ?? null,
                partialPayoffAllowed: debtModel.trace?.partialPayoffAllowed === true,
                invariantCorrectionApplied: debtModel.trace?.invariantCorrectionApplied === true,
                correctionCode: debtModel.trace?.correctionCode || null
              },
              warnings: Array.isArray(mortgageLifetimeProjection.warnings)
                ? clonePlainValue(mortgageLifetimeProjection.warnings)
                : [],
              dataGaps: Array.isArray(mortgageLifetimeProjection.dataGaps)
                ? clonePlainValue(mortgageLifetimeProjection.dataGaps)
                : [],
              warningCount: Array.isArray(mortgageLifetimeProjection.warnings)
                ? mortgageLifetimeProjection.warnings.length
                : 0,
              dataGapCount: Array.isArray(mortgageLifetimeProjection.dataGaps)
                ? mortgageLifetimeProjection.dataGaps.length
                : 0
            }
          : null,
        mortgageProjectionTrace: {
          rawMortgageMode: debtModel.trace?.rawMortgageMode || null,
          normalizedMortgageMode: debtModel.trace?.normalizedMortgageMode || null,
          projectionDecision: debtModel.trace?.mortgageProjectionDecision || null,
          projectionDecisionReason: debtModel.trace?.mortgageProjectionDecisionReason || null,
          reliableFactsAvailable: debtModel.trace?.mortgageProjectionReliableFactsAvailable === true,
          factsUsed: debtModel.trace?.mortgageProjectionFactsUsed || {},
          rawPayoffPercent: debtModel.trace?.rawPayoffPercent ?? null,
          effectivePayoffPercent: debtModel.trace?.effectivePayoffPercent ?? null,
          partialPayoffAllowed: debtModel.trace?.partialPayoffAllowed === true,
          invariantCorrectionApplied: debtModel.trace?.invariantCorrectionApplied === true,
          correctionCode: debtModel.trace?.correctionCode || null,
          projectionConsumed: Boolean(mortgageLifetimeProjection)
        },
        debtLifetimeProjection: debtLifetimeProjection
          ? {
              status: debtLifetimeProjection.status,
              assumptionsUsed: debtLifetimeProjection.assumptionsUsed,
              debtPoints: Array.isArray(debtLifetimeProjection.debtPoints)
                ? clonePlainValue(debtLifetimeProjection.debtPoints)
                : [],
              debtRecordProjections: Array.isArray(debtLifetimeProjection.debtRecordProjections)
                ? clonePlainValue(debtLifetimeProjection.debtRecordProjections)
                : [],
              warnings: Array.isArray(debtLifetimeProjection.warnings)
                ? clonePlainValue(debtLifetimeProjection.warnings)
                : [],
              dataGaps: Array.isArray(debtLifetimeProjection.dataGaps)
                ? clonePlainValue(debtLifetimeProjection.dataGaps)
                : [],
              trace: isPlainObject(debtLifetimeProjection.trace)
                ? clonePlainValue(debtLifetimeProjection.trace)
                : {},
              warningCount: Array.isArray(debtLifetimeProjection.warnings)
                ? debtLifetimeProjection.warnings.length
                : 0,
              dataGapCount: Array.isArray(debtLifetimeProjection.dataGaps)
                ? debtLifetimeProjection.dataGaps.length
                : 0
            }
          : null,
        nonMortgageDebtLifetimeProjection: debtLifetimeProjection
          ? {
              status: debtLifetimeProjection.status,
              assumptionsUsed: debtLifetimeProjection.assumptionsUsed,
              debtPoints: Array.isArray(debtLifetimeProjection.debtPoints)
                ? clonePlainValue(debtLifetimeProjection.debtPoints)
                : [],
              debtRecordProjections: Array.isArray(debtLifetimeProjection.debtRecordProjections)
                ? clonePlainValue(debtLifetimeProjection.debtRecordProjections)
                : [],
              warnings: Array.isArray(debtLifetimeProjection.warnings)
                ? clonePlainValue(debtLifetimeProjection.warnings)
                : [],
              dataGaps: Array.isArray(debtLifetimeProjection.dataGaps)
                ? clonePlainValue(debtLifetimeProjection.dataGaps)
                : [],
              trace: isPlainObject(debtLifetimeProjection.trace)
                ? clonePlainValue(debtLifetimeProjection.trace)
                : {},
              warningCount: Array.isArray(debtLifetimeProjection.warnings)
                ? debtLifetimeProjection.warnings.length
                : 0,
              dataGapCount: Array.isArray(debtLifetimeProjection.dataGaps)
                ? debtLifetimeProjection.dataGaps.length
                : 0
            }
          : null,
        education: {
          ...educationModel,
          lifetimeProjection: educationLifetimeProjection
            ? {
                status: educationLifetimeProjection.status,
                aggregateFallbackUsed: educationLifetimeProjection.aggregateFallbackUsed === true,
                assumptionsUsed: educationLifetimeProjection.assumptionsUsed,
                currentDependentScheduleCount: Array.isArray(educationLifetimeProjection.currentDependentSchedules)
                  ? educationLifetimeProjection.currentDependentSchedules.length
                  : 0,
                projectedDependentScheduleCount: Array.isArray(educationLifetimeProjection.projectedDependentSchedules)
                  ? educationLifetimeProjection.projectedDependentSchedules.length
                  : 0,
                untimedProjectedDependentCount: Array.isArray(educationLifetimeProjection.untimedProjectedDependents)
                  ? educationLifetimeProjection.untimedProjectedDependents.length
                  : 0,
                excludedDependentCount: Array.isArray(educationLifetimeProjection.excludedDependents)
                  ? educationLifetimeProjection.excludedDependents.length
                  : 0,
                educationSavingsOffset: educationLifetimeProjection.educationSavingsOffset || null,
                educationResourceSpending: educationLifetimeProjection.educationResourceSpending || null,
                broaderEligibleResourceAllocation:
                  educationLifetimeProjection.broaderEligibleResourceAllocation || null,
                broaderEligibleResourceAllocationObligations:
                  Array.isArray(educationLifetimeProjection.broaderEligibleResourceAllocationObligations)
                    ? educationLifetimeProjection.broaderEligibleResourceAllocationObligations
                    : [],
                alreadyAppliedEducationSavings:
                  Array.isArray(educationLifetimeProjection.alreadyAppliedEducationSavings)
                    ? educationLifetimeProjection.alreadyAppliedEducationSavings
                    : [],
                educationTreatment: educationLifetimeProjection.educationTreatment || null,
                projectedDependentTimingMetadata:
                  educationLifetimeProjection.projectedDependentTimingMetadata || null,
                warningCount: Array.isArray(educationLifetimeProjection.warnings)
                  ? educationLifetimeProjection.warnings.length
                  : 0,
                dataGapCount: Array.isArray(educationLifetimeProjection.dataGaps)
                  ? educationLifetimeProjection.dataGaps.length
                  : 0,
                warnings: Array.isArray(educationLifetimeProjection.warnings)
                  ? educationLifetimeProjection.warnings
                  : [],
                dataGaps: Array.isArray(educationLifetimeProjection.dataGaps)
                  ? educationLifetimeProjection.dataGaps
                  : [],
                educationPoints: Array.isArray(educationLifetimeProjection.educationPoints)
                  ? educationLifetimeProjection.educationPoints
                  : [],
                currentDependentSchedules: Array.isArray(educationLifetimeProjection.currentDependentSchedules)
                  ? educationLifetimeProjection.currentDependentSchedules
                  : [],
                projectedDependentSchedules: Array.isArray(educationLifetimeProjection.projectedDependentSchedules)
                  ? educationLifetimeProjection.projectedDependentSchedules
                  : [],
                untimedProjectedDependents: Array.isArray(educationLifetimeProjection.untimedProjectedDependents)
                  ? educationLifetimeProjection.untimedProjectedDependents
                  : []
              }
            : null
        },
        healthcare: {
          ...healthcareModel,
          lifetimeProjection: healthcareLifetimeProjection
            ? {
                status: healthcareLifetimeProjection.status,
                aggregateFallbackUsed: healthcareLifetimeProjection.aggregateFallbackUsed === true,
                assumptionsUsed: healthcareLifetimeProjection.assumptionsUsed,
                includedRecordCount: Array.isArray(healthcareLifetimeProjection.includedRecords)
                  ? healthcareLifetimeProjection.includedRecords.length
                  : 0,
                excludedRecordCount: Array.isArray(healthcareLifetimeProjection.excludedRecords)
                  ? healthcareLifetimeProjection.excludedRecords.length
                  : 0,
                warningCount: Array.isArray(healthcareLifetimeProjection.warnings)
                  ? healthcareLifetimeProjection.warnings.length
                  : 0,
                dataGapCount: Array.isArray(healthcareLifetimeProjection.dataGaps)
                  ? healthcareLifetimeProjection.dataGaps.length
                  : 0,
                warnings: Array.isArray(healthcareLifetimeProjection.warnings)
                  ? healthcareLifetimeProjection.warnings
                  : [],
                dataGaps: Array.isArray(healthcareLifetimeProjection.dataGaps)
                  ? healthcareLifetimeProjection.dataGaps
                  : [],
                supportOwnedHealthcareExpenseExcludedCount:
                  healthcareLifetimeProjection.supportOwnedHealthcareExpenseExcludedCount || 0,
                healthcareLookingExcludedRecords: Array.isArray(healthcareLifetimeProjection.healthcareLookingExcludedRecords)
                  ? healthcareLifetimeProjection.healthcareLookingExcludedRecords
                  : [],
                excludedRecords: Array.isArray(healthcareLifetimeProjection.excludedRecords)
                  ? healthcareLifetimeProjection.excludedRecords
                  : [],
                healthcarePoints: Array.isArray(healthcareLifetimeProjection.healthcarePoints)
                  ? healthcareLifetimeProjection.healthcarePoints
                  : []
              }
            : null
        },
        transitionNeeds: {
          amount: transitionNeeds,
          timing: transitionNeedsLifetimeProjection?.projectionMode || DEFAULT_TRANSITION_TIMING,
          lifetimeProjection: transitionNeedsLifetimeProjection
            ? {
                status: transitionNeedsLifetimeProjection.status,
                projectionMode: transitionNeedsLifetimeProjection.projectionMode,
                assumptionsUsed: transitionNeedsLifetimeProjection.assumptionsUsed,
                warningCount: Array.isArray(transitionNeedsLifetimeProjection.warnings)
                  ? transitionNeedsLifetimeProjection.warnings.length
                  : 0,
                dataGapCount: Array.isArray(transitionNeedsLifetimeProjection.dataGaps)
                  ? transitionNeedsLifetimeProjection.dataGaps.length
                  : 0,
                warnings: Array.isArray(transitionNeedsLifetimeProjection.warnings)
                  ? transitionNeedsLifetimeProjection.warnings
                  : [],
                dataGaps: Array.isArray(transitionNeedsLifetimeProjection.dataGaps)
                  ? transitionNeedsLifetimeProjection.dataGaps
                  : [],
                transitionNeedPoints: Array.isArray(transitionNeedsLifetimeProjection.transitionNeedPoints)
                  ? transitionNeedsLifetimeProjection.transitionNeedPoints
                  : [],
                trace: isPlainObject(transitionNeedsLifetimeProjection.trace)
                  ? transitionNeedsLifetimeProjection.trace
                  : {}
              }
            : null
        },
        finalExpenses: {
          amount: finalExpenses,
          timing: DEFAULT_FINAL_EXPENSE_TIMING,
          trace: findTraceRow(needsResult, "finalExpenses")?.inputs || {},
          lifetimeProjection: finalExpenseLifetimeProjection
            ? {
                status: finalExpenseLifetimeProjection.status,
                staticFallbackUsed: finalExpenseLifetimeProjection.staticFallbackUsed === true,
                assumptionsUsed: finalExpenseLifetimeProjection.assumptionsUsed,
                includedRecordCount: Array.isArray(finalExpenseLifetimeProjection.includedRecords)
                  ? finalExpenseLifetimeProjection.includedRecords.length
                  : 0,
                excludedRecordCount: Array.isArray(finalExpenseLifetimeProjection.excludedRecords)
                  ? finalExpenseLifetimeProjection.excludedRecords.length
                  : 0,
                warningCount: Array.isArray(finalExpenseLifetimeProjection.warnings)
                  ? finalExpenseLifetimeProjection.warnings.length
                  : 0,
                dataGapCount: Array.isArray(finalExpenseLifetimeProjection.dataGaps)
                  ? finalExpenseLifetimeProjection.dataGaps.length
                  : 0,
                finalExpensePoints: Array.isArray(finalExpenseLifetimeProjection.finalExpensePoints)
                  ? finalExpenseLifetimeProjection.finalExpensePoints
                  : []
              }
            : null
        }
      },
      warnings,
      dataGaps,
      trace: {
        adapterVersion: COVERAGE_STRATEGY_NEED_LINE_ADAPTER_VERSION,
        source: "needsResult-plus-prepared-lens-model",
        inputNeedResultMethod: needsResult?.method || null,
        pointCount: needPoints.length,
        componentPointCount: componentPoints.length,
        warningCount: warnings.length,
        dataGapCount: dataGaps.length,
        displayHtmlUsed: false,
        netCoverageGapUsedAsNeed: false,
        assetOffsetSubtracted: false,
        existingCoverageSubtracted: false,
        survivorIncomeSubtractedFromNeedLine: false
      }
    };

    const buildObligationLedger = lensAnalysis.buildCoverageStrategyObligationLedger;
    if (typeof buildObligationLedger === "function") {
      const obligationLedger = buildObligationLedger({
        needPoints: needLineResult.needPoints,
        componentModels: needLineResult.componentModels,
        valuationDate: needLineResult.valuationDate,
        horizonYears: needLineResult.horizonYears
      });
      needLineResult.coverageStrategyObligationLedger = obligationLedger;
      needLineResult.componentModels.coverageStrategyObligationLedger = obligationLedger;
    }

    return needLineResult;
  }

  lensAnalysis.COVERAGE_STRATEGY_NEED_LINE_ADAPTER_VERSION = COVERAGE_STRATEGY_NEED_LINE_ADAPTER_VERSION;
  lensAnalysis.buildCoverageStrategyNeedLine = buildCoverageStrategyNeedLine;

  if (typeof module !== "undefined" && module.exports) {
    module.exports = {
      COVERAGE_STRATEGY_NEED_LINE_ADAPTER_VERSION,
      buildCoverageStrategyNeedLine
    };
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
