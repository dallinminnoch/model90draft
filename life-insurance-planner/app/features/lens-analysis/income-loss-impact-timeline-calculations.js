(function (global) {
  const LensApp = global.LensApp || (global.LensApp = {});
  const lensAnalysis = LensApp.lensAnalysis || (LensApp.lensAnalysis = {});

  // Owner: Lens analysis Income Loss Impact timeline helper.
  // Purpose: calculate fact-based, output-neutral household impact timeline
  // data from normalized linked profile / PMI facts for the Income Impact page.
  // Non-goals: no DOM access, no storage access, no method calls, no
  // recommendation logic, no save/load behavior, no UI state ownership, and no
  // model mutation.

  const CALCULATION_VERSION = 1;
  const DEFAULT_DEPENDENT_MILESTONE_AGE = 18;
  const DEFAULT_RUNWAY_PROJECTION_YEARS = 40;
  const MIN_RUNWAY_PROJECTION_YEARS = 5;
  const MAX_RUNWAY_PROJECTION_YEARS = 100;
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

  function clampNumber(value, min, max) {
    const number = toOptionalNumber(value);
    if (number == null) {
      return null;
    }
    return Math.max(min, Math.min(max, number));
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

  function getYearsMonthsParts(value) {
    const yearsValue = toOptionalNumber(value);
    if (yearsValue == null || yearsValue < 0) {
      return {
        years: null,
        months: null,
        totalMonths: null
      };
    }

    const totalMonths = Math.round(yearsValue * 12);
    return {
      years: Math.floor(totalMonths / 12),
      months: totalMonths % 12,
      totalMonths
    };
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

  function uniqueStrings(values) {
    return Array.from(new Set(
      (Array.isArray(values) ? values : [])
        .map(normalizeString)
        .filter(Boolean)
    ));
  }

  function createRunwayValue(value, sourcePath, sourcePaths, status) {
    const normalizedValue = toOptionalNumber(value);
    const normalizedSourcePaths = uniqueStrings(
      Array.isArray(sourcePaths) && sourcePaths.length
        ? sourcePaths
        : (sourcePath ? [sourcePath] : [])
    );

    return {
      value: normalizedValue,
      sourcePath: sourcePath || normalizedSourcePaths[0] || null,
      sourcePaths: normalizedSourcePaths,
      status: status || (normalizedValue == null ? "missing" : "available")
    };
  }

  function createMissingRunwayValue(sourcePaths, status) {
    return createRunwayValue(null, null, sourcePaths, status || "missing");
  }

  function firstRunwayValue(source, candidates) {
    const safeCandidates = Array.isArray(candidates) ? candidates : [];
    for (let index = 0; index < safeCandidates.length; index += 1) {
      const candidate = safeCandidates[index];
      const value = getNumber(source, candidate.path);
      if (value != null) {
        return createRunwayValue(
          value,
          candidate.path,
          candidate.sourcePaths || [candidate.path],
          candidate.status
        );
      }
    }
    return createMissingRunwayValue(
      safeCandidates.map(function (candidate) {
        return candidate.path;
      }),
      "missing"
    );
  }

  function resolveProjectedAssetOffsetCandidate(lensModel, treatedAssetValue) {
    const projectedAssetOffset = isPlainObject(lensModel?.projectedAssetOffset)
      ? lensModel.projectedAssetOffset
      : null;
    const metadata = isPlainObject(projectedAssetOffset?.metadata)
      ? projectedAssetOffset.metadata
      : {};
    const effectiveProjectedAssetOffset = getNumber(lensModel, "projectedAssetOffset.effectiveProjectedAssetOffset");
    const currentTreatedAssetOffset = getNumber(lensModel, "projectedAssetOffset.currentTreatedAssetOffset");
    const projectedGrowthAdjustment = getNumber(lensModel, "projectedAssetOffset.projectedGrowthAdjustment");
    const projectionYears = getNumber(lensModel, "projectedAssetOffset.projectionYears");
    const sourceMode = normalizeString(projectedAssetOffset?.sourceMode || metadata.sourceMode);
    const activationStatus = normalizeString(projectedAssetOffset?.activationStatus || metadata.activationStatus);
    const consumptionStatus = normalizeString(projectedAssetOffset?.consumptionStatus || metadata.consumptionStatus);
    const consumedByMethods = projectedAssetOffset?.consumedByMethods === true
      || metadata.consumedByMethods === true
      || activationStatus === "method-active"
      || consumptionStatus === "method-active";
    const treatedBaseMatches = treatedAssetValue != null
      && currentTreatedAssetOffset != null
      && roundMoney(currentTreatedAssetOffset) === roundMoney(treatedAssetValue);
    const active = Boolean(
      projectedAssetOffset
      && consumedByMethods
      && sourceMode === "projectedOffsets"
      && effectiveProjectedAssetOffset != null
      && effectiveProjectedAssetOffset > 0
      && projectedGrowthAdjustment != null
      && projectedGrowthAdjustment > 0
      && projectionYears != null
      && projectionYears > 0
      && treatedBaseMatches
    );

    return {
      active,
      value: active ? effectiveProjectedAssetOffset : null,
      sourcePath: active ? "projectedAssetOffset.effectiveProjectedAssetOffset" : null,
      sourcePaths: uniqueStrings([
        "projectedAssetOffset.effectiveProjectedAssetOffset",
        "projectedAssetOffset.currentTreatedAssetOffset",
        "projectedAssetOffset.projectedGrowthAdjustment",
        "projectedAssetOffset.projectionYears",
        "projectedAssetOffset.activationStatus",
        "projectedAssetOffset.consumptionStatus",
        "projectedAssetOffset.metadata.consumedByMethods"
      ]),
      status: active ? "method-active-used" : "excluded",
      reason: active ? null : "projected-asset-offset-not-method-active",
      sourceMode: sourceMode || null,
      activationStatus: activationStatus || null,
      consumptionStatus: consumptionStatus || null,
      consumedByMethods,
      currentTreatedAssetOffset,
      projectedGrowthAdjustment,
      effectiveProjectedAssetOffset,
      projectionYears
    };
  }

  function resolveCoverageRunwayInput(lensModel) {
    const treatedCoverage = firstRunwayValue(lensModel, [
      { path: "treatedExistingCoverageOffset.totalTreatedCoverageOffset", status: "treated" }
    ]);
    if (treatedCoverage.value != null) {
      return treatedCoverage;
    }

    const rawCoverage = firstRunwayValue(lensModel, [
      { path: "existingCoverage.totalExistingCoverage", status: "raw-fallback" },
      { path: "existingCoverage.totalProfileCoverage", status: "raw-fallback" }
    ]);
    if (rawCoverage.value != null) {
      return {
        ...rawCoverage,
        sourcePaths: uniqueStrings(treatedCoverage.sourcePaths.concat(rawCoverage.sourcePaths))
      };
    }

    return createMissingRunwayValue(
      treatedCoverage.sourcePaths.concat(rawCoverage.sourcePaths),
      "missing"
    );
  }

  function resolveAssetRunwayInput(lensModel) {
    const treatedAssets = firstRunwayValue(lensModel, [
      { path: "treatedAssetOffsets.totalTreatedAssetValue", status: "treated" }
    ]);
    const projectedAssetOffsetCandidate = resolveProjectedAssetOffsetCandidate(
      lensModel,
      treatedAssets.value
    );

    if (projectedAssetOffsetCandidate.active) {
      return {
        assets: createRunwayValue(
          projectedAssetOffsetCandidate.value,
          projectedAssetOffsetCandidate.sourcePath,
          projectedAssetOffsetCandidate.sourcePaths,
          "projected-method-active"
        ),
        projectedAssetOffsetCandidate
      };
    }

    if (treatedAssets.value != null) {
      return {
        assets: treatedAssets,
        projectedAssetOffsetCandidate
      };
    }

    const legacyTotal = firstRunwayValue(lensModel, [
      { path: "offsetAssets.totalAvailableOffsetAssetValue", status: "legacy-offset-assets-fallback" }
    ]);
    const legacyComponents = sumKnownValues([
      { value: getNumber(lensModel, "offsetAssets.cashSavings.availableValue"), sourcePath: "offsetAssets.cashSavings.availableValue" },
      { value: getNumber(lensModel, "offsetAssets.currentEmergencyFund.availableValue"), sourcePath: "offsetAssets.currentEmergencyFund.availableValue" },
      { value: getNumber(lensModel, "offsetAssets.brokerageAccounts.availableValue"), sourcePath: "offsetAssets.brokerageAccounts.availableValue" },
      { value: getNumber(lensModel, "offsetAssets.retirementAccounts.availableValue"), sourcePath: "offsetAssets.retirementAccounts.availableValue" },
      { value: getNumber(lensModel, "offsetAssets.realEstateEquity.availableValue"), sourcePath: "offsetAssets.realEstateEquity.availableValue" },
      { value: getNumber(lensModel, "offsetAssets.businessValue.availableValue"), sourcePath: "offsetAssets.businessValue.availableValue" }
    ]);

    if (legacyTotal.value != null) {
      return {
        assets: {
          ...legacyTotal,
          sourcePaths: uniqueStrings(treatedAssets.sourcePaths.concat(legacyTotal.sourcePaths))
        },
        projectedAssetOffsetCandidate
      };
    }

    if (legacyComponents.value != null) {
      return {
        assets: createRunwayValue(
          legacyComponents.value,
          legacyComponents.sourcePaths.join(" + "),
          treatedAssets.sourcePaths.concat(legacyComponents.sourcePaths),
          "legacy-offset-assets-fallback"
        ),
        projectedAssetOffsetCandidate
      };
    }

    return {
      assets: createMissingRunwayValue(
        treatedAssets.sourcePaths.concat(legacyTotal.sourcePaths).concat(legacyComponents.sourcePaths),
        "missing"
      ),
      projectedAssetOffsetCandidate
    };
  }

  function resolveDebtRunwayInput(lensModel) {
    const treatedDebt = firstRunwayValue(lensModel, [
      { path: "treatedDebtPayoff.needs.debtPayoffAmount", status: "treated" }
    ]);
    const rawDebtTotal = firstRunwayValue(lensModel, [
      { path: "debtPayoff.totalDebtPayoffNeed", status: "raw-fallback" }
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
    const mortgage = firstRunwayValue(lensModel, [
      { path: "treatedDebtPayoff.needs.mortgagePayoffAmount", status: "treated" },
      { path: "treatedDebtPayoff.dime.mortgageAmount", status: "treated" },
      { path: "debtPayoff.mortgageBalance", status: "raw-fallback" }
    ]);

    if (treatedDebt.value != null) {
      return {
        debtPayoff: treatedDebt,
        mortgage,
        nonMortgageDebt: nonMortgageDebt.value == null
          ? createMissingRunwayValue(nonMortgageDebt.sourcePaths, "missing")
          : createRunwayValue(nonMortgageDebt.value, "debtPayoff.nonMortgageComponents", nonMortgageDebt.sourcePaths, "raw-detail"),
        sourceStatus: "treated"
      };
    }

    if (rawDebtTotal.value != null) {
      return {
        debtPayoff: {
          ...rawDebtTotal,
          sourcePaths: uniqueStrings(treatedDebt.sourcePaths.concat(rawDebtTotal.sourcePaths))
        },
        mortgage,
        nonMortgageDebt: nonMortgageDebt.value == null
          ? createMissingRunwayValue(nonMortgageDebt.sourcePaths, "missing")
          : createRunwayValue(nonMortgageDebt.value, "debtPayoff.nonMortgageComponents", nonMortgageDebt.sourcePaths, "raw-detail"),
        sourceStatus: "raw-fallback"
      };
    }

    const fallbackDebt = sumKnownValues([
      { value: nonMortgageDebt.value, sourcePath: "debtPayoff.nonMortgageComponents" },
      { value: mortgage.value, sourcePath: mortgage.sourcePath }
    ]);

    return {
      debtPayoff: fallbackDebt.value == null
        ? createMissingRunwayValue(treatedDebt.sourcePaths.concat(rawDebtTotal.sourcePaths).concat(nonMortgageDebt.sourcePaths).concat(mortgage.sourcePaths), "missing")
        : createRunwayValue(fallbackDebt.value, fallbackDebt.sourcePaths.join(" + "), fallbackDebt.sourcePaths, "raw-component-fallback"),
      mortgage,
      nonMortgageDebt: nonMortgageDebt.value == null
        ? createMissingRunwayValue(nonMortgageDebt.sourcePaths, "missing")
        : createRunwayValue(nonMortgageDebt.value, "debtPayoff.nonMortgageComponents", nonMortgageDebt.sourcePaths, "raw-detail"),
      sourceStatus: fallbackDebt.value == null ? "missing" : "raw-component-fallback"
    };
  }

  function resolveAnnualNeedRunwayInput(lensModel, options) {
    const essentialSupport = firstRunwayValue(lensModel, [
      { path: "ongoingSupport.annualTotalEssentialSupportCost", status: "prepared-bucket" },
      { path: "ongoingSupport.annualNonHousingEssentialSupportCost", status: "partial-bucket-fallback" }
    ]);
    const monthlyEssentialExpenses = getNumber(lensModel, "ongoingSupport.monthlyTotalEssentialSupportCost");
    const resolvedEssentialSupport = essentialSupport.value == null && monthlyEssentialExpenses != null
      ? createRunwayValue(
          monthlyEssentialExpenses * 12,
          "ongoingSupport.monthlyTotalEssentialSupportCost",
          ["ongoingSupport.monthlyTotalEssentialSupportCost"],
          "monthly-annualized-fallback"
        )
      : essentialSupport;
    const discretionarySupport = firstRunwayValue(lensModel, [
      { path: "ongoingSupport.annualDiscretionaryPersonalSpending", status: "available-not-included" }
    ]);
    const includeDiscretionarySupport = options?.includeDiscretionarySupport === true;
    const healthcare = createMissingRunwayValue(
      [
        "expenseFacts.expenses",
        "healthcareExpenses.projectedHealthcareExpenseAmount"
      ],
      "not-included-no-prepared-healthcare-bucket"
    );
    const annualHouseholdNeed = includeDiscretionarySupport && discretionarySupport.value != null
      ? createRunwayValue(
          resolvedEssentialSupport.value + discretionarySupport.value,
          "ongoingSupport.annualTotalEssentialSupportCost + ongoingSupport.annualDiscretionaryPersonalSpending",
          resolvedEssentialSupport.sourcePaths.concat(discretionarySupport.sourcePaths),
          "essential-plus-discretionary"
        )
      : resolvedEssentialSupport;

    return {
      essentialSupport: resolvedEssentialSupport,
      discretionarySupport: discretionarySupport.value == null
        ? discretionarySupport
        : {
            ...discretionarySupport,
            status: includeDiscretionarySupport ? "included" : "not-included-no-active-state"
          },
      healthcare,
      education: createMissingRunwayValue(["educationSupport.totalEducationFundingNeed"], "milestone-only"),
      annualHouseholdNeed
    };
  }

  function resolveIncomeOffsetRunwayInput(lensModel) {
    const survivorIncome = firstRunwayValue(lensModel, [
      { path: "survivorScenario.survivorNetAnnualIncome", status: "net-income" },
      { path: "survivorScenario.survivorGrossAnnualIncome", status: "gross-fallback" },
      { path: "incomeBasis.spouseOrPartnerNetAnnualIncome", status: "spouse-net-fallback" },
      { path: "incomeBasis.spouseOrPartnerGrossAnnualIncome", status: "spouse-gross-fallback" }
    ]);

    return {
      survivorIncome,
      survivorIncomeStartDelayMonths: Math.max(
        0,
        toOptionalNumber(getPath(lensModel, "survivorScenario.survivorIncomeStartDelayMonths")) || 0
      ),
      survivorWorkReduction: firstRunwayValue(lensModel, [
        { path: "survivorScenario.spouseExpectedWorkReductionAtDeath", status: "available" }
      ])
    };
  }

  function resolveFinancialRunwayInputs(lensModel, options) {
    const safeLensModel = isPlainObject(lensModel) ? lensModel : {};
    const assetInput = resolveAssetRunwayInput(safeLensModel);
    const debtInput = resolveDebtRunwayInput(safeLensModel);

    return {
      availableAtDeath: {
        coverage: resolveCoverageRunwayInput(safeLensModel),
        assets: assetInput.assets,
        projectedAssetOffsetCandidate: assetInput.projectedAssetOffsetCandidate
      },
      immediateObligations: {
        finalExpenses: firstRunwayValue(safeLensModel, [
          { path: "finalExpenses.totalFinalExpenseNeed", status: "prepared-bucket" }
        ]),
        transitionNeeds: firstRunwayValue(safeLensModel, [
          { path: "transitionNeeds.totalTransitionNeed", status: "prepared-bucket" }
        ]),
        debtPayoff: debtInput.debtPayoff,
        mortgage: debtInput.mortgage,
        nonMortgageDebt: debtInput.nonMortgageDebt,
        debtSourceStatus: debtInput.sourceStatus
      },
      annualNeeds: resolveAnnualNeedRunwayInput(safeLensModel, options),
      incomeOffsets: resolveIncomeOffsetRunwayInput(safeLensModel),
      milestones: {
        dependents: firstRunwayValue(safeLensModel, [
          { path: "educationSupport.linkedDependentCount", status: "available" }
        ]),
        educationWindows: firstRunwayValue(safeLensModel, [
          { path: "educationSupport.totalEducationFundingNeed", status: "milestone-only" },
          { path: "educationSupport.linkedDependentEducationFundingNeed", status: "milestone-only" }
        ]),
        mortgageTerm: firstRunwayValue(safeLensModel, [
          { path: "ongoingSupport.mortgageRemainingTermMonths", status: "available" }
        ]),
        depletionDate: createMissingRunwayValue(["incomeLossImpact.formula.depletionDate"], "calculated-after-runway")
      }
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

  function resolveProjectionYears(options) {
    const projectionYears = Math.round(
      clampNumber(
        isPlainObject(options) ? options.projectionYears : null,
        MIN_RUNWAY_PROJECTION_YEARS,
        MAX_RUNWAY_PROJECTION_YEARS
      ) || DEFAULT_RUNWAY_PROJECTION_YEARS
    );
    return Math.max(MIN_RUNWAY_PROJECTION_YEARS, Math.min(MAX_RUNWAY_PROJECTION_YEARS, projectionYears));
  }

  function buildRunwayProjectionPoints(options) {
    const safeOptions = isPlainObject(options) ? options : {};
    const deathDate = parseDateOnly(safeOptions.selectedDeathDate);
    const selectedDeathAge = toOptionalNumber(safeOptions.selectedDeathAge);
    const netAvailableResources = toOptionalNumber(safeOptions.netAvailableResources);
    const annualShortfall = toOptionalNumber(safeOptions.annualShortfall);
    const projectionYears = resolveProjectionYears(safeOptions.options);

    if (netAvailableResources == null || annualShortfall == null || !deathDate) {
      return [];
    }

    const effectiveShortfall = Math.max(0, annualShortfall);
    const points = [];
    for (let yearIndex = 0; yearIndex <= projectionYears; yearIndex += 1) {
      const startingBalance = netAvailableResources - (effectiveShortfall * Math.max(0, yearIndex - 1));
      const endingBalance = yearIndex === 0
        ? netAvailableResources
        : netAvailableResources - (effectiveShortfall * yearIndex);
      const pointDate = addYears(deathDate.date, yearIndex);
      let status = "available";
      if (yearIndex === 0) {
        status = "starting";
      } else if (effectiveShortfall <= 0) {
        status = "no-shortfall";
      } else if (startingBalance <= 0 || endingBalance <= 0) {
        status = "depleted";
      }

      points.push({
        yearIndex,
        date: formatDateOnly(pointDate),
        age: selectedDeathAge == null ? null : roundYears(selectedDeathAge + yearIndex),
        startingBalance: roundMoney(startingBalance),
        annualShortfall: roundMoney(effectiveShortfall),
        endingBalance: roundMoney(endingBalance),
        status
      });
    }

    return points;
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
      const roundedSelectedDeathAge = Math.round(selectedDeathAge);
      const currentAge = parsedValuationDate
        ? calculateAge(parsedDateOfBirth.date, parsedValuationDate.date)
        : null;
      const effectiveSelectedDeathAge = currentAge == null
        ? roundedSelectedDeathAge
        : Math.max(currentAge, roundedSelectedDeathAge);
      selectedDate = currentAge != null
        && effectiveSelectedDeathAge === currentAge
        && parsedValuationDate
          ? parsedValuationDate.date
          : addYears(parsedDateOfBirth.date, effectiveSelectedDeathAge);
      selectedAge = effectiveSelectedDeathAge;
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
      financialRunway: {
        status: "not-available",
        startingResources: null,
        existingCoverage: null,
        availableAssets: null,
        immediateObligations: null,
        netAvailableResources: null,
        annualHouseholdNeed: null,
        annualSurvivorIncome: null,
        annualShortfall: null,
        yearsOfSecurity: null,
        monthsOfSecurity: null,
        totalMonthsOfSecurity: null,
        depletionYear: null,
        depletionDate: null,
        projectionYears: DEFAULT_RUNWAY_PROJECTION_YEARS,
        projectionPoints: [],
        sourcePaths: [],
        warnings: [],
        dataGaps: []
      },
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

    const financialRunwayInputs = resolveFinancialRunwayInputs(lensModel, safeInput.options);

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

    const survivorIncome = financialRunwayInputs.incomeOffsets.survivorIncome;
    const survivorIncomeStartDelayMonths = financialRunwayInputs.incomeOffsets.survivorIncomeStartDelayMonths;
    if (survivorIncome.value == null) {
      addDataGap(output, "missing-survivor-income", "Survivor income is missing.", survivorIncome.sourcePaths);
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
        sourcePaths: survivorIncome.sourcePaths.concat(["survivorScenario.survivorIncomeStartDelayMonths"]),
        confidence: "calculated"
      }));
      addUnique(output.trace.sourcePaths, [survivorIncome.sourcePath, "survivorScenario.survivorIncomeStartDelayMonths"]);
    }

    const annualHouseholdNeed = financialRunwayInputs.annualNeeds.annualHouseholdNeed;
    const resolvedAnnualEssentialExpenses = annualHouseholdNeed.value;
    const annualEssentialSourcePaths = annualHouseholdNeed.sourcePaths;
    if (resolvedAnnualEssentialExpenses == null) {
      addDataGap(output, "missing-annual-essential-expenses", "Annual essential household expenses are missing.", annualHouseholdNeed.sourcePaths);
    }

    const coverage = financialRunwayInputs.availableAtDeath.coverage;
    if (coverage.value == null) {
      addDataGap(output, "missing-existing-coverage", "Existing coverage is missing.", coverage.sourcePaths);
    } else {
      output.timelineEvents.push(createEvent({
        id: "coverage-available",
        type: "coverageAvailable",
        date: output.selectedDeath.date,
        age: output.selectedDeath.age,
        label: "Existing coverage available",
        amount: coverage.value,
        sourcePaths: coverage.sourcePaths,
        confidence: "calculated"
      }));
      addUnique(output.trace.sourcePaths, [coverage.sourcePath]);
    }

    const assets = financialRunwayInputs.availableAtDeath.assets;
    const availableAssetValue = assets.value;
    const availableAssetSourcePaths = assets.sourcePaths;
    if (availableAssetValue == null) {
      addDataGap(output, "missing-assets-liquidity", "Available asset and liquidity facts are missing.", assets.sourcePaths);
    }

    const finalExpenses = financialRunwayInputs.immediateObligations.finalExpenses;
    if (finalExpenses.value != null) {
      output.timelineEvents.push(createEvent({
        id: "final-expenses-due",
        type: "finalExpensesDue",
        date: output.selectedDeath.date,
        age: output.selectedDeath.age,
        label: "Final expenses due",
        amount: finalExpenses.value,
        sourcePaths: finalExpenses.sourcePaths,
        confidence: "calculated"
      }));
    }

    const transitionNeeds = financialRunwayInputs.immediateObligations.transitionNeeds;
    const mortgage = financialRunwayInputs.immediateObligations.mortgage;
    if (mortgage.value != null) {
      output.timelineEvents.push(createEvent({
        id: "mortgage-obligation",
        type: "mortgageObligation",
        date: output.selectedDeath.date,
        age: output.selectedDeath.age,
        label: "Mortgage obligation",
        amount: mortgage.value,
        sourcePaths: mortgage.sourcePaths,
        confidence: mortgage.status === "treated" ? "calculated" : "reported"
      }));
    }

    const debtPayoffTotal = financialRunwayInputs.immediateObligations.debtPayoff;
    const nonMortgageDebt = financialRunwayInputs.immediateObligations.nonMortgageDebt;
    if (nonMortgageDebt.value != null || debtPayoffTotal.value != null) {
      const eventAmount = debtPayoffTotal.status === "treated" || nonMortgageDebt.value == null
        ? debtPayoffTotal.value
        : nonMortgageDebt.value;
      const sourcePaths = debtPayoffTotal.status === "treated" || nonMortgageDebt.value == null
        ? debtPayoffTotal.sourcePaths
        : nonMortgageDebt.sourcePaths;
      output.timelineEvents.push(createEvent({
        id: "debt-obligation",
        type: "debtObligation",
        date: output.selectedDeath.date,
        age: output.selectedDeath.age,
        label: "Debt obligations",
        amount: eventAmount,
        sourcePaths,
        confidence: debtPayoffTotal.status === "treated" ? "calculated" : "reported"
      }));
    }

    const immediateDebt = debtPayoffTotal;
    const immediateObligations = sumKnownValues([
      { value: finalExpenses.value, sourcePath: finalExpenses.sourcePath },
      { value: transitionNeeds.value, sourcePath: transitionNeeds.sourcePath },
      { value: immediateDebt.value, sourcePath: immediateDebt.sourcePaths.join(" + ") }
    ]);
    if (immediateObligations.value == null) {
      addDataGap(output, "missing-immediate-obligations", "Immediate obligation facts are missing.", [
        "finalExpenses.totalFinalExpenseNeed",
        "transitionNeeds.totalTransitionNeed",
        "treatedDebtPayoff.needs.debtPayoffAmount",
        "debtPayoff.totalDebtPayoffNeed"
      ]);
    }

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
    let yearsOfFinancialSecurityStatus = "not-available";
    const missingRunwayCriticalFacts = [];
    if (coverage.value == null) {
      missingRunwayCriticalFacts.push("existing coverage");
    }
    if (availableAssetValue == null) {
      missingRunwayCriticalFacts.push("available assets/liquidity");
    }
    if (immediateObligations.value == null) {
      missingRunwayCriticalFacts.push("immediate obligations");
    }
    if (resolvedAnnualEssentialExpenses == null) {
      missingRunwayCriticalFacts.push("annual household need");
    }
    if (survivorIncome.value == null) {
      missingRunwayCriticalFacts.push("survivor income");
    }

    if (annualShortfall == null) {
      output.warnings.push(createWarning("missing-annual-shortfall", "Years of Financial Security was not calculated because annual shortfall inputs are missing."));
    } else if (annualShortfall <= 0) {
      yearsOfFinancialSecurityStatus = "no-shortfall";
      output.warnings.push(createWarning("no-annual-household-shortfall", "Years of Financial Security was not calculated because survivor income covers annual essential expenses."));
    } else if (netAvailableResources == null) {
      output.warnings.push(createWarning("missing-net-available-resources", "Years of Financial Security was not calculated because coverage and liquidity facts are missing."));
    } else {
      yearsOfFinancialSecurity = Math.max(0, netAvailableResources) / annualShortfall;
      yearsOfFinancialSecurityStatus = missingRunwayCriticalFacts.length ? "partial-estimate" : "complete";
      if (missingRunwayCriticalFacts.length) {
        output.warnings.push(createWarning(
          "partial-financial-runway",
          "Financial runway is a partial estimate because critical facts are missing.",
          {
            missingCriticalFacts: missingRunwayCriticalFacts.slice()
          }
        ));
      }
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

    const projectionYears = resolveProjectionYears(safeInput.options);
    const securityParts = getYearsMonthsParts(yearsOfFinancialSecurity);
    const depletionDate = yearsOfFinancialSecurity == null
      ? null
      : parseDateOnly(output.selectedDeath.date);
    const depletionDateValue = depletionDate
      ? formatDateOnly(addMonths(depletionDate.date, securityParts.totalMonths || 0))
      : null;
    const runwayStatus = yearsOfFinancialSecurityStatus;
    output.financialRunway = {
      status: runwayStatus,
      startingResources: totalResources.value == null ? null : roundMoney(totalResources.value),
      existingCoverage: coverage.value == null ? null : roundMoney(coverage.value),
      availableAssets: availableAssetValue == null ? null : roundMoney(availableAssetValue),
      immediateObligations: immediateObligations.value == null ? null : roundMoney(immediateObligations.value),
      netAvailableResources: netAvailableResources == null ? null : roundMoney(netAvailableResources),
      annualHouseholdNeed: resolvedAnnualEssentialExpenses == null ? null : roundMoney(resolvedAnnualEssentialExpenses),
      annualSurvivorIncome: survivorIncome.value == null ? null : roundMoney(survivorIncome.value),
      annualShortfall: annualShortfall == null ? null : roundMoney(Math.max(0, annualShortfall)),
      yearsOfSecurity: securityParts.years,
      monthsOfSecurity: securityParts.months,
      totalMonthsOfSecurity: securityParts.totalMonths,
      depletionYear: depletionDateValue ? parseDateOnly(depletionDateValue)?.date.getFullYear() || null : null,
      depletionDate: depletionDateValue,
      projectionYears,
      projectionPoints: buildRunwayProjectionPoints({
        selectedDeathDate: output.selectedDeath.date,
        selectedDeathAge: output.selectedDeath.age,
        netAvailableResources,
        annualShortfall,
        options: { projectionYears }
      }),
      inputs: financialRunwayInputs,
      sourcePaths: totalResources.sourcePaths
        .concat(immediateObligations.sourcePaths)
        .concat(annualEssentialSourcePaths)
        .concat(survivorIncome.sourcePath ? [survivorIncome.sourcePath] : []),
      warnings: output.warnings.slice(),
      dataGaps: output.dataGaps.slice()
    };

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
        yearsOfFinancialSecurityStatus === "no-shortfall"
          ? "No shortfall"
          : (yearsOfFinancialSecurityStatus === "partial-estimate"
            ? "Partial estimate"
            : formatYearsMonths(yearsOfFinancialSecurity)),
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
      "netAvailableResources = preferred coverage bucket + preferred prepared asset bucket - immediate obligations",
      "annualHouseholdShortfall = ongoingSupport.annualTotalEssentialSupportCost - survivorScenario.survivorNetAnnualIncome",
      "yearsOfFinancialSecurity = netAvailableResources / annualHouseholdShortfall",
      "coverage source priority: treatedExistingCoverageOffset.totalTreatedCoverageOffset, then existingCoverage totals",
      "asset source priority: method-active projectedAssetOffset, then treatedAssetOffsets.totalTreatedAssetValue, then legacy offsetAssets",
      "immediate obligations include finalExpenses.totalFinalExpenseNeed + transitionNeeds.totalTransitionNeed + treatedDebtPayoff.needs.debtPayoffAmount when available"
    );
    addUnique(output.trace.sourcePaths, totalResources.sourcePaths);
    addUnique(output.trace.sourcePaths, immediateObligations.sourcePaths);
    addUnique(output.trace.sourcePaths, annualEssentialSourcePaths);

    return output;
  }

  lensAnalysis.calculateIncomeLossImpactTimeline = calculateIncomeLossImpactTimeline;
})(typeof globalThis !== "undefined" ? globalThis : this);
