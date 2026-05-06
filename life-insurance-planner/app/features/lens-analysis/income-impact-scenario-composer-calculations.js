(function (global) {
  const LensApp = global.LensApp || (global.LensApp = {});
  const lensAnalysis = LensApp.lensAnalysis || (LensApp.lensAnalysis = {});

  const CALCULATION_METHOD = "income-impact-scenario-composer-v1";
  const DEFAULT_PROJECTION_HORIZON_MONTHS = 480;
  const MONTHLY_CADENCE = "monthly";
  const CASH_FLOW_ROW_ID = "cashFlowContribution";

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

  function calculateWholeMonthsBetween(startDate, endDate) {
    const wholeMonths = (endDate.getFullYear() - startDate.getFullYear()) * 12
      + (endDate.getMonth() - startDate.getMonth());
    return endDate.getDate() < startDate.getDate() ? wholeMonths - 1 : wholeMonths;
  }

  function isSameDate(left, right) {
    return Boolean(left && right && left.normalizedDate === right.normalizedDate);
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

  function getPath(source, path) {
    if (!isPlainObject(source) || !path) {
      return undefined;
    }

    return path.split(".").reduce(function (current, key) {
      if (current == null) {
        return undefined;
      }
      return current[key];
    }, source);
  }

  function firstDefined(source, paths) {
    for (let index = 0; index < paths.length; index += 1) {
      const value = getPath(source, paths[index]);
      if (value !== undefined && value !== null && value !== "") {
        return {
          value,
          path: paths[index]
        };
      }
    }
    return {
      value: undefined,
      path: null
    };
  }

  function firstNumeric(source, paths) {
    for (let index = 0; index < paths.length; index += 1) {
      const value = getPath(source, paths[index]);
      const parsed = toOptionalNumber(value);
      if (parsed != null) {
        return {
          value: parsed,
          path: paths[index]
        };
      }
    }
    return {
      value: null,
      path: null
    };
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

  function addIssue(target, code, message, sourcePaths, details) {
    target.push(makeIssue(code, message, sourcePaths, details));
  }

  function collectLayerItems(target, items) {
    if (!Array.isArray(items)) {
      return;
    }
    items.forEach(function (item) {
      target.push(clonePlainValue(item));
    });
  }

  function collectLayerSourcePaths(target, layerOutput) {
    appendUnique(target, layerOutput?.sourcePaths);
    appendUnique(target, layerOutput?.trace?.sourcePaths);
  }

  function isExcludedStatus(status) {
    return [
      "excluded",
      "inactive",
      "missing",
      "not-available",
      "not_available",
      "omitted",
      "skipped"
    ].includes(normalizeStatus(status));
  }

  function normalizeProjectionHorizonMonths(value) {
    const parsed = toWholeMonthCount(value);
    return parsed == null || parsed <= 0 ? DEFAULT_PROJECTION_HORIZON_MONTHS : parsed;
  }

  function resolveAssetFacts(lensModel, dataGaps, sourcePaths) {
    const assets = Array.isArray(lensModel?.assetFacts?.assets)
      ? lensModel.assetFacts.assets
      : [];
    if (!assets.length) {
      addIssue(
        dataGaps,
        "missing-current-gross-asset-facts",
        "Current gross asset facts are required for Layer 1.",
        ["lensModel.assetFacts.assets"]
      );
    } else {
      appendUnique(sourcePaths, ["lensModel.assetFacts.assets"]);
    }
    return assets;
  }

  function resolveGrowthMap(lensModel, analysisSettings, trace, sourcePaths) {
    const projectedOffsetAssumptions = analysisSettings?.projectedAssetOffsetAssumptions || {};
    const assetTreatmentAssumptions = analysisSettings?.assetTreatmentAssumptions || {};
    const growthAssumptions = assetTreatmentAssumptions.assetGrowthProjectionAssumptions
      || analysisSettings?.assetGrowthProjectionAssumptions
      || {};
    const projectedAssetOffset = lensModel?.projectedAssetOffset || {};
    const sourceMode = normalizeStatus(
      projectedAssetOffset.sourceMode
      || projectedAssetOffset.projectionMode
      || growthAssumptions.mode
    );
    const consumptionStatus = normalizeStatus(
      projectedOffsetAssumptions.consumptionStatus
      || projectedOffsetAssumptions.status
      || projectedAssetOffset.consumptionStatus
    );
    const methodActive = projectedOffsetAssumptions.enabled === true
      && consumptionStatus === "method-active"
      && toOptionalNumber(projectedOffsetAssumptions.activationVersion) >= 1
      && !sourceMode.includes("reporting")
      && !sourceMode.includes("saved")
      && !sourceMode.includes("inactive");
    const categories = []
      .concat(Array.isArray(projectedAssetOffset.includedCategories) ? projectedAssetOffset.includedCategories : [])
      .concat(
        Array.isArray(projectedAssetOffset.includedProjectedOffsetCategories)
          ? projectedAssetOffset.includedProjectedOffsetCategories
          : []
      )
      .concat(
        Array.isArray(projectedAssetOffset.includedAssetGrowthCategories)
          ? projectedAssetOffset.includedAssetGrowthCategories
          : []
      );
    const growthMap = new Map();

    trace.layer1.growthGate = {
      enabled: projectedOffsetAssumptions.enabled === true,
      consumptionStatus: consumptionStatus || null,
      activationVersion: toOptionalNumber(projectedOffsetAssumptions.activationVersion),
      sourceMode: sourceMode || null,
      active: methodActive === true
    };

    if (!methodActive) {
      trace.layer1.growthGate.fallbackReason = "projected-offset-growth-not-method-active";
      return growthMap;
    }

    appendUnique(sourcePaths, [
      "analysisSettings.projectedAssetOffsetAssumptions",
      "analysisSettings.assetTreatmentAssumptions.assetGrowthProjectionAssumptions",
      "lensModel.projectedAssetOffset.includedCategories"
    ]);

    categories.forEach(function (category, index) {
      if (!isPlainObject(category)) {
        return;
      }
      const categoryKey = normalizeString(category.categoryKey || category.key || category.id);
      const rate = toOptionalNumber(
        category.assumedAnnualGrowthRatePercent
        ?? category.annualGrowthRatePercent
        ?? category.growthRatePercent
        ?? category.annualGrowthRate
      );
      if (!categoryKey || rate == null || category.included === false) {
        return;
      }
      growthMap.set(categoryKey, {
        annualGrowthRate: rate,
        growthEligible: true,
        growthStatus: "method-active",
        sourcePaths: readSourcePaths(category, `lensModel.projectedAssetOffset.includedCategories.${index}`)
      });
    });

    trace.layer1.growthGate.includedCategoryKeys = Array.from(growthMap.keys());
    return growthMap;
  }

  function buildLayer1AssetLedger(lensModel, analysisSettings, dataGaps, trace, sourcePaths) {
    const sourceAssets = resolveAssetFacts(lensModel, dataGaps, sourcePaths);
    const growthMap = resolveGrowthMap(lensModel, analysisSettings, trace, sourcePaths);
    const rows = [];

    sourceAssets.forEach(function (asset, index) {
      if (!isPlainObject(asset)) {
        return;
      }

      const valueResult = firstNumeric(asset, [
        "currentValue",
        "value",
        "rawValue",
        "amount",
        "balance"
      ]);
      const categoryKey = normalizeString(
        asset.categoryKey
        || asset.typeKey
        || asset.category
        || asset.assetCategory
      ) || `asset-${index + 1}`;
      const id = normalizeString(asset.id || asset.assetId || asset.sourceKey) || `asset-${index + 1}`;
      const rowSourcePaths = readSourcePaths(
        asset,
        valueResult.path ? `lensModel.assetFacts.assets.${index}.${valueResult.path}` : `lensModel.assetFacts.assets.${index}`
      );
      const included = asset.includedInProjection !== false
        && asset.included !== false
        && !isExcludedStatus(asset.status);
      const growth = growthMap.get(categoryKey);

      appendUnique(sourcePaths, rowSourcePaths);

      if (valueResult.value == null) {
        addIssue(
          dataGaps,
          "missing-current-gross-asset-value",
          "Asset fact was missing a current gross value for Layer 1.",
          rowSourcePaths,
          { id, categoryKey }
        );
        return;
      }

      rows.push({
        id,
        categoryKey,
        label: normalizeString(asset.label || asset.name || categoryKey),
        currentValue: roundMoney(valueResult.value),
        includedInProjection: included,
        growthEligible: growth?.growthEligible === true,
        annualGrowthRate: growth?.annualGrowthRate ?? null,
        growthStatus: growth?.growthStatus || "current-dollar",
        sourcePaths: uniqueStrings(rowSourcePaths.concat(growth?.sourcePaths || [])),
        trace: {
          source: "lensModel.assetFacts.assets",
          sourceIndex: index,
          currentGrossValuePath: valueResult.path,
          treatmentValuesIgnoredForLayer1: true
        }
      });
    });

    trace.layer1.assetLedger = {
      source: "lensModel.assetFacts.assets",
      rowCount: rows.length,
      totalCurrentGrossAssets: roundMoney(rows.reduce(function (total, row) {
        return total + (row.includedInProjection === false ? 0 : row.currentValue);
      }, 0))
    };

    return rows;
  }

  function hasGrossIncomeFallback(incomeBasis) {
    return [
      "insuredGrossAnnualIncome",
      "spouseOrPartnerGrossAnnualIncome",
      "grossAnnualIncome",
      "annualIncomeReplacementBase"
    ].some(function (path) {
      return firstNumeric(incomeBasis, [path]).value != null;
    });
  }

  function buildHouseholdIncomeStream(lensModel, dataGaps, sourcePaths, trace) {
    const incomeBasis = lensModel?.incomeBasis || {};
    const insured = firstNumeric(incomeBasis, ["insuredNetAnnualIncome"]);
    const spouse = firstNumeric(incomeBasis, ["spouseOrPartnerNetAnnualIncome"]);
    const knownNetValues = [insured, spouse].filter(function (result) {
      return result.value != null;
    });

    if (!knownNetValues.length) {
      addIssue(
        dataGaps,
        "missing-mature-net-household-income",
        "Mature net household income is required for Layer 1.",
        [
          "lensModel.incomeBasis.insuredNetAnnualIncome",
          "lensModel.incomeBasis.spouseOrPartnerNetAnnualIncome"
        ]
      );
      if (hasGrossIncomeFallback(incomeBasis)) {
        addIssue(
          dataGaps,
          "unsafe-gross-income-fallback-excluded",
          "Gross income was present but not used as spendable household income.",
          ["lensModel.incomeBasis"]
        );
      }
      return [];
    }

    const amount = roundMoney(knownNetValues.reduce(function (total, result) {
      return total + result.value;
    }, 0));
    const paths = uniqueStrings(knownNetValues.map(function (result) {
      return `lensModel.incomeBasis.${result.path}`;
    }));
    appendUnique(sourcePaths, paths);
    trace.layer1.householdIncome = {
      source: "lensModel.incomeBasis net annual income fields",
      annualAmount: amount,
      sourcePaths: paths
    };

    return [{
      id: "household-net-income",
      label: "Household net income",
      amount,
      frequency: "annual",
      status: "mature-net",
      incomeType: "net",
      sourcePaths: paths
    }];
  }

  function buildExpenseStreams(lensModel, scenarioOptions, dataGaps, sourcePaths, trace, owner) {
    const ongoingSupport = lensModel?.ongoingSupport || {};
    const streams = [];
    const essential = firstNumeric(ongoingSupport, ["annualTotalEssentialSupportCost"]);
    const includeDiscretionary = scenarioOptions?.includeDiscretionaryNeeds === true;
    const discretionary = firstNumeric(ongoingSupport, ["annualDiscretionaryPersonalSpending"]);

    if (essential.value == null) {
      addIssue(
        dataGaps,
        owner === "layer3" ? "missing-survivor-needs" : "missing-essential-expenses",
        owner === "layer3"
          ? "Survivor essential needs are required for Layer 3."
          : "Essential household expenses are required for Layer 1.",
        ["lensModel.ongoingSupport.annualTotalEssentialSupportCost"]
      );
    } else {
      appendUnique(sourcePaths, [`lensModel.ongoingSupport.${essential.path}`]);
      streams.push({
        id: owner === "layer3" ? "survivor-essential-needs" : "household-essential-expenses",
        label: owner === "layer3" ? "Survivor essential needs" : "Household essential expenses",
        amount: roundMoney(essential.value),
        frequency: "annual",
        category: "household",
        expenseType: "essential",
        needType: "essential",
        status: "active",
        sourcePaths: [`lensModel.ongoingSupport.${essential.path}`]
      });
    }

    if (includeDiscretionary) {
      if (discretionary.value == null) {
        addIssue(
          dataGaps,
          owner === "layer3" ? "missing-discretionary-survivor-needs" : "missing-discretionary-expenses",
          owner === "layer3"
            ? "Discretionary survivor needs were requested but no mature annual value was available."
            : "Discretionary expenses were requested but no mature annual value was available.",
          ["lensModel.ongoingSupport.annualDiscretionaryPersonalSpending"]
        );
      } else {
        appendUnique(sourcePaths, [`lensModel.ongoingSupport.${discretionary.path}`]);
        streams.push({
          id: owner === "layer3" ? "survivor-discretionary-needs" : "household-discretionary-expenses",
          label: owner === "layer3" ? "Survivor discretionary needs" : "Household discretionary expenses",
          amount: roundMoney(discretionary.value),
          frequency: "annual",
          category: "personal",
          expenseType: "discretionary",
          needType: "discretionary",
          status: "active",
          sourcePaths: [`lensModel.ongoingSupport.${discretionary.path}`]
        });
      }
    }

    trace[owner].expensePolicy = {
      essentialSource: essential.path ? `lensModel.ongoingSupport.${essential.path}` : null,
      discretionaryIncluded: includeDiscretionary,
      discretionarySource: discretionary.path ? `lensModel.ongoingSupport.${discretionary.path}` : null
    };
    return streams;
  }

  function buildLayer1Input(input, dataGaps, trace, sourcePaths) {
    const assetLedger = buildLayer1AssetLedger(input.lensModel, input.analysisSettings, dataGaps, trace, sourcePaths);
    const incomeStreams = buildHouseholdIncomeStream(input.lensModel, dataGaps, sourcePaths, trace);
    const expenseStreams = buildExpenseStreams(
      input.lensModel,
      input.scenarioOptions,
      dataGaps,
      sourcePaths,
      trace,
      "layer1"
    ).map(function (stream) {
      return {
        id: stream.id,
        label: stream.label,
        amount: stream.amount,
        frequency: stream.frequency,
        category: stream.category,
        expenseType: stream.expenseType,
        status: stream.status,
        sourcePaths: stream.sourcePaths
      };
    });

    trace.layer1.scheduledObligations = {
      policy: "none-in-v1",
      reason: "No pre-event household obligation is added unless it is clearly separate from expenses."
    };

    return {
      startDate: input.valuationDate,
      endDate: input.selectedDeathDate,
      cadence: MONTHLY_CADENCE,
      assetLedger,
      incomeStreams,
      expenseStreams,
      scheduledObligations: [],
      options: {
        allowNegativeAssets: true,
        growthMode: "activeEligibleOnly",
        cashFlowTiming: "growth-first-then-cash-flow"
      }
    };
  }

  function buildCurrentTargetPoint(layer1Output, layer1Input, selectedDeathDate) {
    const assetLedger = (Array.isArray(layer1Input.assetLedger) ? layer1Input.assetLedger : [])
      .map(function (row) {
        return {
          id: row.id,
          categoryKey: row.categoryKey,
          label: row.label,
          currentValue: row.currentValue,
          projectedValue: row.currentValue,
          includedInProjection: row.includedInProjection,
          growthEligible: row.growthEligible,
          annualGrowthRate: row.annualGrowthRate,
          growthStatus: row.growthStatus,
          sourcePaths: clonePlainValue(row.sourcePaths),
          trace: clonePlainValue(row.trace)
        };
      });
    return {
      date: selectedDeathDate,
      monthIndex: 0,
      startingAssets: layer1Output?.summary?.startingAssets ?? 0,
      income: 0,
      essentialExpenses: 0,
      discretionaryExpenses: 0,
      scheduledObligations: 0,
      netCashFlow: 0,
      investmentGrowth: 0,
      endingAssets: layer1Output?.summary?.endingAssets ?? layer1Output?.summary?.startingAssets ?? 0,
      assetLedger,
      sourcePaths: layer1Output?.trace?.sourcePaths || [],
      trace: {
        calculationMethod: CALCULATION_METHOD,
        currentPointOnly: true
      }
    };
  }

  function resolveTargetWealthPoint(layer1Output, layer1Input, selectedDeathDate) {
    const points = Array.isArray(layer1Output?.points) ? layer1Output.points : [];
    if (points.length) {
      return clonePlainValue(points[points.length - 1]);
    }
    return buildCurrentTargetPoint(layer1Output, layer1Input, selectedDeathDate);
  }

  function readPreparedAmount(source, paths) {
    const result = firstNumeric(source, paths);
    if (result.value == null) {
      return null;
    }
    return {
      value: roundMoney(result.value),
      sourcePaths: [result.path]
    };
  }

  function resolveExistingCoverageTreatment(lensModel, dataGaps, sourcePaths) {
    const coverage = lensModel?.treatedExistingCoverageOffset
      || lensModel?.existingCoverageTreatment
      || lensModel?.treatedExistingCoverage
      || null;

    if (!isPlainObject(coverage) || toOptionalNumber(coverage.totalTreatedCoverageOffset) == null) {
      addIssue(
        dataGaps,
        "missing-treated-existing-coverage-output",
        "Prepared treated existing coverage output is required for Layer 2.",
        ["lensModel.treatedExistingCoverageOffset.totalTreatedCoverageOffset"]
      );
    } else {
      appendUnique(sourcePaths, readSourcePaths(coverage, "lensModel.treatedExistingCoverageOffset"));
    }

    return coverage;
  }

  function resolveImmediateObligations(lensModel, dataGaps, sourcePaths) {
    const finalExpenses = readPreparedAmount(lensModel, [
      "finalExpenses.totalFinalExpenseNeed",
      "finalExpenses.combinedFinalExpenseUsed",
      "finalExpenseProjection.combinedFinalExpenseUsed",
      "lensComponents.finalExpenses"
    ]);
    const transitionNeeds = readPreparedAmount(lensModel, [
      "transitionNeeds.totalTransitionNeed",
      "transitionNeeds.transitionNeedAmount",
      "lensComponents.transitionNeeds"
    ]);
    const debtTreatment = lensModel?.treatedDebtPayoff || lensModel?.debtTreatment || {};

    if (
      !finalExpenses
      && !transitionNeeds
      && (!isPlainObject(debtTreatment) || !Object.keys(debtTreatment).length)
    ) {
      addIssue(
        dataGaps,
        "missing-immediate-obligation-source",
        "No prepared immediate obligation source was available for Layer 2.",
        [
          "lensModel.finalExpenses",
          "lensModel.transitionNeeds",
          "lensModel.treatedDebtPayoff"
        ]
      );
    }

    if (finalExpenses) {
      appendUnique(sourcePaths, [`lensModel.${finalExpenses.sourcePaths[0]}`]);
    }
    if (transitionNeeds) {
      appendUnique(sourcePaths, [`lensModel.${transitionNeeds.sourcePaths[0]}`]);
    }
    if (isPlainObject(debtTreatment)) {
      appendUnique(sourcePaths, readSourcePaths(debtTreatment, "lensModel.treatedDebtPayoff"));
    }

    return {
      finalExpenses: finalExpenses
        ? {
            value: finalExpenses.value,
            sourcePaths: [`lensModel.${finalExpenses.sourcePaths[0]}`]
          }
        : null,
      transitionNeeds: transitionNeeds
        ? {
            value: transitionNeeds.value,
            sourcePaths: [`lensModel.${transitionNeeds.sourcePaths[0]}`]
          }
        : null,
      debtTreatment
    };
  }

  function buildLayer2Input(input, layer1Output, layer1Input, targetWealthPoint, dataGaps, trace, sourcePaths) {
    if (!isPlainObject(input.analysisSettings?.assetTreatmentAssumptions)) {
      addIssue(
        dataGaps,
        "missing-asset-treatment-assumptions",
        "Asset treatment assumptions are required for Layer 2.",
        ["analysisSettings.assetTreatmentAssumptions"]
      );
    } else {
      appendUnique(sourcePaths, ["analysisSettings.assetTreatmentAssumptions"]);
    }

    const existingCoverageTreatment = resolveExistingCoverageTreatment(input.lensModel, dataGaps, sourcePaths);
    const immediateObligations = resolveImmediateObligations(input.lensModel, dataGaps, sourcePaths);
    const projectedAssetLedger = Array.isArray(targetWealthPoint?.assetLedger)
      ? targetWealthPoint.assetLedger
      : [];

    trace.layer2.inputMapping = {
      projectedWealthPoint: "Layer 1 target point",
      projectedAssetLedgerRows: projectedAssetLedger.length,
      assetTreatmentAssumptions: "analysisSettings.assetTreatmentAssumptions",
      existingCoverageTreatment: existingCoverageTreatment ? "prepared treated existing coverage output" : "missing",
      immediateObligations: "prepared final expenses, transition needs, and treated debt payoff"
    };

    return {
      eventDate: input.selectedDeathDate,
      projectedWealthPoint: targetWealthPoint,
      projectedAssetLedger,
      assetTreatmentAssumptions: input.analysisSettings?.assetTreatmentAssumptions,
      existingCoverageTreatment,
      immediateObligations,
      options: {
        source: CALCULATION_METHOD,
        layer1Summary: clonePlainValue(layer1Output?.summary)
      }
    };
  }

  function getDebtRows(debtTreatment) {
    const rows = []
      .concat(Array.isArray(debtTreatment?.debts) ? debtTreatment.debts : [])
      .concat(Array.isArray(debtTreatment?.trace?.debts) ? debtTreatment.trace.debts : []);
    const seen = new Set();
    return rows.filter(function (row, index) {
      if (!isPlainObject(row)) {
        return false;
      }
      const key = [
        row.debtFactId || row.id || index,
        row.isMortgage === true,
        row.treatmentMode || row.mortgageTreatmentMode || "",
        row.treatedAmount || row.mortgageSupportAmount || ""
      ].join(":");
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
  }

  function isMortgageSupportRow(row) {
    const mode = normalizeStatus(row?.mortgageTreatmentMode || row?.treatmentMode);
    return row?.isMortgage === true && mode === "support" && row.included !== false;
  }

  function buildMortgageSupportObligations(debtTreatment, layer2Output, dataGaps, sourcePaths) {
    const rows = getDebtRows(debtTreatment).filter(isMortgageSupportRow);
    const obligations = [];

    rows.forEach(function (row, index) {
      const trace = isPlainObject(row.mortgageSupportTrace) ? row.mortgageSupportTrace : {};
      const monthlyAmount = toOptionalNumber(
        trace.monthlyMortgagePaymentUsed
        ?? row.monthlyMortgagePaymentUsed
        ?? row.monthlyPayment
        ?? row.payment
      );
      const termMonths = toWholeMonthCount(
        trace.supportMonthsUsed
        ?? trace.supportMonthsRequested
        ?? row.supportMonthsUsed
        ?? row.supportMonths
        ?? row.termMonths
      );
      const paths = readSourcePaths(row, `lensModel.treatedDebtPayoff.debts.${index}`);

      appendUnique(sourcePaths, paths);

      if (monthlyAmount == null || monthlyAmount <= 0 || termMonths == null || termMonths <= 0) {
        return;
      }

      obligations.push({
        id: normalizeString(row.debtFactId || row.id) || `mortgage-support-${index + 1}`,
        label: normalizeString(row.label || row.name) || "Mortgage support",
        amount: roundMoney(monthlyAmount),
        frequency: "monthly",
        termMonths,
        category: "mortgageSupport",
        status: "scheduled",
        alreadyIncludedInNeeds: row.alreadyIncludedInNeeds === true,
        sourcePaths: paths,
        trace: {
          source: "lensModel.treatedDebtPayoff mortgage support row",
          deferredFromLayer2: true
        }
      });
    });

    const deferredMortgageSupport = toOptionalNumber(layer2Output?.immediateObligations?.deferredMortgageSupport);
    if ((deferredMortgageSupport || 0) > 0 && !obligations.length) {
      addIssue(
        dataGaps,
        "mortgage-support-detected-without-schedule",
        "Mortgage support was deferred from Layer 2 but no monthly schedule was available for Layer 3.",
        ["lensModel.treatedDebtPayoff"]
      );
    }

    return obligations;
  }

  function buildSurvivorIncomeStreams(lensModel, dataGaps, sourcePaths, trace) {
    const survivorScenario = lensModel?.survivorScenario || {};
    const survivorIncome = firstNumeric(survivorScenario, ["survivorNetAnnualIncome"]);
    const delay = firstNumeric(survivorScenario, ["survivorIncomeStartDelayMonths"]);

    if (survivorIncome.value == null) {
      addIssue(
        dataGaps,
        "missing-survivor-net-income",
        "Mature survivor net income is required for Layer 3.",
        ["lensModel.survivorScenario.survivorNetAnnualIncome"]
      );
      return [];
    }

    const paths = [`lensModel.survivorScenario.${survivorIncome.path}`];
    appendUnique(sourcePaths, paths);
    trace.layer3.survivorIncome = {
      annualAmount: roundMoney(survivorIncome.value),
      startDelayMonths: delay.value == null ? 0 : Math.max(0, Math.floor(delay.value)),
      sourcePaths: paths
    };

    return [{
      id: "survivor-net-income",
      label: "Survivor net income",
      amount: roundMoney(survivorIncome.value),
      frequency: "annual",
      status: "mature-net",
      incomeType: "net",
      startDelayMonths: delay.value == null ? 0 : Math.max(0, Math.floor(delay.value)),
      sourcePaths: paths,
      trace: {
        source: "lensModel.survivorScenario.survivorNetAnnualIncome"
      }
    }];
  }

  function buildLayer3Input(input, layer2Output, dataGaps, trace, sourcePaths) {
    const survivorNeedStreams = buildExpenseStreams(
      input.lensModel,
      input.scenarioOptions,
      dataGaps,
      sourcePaths,
      trace,
      "layer3"
    ).map(function (stream) {
      return {
        id: stream.id,
        label: stream.label,
        amount: stream.amount,
        frequency: stream.frequency,
        needType: stream.needType,
        status: stream.status,
        sourcePaths: stream.sourcePaths,
        trace: {
          source: stream.sourcePaths[0]
        }
      };
    });
    const survivorIncomeStreams = buildSurvivorIncomeStreams(input.lensModel, dataGaps, sourcePaths, trace);
    const scheduledObligations = buildMortgageSupportObligations(
      input.lensModel?.treatedDebtPayoff || input.lensModel?.debtTreatment || {},
      layer2Output,
      dataGaps,
      sourcePaths
    );
    const resourcesAfterObligations = toOptionalNumber(layer2Output?.resources?.resourcesAfterObligations);

    trace.layer3.inputMapping = {
      startingResources: "Layer 2 resources.resourcesAfterObligations",
      survivorIncome: "lensModel.survivorScenario.survivorNetAnnualIncome",
      survivorNeeds: "lensModel.ongoingSupport annual support fields",
      scheduledObligations: scheduledObligations.map(function (row) { return row.id; }),
      educationAndHealthcarePolicy: "explicit-only-deferred-in-v1"
    };

    return {
      startDate: input.selectedDeathDate,
      projectionHorizonMonths: input.projectionHorizonMonths,
      startingResources: {
        value: resourcesAfterObligations,
        status: resourcesAfterObligations == null ? "missing" : "available",
        sourcePaths: ["layer2.resources.resourcesAfterObligations"],
        trace: {
          source: "household-death-event-availability-v1"
        }
      },
      survivorIncomeStreams,
      survivorNeedStreams,
      scheduledObligations,
      options: {
        cadence: MONTHLY_CADENCE,
        preserveSignedResources: true
      }
    };
  }

  function createUnavailableLayerOutput(methodName, code, message) {
    return {
      status: "not-available",
      warnings: [],
      dataGaps: [makeIssue(code, message, [methodName])],
      sourcePaths: [],
      trace: {
        helper: "missing"
      }
    };
  }

  function runLayer(helper, input, missingCode, missingMessage) {
    if (typeof helper !== "function") {
      return createUnavailableLayerOutput(input?.methodName || "helper", missingCode, missingMessage);
    }
    return helper(input);
  }

  function getOverallStatus(layerOutputs, dataGaps) {
    if (dataGaps.length) {
      return "partial";
    }
    return layerOutputs.some(function (layer) {
      return layer?.status && layer.status !== "complete";
    }) ? "partial" : "complete";
  }

  function composeIncomeImpactScenario(input) {
    const safeInput = isPlainObject(input) ? input : {};
    const valuation = normalizeDateOnly(safeInput.valuationDate);
    const selectedDeath = normalizeDateOnly(safeInput.selectedDeathDate);
    const projectionHorizonMonths = normalizeProjectionHorizonMonths(safeInput.projectionHorizonMonths);
    const scenarioOptions = isPlainObject(safeInput.scenarioOptions) ? safeInput.scenarioOptions : {};
    const lensModel = isPlainObject(safeInput.lensModel) ? safeInput.lensModel : {};
    const analysisSettings = isPlainObject(safeInput.analysisSettings) ? safeInput.analysisSettings : {};
    const warnings = [];
    const dataGaps = [];
    const sourcePaths = [];
    const trace = {
      calculationMethod: CALCULATION_METHOD,
      layerOrder: ["householdWealthProjection", "deathEventAvailability", "survivorRunway"],
      scopeStatement: "Composer prepares calculation layers only; rendering, persistence, and risk evaluation are outside this helper.",
      layer1: {},
      layer2: {},
      layer3: {},
      currentAgeDeathPolicy: null
    };

    if (!valuation) {
      addIssue(dataGaps, "missing-valuation-date", "A valid valuationDate is required.", ["valuationDate"]);
    }
    if (!selectedDeath) {
      addIssue(dataGaps, "missing-selected-death-date", "A valid selectedDeathDate is required.", ["selectedDeathDate"]);
    }

    const normalizedInput = {
      valuationDate: valuation?.normalizedDate || normalizeString(safeInput.valuationDate),
      selectedDeathDate: selectedDeath?.normalizedDate || normalizeString(safeInput.selectedDeathDate),
      selectedDeathAge: toOptionalNumber(safeInput.selectedDeathAge),
      projectionHorizonMonths,
      lensModel,
      analysisSettings,
      scenarioOptions
    };

    const layer1Input = buildLayer1Input(normalizedInput, dataGaps, trace, sourcePaths);
    const layer1Helper = lensAnalysis.calculateHouseholdWealthProjection;
    const layer1 = runLayer(
      layer1Helper,
      layer1Input,
      "missing-layer-1-helper",
      "Layer 1 household wealth projection helper was unavailable."
    );
    const currentPointOnly = isSameDate(valuation, selectedDeath)
      || (toWholeMonthCount(layer1.durationMonths) === 0 && Array.isArray(layer1.points) && !layer1.points.length);
    const targetWealthPoint = resolveTargetWealthPoint(layer1, layer1Input, normalizedInput.selectedDeathDate);

    const traceDurationMonths = valuation?.date && selectedDeath?.date
      ? calculateWholeMonthsBetween(valuation.date, selectedDeath.date)
      : null;
    trace.currentAgeDeathPolicy = currentPointOnly
      ? {
          mode: "current-point-only",
          note: "No forward projection period exists, so no prior context is synthesized."
        }
      : {
          mode: "forward-projection",
          durationMonths: layer1.durationMonths ?? traceDurationMonths
        };

    const layer2Input = buildLayer2Input(normalizedInput, layer1, layer1Input, targetWealthPoint, dataGaps, trace, sourcePaths);
    const layer2Helper = lensAnalysis.calculateHouseholdDeathEventAvailability;
    const layer2 = runLayer(
      layer2Helper,
      layer2Input,
      "missing-layer-2-helper",
      "Layer 2 death-event availability helper was unavailable."
    );

    const layer3Input = buildLayer3Input(normalizedInput, layer2, dataGaps, trace, sourcePaths);
    const layer3Helper = lensAnalysis.calculateHouseholdSurvivorRunway;
    const layer3 = runLayer(
      layer3Helper,
      layer3Input,
      "missing-layer-3-helper",
      "Layer 3 survivor runway helper was unavailable."
    );

    collectLayerItems(warnings, layer1.warnings);
    collectLayerItems(warnings, layer2.warnings);
    collectLayerItems(warnings, layer3.warnings);
    collectLayerItems(dataGaps, layer1.dataGaps);
    collectLayerItems(dataGaps, layer2.dataGaps);
    collectLayerItems(dataGaps, layer3.dataGaps);
    collectLayerSourcePaths(sourcePaths, layer1);
    collectLayerSourcePaths(sourcePaths, layer2);
    collectLayerSourcePaths(sourcePaths, layer3);

    const resourcesAfterObligations = roundMoney(layer2?.resources?.resourcesAfterObligations || 0);
    const coverageAdded = roundMoney(layer2?.resources?.existingCoverage || 0);
    const survivorAvailableTreatedAssets = roundMoney(layer2?.resources?.survivorAvailableTreatedAssets || 0);
    const assetsBeforeDeath = roundMoney(layer2?.resources?.grossProjectedAssetsBeforeTreatment || targetWealthPoint?.endingAssets || 0);
    const immediateObligations = roundMoney(layer2?.resources?.immediateObligations || 0);
    const depletion = layer3?.depletion || {};
    const accumulatedUnmetNeed = roundMoney(layer3?.summary?.accumulatedUnmetNeed || 0);

    return {
      status: getOverallStatus([layer1, layer2, layer3], dataGaps),
      scenario: {
        valuationDate: normalizedInput.valuationDate,
        selectedDeathDate: normalizedInput.selectedDeathDate,
        selectedDeathAge: normalizedInput.selectedDeathAge,
        projectionHorizonMonths,
        mortgageTreatmentOverride: scenarioOptions.mortgageTreatmentOverride || null
      },
      preDeathSeries: {
        mode: currentPointOnly ? "current-point-only" : "forward-projection",
        precision: "monthly",
        points: currentPointOnly ? [] : clonePlainValue(layer1.points || []),
        targetPoint: clonePlainValue(targetWealthPoint),
        summary: clonePlainValue(layer1.summary || {}),
        layer1: clonePlainValue(layer1)
      },
      deathEvent: {
        date: normalizedInput.selectedDeathDate,
        age: normalizedInput.selectedDeathAge,
        assetsBeforeDeath,
        survivorAvailableTreatedAssets,
        coverageAdded,
        immediateObligations,
        resourcesAfterObligations,
        layer2: clonePlainValue(layer2)
      },
      postDeathSeries: {
        points: clonePlainValue(layer3.points || []),
        summary: clonePlainValue(layer3.summary || {}),
        depletion: clonePlainValue(depletion),
        layer3: clonePlainValue(layer3)
      },
      timelineFacts: {
        assetsBeforeDeath,
        survivorAvailableTreatedAssets,
        coverageAdded,
        resourcesAfterObligations,
        depletionDate: depletion.depletionDate || null,
        monthsCovered: depletion.monthsCovered ?? null,
        accumulatedUnmetNeed
      },
      warnings,
      dataGaps,
      trace: {
        ...trace,
        inputMappings: {
          layer1: {
            assetLedger: "lensModel.assetFacts.assets current gross values",
            incomeStreams: "lensModel.incomeBasis net annual income fields",
            expenseStreams: "lensModel.ongoingSupport annual support fields",
            growth: "method-active projected offset categories only"
          },
          layer2: trace.layer2.inputMapping,
          layer3: trace.layer3.inputMapping
        },
        layerOutputs: {
          layer1Status: layer1.status || null,
          layer2Status: layer2.status || null,
          layer3Status: layer3.status || null
        },
        sourcePaths: uniqueStrings(sourcePaths)
      },
      sourcePaths: uniqueStrings(sourcePaths)
    };
  }

  lensAnalysis.composeIncomeImpactScenario = composeIncomeImpactScenario;
})(typeof globalThis !== "undefined" ? globalThis : this);
