(function (global) {
  const LensApp = global.LensApp || (global.LensApp = {});
  const accountSettings = LensApp.accountSettings || (LensApp.accountSettings = {});

  // Owner: backend-mediated USDA Food Plan import contract and pure mapping helpers.
  // Non-goals: no DOM, browser fetch, storage writes, runtime analysis, or USDA workbook parsing.

  const USDA_FOOD_PLAN_IMPORT_CONTRACT_VERSION = 1;
  const USDA_FOOD_PLAN_PREVIEW_ENDPOINT = "/api/account-settings/usda-food-plan/preview";
  const USDA_FOOD_PLAN_APPROVAL_SAVE_NAMESPACE = "accountPolicy.livingFloorAssumptions.foodAtHome";
  const USDA_FOOD_PLAN_PREVIEW_FORMAT = "MODEL90_USDA_FOOD_PLAN_PREVIEW_V1";

  const SUPPORTED_USDA_FOOD_PLAN_LEVELS = Object.freeze([
    "thrifty",
    "lowCost",
    "moderateCost",
    "liberal"
  ]);

  const USDA_FOOD_PLAN_LEVEL_LABELS = Object.freeze({
    thrifty: "Thrifty Food Plan",
    lowCost: "Low-Cost Food Plan",
    moderateCost: "Moderate-Cost Food Plan",
    liberal: "Liberal Food Plan"
  });

  const FOOD_AT_HOME_BAND_KEYS = Object.freeze([
    "infantToddler",
    "youngChild",
    "olderChild",
    "teenMale",
    "teenFemale",
    "adultMale",
    "adultFemale",
    "adultUnknown",
    "childUnknown"
  ]);

  const HOUSEHOLD_SIZE_ADJUSTMENT_FACTOR_KEYS = Object.freeze(["1", "2", "3", "4", "5", "6Plus"]);

  const DEFAULT_HOUSEHOLD_SIZE_ADJUSTMENT_FACTORS = Object.freeze({
    "1": 1.2,
    "2": 1.1,
    "3": 1.05,
    "4": 1,
    "5": 0.95,
    "6Plus": 0.9
  });

  const USDA_TO_MODEL90_BAND_MAPPING = Object.freeze({
    infantToddler: Object.freeze({
      model90BandKey: "infantToddler",
      expectedUsdaRows: Object.freeze(["child.1Year", "child.2To3Years"]),
      mappingMethod: "backend-explicit-or-average",
      notes: "USDA does not publish a 0-year row in the monthly report; backend must document how the 0-3 MODEL90 value was derived."
    }),
    youngChild: Object.freeze({
      model90BandKey: "youngChild",
      expectedUsdaRows: Object.freeze(["child.4To5Years", "child.6To8Years"]),
      mappingMethod: "backend-explicit-or-average"
    }),
    olderChild: Object.freeze({
      model90BandKey: "olderChild",
      expectedUsdaRows: Object.freeze(["child.9To11Years", "female.12To13Years", "male.12To13Years"]),
      mappingMethod: "backend-explicit-or-average"
    }),
    teenMale: Object.freeze({
      model90BandKey: "teenMale",
      expectedUsdaRows: Object.freeze(["male.14To19Years"]),
      mappingMethod: "direct-usda-row"
    }),
    teenFemale: Object.freeze({
      model90BandKey: "teenFemale",
      expectedUsdaRows: Object.freeze(["female.14To19Years"]),
      mappingMethod: "direct-usda-row"
    }),
    adultMale: Object.freeze({
      model90BandKey: "adultMale",
      expectedUsdaRows: Object.freeze(["male.20To50Years"]),
      mappingMethod: "representative-adult-row",
      notes: "Backend may provide a richer adult aggregation later, but it must return one explicit MODEL90 band value for approval."
    }),
    adultFemale: Object.freeze({
      model90BandKey: "adultFemale",
      expectedUsdaRows: Object.freeze(["female.20To50Years"]),
      mappingMethod: "representative-adult-row",
      notes: "Backend may provide a richer adult aggregation later, but it must return one explicit MODEL90 band value for approval."
    }),
    adultUnknown: Object.freeze({
      model90BandKey: "adultUnknown",
      expectedUsdaRows: Object.freeze(["male.20To50Years", "female.20To50Years"]),
      mappingMethod: "backend-explicit-or-average",
      notes: "Unknown-sex adult fallback must be explicit in the backend preview."
    }),
    childUnknown: Object.freeze({
      model90BandKey: "childUnknown",
      expectedUsdaRows: Object.freeze([
        "child.1Year",
        "child.2To3Years",
        "child.4To5Years",
        "child.6To8Years",
        "child.9To11Years",
        "female.12To13Years",
        "male.12To13Years"
      ]),
      mappingMethod: "backend-explicit-or-average",
      notes: "Unknown-age/sex child fallback must be explicit in the backend preview."
    })
  });

  const USDA_FOOD_PLAN_BACKEND_CONTRACT = Object.freeze({
    version: USDA_FOOD_PLAN_IMPORT_CONTRACT_VERSION,
    previewEndpoint: Object.freeze({
      method: "POST",
      path: USDA_FOOD_PLAN_PREVIEW_ENDPOINT,
      requestBody: Object.freeze({
        planLevel: "thrifty|lowCost|moderateCost|liberal",
        sourcePeriod: "optional YYYY-MM or backend latest",
        sourceUrl: "optional backend allow-listed USDA URL"
      }),
      responseFormat: USDA_FOOD_PLAN_PREVIEW_FORMAT
    }),
    approval: Object.freeze({
      saveNamespace: USDA_FOOD_PLAN_APPROVAL_SAVE_NAMESPACE,
      saveBehavior: "Admin approval maps the backend preview to foodAtHome assumptions, then the account policy storage path saves the approved policy."
    }),
    runtime: Object.freeze({
      clientAnalysisFetchesUsda: false,
      incomeImpactUsesSavedAssumptionsOnly: true
    })
  });

  function isPlainObject(value) {
    return Boolean(value && typeof value === "object" && !Array.isArray(value));
  }

  function clonePlainValue(value) {
    if (Array.isArray(value)) {
      return value.map(clonePlainValue);
    }

    if (isPlainObject(value)) {
      return Object.keys(value).sort().reduce(function (clone, key) {
        const nextValue = clonePlainValue(value[key]);
        if (nextValue !== undefined) {
          clone[key] = nextValue;
        }
        return clone;
      }, {});
    }

    if (typeof value === "number") {
      return Number.isFinite(value) ? value : null;
    }

    return value === undefined ? undefined : value;
  }

  function normalizeNullableText(value) {
    const text = String(value == null ? "" : value).trim();
    return text || null;
  }

  function normalizePlanLevel(value) {
    const planLevel = normalizeNullableText(value);
    return SUPPORTED_USDA_FOOD_PLAN_LEVELS.includes(planLevel) ? planLevel : null;
  }

  function normalizeSourceFormat(value) {
    return normalizeNullableText(value);
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

  function normalizeDollarValue(value) {
    const parsed = toOptionalNumber(value);
    return parsed === null || parsed < 0 ? null : Number(parsed.toFixed(2));
  }

  function normalizeHouseholdSizeFactor(value) {
    const parsed = toOptionalNumber(value);
    return parsed === null || parsed < 0.25 || parsed > 3 ? null : Number(parsed.toFixed(4));
  }

  function createIssue(code, message, details) {
    const issue = { code, message };
    if (details !== undefined) {
      issue.details = clonePlainValue(details);
    }
    return issue;
  }

  function normalizeIssueList(value) {
    return (Array.isArray(value) ? value : []).filter(isPlainObject).map(function (issue) {
      return createIssue(
        normalizeNullableText(issue.code) || "usda-food-plan-import-issue",
        normalizeNullableText(issue.message) || "USDA Food Plan import issue.",
        isPlainObject(issue.details) ? issue.details : undefined
      );
    });
  }

  function normalizeMonthlyAmountsByBand(value, dataGaps) {
    const source = isPlainObject(value) ? value : {};
    return FOOD_AT_HOME_BAND_KEYS.reduce(function (amounts, bandKey) {
      const amount = normalizeDollarValue(source[bandKey]);
      amounts[bandKey] = amount;
      if (amount === null) {
        dataGaps.push(createIssue(
          "missing-usda-band-value",
          "USDA Food Plan preview is missing a required MODEL90 Food at Home band value.",
          {
            bandKey,
            expectedUsdaRows: USDA_TO_MODEL90_BAND_MAPPING[bandKey]?.expectedUsdaRows || []
          }
        ));
      }
      return amounts;
    }, {});
  }

  function normalizeHouseholdSizeAdjustmentFactors(value, dataGaps) {
    const source = isPlainObject(value) ? value : {};
    return HOUSEHOLD_SIZE_ADJUSTMENT_FACTOR_KEYS.reduce(function (factors, factorKey) {
      const factor = normalizeHouseholdSizeFactor(source[factorKey]);
      factors[factorKey] = factor;
      if (factor === null) {
        dataGaps.push(createIssue(
          "incomplete-household-size-factors",
          "USDA Food Plan preview is missing a required household-size adjustment factor.",
          { factorKey }
        ));
      }
      return factors;
    }, {});
  }

  function buildNormalizedPreview(input, warnings, dataGaps) {
    const preview = isPlainObject(input) ? input : {};
    const sourceFormat = normalizeSourceFormat(preview.sourceFormat);
    const planLevel = normalizePlanLevel(preview.planLevel);
    const sourcePeriod = normalizeNullableText(preview.sourcePeriod);

    if (sourceFormat !== USDA_FOOD_PLAN_PREVIEW_FORMAT) {
      dataGaps.push(createIssue(
        "unknown-source-format",
        "USDA Food Plan preview used an unknown source format.",
        {
          received: sourceFormat,
          expected: USDA_FOOD_PLAN_PREVIEW_FORMAT
        }
      ));
    }

    if (!planLevel) {
      dataGaps.push(createIssue(
        "invalid-plan-level",
        "USDA Food Plan preview must use a supported plan level.",
        {
          received: preview.planLevel == null ? null : String(preview.planLevel),
          supportedPlanLevels: SUPPORTED_USDA_FOOD_PLAN_LEVELS
        }
      ));
    }

    if (!sourcePeriod) {
      dataGaps.push(createIssue(
        "missing-source-period",
        "USDA Food Plan preview must include the source reporting period."
      ));
    }

    normalizeIssueList(preview.warnings).forEach(function (warning) {
      warnings.push(warning);
    });
    normalizeIssueList(preview.dataGaps).forEach(function (dataGap) {
      dataGaps.push(dataGap);
    });

    return {
      sourceFormat,
      planLevel,
      planLevelLabel: planLevel ? USDA_FOOD_PLAN_LEVEL_LABELS[planLevel] : null,
      sourcePeriod,
      sourceUrl: normalizeNullableText(preview.sourceUrl),
      sourceFileName: normalizeNullableText(preview.sourceFileName),
      importedAt: normalizeNullableText(preview.importedAt),
      approvedAt: normalizeNullableText(preview.approvedAt),
      monthlyAmountsByBand: normalizeMonthlyAmountsByBand(preview.monthlyAmountsByBand, dataGaps),
      householdSizeAdjustmentFactors: normalizeHouseholdSizeAdjustmentFactors(
        preview.householdSizeAdjustmentFactors,
        dataGaps
      )
    };
  }

  function validateUsdaFoodPlanImportPreview(input) {
    const warnings = [];
    const dataGaps = [];
    const normalizedPreview = buildNormalizedPreview(input, warnings, dataGaps);

    return clonePlainValue({
      valid: dataGaps.length === 0,
      normalizedPreview,
      warnings,
      dataGaps,
      trace: {
        source: "usda-food-plan-import-contract-validation",
        contractVersion: USDA_FOOD_PLAN_IMPORT_CONTRACT_VERSION,
        sourceFormat: normalizedPreview.sourceFormat,
        planLevel: normalizedPreview.planLevel,
        expectedBandCount: FOOD_AT_HOME_BAND_KEYS.length,
        expectedHouseholdSizeFactorCount: HOUSEHOLD_SIZE_ADJUSTMENT_FACTOR_KEYS.length,
        warnings: warnings.length,
        dataGaps: dataGaps.length
      }
    });
  }

  function mapUsdaFoodPlanPreviewToFoodAtHomeAssumptions(input) {
    const validation = validateUsdaFoodPlanImportPreview(input);
    if (!validation.valid) {
      return clonePlainValue({
        valid: false,
        foodAtHome: null,
        warnings: validation.warnings,
        dataGaps: validation.dataGaps,
        trace: Object.assign({}, validation.trace, {
          source: "usda-food-plan-import-contract-mapping",
          mapped: false
        })
      });
    }

    const preview = validation.normalizedPreview;
    const foodAtHome = {
      planningBucketKey: "foodAtHomeConsumables",
      source: "USDA_FOOD_PLAN",
      sourcePeriod: preview.sourcePeriod,
      planLevel: preview.planLevel,
      sourceUrl: preview.sourceUrl,
      sourceFileName: preview.sourceFileName,
      importedAt: preview.importedAt,
      monthlyAmountsByBand: preview.monthlyAmountsByBand,
      householdSizeAdjustmentFactors: preview.householdSizeAdjustmentFactors
    };

    if (preview.approvedAt) {
      foodAtHome.approvedAt = preview.approvedAt;
    }

    return clonePlainValue({
      valid: true,
      foodAtHome,
      warnings: validation.warnings,
      dataGaps: [],
      trace: Object.assign({}, validation.trace, {
        source: "usda-food-plan-import-contract-mapping",
        mapped: true,
        saveNamespace: USDA_FOOD_PLAN_APPROVAL_SAVE_NAMESPACE
      })
    });
  }

  function getUsdaFoodPlanBackendContract() {
    return clonePlainValue(USDA_FOOD_PLAN_BACKEND_CONTRACT);
  }

  accountSettings.usdaFoodPlanImportContract = Object.freeze({
    USDA_FOOD_PLAN_IMPORT_CONTRACT_VERSION,
    USDA_FOOD_PLAN_PREVIEW_ENDPOINT,
    USDA_FOOD_PLAN_APPROVAL_SAVE_NAMESPACE,
    USDA_FOOD_PLAN_PREVIEW_FORMAT,
    SUPPORTED_USDA_FOOD_PLAN_LEVELS,
    USDA_FOOD_PLAN_LEVEL_LABELS,
    FOOD_AT_HOME_BAND_KEYS,
    HOUSEHOLD_SIZE_ADJUSTMENT_FACTOR_KEYS,
    DEFAULT_HOUSEHOLD_SIZE_ADJUSTMENT_FACTORS,
    USDA_TO_MODEL90_BAND_MAPPING,
    USDA_FOOD_PLAN_BACKEND_CONTRACT,
    getUsdaFoodPlanBackendContract,
    validateUsdaFoodPlanImportPreview,
    mapUsdaFoodPlanPreviewToFoodAtHomeAssumptions
  });
})(typeof globalThis !== "undefined" ? globalThis : this);
