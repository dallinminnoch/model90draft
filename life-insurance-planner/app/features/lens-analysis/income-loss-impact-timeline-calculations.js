(function (global) {
  const LensApp = global.LensApp || (global.LensApp = {});
  const lensAnalysis = LensApp.lensAnalysis || (LensApp.lensAnalysis = {});

  // Owner: Lens analysis Income Loss Impact timeline helper.
  // Purpose: calculate fact-based, output-neutral household impact timeline
  // data from normalized linked profile / PMI facts. This file is intentionally
  // not wired into the page yet.
  // Non-goals: no DOM access, no storage access, no method calls, no
  // recommendation logic, no save/load behavior, no slider UI, and no model
  // mutation.

  const CALCULATION_VERSION = 1;
  const DEFAULT_DEPENDENT_MILESTONE_AGE = 18;
  const MONEY_FORMATTER = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0
  });

  function isPlainObject(value) {
    return Boolean(value && typeof value === "object" && !Array.isArray(value));
  }

  function normalizeString(value) {
    return String(value == null ? "" : value).trim();
  }

  function toOptionalNumber(value) {
    if (typeof lensAnalysis.toOptionalNumber === "function") {
      return lensAnalysis.toOptionalNumber(value);
    }

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
    return Number.isFinite(value) ? Number(value.toFixed(2)) : null;
  }

  function roundYears(value) {
    return Number.isFinite(value) ? Number(value.toFixed(6)) : null;
  }

  function formatMoney(value) {
    const number = toOptionalNumber(value);
    return number == null ? "Not available" : MONEY_FORMATTER.format(number);
  }

  function formatYearsMonths(value) {
    const yearsValue = toOptionalNumber(value);
    if (yearsValue == null || yearsValue < 0) {
      return "Not available";
    }

    const totalMonths = Math.round(yearsValue * 12);
    const years = Math.floor(totalMonths / 12);
    const months = totalMonths % 12;
    return `${years} ${years === 1 ? "year" : "years"} ${months} ${months === 1 ? "month" : "months"}`;
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
      sourcePaths: Array.isArray(sourcePaths) ? sourcePaths.slice() : []
    };
    if (details !== undefined) {
      dataGap.details = details;
    }
    return dataGap;
  }

  function formatDateOnly(date) {
    return [
      String(date.getFullYear()).padStart(4, "0"),
      String(date.getMonth() + 1).padStart(2, "0"),
      String(date.getDate()).padStart(2, "0")
    ].join("-");
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

  function addYears(date, years) {
    const output = new Date(date.getFullYear() + years, date.getMonth(), date.getDate());
    if (date.getMonth() === 1 && date.getDate() === 29 && output.getMonth() !== 1) {
      return new Date(date.getFullYear() + years, 1, 28);
    }
    return output;
  }

  function addMonths(date, months) {
    const output = new Date(date.getFullYear(), date.getMonth() + months, date.getDate());
    if (output.getDate() !== date.getDate()) {
      return new Date(output.getFullYear(), output.getMonth(), 0);
    }
    return output;
  }

  function calculateAge(dateOfBirth, asOfDate) {
    if (!dateOfBirth || !asOfDate) {
      return null;
    }

    let age = asOfDate.getFullYear() - dateOfBirth.getFullYear();
    const birthdayHasOccurred = asOfDate.getMonth() > dateOfBirth.getMonth()
      || (
        asOfDate.getMonth() === dateOfBirth.getMonth()
        && asOfDate.getDate() >= dateOfBirth.getDate()
      );
    if (!birthdayHasOccurred) {
      age -= 1;
    }

    return age >= 0 ? age : null;
  }

  function getPath(source, path) {
    return normalizeString(path)
      .split(".")
      .filter(Boolean)
      .reduce(function (current, key) {
        return current && typeof current === "object" ? current[key] : undefined;
      }, source);
  }

  function getNumber(source, path) {
    return toOptionalNumber(getPath(source, path));
  }

  function firstNumber(source, candidates) {
    const safeCandidates = Array.isArray(candidates) ? candidates : [];
    for (let index = 0; index < safeCandidates.length; index += 1) {
      const candidate = safeCandidates[index];
      const value = getNumber(source, candidate.path);
      if (value != null) {
        return {
          value,
          sourcePath: candidate.path
        };
      }
    }
    return {
      value: null,
      sourcePath: safeCandidates[0]?.path || null
    };
  }

  function sumKnownValues(items) {
    let total = 0;
    let hasAny = false;
    const sourcePaths = [];

    (Array.isArray(items) ? items : []).forEach(function (item) {
      const value = toOptionalNumber(item?.value);
      if (value == null) {
        return;
      }
      hasAny = true;
      total += value;
      if (item.sourcePath) {
        sourcePaths.push(item.sourcePath);
      }
    });

    return {
      value: hasAny ? total : null,
      sourcePaths
    };
  }

  function addUnique(target, values) {
    (Array.isArray(values) ? values : []).forEach(function (value) {
      const normalized = normalizeString(value);
      if (normalized && !target.includes(normalized)) {
        target.push(normalized);
      }
    });
  }

  function createEvent(options) {
    const safeOptions = isPlainObject(options) ? options : {};
    return {
      id: normalizeString(safeOptions.id),
      type: normalizeString(safeOptions.type),
      date: safeOptions.date || null,
      age: safeOptions.age == null ? null : safeOptions.age,
      label: normalizeString(safeOptions.label),
      amount: safeOptions.amount == null ? null : roundMoney(safeOptions.amount),
      sourcePaths: Array.isArray(safeOptions.sourcePaths) ? safeOptions.sourcePaths.slice() : [],
      confidence: normalizeString(safeOptions.confidence) || "unknown",
      warnings: Array.isArray(safeOptions.warnings) ? safeOptions.warnings.slice() : []
    };
  }

  function createSummaryCard(id, title, value, displayValue, status, sourcePaths) {
    return {
      id,
      title,
      value: value == null ? null : value,
      displayValue,
      status,
      sourcePaths: Array.isArray(sourcePaths) ? sourcePaths.slice() : []
    };
  }

  function addDataGap(output, code, label, sourcePaths, details) {
    const dataGap = createDataGap(code, label, sourcePaths, details);
    output.dataGaps.push(dataGap);
    output.timelineEvents.push(createEvent({
      id: `data-gap-${code}`,
      type: "dataGap",
      date: output.selectedDeath.date,
      age: output.selectedDeath.age,
      label,
      sourcePaths,
      confidence: "missing",
      warnings: [code]
    }));
    return dataGap;
  }

  function getDependentDetailsFromProfile(profileRecord) {
    const source = profileRecord?.dependentDetails;
    if (Array.isArray(source)) {
      return source;
    }

    if (typeof source !== "string" || !source.trim()) {
      return [];
    }

    try {
      const parsed = JSON.parse(source);
      return Array.isArray(parsed) ? parsed : [];
    } catch (_error) {
      return [];
    }
  }

  function getDependentRows(lensModel, profileRecord) {
    const canonicalDetails = getPath(lensModel, "educationSupport.currentDependentDetails");
    const sourceDetails = Array.isArray(canonicalDetails)
      ? canonicalDetails
      : getDependentDetailsFromProfile(profileRecord);

    return (Array.isArray(sourceDetails) ? sourceDetails : [])
      .map(function (detail, index) {
        if (!isPlainObject(detail)) {
          return null;
        }
        const rawDateOfBirth = normalizeString(detail.dateOfBirth || detail.birthDate);
        const parsedDateOfBirth = parseDateOnly(rawDateOfBirth);
        if (!parsedDateOfBirth) {
          return null;
        }
        return {
          id: normalizeString(detail.id) || `dependent-${index + 1}`,
          index,
          dateOfBirth: parsedDateOfBirth.normalizedDate,
          sourcePath: Array.isArray(canonicalDetails)
            ? `educationSupport.currentDependentDetails[${index}].dateOfBirth`
            : `profileRecord.dependentDetails[${index}].dateOfBirth`
        };
      })
      .filter(Boolean);
  }

  function resolveSelectedDeath(input, output, parsedDateOfBirth, parsedValuationDate) {
    const selectedDeathAge = toOptionalNumber(input?.selectedDeathAge);
    const parsedSelectedDeathDate = parseDateOnly(input?.selectedDeathDate);
    const hasDateOfBirth = Boolean(parsedDateOfBirth);
    let selectedDate = null;
    let selectedAge = null;
    let source = "unresolved";
    let status = "unresolved";

    if (hasDateOfBirth && selectedDeathAge != null) {
      selectedDate = addYears(parsedDateOfBirth.date, Math.round(selectedDeathAge));
      selectedAge = selectedDeathAge;
      source = "selectedDeathAge";
      status = "resolved";
    } else if (parsedSelectedDeathDate) {
      selectedDate = parsedSelectedDeathDate.date;
      selectedAge = hasDateOfBirth ? calculateAge(parsedDateOfBirth.date, selectedDate) : null;
      source = "selectedDeathDate";
      status = hasDateOfBirth ? "resolved" : "date-only";
    } else if (hasDateOfBirth && parsedValuationDate) {
      selectedDate = parsedValuationDate.date;
      selectedAge = calculateAge(parsedDateOfBirth.date, selectedDate);
      source = "valuationDate";
      status = "defaulted";
    } else if (selectedDeathAge != null) {
      selectedAge = selectedDeathAge;
      source = "selectedDeathAge";
      status = "age-only";
    }

    output.selectedDeath = {
      date: selectedDate ? formatDateOnly(selectedDate) : null,
      age: selectedAge == null ? null : selectedAge,
      source,
      status
    };
  }

  function createBaseOutput() {
    return {
      version: CALCULATION_VERSION,
      selectedDeath: {
        date: null,
        age: null,
        source: "unresolved",
        status: "unresolved"
      },
      summaryCards: [],
      householdImpact: {},
      incomeImpact: {},
      obligations: {},
      liquidity: {},
      dependents: {
        rows: [],
        milestones: []
      },
      timelineEvents: [],
      warnings: [],
      dataGaps: [],
      trace: {
        sourcePaths: [],
        formula: []
      }
    };
  }

  function calculateIncomeLossImpactTimeline(input) {
    const safeInput = isPlainObject(input) ? input : {};
    const output = createBaseOutput();
    const lensModel = isPlainObject(safeInput.lensModel) ? safeInput.lensModel : {};
    const profileRecord = isPlainObject(safeInput.profileRecord) ? safeInput.profileRecord : null;
    const parsedValuationDate = parseDateOnly(safeInput.valuationDate);
    const clientDateOfBirth = getPath(lensModel, "profileFacts.clientDateOfBirth");
    const parsedDateOfBirth = parseDateOnly(clientDateOfBirth);

    if (!isPlainObject(safeInput.lensModel)) {
      output.warnings.push(createWarning("missing-lens-model", "lensModel is required; sparse output was returned."));
    }

    if (!parsedValuationDate) {
      addDataGap(output, "missing-valuation-date", "Valuation date is required for deterministic age and date math.", ["valuationDate"]);
    }

    if (!parsedDateOfBirth) {
      addDataGap(output, "missing-client-dob", "Client date of birth is missing or invalid.", ["profileFacts.clientDateOfBirth"]);
    }

    resolveSelectedDeath(safeInput, output, parsedDateOfBirth, parsedValuationDate);
    if (output.selectedDeath.date || output.selectedDeath.age != null) {
      output.timelineEvents.push(createEvent({
        id: "death-event",
        type: "death",
        date: output.selectedDeath.date,
        age: output.selectedDeath.age,
        label: "Selected death event",
        sourcePaths: ["selectedDeathDate", "selectedDeathAge", "profileFacts.clientDateOfBirth"],
        confidence: output.selectedDeath.status === "resolved" ? "calculated" : output.selectedDeath.status
      }));
    }

    const insuredIncome = firstNumber(lensModel, [
      { path: "incomeBasis.annualIncomeReplacementBase" },
      { path: "incomeBasis.insuredNetAnnualIncome" },
      { path: "incomeBasis.insuredGrossAnnualIncome" }
    ]);
    if (insuredIncome.value == null) {
      addDataGap(output, "missing-insured-income", "Insured income is missing.", ["incomeBasis.annualIncomeReplacementBase", "incomeBasis.insuredNetAnnualIncome", "incomeBasis.insuredGrossAnnualIncome"]);
    } else {
      output.timelineEvents.push(createEvent({
        id: "insured-income-stops",
        type: "incomeStops",
        date: output.selectedDeath.date,
        age: output.selectedDeath.age,
        label: "Insured income stops",
        amount: insuredIncome.value,
        sourcePaths: [insuredIncome.sourcePath],
        confidence: "reported"
      }));
      addUnique(output.trace.sourcePaths, [insuredIncome.sourcePath]);
    }

    const survivorIncome = firstNumber(lensModel, [
      { path: "survivorScenario.survivorNetAnnualIncome" },
      { path: "survivorScenario.survivorGrossAnnualIncome" },
      { path: "incomeBasis.spouseOrPartnerNetAnnualIncome" },
      { path: "incomeBasis.spouseOrPartnerGrossAnnualIncome" }
    ]);
    const survivorIncomeStartDelayMonths = Math.max(
      0,
      toOptionalNumber(getPath(lensModel, "survivorScenario.survivorIncomeStartDelayMonths")) || 0
    );
    if (survivorIncome.value == null) {
      addDataGap(output, "missing-survivor-income", "Survivor income is missing.", ["survivorScenario.survivorNetAnnualIncome", "survivorScenario.survivorGrossAnnualIncome"]);
    } else {
      const deathDate = parseDateOnly(output.selectedDeath.date);
      const survivorIncomeStartDate = deathDate
        ? formatDateOnly(addMonths(deathDate.date, survivorIncomeStartDelayMonths))
        : null;
      output.timelineEvents.push(createEvent({
        id: "survivor-income-continues",
        type: "survivorIncomeContinues",
        date: survivorIncomeStartDate,
        age: output.selectedDeath.age,
        label: survivorIncomeStartDelayMonths > 0
          ? `Survivor income begins after ${survivorIncomeStartDelayMonths} months`
          : "Survivor income continues",
        amount: survivorIncome.value,
        sourcePaths: [survivorIncome.sourcePath, "survivorScenario.survivorIncomeStartDelayMonths"],
        confidence: "calculated"
      }));
      addUnique(output.trace.sourcePaths, [survivorIncome.sourcePath, "survivorScenario.survivorIncomeStartDelayMonths"]);
    }

    const annualEssentialExpenses = firstNumber(lensModel, [
      { path: "ongoingSupport.annualTotalEssentialSupportCost" },
      { path: "ongoingSupport.annualNonHousingEssentialSupportCost" }
    ]);
    const monthlyEssentialExpenses = getNumber(lensModel, "ongoingSupport.monthlyTotalEssentialSupportCost");
    const resolvedAnnualEssentialExpenses = annualEssentialExpenses.value == null && monthlyEssentialExpenses != null
      ? monthlyEssentialExpenses * 12
      : annualEssentialExpenses.value;
    const annualEssentialSourcePaths = annualEssentialExpenses.value == null && monthlyEssentialExpenses != null
      ? ["ongoingSupport.monthlyTotalEssentialSupportCost"]
      : [annualEssentialExpenses.sourcePath];
    if (resolvedAnnualEssentialExpenses == null) {
      addDataGap(output, "missing-annual-essential-expenses", "Annual essential household expenses are missing.", ["ongoingSupport.annualTotalEssentialSupportCost", "ongoingSupport.monthlyTotalEssentialSupportCost"]);
    }

    const coverage = firstNumber(lensModel, [
      { path: "existingCoverage.totalExistingCoverage" },
      { path: "existingCoverage.totalProfileCoverage" }
    ]);
    if (coverage.value == null) {
      addDataGap(output, "missing-existing-coverage", "Existing coverage is missing.", ["existingCoverage.totalExistingCoverage"]);
    } else {
      output.timelineEvents.push(createEvent({
        id: "coverage-available",
        type: "coverageAvailable",
        date: output.selectedDeath.date,
        age: output.selectedDeath.age,
        label: "Existing coverage available",
        amount: coverage.value,
        sourcePaths: [coverage.sourcePath],
        confidence: "calculated"
      }));
      addUnique(output.trace.sourcePaths, [coverage.sourcePath]);
    }

    const availableAssets = firstNumber(lensModel, [
      { path: "offsetAssets.totalAvailableOffsetAssetValue" }
    ]);
    const fallbackAssets = sumKnownValues([
      { value: getNumber(lensModel, "offsetAssets.cashSavings.availableValue"), sourcePath: "offsetAssets.cashSavings.availableValue" },
      { value: getNumber(lensModel, "offsetAssets.currentEmergencyFund.availableValue"), sourcePath: "offsetAssets.currentEmergencyFund.availableValue" },
      { value: getNumber(lensModel, "offsetAssets.brokerageAccounts.availableValue"), sourcePath: "offsetAssets.brokerageAccounts.availableValue" },
      { value: getNumber(lensModel, "offsetAssets.retirementAccounts.availableValue"), sourcePath: "offsetAssets.retirementAccounts.availableValue" },
      { value: getNumber(lensModel, "offsetAssets.realEstateEquity.availableValue"), sourcePath: "offsetAssets.realEstateEquity.availableValue" },
      { value: getNumber(lensModel, "offsetAssets.businessValue.availableValue"), sourcePath: "offsetAssets.businessValue.availableValue" }
    ]);
    const availableAssetValue = availableAssets.value == null ? fallbackAssets.value : availableAssets.value;
    const availableAssetSourcePaths = availableAssets.value == null
      ? fallbackAssets.sourcePaths
      : [availableAssets.sourcePath];
    if (availableAssetValue == null) {
      addDataGap(output, "missing-assets-liquidity", "Available asset and liquidity facts are missing.", ["offsetAssets.totalAvailableOffsetAssetValue"]);
    }

    const finalExpenses = firstNumber(lensModel, [
      { path: "finalExpenses.totalFinalExpenseNeed" }
    ]);
    if (finalExpenses.value != null) {
      output.timelineEvents.push(createEvent({
        id: "final-expenses-due",
        type: "finalExpensesDue",
        date: output.selectedDeath.date,
        age: output.selectedDeath.age,
        label: "Final expenses due",
        amount: finalExpenses.value,
        sourcePaths: [finalExpenses.sourcePath],
        confidence: "calculated"
      }));
    }

    const transitionNeeds = firstNumber(lensModel, [
      { path: "transitionNeeds.totalTransitionNeed" }
    ]);
    const mortgage = firstNumber(lensModel, [
      { path: "debtPayoff.mortgageBalance" }
    ]);
    if (mortgage.value != null) {
      output.timelineEvents.push(createEvent({
        id: "mortgage-obligation",
        type: "mortgageObligation",
        date: output.selectedDeath.date,
        age: output.selectedDeath.age,
        label: "Mortgage obligation",
        amount: mortgage.value,
        sourcePaths: [mortgage.sourcePath],
        confidence: "reported"
      }));
    }

    const debtPayoffTotal = firstNumber(lensModel, [
      { path: "debtPayoff.totalDebtPayoffNeed" }
    ]);
    const nonMortgageDebt = sumKnownValues([
      { value: getNumber(lensModel, "debtPayoff.otherRealEstateLoanBalance"), sourcePath: "debtPayoff.otherRealEstateLoanBalance" },
      { value: getNumber(lensModel, "debtPayoff.autoLoanBalance"), sourcePath: "debtPayoff.autoLoanBalance" },
      { value: getNumber(lensModel, "debtPayoff.creditCardBalance"), sourcePath: "debtPayoff.creditCardBalance" },
      { value: getNumber(lensModel, "debtPayoff.studentLoanBalance"), sourcePath: "debtPayoff.studentLoanBalance" },
      { value: getNumber(lensModel, "debtPayoff.personalLoanBalance"), sourcePath: "debtPayoff.personalLoanBalance" },
      { value: getNumber(lensModel, "debtPayoff.businessDebtBalance"), sourcePath: "debtPayoff.businessDebtBalance" },
      { value: getNumber(lensModel, "debtPayoff.outstandingTaxLiabilities"), sourcePath: "debtPayoff.outstandingTaxLiabilities" },
      { value: getNumber(lensModel, "debtPayoff.otherDebtPayoffNeeds"), sourcePath: "debtPayoff.otherDebtPayoffNeeds" }
    ]);
    if (nonMortgageDebt.value != null || debtPayoffTotal.value != null) {
      const eventAmount = nonMortgageDebt.value == null
        ? debtPayoffTotal.value
        : nonMortgageDebt.value;
      const sourcePaths = nonMortgageDebt.value == null
        ? [debtPayoffTotal.sourcePath]
        : nonMortgageDebt.sourcePaths;
      output.timelineEvents.push(createEvent({
        id: "debt-obligation",
        type: "debtObligation",
        date: output.selectedDeath.date,
        age: output.selectedDeath.age,
        label: "Debt obligations",
        amount: eventAmount,
        sourcePaths,
        confidence: "reported"
      }));
    }

    const immediateDebt = debtPayoffTotal.value == null
      ? sumKnownValues([
          { value: nonMortgageDebt.value, sourcePath: "debtPayoff.nonMortgageComponents" },
          { value: mortgage.value, sourcePath: "debtPayoff.mortgageBalance" }
        ])
      : {
          value: debtPayoffTotal.value,
          sourcePaths: [debtPayoffTotal.sourcePath]
        };
    const immediateObligations = sumKnownValues([
      { value: finalExpenses.value, sourcePath: finalExpenses.sourcePath },
      { value: transitionNeeds.value, sourcePath: transitionNeeds.sourcePath },
      { value: immediateDebt.value, sourcePath: immediateDebt.sourcePaths.join(" + ") }
    ]);

    const totalResources = sumKnownValues([
      { value: coverage.value, sourcePath: coverage.sourcePath },
      { value: availableAssetValue, sourcePath: availableAssetSourcePaths.join(" + ") }
    ]);
    const netAvailableResources = totalResources.value == null
      ? null
      : totalResources.value - (immediateObligations.value == null ? 0 : immediateObligations.value);

    if (totalResources.value != null) {
      output.timelineEvents.push(createEvent({
        id: "liquidity-checkpoint",
        type: "liquidityCheckpoint",
        date: output.selectedDeath.date,
        age: output.selectedDeath.age,
        label: "Available coverage and liquidity",
        amount: netAvailableResources,
        sourcePaths: totalResources.sourcePaths.concat(immediateObligations.sourcePaths),
        confidence: "calculated"
      }));
    }

    const annualShortfall = resolvedAnnualEssentialExpenses == null || survivorIncome.value == null
      ? null
      : resolvedAnnualEssentialExpenses - survivorIncome.value;
    if (annualShortfall != null) {
      output.timelineEvents.push(createEvent({
        id: "household-expense-runway",
        type: "householdExpenseRunway",
        date: output.selectedDeath.date,
        age: output.selectedDeath.age,
        label: annualShortfall > 0 ? "Annual household shortfall" : "No annual household shortfall",
        amount: Math.max(0, annualShortfall),
        sourcePaths: annualEssentialSourcePaths.concat([survivorIncome.sourcePath]),
        confidence: "calculated"
      }));
    }

    let yearsOfFinancialSecurity = null;
    let yearsOfFinancialSecurityStatus = "notAvailable";
    if (annualShortfall == null) {
      output.warnings.push(createWarning("missing-annual-shortfall", "Years of Financial Security was not calculated because annual shortfall inputs are missing."));
    } else if (annualShortfall <= 0) {
      yearsOfFinancialSecurityStatus = "noShortfall";
      output.warnings.push(createWarning("no-annual-household-shortfall", "Years of Financial Security was not calculated because survivor income covers annual essential expenses."));
    } else if (netAvailableResources == null) {
      output.warnings.push(createWarning("missing-net-available-resources", "Years of Financial Security was not calculated because coverage and liquidity facts are missing."));
    } else {
      yearsOfFinancialSecurity = Math.max(0, netAvailableResources) / annualShortfall;
      yearsOfFinancialSecurityStatus = "available";
      const deathDate = parseDateOnly(output.selectedDeath.date);
      if (deathDate) {
        output.timelineEvents.push(createEvent({
          id: "support-need-ends",
          type: "supportNeedEnds",
          date: formatDateOnly(addMonths(deathDate.date, Math.round(yearsOfFinancialSecurity * 12))),
          age: output.selectedDeath.age == null ? null : roundYears(output.selectedDeath.age + yearsOfFinancialSecurity),
          label: "Estimated security runway ends",
          sourcePaths: ["incomeLossImpact.formula.yearsOfFinancialSecurity"],
          confidence: "calculated"
        }));
      }
    }

    output.householdImpact = {
      annualEssentialExpenses: resolvedAnnualEssentialExpenses == null ? null : roundMoney(resolvedAnnualEssentialExpenses),
      annualHouseholdShortfall: annualShortfall == null ? null : roundMoney(Math.max(0, annualShortfall))
    };
    output.incomeImpact = {
      insuredIncomeStopped: insuredIncome.value == null ? null : roundMoney(insuredIncome.value),
      survivorIncome: survivorIncome.value == null ? null : roundMoney(survivorIncome.value),
      survivorIncomeStartDelayMonths,
      annualHouseholdShortfall: output.householdImpact.annualHouseholdShortfall
    };
    output.obligations = {
      finalExpenses: finalExpenses.value == null ? null : roundMoney(finalExpenses.value),
      transitionNeeds: transitionNeeds.value == null ? null : roundMoney(transitionNeeds.value),
      debtPayoff: immediateDebt.value == null ? null : roundMoney(immediateDebt.value),
      mortgageBalance: mortgage.value == null ? null : roundMoney(mortgage.value),
      immediateObligationsTotal: immediateObligations.value == null ? null : roundMoney(immediateObligations.value)
    };
    output.liquidity = {
      existingCoverage: coverage.value == null ? null : roundMoney(coverage.value),
      availableAssets: availableAssetValue == null ? null : roundMoney(availableAssetValue),
      netAvailableResources: netAvailableResources == null ? null : roundMoney(netAvailableResources)
    };

    const dependentRows = getDependentRows(lensModel, profileRecord);
    output.dependents.rows = dependentRows;
    dependentRows.forEach(function (dependent) {
      const parsedDependentBirthDate = parseDateOnly(dependent.dateOfBirth);
      const milestoneDate = parsedDependentBirthDate
        ? addYears(parsedDependentBirthDate.date, DEFAULT_DEPENDENT_MILESTONE_AGE)
        : null;
      const milestone = {
        id: `${dependent.id}-age-${DEFAULT_DEPENDENT_MILESTONE_AGE}`,
        dependentId: dependent.id,
        date: milestoneDate ? formatDateOnly(milestoneDate) : null,
        age: DEFAULT_DEPENDENT_MILESTONE_AGE,
        label: `Dependent reaches age ${DEFAULT_DEPENDENT_MILESTONE_AGE}`,
        sourcePaths: [dependent.sourcePath]
      };
      output.dependents.milestones.push(milestone);
      output.timelineEvents.push(createEvent({
        id: `dependent-milestone-${dependent.id}`,
        type: "dependentMilestone",
        date: milestone.date,
        label: milestone.label,
        sourcePaths: milestone.sourcePaths,
        confidence: "calculated"
      }));
    });

    const linkedDependentCount = getNumber(lensModel, "educationSupport.linkedDependentCount");
    if (!dependentRows.length && linkedDependentCount != null && linkedDependentCount > 0) {
      addDataGap(output, "missing-dependent-dobs", "Dependent date of birth details are missing; dependent milestones cannot be dated.", ["educationSupport.linkedDependentCount", "educationSupport.currentDependentDetails"]);
    }

    const educationFunding = firstNumber(lensModel, [
      { path: "educationSupport.totalEducationFundingNeed" },
      { path: "educationSupport.linkedDependentEducationFundingNeed" }
    ]);
    if (educationFunding.value != null && dependentRows.length) {
      const firstMilestone = output.dependents.milestones[0];
      output.timelineEvents.push(createEvent({
        id: "education-window",
        type: "educationWindow",
        date: firstMilestone?.date || null,
        label: "Education funding window",
        amount: educationFunding.value,
        sourcePaths: [educationFunding.sourcePath, "educationSupport.currentDependentDetails"],
        confidence: "calculated"
      }));
    } else if (educationFunding.value != null && linkedDependentCount != null && linkedDependentCount > 0) {
      addDataGap(output, "missing-education-window-dates", "Education funding exists, but dependent birth dates are missing.", [educationFunding.sourcePath, "educationSupport.currentDependentDetails"]);
    }

    output.summaryCards = [
      createSummaryCard(
        "yearsOfFinancialSecurity",
        "Years of Financial Security",
        yearsOfFinancialSecurity == null ? null : roundYears(yearsOfFinancialSecurity),
        yearsOfFinancialSecurityStatus === "noShortfall"
          ? "No shortfall"
          : formatYearsMonths(yearsOfFinancialSecurity),
        yearsOfFinancialSecurityStatus,
        ["incomeLossImpact.formula.yearsOfFinancialSecurity"]
      ),
      createSummaryCard(
        "existingCoverageAvailable",
        "Existing Coverage Available",
        coverage.value == null ? null : roundMoney(coverage.value),
        formatMoney(coverage.value),
        coverage.value == null ? "notAvailable" : "available",
        [coverage.sourcePath]
      ),
      createSummaryCard(
        "annualHouseholdShortfall",
        "Annual Household Shortfall",
        annualShortfall == null ? null : roundMoney(Math.max(0, annualShortfall)),
        annualShortfall == null ? "Not available" : formatMoney(Math.max(0, annualShortfall)),
        annualShortfall == null ? "notAvailable" : (annualShortfall <= 0 ? "noShortfall" : "available"),
        annualEssentialSourcePaths.concat([survivorIncome.sourcePath])
      ),
      createSummaryCard(
        "immediateObligations",
        "Immediate Obligations",
        immediateObligations.value == null ? null : roundMoney(immediateObligations.value),
        formatMoney(immediateObligations.value),
        immediateObligations.value == null ? "notAvailable" : "available",
        immediateObligations.sourcePaths
      )
    ];

    output.trace.formula.push(
      "netAvailableResources = existingCoverage.totalExistingCoverage + liquid/available current assets - immediate obligations",
      "annualHouseholdShortfall = ongoingSupport.annualTotalEssentialSupportCost - survivorScenario.survivorNetAnnualIncome",
      "yearsOfFinancialSecurity = netAvailableResources / annualHouseholdShortfall",
      "immediate obligations include finalExpenses.totalFinalExpenseNeed + transitionNeeds.totalTransitionNeed + debtPayoff.totalDebtPayoffNeed when available"
    );
    addUnique(output.trace.sourcePaths, totalResources.sourcePaths);
    addUnique(output.trace.sourcePaths, immediateObligations.sourcePaths);
    addUnique(output.trace.sourcePaths, annualEssentialSourcePaths);

    return output;
  }

  lensAnalysis.calculateIncomeLossImpactTimeline = calculateIncomeLossImpactTimeline;
})(typeof globalThis !== "undefined" ? globalThis : this);
