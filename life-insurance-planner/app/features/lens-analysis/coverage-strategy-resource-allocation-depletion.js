// Coverage Strategy resource allocation/depletion helper.
// Future home after folder reorganization:
// app/features/lens-analysis/coverage-strategy/resources/resource-allocation-depletion.js
// Backend-ready pure calculation helper: accepts scheduled obligations, asset
// balances, baseline resource points, and an eligibility policy; returns a
// serializable allocation ledger and year-by-year depletion adjustments.
// Does not own Resource Line rendering, Need Line math, education projection
// runtime wiring, scenario settings, storage, DOM, or display behavior.
(function (global) {
  const root = global.LensApp || (global.LensApp = {});
  const lensAnalysis = root.lensAnalysis || (root.lensAnalysis = {});

  const COVERAGE_STRATEGY_RESOURCE_ALLOCATION_DEPLETION_VERSION =
    "coverage-strategy-resource-allocation-depletion-v1";

  const DEFAULT_CATEGORY_ORDER = Object.freeze([
    "cashAndCashEquivalents",
    "taxableBrokerageInvestments"
  ]);

  const CATEGORY_FLAGS = Object.freeze({
    cashAndCashEquivalents: Object.freeze({
      liquidGeneral: true
    }),
    emergencyFund: Object.freeze({
      emergencyReserve: true
    }),
    taxableBrokerageInvestments: Object.freeze({
      taxableBrokerage: true,
      liquidGeneral: true
    }),
    traditionalRetirementAssets: Object.freeze({
      retirement: true,
      taxSensitive: true
    }),
    rothTaxAdvantagedRetirementAssets: Object.freeze({
      retirement: true,
      taxSensitive: true
    }),
    qualifiedAnnuities: Object.freeze({
      retirement: true,
      taxSensitive: true
    }),
    nonqualifiedAnnuities: Object.freeze({
      taxSensitive: true,
      reviewOnly: true
    }),
    primaryResidenceEquity: Object.freeze({
      homeEquity: true
    }),
    otherRealEstateEquity: Object.freeze({
      homeEquity: true
    }),
    businessPrivateCompanyValue: Object.freeze({
      businessValue: true
    }),
    educationSpecificSavings: Object.freeze({
      educationSpecific: true
    }),
    trustRestrictedAssets: Object.freeze({
      restricted: true
    }),
    stockCompensationDeferredCompensation: Object.freeze({
      reviewOnly: true,
      taxSensitive: true
    }),
    digitalAssetsCrypto: Object.freeze({
      crypto: true,
      reviewOnly: true
    }),
    otherCustomAsset: Object.freeze({
      reviewOnly: true
    })
  });

  const DEFAULT_ELIGIBILITY_POLICY = Object.freeze({
    allowCashAboveReserve: true,
    cashReserveAmount: 0,
    allowTaxableBrokerage: true,
    allowEmergencyFund: false,
    allowRetirementAssets: false,
    allowRestrictedAssets: false,
    allowHomeEquity: false,
    allowBusinessValue: false,
    allowCrypto: false,
    allowReviewOnlyAssets: false,
    allowedCategoryOrder: DEFAULT_CATEGORY_ORDER
  });

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

  function mergePolicy(policy) {
    const safePolicy = isPlainObject(policy) ? policy : {};
    const categoryOrder = Array.isArray(safePolicy.allowedCategoryOrder)
      ? safePolicy.allowedCategoryOrder.map(normalizeString).filter(Boolean)
      : DEFAULT_CATEGORY_ORDER.slice();
    return {
      ...clonePlainValue(DEFAULT_ELIGIBILITY_POLICY),
      ...clonePlainValue(safePolicy),
      cashReserveAmount: Math.max(0, toOptionalNumber(safePolicy.cashReserveAmount) || 0),
      allowedCategoryOrder: categoryOrder.length ? categoryOrder : DEFAULT_CATEGORY_ORDER.slice()
    };
  }

  function normalizeYearIndex(value, fallback) {
    const parsed = toOptionalNumber(value);
    if (parsed == null || parsed < 0) {
      return fallback;
    }
    return Math.max(0, Math.round(parsed));
  }

  function getAssetId(asset, index) {
    return normalizeString(asset?.assetId || asset?.id || asset?.sourceKey) || `asset-${index + 1}`;
  }

  function getSourcePath(row, fallback) {
    if (normalizeString(row?.sourcePath)) {
      return normalizeString(row.sourcePath);
    }
    if (Array.isArray(row?.sourcePaths)) {
      return row.sourcePaths.map(normalizeString).filter(Boolean)[0] || fallback;
    }
    return fallback;
  }

  function getCategoryFlags(asset) {
    const categoryKey = normalizeString(asset?.categoryKey || asset?.assetCategoryKey);
    const defaults = CATEGORY_FLAGS[categoryKey] || {};
    return {
      isEducationSpecific: asset?.isEducationSpecific === true || defaults.educationSpecific === true,
      isRestricted: asset?.isRestricted === true || defaults.restricted === true,
      isEmergencyReserve: asset?.isEmergencyReserve === true || defaults.emergencyReserve === true,
      isRetirement: asset?.isRetirement === true || defaults.retirement === true,
      isTaxSensitive: asset?.isTaxSensitive === true || defaults.taxSensitive === true,
      isHomeEquity: asset?.isHomeEquity === true || defaults.homeEquity === true,
      isBusinessValue: asset?.isBusinessValue === true || defaults.businessValue === true,
      isCrypto: asset?.isCrypto === true || defaults.crypto === true,
      isReviewOnly: asset?.isReviewOnly === true || defaults.reviewOnly === true,
      isTaxableBrokerage: defaults.taxableBrokerage === true,
      isLiquidGeneral: defaults.liquidGeneral === true
    };
  }

  function getAssetBalance(asset) {
    const treatedValue = toOptionalNumber(asset?.treatedValue);
    if (treatedValue != null) {
      return Math.max(0, treatedValue);
    }
    const rawValue = toOptionalNumber(
      asset?.rawValue
      ?? asset?.currentValue
      ?? asset?.value
      ?? asset?.amount
      ?? asset?.balance
    );
    return rawValue == null ? null : Math.max(0, rawValue);
  }

  function sumAlreadyAppliedByAsset(alreadyAppliedEducationSavings) {
    const appliedByAsset = new Map();
    (Array.isArray(alreadyAppliedEducationSavings) ? alreadyAppliedEducationSavings : []).forEach(function (row) {
      if (!isPlainObject(row)) {
        return;
      }
      const assetId = normalizeString(row.assetId || row.id || row.sourceKey);
      const amount = Math.max(0, toOptionalNumber(row.amountApplied ?? row.appliedAmount ?? row.amount) || 0);
      if (!assetId || !(amount > 0)) {
        return;
      }
      appliedByAsset.set(assetId, roundMoney((appliedByAsset.get(assetId) || 0) + amount));
    });
    return appliedByAsset;
  }

  function normalizeAssets(assets, alreadyAppliedByAsset, warnings, dataGaps) {
    return (Array.isArray(assets) ? assets : []).reduce(function (rows, asset, index) {
      if (!isPlainObject(asset)) {
        addIssue(warnings, "invalid-resource-allocation-asset", "Asset row was ignored because it was not an object.", { index });
        return rows;
      }
      const assetId = getAssetId(asset, index);
      const categoryKey = normalizeString(asset.categoryKey || asset.assetCategoryKey || asset.typeKey || asset.category) || "uncategorized";
      const startingBalance = getAssetBalance(asset);
      if (startingBalance == null) {
        addIssue(
          dataGaps,
          "missing-resource-allocation-asset-balance",
          "Asset row was missing a usable raw or treated value.",
          { assetId, categoryKey, sourcePath: getSourcePath(asset, `assets[${index}]`) }
        );
        return rows;
      }
      const alreadyAppliedAmount = Math.min(startingBalance, alreadyAppliedByAsset.get(assetId) || 0);
      rows.push({
        assetId,
        categoryKey,
        label: normalizeString(asset.label || asset.name || categoryKey),
        sourcePath: getSourcePath(asset, `assets[${index}]`),
        rawValue: roundMoney(toOptionalNumber(asset.rawValue ?? asset.currentValue ?? asset.value ?? asset.amount ?? asset.balance) || 0),
        treatedValue: roundMoney(toOptionalNumber(asset.treatedValue) ?? startingBalance),
        startingBalance: roundMoney(startingBalance),
        currentBalance: roundMoney(Math.max(0, startingBalance - alreadyAppliedAmount)),
        alreadyAppliedEducationSavingsAmount: roundMoney(alreadyAppliedAmount),
        availabilityStatus: normalizeString(asset.availabilityStatus) || "available",
        treatmentStatus: normalizeString(asset.treatmentStatus) || null,
        ...getCategoryFlags({ ...asset, categoryKey })
      });
      return rows;
    }, []);
  }

  function normalizeObligations(obligations, warnings, dataGaps) {
    return (Array.isArray(obligations) ? obligations : []).reduce(function (rows, obligation, index) {
      if (!isPlainObject(obligation)) {
        addIssue(warnings, "invalid-resource-allocation-obligation", "Obligation row was ignored because it was not an object.", { index });
        return rows;
      }
      const requestedAmount = toOptionalNumber(
        obligation.requestedAmount
        ?? obligation.amount
        ?? obligation.needAmount
      );
      if (requestedAmount == null || requestedAmount <= 0) {
        addIssue(
          dataGaps,
          "missing-resource-allocation-obligation-amount",
          "Obligation row was missing a positive requested amount.",
          { index, sourcePath: obligation.sourcePath || `obligations[${index}]` }
        );
        return rows;
      }
      rows.push({
        obligationId: normalizeString(obligation.obligationId || obligation.id) || `obligation-${index + 1}`,
        componentKey: normalizeString(obligation.componentKey || obligation.component || "education"),
        yearIndex: normalizeYearIndex(obligation.yearIndex, index),
        calendarYear: toOptionalNumber(obligation.calendarYear) == null
          ? null
          : Math.round(toOptionalNumber(obligation.calendarYear)),
        requestedAmount: roundMoney(requestedAmount),
        label: normalizeString(obligation.label || obligation.name || "Scheduled obligation"),
        sourcePath: getSourcePath(obligation, `obligations[${index}]`),
        inputOrder: index
      });
      return rows;
    }, []).sort(function (left, right) {
      if (left.yearIndex !== right.yearIndex) {
        return left.yearIndex - right.yearIndex;
      }
      return left.inputOrder - right.inputOrder;
    });
  }

  function normalizeBaselineResourcePoints(points) {
    return (Array.isArray(points) ? points : []).map(function (point, index) {
      const yearIndex = normalizeYearIndex(point?.yearIndex, index);
      return {
        yearIndex,
        calendarYear: toOptionalNumber(point?.calendarYear) == null
          ? null
          : Math.round(toOptionalNumber(point.calendarYear)),
        resourceAmount: roundMoney(Math.max(0, toOptionalNumber(point?.resourceAmount ?? point?.eligibleResourceAmount) || 0)),
        categoryAmounts: isPlainObject(point?.categoryAmounts) ? clonePlainValue(point.categoryAmounts) : {}
      };
    }).sort(function (left, right) {
      return left.yearIndex - right.yearIndex;
    });
  }

  function resolveEligibility(asset, policy) {
    const availabilityStatus = normalizeString(asset.availabilityStatus).toLowerCase();
    const treatmentStatus = normalizeString(asset.treatmentStatus).toLowerCase();
    if (asset.alreadyAppliedEducationSavingsAmount > 0 && asset.isEducationSpecific) {
      return {
        eligible: false,
        amountAvailable: 0,
        decision: "excluded",
        reason: "education-specific-asset-already-applied"
      };
    }
    if (
      availabilityStatus === "unavailable"
      || availabilityStatus === "excluded"
      || treatmentStatus === "unavailable"
      || treatmentStatus === "excluded"
      || treatmentStatus === "excluded-by-treatment"
    ) {
      return {
        eligible: false,
        amountAvailable: 0,
        decision: "excluded",
        reason: "asset-unavailable-or-excluded-by-treatment"
      };
    }
    if (asset.isEducationSpecific) {
      return {
        eligible: false,
        amountAvailable: 0,
        decision: "excluded",
        reason: "education-specific-savings-handled-before-broader-allocation"
      };
    }
    if (asset.isEmergencyReserve && policy.allowEmergencyFund !== true) {
      return {
        eligible: false,
        amountAvailable: 0,
        decision: "excluded",
        reason: "emergency-fund-excluded-by-policy"
      };
    }
    if (asset.isRetirement && policy.allowRetirementAssets !== true) {
      return {
        eligible: false,
        amountAvailable: 0,
        decision: "excluded",
        reason: "retirement-assets-excluded-by-policy"
      };
    }
    if (asset.isRestricted && policy.allowRestrictedAssets !== true) {
      return {
        eligible: false,
        amountAvailable: 0,
        decision: "excluded",
        reason: "restricted-assets-excluded-by-policy"
      };
    }
    if (asset.isHomeEquity && policy.allowHomeEquity !== true) {
      return {
        eligible: false,
        amountAvailable: 0,
        decision: "excluded",
        reason: "home-equity-excluded-by-policy"
      };
    }
    if (asset.isBusinessValue && policy.allowBusinessValue !== true) {
      return {
        eligible: false,
        amountAvailable: 0,
        decision: "excluded",
        reason: "business-value-excluded-by-policy"
      };
    }
    if (asset.isCrypto && policy.allowCrypto !== true) {
      return {
        eligible: false,
        amountAvailable: 0,
        decision: "excluded",
        reason: "crypto-assets-excluded-by-policy"
      };
    }
    if (asset.isReviewOnly && policy.allowReviewOnlyAssets !== true) {
      return {
        eligible: false,
        amountAvailable: 0,
        decision: "excluded",
        reason: "review-only-assets-excluded-by-policy"
      };
    }
    if (asset.categoryKey === "cashAndCashEquivalents") {
      if (policy.allowCashAboveReserve !== true) {
        return {
          eligible: false,
          amountAvailable: 0,
          decision: "excluded",
          reason: "cash-excluded-by-policy"
        };
      }
      const amountAvailable = Math.max(0, asset.currentBalance - policy.cashReserveAmount);
      return {
        eligible: amountAvailable > 0,
        amountAvailable: roundMoney(amountAvailable),
        decision: amountAvailable > 0 ? "eligible" : "excluded",
        reason: amountAvailable > 0 ? "cash-available-above-reserve" : "cash-reserve-preserved"
      };
    }
    if (asset.categoryKey === "taxableBrokerageInvestments") {
      return {
        eligible: policy.allowTaxableBrokerage === true && asset.currentBalance > 0,
        amountAvailable: policy.allowTaxableBrokerage === true ? asset.currentBalance : 0,
        decision: policy.allowTaxableBrokerage === true ? "eligible" : "excluded",
        reason: policy.allowTaxableBrokerage === true
          ? "taxable-brokerage-allowed-by-policy"
          : "taxable-brokerage-excluded-by-policy"
      };
    }
    return {
      eligible: false,
      amountAvailable: 0,
      decision: "excluded",
      reason: "asset-category-not-allowed-by-policy"
    };
  }

  function sortAssetsByPolicy(assets, policy) {
    const order = new Map(policy.allowedCategoryOrder.map(function (categoryKey, index) {
      return [categoryKey, index];
    }));
    return assets.slice().sort(function (left, right) {
      const leftOrder = order.has(left.categoryKey) ? order.get(left.categoryKey) : Number.MAX_SAFE_INTEGER;
      const rightOrder = order.has(right.categoryKey) ? order.get(right.categoryKey) : Number.MAX_SAFE_INTEGER;
      if (leftOrder !== rightOrder) {
        return leftOrder - rightOrder;
      }
      return left.assetId.localeCompare(right.assetId);
    });
  }

  function buildExcludedAssetDecisions(assets, policy) {
    return assets.map(function (asset) {
      const eligibility = resolveEligibility(asset, policy);
      return {
        assetId: asset.assetId,
        label: asset.label,
        categoryKey: asset.categoryKey,
        sourcePath: asset.sourcePath,
        startingBalance: asset.startingBalance,
        alreadyAppliedEducationSavingsAmount: asset.alreadyAppliedEducationSavingsAmount,
        remainingBalance: asset.currentBalance,
        eligibleAmount: eligibility.amountAvailable,
        eligibilityDecision: eligibility.decision,
        eligibilityReason: eligibility.reason
      };
    }).filter(function (decision) {
      return decision.eligibilityDecision !== "eligible";
    });
  }

  function getProjectionYearIndexes(projectionYears, obligations, baselinePoints) {
    const maxFromProjectionYears = Math.max(0, normalizeYearIndex(projectionYears, 0));
    const maxFromObligations = obligations.reduce(function (max, obligation) {
      return Math.max(max, obligation.yearIndex);
    }, 0);
    const maxFromBaseline = baselinePoints.reduce(function (max, point) {
      return Math.max(max, point.yearIndex);
    }, 0);
    const maxYear = Math.max(maxFromProjectionYears, maxFromObligations, maxFromBaseline);
    return Array.from({ length: maxYear + 1 }, function (_unused, yearIndex) {
      return yearIndex;
    });
  }

  function sumByYear(rows, fieldName) {
    return rows.reduce(function (map, row) {
      const yearIndex = normalizeYearIndex(row.yearIndex, 0);
      map.set(yearIndex, roundMoney((map.get(yearIndex) || 0) + (toOptionalNumber(row[fieldName]) || 0)));
      return map;
    }, new Map());
  }

  function createAnnualBalances(yearIndexes, assets, applications, baselinePoints) {
    const baselineByYear = new Map(baselinePoints.map(function (point) {
      return [point.yearIndex, point];
    }));
    const applicationsByYear = applications.reduce(function (map, application) {
      const rows = map.get(application.yearIndex) || [];
      rows.push(application);
      map.set(application.yearIndex, rows);
      return map;
    }, new Map());
    const runningBalances = new Map(assets.map(function (asset) {
      return [asset.assetId, asset.startingBalance];
    }));
    const alreadyAppliedByAsset = new Map(assets.map(function (asset) {
      return [asset.assetId, asset.alreadyAppliedEducationSavingsAmount];
    }));

    return yearIndexes.map(function (yearIndex) {
      assets.forEach(function (asset) {
        if ((alreadyAppliedByAsset.get(asset.assetId) || 0) > 0 && !applicationsByYear.has(-1)) {
          runningBalances.set(
            asset.assetId,
            roundMoney(Math.max(0, (runningBalances.get(asset.assetId) || 0) - alreadyAppliedByAsset.get(asset.assetId)))
          );
          alreadyAppliedByAsset.set(asset.assetId, 0);
        }
      });
      const yearApplications = applicationsByYear.get(yearIndex) || [];
      yearApplications.forEach(function (application) {
        runningBalances.set(
          application.assetId,
          roundMoney(Math.max(0, (runningBalances.get(application.assetId) || 0) - application.appliedAmount))
        );
      });
      const balanceRows = assets.map(function (asset) {
        return {
          assetId: asset.assetId,
          categoryKey: asset.categoryKey,
          label: asset.label,
          balance: roundMoney(runningBalances.get(asset.assetId) || 0),
          sourcePath: asset.sourcePath
        };
      });
      const totalRemainingBalance = roundMoney(balanceRows.reduce(function (sum, asset) {
        return sum + asset.balance;
      }, 0));
      const resourceLineAdjustmentAmount = roundMoney(applications
        .filter(function (application) {
          return application.yearIndex <= yearIndex;
        })
        .reduce(function (sum, application) {
          return sum + application.resourceLineReductionAmount;
        }, 0));
      const baselinePoint = baselineByYear.get(yearIndex) || null;
      return {
        yearIndex,
        calendarYear: baselinePoint?.calendarYear ?? null,
        baselineResourceAmount: baselinePoint?.resourceAmount ?? null,
        resourceLineAdjustmentAmount,
        adjustedResourceAmount: baselinePoint
          ? roundMoney(Math.max(0, baselinePoint.resourceAmount - resourceLineAdjustmentAmount))
          : null,
        totalRemainingBalance,
        assetBalances: balanceRows,
        applications: yearApplications.map(clonePlainValue)
      };
    });
  }

  function createRemainingNeedByYear(obligations, applications) {
    const requestedByYear = sumByYear(obligations, "requestedAmount");
    const appliedByYear = sumByYear(applications, "appliedAmount");
    return Array.from(requestedByYear.keys()).sort(function (left, right) {
      return left - right;
    }).map(function (yearIndex) {
      const requestedAmount = requestedByYear.get(yearIndex) || 0;
      const appliedAmount = appliedByYear.get(yearIndex) || 0;
      return {
        yearIndex,
        requestedAmount,
        appliedAmount,
        unfundedAmount: roundMoney(Math.max(0, requestedAmount - appliedAmount))
      };
    });
  }

  function createResourceLineAdjustments(yearIndexes, applications, baselinePoints) {
    const baselineByYear = new Map(baselinePoints.map(function (point) {
      return [point.yearIndex, point];
    }));
    return yearIndexes.map(function (yearIndex) {
      const applicationsThroughYear = applications.filter(function (application) {
        return application.yearIndex <= yearIndex;
      });
      const resourceLineReductionAmount = roundMoney(applicationsThroughYear.reduce(function (sum, application) {
        return sum + application.resourceLineReductionAmount;
      }, 0));
      const baselinePoint = baselineByYear.get(yearIndex) || null;
      return {
        yearIndex,
        calendarYear: baselinePoint?.calendarYear ?? null,
        baselineResourceAmount: baselinePoint?.resourceAmount ?? null,
        resourceLineReductionAmount,
        adjustedResourceAmount: baselinePoint
          ? roundMoney(Math.max(0, baselinePoint.resourceAmount - resourceLineReductionAmount))
          : null,
        sourceApplicationCount: applicationsThroughYear.length,
        sourceApplicationIds: applicationsThroughYear.map(function (application) {
          return application.applicationId;
        })
      };
    });
  }

  function allocateObligations(obligations, assets, policy) {
    const applications = [];
    const sortedAssets = sortAssetsByPolicy(assets, policy);
    const eligibleAssets = sortedAssets.filter(function (asset) {
      return resolveEligibility(asset, policy).eligible === true;
    });

    obligations.forEach(function (obligation) {
      let remaining = obligation.requestedAmount;
      eligibleAssets.forEach(function (asset) {
        if (!(remaining > 0)) {
          return;
        }
        const eligibility = resolveEligibility(asset, policy);
        const available = Math.min(asset.currentBalance, eligibility.amountAvailable);
        if (!(available > 0)) {
          return;
        }
        const appliedAmount = roundMoney(Math.min(remaining, available));
        const preBalance = roundMoney(asset.currentBalance);
        asset.currentBalance = roundMoney(Math.max(0, asset.currentBalance - appliedAmount));
        remaining = roundMoney(Math.max(0, remaining - appliedAmount));
        applications.push({
          applicationId: `resource-application-${applications.length + 1}`,
          obligationId: obligation.obligationId,
          componentKey: obligation.componentKey,
          yearIndex: obligation.yearIndex,
          calendarYear: obligation.calendarYear,
          assetId: asset.assetId,
          assetLabel: asset.label,
          assetCategoryKey: asset.categoryKey,
          sourcePath: asset.sourcePath,
          obligationSourcePath: obligation.sourcePath,
          requestedAmount: obligation.requestedAmount,
          appliedAmount,
          preBalance,
          postBalance: asset.currentBalance,
          eligibilityDecision: eligibility.decision,
          eligibilityReason: eligibility.reason,
          needLineReductionAmount: appliedAmount,
          resourceLineReductionAmount: appliedAmount
        });
      });
    });

    return applications;
  }

  function calculateCoverageStrategyResourceAllocationDepletion(input) {
    const safeInput = isPlainObject(input) ? input : {};
    const warnings = [];
    const dataGaps = [];
    const policy = mergePolicy(safeInput.eligibilityPolicy);
    const alreadyAppliedByAsset = sumAlreadyAppliedByAsset(safeInput.alreadyAppliedEducationSavings);
    const assets = normalizeAssets(
      safeInput.assets,
      alreadyAppliedByAsset,
      warnings,
      dataGaps
    );
    const obligations = normalizeObligations(safeInput.obligations, warnings, dataGaps);
    const baselineResourcePoints = normalizeBaselineResourcePoints(safeInput.baselineResourcePoints);
    const yearIndexes = getProjectionYearIndexes(
      safeInput.projectionYears,
      obligations,
      baselineResourcePoints
    );
    const allocationAssets = assets.map(clonePlainValue);
    const scheduledResourceApplications = allocateObligations(
      obligations,
      allocationAssets,
      policy
    );
    const totalRequested = roundMoney(obligations.reduce(function (sum, obligation) {
      return sum + obligation.requestedAmount;
    }, 0));
    const totalApplied = roundMoney(scheduledResourceApplications.reduce(function (sum, application) {
      return sum + application.appliedAmount;
    }, 0));
    const totalUnfunded = roundMoney(Math.max(0, totalRequested - totalApplied));
    const resourceLineAdjustmentsByYear = createResourceLineAdjustments(
      yearIndexes,
      scheduledResourceApplications,
      baselineResourcePoints
    );
    const annualResourceBalances = createAnnualBalances(
      yearIndexes,
      assets,
      scheduledResourceApplications,
      baselineResourcePoints
    );
    const remainingNeedByYear = createRemainingNeedByYear(
      obligations,
      scheduledResourceApplications
    );
    const excludedAssetDecisions = buildExcludedAssetDecisions(assets, policy);

    if (totalRequested > 0 && totalUnfunded > 0) {
      addIssue(
        dataGaps,
        "resource-allocation-insufficient-eligible-resources",
        "Eligible resources were insufficient to fully fund scheduled obligations.",
        { totalRequested, totalApplied, totalUnfunded }
      );
    }

    return {
      version: COVERAGE_STRATEGY_RESOURCE_ALLOCATION_DEPLETION_VERSION,
      status: dataGaps.length ? "partial" : "complete",
      scheduledResourceApplications,
      annualResourceBalances,
      resourceLineAdjustmentsByYear,
      remainingNeedByYear,
      excludedAssetDecisions,
      totalRequested,
      totalApplied,
      totalUnfunded,
      warnings,
      dataGaps,
      trace: {
        source: "coverage-strategy-resource-allocation-depletion",
        helperVersion: COVERAGE_STRATEGY_RESOURCE_ALLOCATION_DEPLETION_VERSION,
        allocationRule: "scheduled-obligations-by-year-then-policy-ordered-assets",
        noFreeFundingRule: "broader-resource-need-line-reduction-must-equal-resource-line-reduction",
        totalNeedLineReductionAmount: totalApplied,
        totalResourceLineReductionAmount: totalApplied,
        needLineResourceLineReductionAmountsMatch: totalApplied === roundMoney(scheduledResourceApplications.reduce(function (sum, application) {
          return sum + application.resourceLineReductionAmount;
        }, 0)),
        assetCount: assets.length,
        obligationCount: obligations.length,
        applicationCount: scheduledResourceApplications.length,
        excludedAssetDecisionCount: excludedAssetDecisions.length,
        alreadyAppliedEducationSavingsByAsset: Object.fromEntries(alreadyAppliedByAsset),
        policy: clonePlainValue(policy),
        productionWiringActive: false,
        resourceLineAdapterCalled: false,
        needLineAdapterCalled: false,
        educationProjectionCalled: false,
        displayHtmlUsed: false,
        storageUsed: false,
        inputMutated: false
      }
    };
  }

  lensAnalysis.COVERAGE_STRATEGY_RESOURCE_ALLOCATION_DEPLETION_VERSION =
    COVERAGE_STRATEGY_RESOURCE_ALLOCATION_DEPLETION_VERSION;
  lensAnalysis.calculateCoverageStrategyResourceAllocationDepletion =
    calculateCoverageStrategyResourceAllocationDepletion;

  if (typeof module !== "undefined" && module.exports) {
    module.exports = {
      COVERAGE_STRATEGY_RESOURCE_ALLOCATION_DEPLETION_VERSION,
      calculateCoverageStrategyResourceAllocationDepletion
    };
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
