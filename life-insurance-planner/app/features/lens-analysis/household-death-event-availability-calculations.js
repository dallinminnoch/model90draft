(function (global) {
  const LensApp = global.LensApp || (global.LensApp = {});
  const lensAnalysis = LensApp.lensAnalysis || (LensApp.lensAnalysis = {});

  const CALCULATION_METHOD = "household-death-event-availability-v1";
  const CASH_FLOW_ROW_ID = "cashFlowContribution";
  const CASH_EQUIVALENT_CATEGORY = "cashAndCashEquivalents";

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

  function roundMoney(value) {
    return Number.isFinite(Number(value)) ? Number(Number(value).toFixed(2)) : 0;
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

  function createIssue(code, message, sourcePaths, details) {
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

  function readAmount(source) {
    if (typeof source === "number" || typeof source === "string") {
      return toOptionalNumber(source);
    }
    if (!isPlainObject(source)) {
      return null;
    }
    return toOptionalNumber(
      source.value !== undefined
        ? source.value
        : source.amount !== undefined
          ? source.amount
          : source.total
    );
  }

  function readSourcePaths(source, fallback) {
    if (isPlainObject(source)) {
      return uniqueStrings(
        (Array.isArray(source.sourcePaths) ? source.sourcePaths : [])
          .concat(source.sourcePath ? [source.sourcePath] : [])
      );
    }
    return uniqueStrings(fallback ? [fallback] : []);
  }

  function getAssetLedger(input) {
    if (Array.isArray(input.projectedAssetLedger)) {
      return input.projectedAssetLedger;
    }
    if (Array.isArray(input.projectedWealthPoint?.assetLedger)) {
      return input.projectedWealthPoint.assetLedger;
    }
    return [];
  }

  function getProjectedAssetValue(row) {
    if (!isPlainObject(row)) {
      return null;
    }
    return toOptionalNumber(
      row.projectedValue !== undefined
        ? row.projectedValue
        : row.currentValue !== undefined
          ? row.currentValue
          : row.endingAssets !== undefined
            ? row.endingAssets
            : row.value
    );
  }

  function isCashFlowContributionRow(row) {
    const id = normalizeString(row?.id);
    const categoryKey = normalizeString(row?.categoryKey);
    return id === CASH_FLOW_ROW_ID || categoryKey === CASH_FLOW_ROW_ID;
  }

  function normalizeProjectedAssetRows(input, dataGaps, trace, sourcePaths) {
    const ledger = getAssetLedger(input);
    if (!ledger.length) {
      dataGaps.push(createIssue(
        "missing-projected-asset-ledger",
        "Projected asset ledger at the event date is required.",
        ["projectedAssetLedger", "projectedWealthPoint.assetLedger"]
      ));
    }

    const rows = [];
    const assetFacts = [];
    let grossProjectedAssets = 0;
    let deficitAdjustment = 0;

    ledger.forEach(function (row, index) {
      const sourceRow = isPlainObject(row) ? row : {};
      const sourceRowPaths = readSourcePaths(sourceRow, `projectedAssetLedger.${index}`);
      appendUnique(sourcePaths, sourceRowPaths);

      const projectedValue = getProjectedAssetValue(sourceRow);
      const categoryKey = normalizeString(sourceRow.categoryKey) || `projectedAssetLedger.${index}`;
      const id = normalizeString(sourceRow.id) || normalizeString(sourceRow.assetId) || `projected-asset-${index + 1}`;
      const included = sourceRow.includedInProjection !== false && sourceRow.included !== false;
      const isCashFlow = isCashFlowContributionRow(sourceRow);

      const normalizedRow = {
        id,
        categoryKey,
        label: normalizeString(sourceRow.label) || categoryKey,
        projectedValue: projectedValue == null ? null : roundMoney(projectedValue),
        includedInProjection: included,
        sourcePaths: sourceRowPaths,
        trace: isPlainObject(sourceRow.trace) ? clonePlainValue(sourceRow.trace) : {}
      };
      rows.push(normalizedRow);

      if (projectedValue == null) {
        dataGaps.push(createIssue(
          "missing-projected-asset-value",
          "Projected asset ledger row was missing a numeric event-date value.",
          sourceRowPaths.length ? sourceRowPaths : [`projectedAssetLedger.${index}`],
          { id, categoryKey }
        ));
        return;
      }

      if (!included) {
        trace.excludedAssetRows.push({ id, categoryKey, reason: "excluded-from-projection" });
        return;
      }

      if (isCashFlow && projectedValue < 0) {
        deficitAdjustment = roundMoney(deficitAdjustment + projectedValue);
        trace.derivedCashFlowContribution = {
          mode: "negative-deficit-adjustment",
          amount: roundMoney(projectedValue),
          sourcePaths: sourceRowPaths
        };
        return;
      }

      if (projectedValue < 0) {
        deficitAdjustment = roundMoney(deficitAdjustment + projectedValue);
        trace.negativeAssetAdjustments.push({ id, categoryKey, amount: roundMoney(projectedValue) });
        return;
      }

      const treatmentCategoryKey = isCashFlow ? CASH_EQUIVALENT_CATEGORY : categoryKey;
      if (isCashFlow) {
        trace.derivedCashFlowContribution = {
          mode: "positive-cash-like-asset",
          amount: roundMoney(projectedValue),
          categoryKey: treatmentCategoryKey,
          sourcePaths: sourceRowPaths
        };
      }

      grossProjectedAssets = roundMoney(grossProjectedAssets + projectedValue);
      assetFacts.push({
        assetId: id,
        categoryKey: treatmentCategoryKey,
        typeKey: normalizeString(sourceRow.typeKey) || null,
        label: normalizeString(sourceRow.label) || treatmentCategoryKey,
        currentValue: roundMoney(projectedValue),
        source: "projected-asset-ledger",
        sourceKey: normalizeString(sourceRow.sourceKey) || id,
        metadata: {
          sourceProjectedCategoryKey: categoryKey,
          derivedCashFlowContribution: isCashFlow === true
        }
      });
    });

    return {
      rows,
      assetFacts,
      grossProjectedAssets: roundMoney(grossProjectedAssets),
      deficitAdjustment: roundMoney(deficitAdjustment)
    };
  }

  function buildTreatmentRows(projectedRows, treatmentResult, deficitAdjustment) {
    const treatedRowsById = new Map();
    (Array.isArray(treatmentResult?.assets) ? treatmentResult.assets : []).forEach(function (asset) {
      treatedRowsById.set(normalizeString(asset.assetId), asset);
    });

    const rows = projectedRows.map(function (row) {
      if (row.projectedValue == null) {
        return {
          id: row.id,
          categoryKey: row.categoryKey,
          label: row.label,
          projectedValue: null,
          included: false,
          treatedValue: 0,
          treatmentStatus: "missing-projected-value",
          sourcePaths: row.sourcePaths,
          trace: row.trace
        };
      }

      if (row.includedInProjection === false) {
        return {
          id: row.id,
          categoryKey: row.categoryKey,
          label: row.label,
          projectedValue: row.projectedValue,
          included: false,
          treatedValue: 0,
          treatmentStatus: "excluded-from-projection",
          sourcePaths: row.sourcePaths,
          trace: row.trace
        };
      }

      if (row.projectedValue < 0) {
        return {
          id: row.id,
          categoryKey: row.categoryKey,
          label: row.label,
          projectedValue: row.projectedValue,
          included: false,
          treatedValue: 0,
          treatmentStatus: "negative-deficit-adjustment",
          sourcePaths: row.sourcePaths,
          trace: row.trace
        };
      }

      const treated = treatedRowsById.get(row.id);
      if (!treated) {
        return {
          id: row.id,
          categoryKey: row.categoryKey,
          label: row.label,
          projectedValue: row.projectedValue,
          included: false,
          treatedValue: 0,
          treatmentStatus: "not-treated",
          sourcePaths: row.sourcePaths,
          trace: row.trace
        };
      }

      return {
        id: row.id,
        categoryKey: row.categoryKey,
        treatmentCategoryKey: treated.categoryKey || row.categoryKey,
        label: row.label,
        projectedValue: row.projectedValue,
        included: treated.include === true,
        rawValue: treated.rawValue,
        taxDragPercent: treated.taxDragPercent,
        liquidityHaircutPercent: treated.liquidityDiscountPercent,
        treatedValue: roundMoney(treated.treatedValue),
        treatmentStatus: treated.include === true ? "treated" : "excluded-by-treatment",
        sourcePaths: row.sourcePaths,
        trace: {
          ...row.trace,
          treatmentSource: treated.trace?.treatmentSource || null,
          treatmentSourceKey: treated.trace?.treatmentSourceKey || null,
          treatmentPreset: treated.trace?.treatmentPreset || null,
          taxTreatment: treated.trace?.taxTreatment || null,
          afterTaxValue: treated.trace?.afterTaxValue ?? null,
          derivedCashFlowContribution: treated.metadata?.derivedCashFlowContribution === true
        }
      };
    });

    if (deficitAdjustment < 0) {
      rows.push({
        id: "cash-flow-deficit-adjustment",
        categoryKey: CASH_FLOW_ROW_ID,
        label: "Cash-flow deficit adjustment",
        projectedValue: deficitAdjustment,
        included: false,
        treatedValue: 0,
        treatmentStatus: "deficit-adjustment-not-asset-treatment",
        sourcePaths: [],
        trace: {
          role: "resource-reduction"
        }
      });
    }

    return rows;
  }

  function applyAssetTreatmentAtEvent(normalizedAssets, assetTreatmentAssumptions, warnings, dataGaps, trace, sourcePaths) {
    const calculateAssetTreatment = lensAnalysis.calculateAssetTreatment;
    const assumptionsAvailable = isPlainObject(assetTreatmentAssumptions);

    if (!assumptionsAvailable) {
      dataGaps.push(createIssue(
        "missing-asset-treatment-assumptions",
        "Asset treatment assumptions are required to convert projected assets at the event date.",
        ["assetTreatmentAssumptions"]
      ));
    }

    if (typeof calculateAssetTreatment !== "function") {
      dataGaps.push(createIssue(
        "missing-asset-treatment-helper",
        "Asset treatment helper was unavailable, so projected assets were not converted.",
        ["LensApp.lensAnalysis.calculateAssetTreatment"]
      ));
      trace.assetTreatmentHelper = "missing";
      return {
        treatedAssetValue: 0,
        totalTreatmentReduction: normalizedAssets.grossProjectedAssets,
        rows: buildTreatmentRows(normalizedAssets.rows, null, normalizedAssets.deficitAdjustment),
        helperWarnings: []
      };
    }

    trace.assetTreatmentHelper = "LensApp.lensAnalysis.calculateAssetTreatment";
    const result = calculateAssetTreatment({
      assetFacts: {
        assets: normalizedAssets.assetFacts
      },
      assetTreatmentAssumptions: assumptionsAvailable ? assetTreatmentAssumptions : {},
      options: {
        source: CALCULATION_METHOD
      }
    });
    const helperWarnings = Array.isArray(result?.warnings) ? clonePlainValue(result.warnings) : [];
    warnings.push(...helperWarnings);

    const treatedAssetValue = roundMoney(result?.totalTreatedAssetValue || 0);
    const availableAfterDeficit = roundMoney(treatedAssetValue + normalizedAssets.deficitAdjustment);
    const rows = buildTreatmentRows(normalizedAssets.rows, result, normalizedAssets.deficitAdjustment);
    trace.perAssetTreatment = rows.map(function (row) {
      return {
        id: row.id,
        categoryKey: row.categoryKey,
        treatmentCategoryKey: row.treatmentCategoryKey || row.categoryKey,
        projectedValue: row.projectedValue,
        taxDragPercent: row.taxDragPercent ?? null,
        liquidityHaircutPercent: row.liquidityHaircutPercent ?? null,
        treatedValue: row.treatedValue,
        treatmentStatus: row.treatmentStatus,
        sourcePaths: row.sourcePaths
      };
    });
    appendUnique(sourcePaths, ["assetTreatmentAssumptions", "projectedAssetLedger"]);

    return {
      treatedAssetValue,
      availableAfterDeficit,
      totalTreatmentReduction: roundMoney(normalizedAssets.grossProjectedAssets - treatedAssetValue),
      rows,
      helperWarnings
    };
  }

  function resolveExistingCoverage(existingCoverageTreatment, warnings, dataGaps, trace, sourcePaths) {
    const sourcePathsForCoverage = readSourcePaths(
      existingCoverageTreatment,
      "existingCoverageTreatment.totalTreatedCoverageOffset"
    );
    appendUnique(sourcePaths, sourcePathsForCoverage);

    const treatedCoverageAmount = toOptionalNumber(existingCoverageTreatment?.totalTreatedCoverageOffset);
    if (treatedCoverageAmount == null) {
      dataGaps.push(createIssue(
        "missing-treated-existing-coverage",
        "Treated existing coverage output is required before coverage can be added at the event.",
        sourcePathsForCoverage.length ? sourcePathsForCoverage : ["existingCoverageTreatment.totalTreatedCoverageOffset"]
      ));
    }

    trace.coverageSource = treatedCoverageAmount == null
      ? "missing"
      : "existingCoverageTreatment.totalTreatedCoverageOffset";
    const coverageWarnings = Array.isArray(existingCoverageTreatment?.warnings)
      ? clonePlainValue(existingCoverageTreatment.warnings)
      : [];
    warnings.push(...coverageWarnings);

    return {
      treatedCoverageAmount: treatedCoverageAmount == null ? null : roundMoney(treatedCoverageAmount),
      includedPolicyCount: existingCoverageTreatment?.includedPolicyCount ?? (
        Array.isArray(existingCoverageTreatment?.policies)
          ? existingCoverageTreatment.policies.filter(function (policy) { return policy?.included === true; }).length
          : null
      ),
      excludedPolicyCount: existingCoverageTreatment?.excludedPolicyCount ?? (
        Array.isArray(existingCoverageTreatment?.policies)
          ? existingCoverageTreatment.policies.filter(function (policy) { return policy?.included !== true; }).length
          : null
      ),
      warnings: coverageWarnings,
      sourcePaths: sourcePathsForCoverage,
      trace: Array.isArray(existingCoverageTreatment?.trace)
        ? clonePlainValue(existingCoverageTreatment.trace)
        : []
    };
  }

  function resolveObligationAmount(source, fallbackPath, dataGaps, sourcePaths, missingCode, missingMessage) {
    const amount = readAmount(source);
    const paths = readSourcePaths(source, fallbackPath);
    appendUnique(sourcePaths, paths);
    if (amount == null) {
      dataGaps.push(createIssue(missingCode, missingMessage, paths.length ? paths : [fallbackPath]));
      return {
        value: null,
        sourcePaths: paths,
        status: "missing"
      };
    }
    return {
      value: roundMoney(Math.max(0, amount)),
      sourcePaths: paths,
      status: "available"
    };
  }

  function isMortgageSupportRow(row) {
    const mode = normalizeStatus(row?.mortgageTreatmentMode || row?.treatmentMode);
    return row?.isMortgage === true && mode === "support";
  }

  function isMortgagePayoffRow(row) {
    const mode = normalizeStatus(row?.mortgageTreatmentMode || row?.treatmentMode);
    return row?.isMortgage === true && (!mode || mode === "payoff");
  }

  function resolveDebtObligations(debtTreatment, dataGaps, warnings, trace, sourcePaths) {
    const rows = []
      .concat(Array.isArray(debtTreatment?.debts) ? debtTreatment.debts : [])
      .concat(Array.isArray(debtTreatment?.trace?.debts) ? debtTreatment.trace.debts : []);
    const uniqueRows = [];
    const rowIds = new Set();
    rows.forEach(function (row, index) {
      if (!isPlainObject(row)) {
        return;
      }
      const id = normalizeString(row.debtFactId || row.id || `${row.categoryKey || "debt"}-${index}`);
      const key = `${id}:${row.isMortgage === true}:${row.treatmentMode || row.mortgageTreatmentMode || ""}`;
      if (rowIds.has(key)) {
        return;
      }
      rowIds.add(key);
      uniqueRows.push(row);
    });

    let nonMortgageDebtPayoff = 0;
    let mortgagePayoff = 0;
    let deferredMortgageSupport = 0;
    const debtSourcePaths = readSourcePaths(debtTreatment, "immediateObligations.debtTreatment");
    appendUnique(sourcePaths, debtSourcePaths);

    if (uniqueRows.length) {
      uniqueRows.forEach(function (row) {
        const treatedAmount = toOptionalNumber(row.treatedAmount);
        if (treatedAmount == null || treatedAmount <= 0 || row.included === false) {
          return;
        }

        if (isMortgageSupportRow(row)) {
          deferredMortgageSupport = roundMoney(deferredMortgageSupport + treatedAmount);
          dataGaps.push(createIssue(
            "mortgage-support-deferred-from-immediate-obligations",
            "Mortgage support was detected and deferred from immediate obligations.",
            debtSourcePaths,
            {
              debtFactId: row.debtFactId || null,
              amount: roundMoney(treatedAmount)
            }
          ));
          warnings.push(createIssue(
            "mortgage-support-deferred",
            "Mortgage support is not an immediate event obligation in Layer 2.",
            debtSourcePaths
          ));
          return;
        }

        if (isMortgagePayoffRow(row)) {
          mortgagePayoff = roundMoney(mortgagePayoff + treatedAmount);
          return;
        }

        const mode = normalizeStatus(row.treatmentMode);
        if (mode && mode !== "payoff") {
          warnings.push(createIssue(
            "non-mortgage-debt-treatment-mode-review",
            "Non-mortgage debt treatment mode was not payoff; row was not treated as an immediate payoff.",
            debtSourcePaths,
            { debtFactId: row.debtFactId || null, treatmentMode: row.treatmentMode || null }
          ));
          return;
        }
        nonMortgageDebtPayoff = roundMoney(nonMortgageDebtPayoff + treatedAmount);
      });
    } else {
      const directNonMortgage = readAmount(debtTreatment?.needs?.nonMortgageDebtAmount)
        ?? readAmount(debtTreatment?.nonMortgageDebtPayoff);
      if (directNonMortgage != null) {
        nonMortgageDebtPayoff = roundMoney(Math.max(0, directNonMortgage));
      }

      const aggregate = readAmount(debtTreatment?.needs?.debtPayoffAmount)
        ?? readAmount(debtTreatment?.debtPayoff);
      if (aggregate != null && directNonMortgage == null) {
        dataGaps.push(createIssue(
          "missing-debt-row-trace-for-aggregate-payoff",
          "Aggregate debt payoff was present without row trace, so mortgage payoff/support could not be separated safely.",
          debtSourcePaths.length ? debtSourcePaths : ["immediateObligations.debtTreatment.needs.debtPayoffAmount"]
        ));
      }
    }

    trace.debtSource = uniqueRows.length
      ? "immediateObligations.debtTreatment.debts"
      : "aggregate-debt-without-row-trace";

    return {
      nonMortgageDebtPayoff: roundMoney(nonMortgageDebtPayoff),
      mortgagePayoff: roundMoney(mortgagePayoff),
      deferredMortgageSupport: roundMoney(deferredMortgageSupport),
      sourcePaths: debtSourcePaths
    };
  }

  function resolveImmediateObligations(immediateObligations, dataGaps, warnings, trace, sourcePaths) {
    const safeObligations = isPlainObject(immediateObligations) ? immediateObligations : {};
    const finalExpenses = resolveObligationAmount(
      safeObligations.finalExpenses,
      "immediateObligations.finalExpenses",
      dataGaps,
      sourcePaths,
      "missing-final-expenses",
      "Final expenses are required for event-date availability."
    );
    const transitionNeeds = resolveObligationAmount(
      safeObligations.transitionNeeds,
      "immediateObligations.transitionNeeds",
      dataGaps,
      sourcePaths,
      "missing-transition-needs",
      "Transition needs are required for event-date availability."
    );
    const debtTreatment = safeObligations.debtTreatment || safeObligations.treatedDebtPayoff || {};
    const debt = resolveDebtObligations(debtTreatment, dataGaps, warnings, trace, sourcePaths);
    const debtPayoff = roundMoney(debt.nonMortgageDebtPayoff);
    const mortgagePayoff = roundMoney(debt.mortgagePayoff);
    const totalImmediateObligations = roundMoney(
      (finalExpenses.value || 0)
      + (transitionNeeds.value || 0)
      + debtPayoff
      + mortgagePayoff
    );

    return {
      finalExpenses: finalExpenses.value,
      transitionNeeds: transitionNeeds.value,
      debtPayoff,
      mortgagePayoff,
      deferredMortgageSupport: debt.deferredMortgageSupport,
      totalImmediateObligations,
      sourcePaths: uniqueStrings(
        finalExpenses.sourcePaths
          .concat(transitionNeeds.sourcePaths)
          .concat(debt.sourcePaths)
      )
    };
  }

  function getProjectedAssetPointDate(input) {
    return normalizeString(
      input.projectedWealthPoint?.date
      || input.projectedWealthPoint?.endDate
      || input.eventDate
    ) || null;
  }

  function calculateHouseholdDeathEventAvailability(input) {
    const safeInput = isPlainObject(input) ? input : {};
    const warnings = [];
    const dataGaps = [];
    const sourcePaths = [];
    const trace = {
      calculationMethod: CALCULATION_METHOD,
      projectedAssetSourcePointDate: getProjectedAssetPointDate(safeInput),
      assetTreatmentHelper: null,
      perAssetTreatment: [],
      derivedCashFlowContribution: null,
      negativeAssetAdjustments: [],
      excludedAssetRows: [],
      coverageSource: null,
      debtSource: null,
      formula: "treatedAssets + existingCoverage - immediateObligations"
    };
    const eventDate = normalizeString(safeInput.eventDate) || trace.projectedAssetSourcePointDate;
    const normalizedAssets = normalizeProjectedAssetRows(safeInput, dataGaps, trace, sourcePaths);
    const treatedAssets = applyAssetTreatmentAtEvent(
      normalizedAssets,
      safeInput.assetTreatmentAssumptions,
      warnings,
      dataGaps,
      trace,
      sourcePaths
    );
    const existingCoverage = resolveExistingCoverage(
      safeInput.existingCoverageTreatment,
      warnings,
      dataGaps,
      trace,
      sourcePaths
    );
    const obligations = resolveImmediateObligations(
      safeInput.immediateObligations,
      dataGaps,
      warnings,
      trace,
      sourcePaths
    );
    const survivorAvailableTreatedAssets = roundMoney(
      (treatedAssets.availableAfterDeficit ?? treatedAssets.treatedAssetValue)
    );
    const coverageAmount = existingCoverage.treatedCoverageAmount == null
      ? 0
      : existingCoverage.treatedCoverageAmount;
    const totalResourcesBeforeObligations = roundMoney(survivorAvailableTreatedAssets + coverageAmount);
    const resourcesAfterObligations = roundMoney(
      totalResourcesBeforeObligations - obligations.totalImmediateObligations
    );

    return {
      status: dataGaps.length ? "partial" : "complete",
      eventDate,
      assetsBeforeDeath: {
        grossProjectedAssets: normalizedAssets.grossProjectedAssets,
        rows: normalizedAssets.rows
      },
      assetTreatmentAtDeath: {
        treatedAssetValue: treatedAssets.treatedAssetValue,
        totalTreatmentReduction: treatedAssets.totalTreatmentReduction,
        cashFlowDeficitAdjustment: normalizedAssets.deficitAdjustment,
        rows: treatedAssets.rows
      },
      existingCoverage: {
        treatedCoverageAmount: existingCoverage.treatedCoverageAmount,
        includedPolicyCount: existingCoverage.includedPolicyCount,
        excludedPolicyCount: existingCoverage.excludedPolicyCount,
        warnings: existingCoverage.warnings,
        sourcePaths: existingCoverage.sourcePaths,
        trace: existingCoverage.trace
      },
      immediateObligations: {
        finalExpenses: obligations.finalExpenses,
        transitionNeeds: obligations.transitionNeeds,
        debtPayoff: obligations.debtPayoff,
        mortgagePayoff: obligations.mortgagePayoff,
        deferredMortgageSupport: obligations.deferredMortgageSupport,
        totalImmediateObligations: obligations.totalImmediateObligations,
        sourcePaths: obligations.sourcePaths
      },
      resources: {
        grossProjectedAssetsBeforeTreatment: normalizedAssets.grossProjectedAssets,
        survivorAvailableTreatedAssets,
        existingCoverage: existingCoverage.treatedCoverageAmount,
        totalResourcesBeforeObligations,
        immediateObligations: obligations.totalImmediateObligations,
        resourcesAfterObligations
      },
      warnings,
      dataGaps,
      trace,
      sourcePaths: uniqueStrings(sourcePaths)
    };
  }

  lensAnalysis.calculateHouseholdDeathEventAvailability = calculateHouseholdDeathEventAvailability;
})(typeof globalThis !== "undefined" ? globalThis : this);
