#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const childProcess = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const repoRoot = path.resolve(__dirname, "..", "..");

function readRepoFile(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function getChangedFiles(relativePaths) {
  try {
    const output = childProcess.execFileSync(
      "git",
      ["diff", "--name-only", "--", ...relativePaths],
      {
        cwd: repoRoot,
        encoding: "utf8"
      }
    );
    return output
      .split(/\r?\n/)
      .map(function (line) { return line.trim(); })
      .filter(Boolean);
  } catch (_error) {
    return [];
  }
}

function createProjectedAssetGrowth() {
  return {
    sourceMode: "reportingOnly",
    projectionMode: "reportingOnly",
    projectionYears: 12,
    projectionYearsSource: "assetTreatmentAssumptions.assetGrowthProjectionAssumptions.projectionYears",
    consumedByMethods: false,
    currentTotalAssetValue: 450000,
    projectedTotalAssetValue: 831092.94,
    totalProjectedGrowthAmount: 381092.94,
    includedCategoryCount: 2,
    excludedCategoryCount: 1,
    reviewWarningCount: 1,
    includedCategories: [
      {
        categoryKey: "cashAndCashEquivalents",
        label: "Cash & Cash Equivalents",
        currentValue: 100000,
        assumedAnnualGrowthRatePercent: 2,
        projectionYears: 12,
        projectedValue: 126824.18,
        projectedGrowthAmount: 26824.18,
        warnings: []
      }
    ],
    warnings: [
      {
        code: "asset-growth-projection-reporting-only",
        message: "Projected asset growth uses saved reporting-only projection years and is not consumed by current methods."
      }
    ]
  };
}

function createProjectedAssetOffset(overrides = {}) {
  return {
    currentTreatedAssetOffset: 345000,
    eligibleTreatedBase: 300000,
    projectedTreatedValue: 366000,
    projectedGrowthAdjustment: 66000,
    effectiveProjectedAssetOffset: 411000,
    projectionYears: 10,
    sourceMode: "projectedOffsets",
    projectionMode: "projectedOffsetsFutureInactive",
    consumptionStatus: "saved-only",
    consumedByMethods: false,
    includedCategories: [
      {
        categoryKey: "cashAndCashEquivalents",
        label: "Cash & Cash Equivalents",
        treatedValue: 100000,
        assumedAnnualGrowthRatePercent: 2,
        projectionYears: 10,
        projectedTreatedValue: 121899.44,
        projectedGrowthAdjustment: 21899.44,
        warnings: []
      },
      {
        categoryKey: "taxableBrokerageInvestments",
        label: "Taxable Brokerage / Investments",
        treatedValue: 200000,
        assumedAnnualGrowthRatePercent: 6,
        projectionYears: 10,
        projectedTreatedValue: 358169.54,
        projectedGrowthAdjustment: 158169.54,
        warnings: []
      }
    ],
    excludedCategories: [
      {
        categoryKey: "emergencyFund",
        label: "Emergency Fund",
        treatedValue: 25000,
        reason: "Emergency fund assets are excluded from projected method-consumed growth in v1.",
        warningCode: "emergency-fund-excluded-from-projected-asset-offset"
      }
    ],
    warnings: [
      {
        code: "projected-asset-offset-future-inactive",
        message: "Projected asset offset is prepared as an inactive future candidate and is not consumed by current methods."
      },
      {
        code: "treated-asset-offsets-remain-current-source",
        message: "Current methods continue to consume treatedAssetOffsets.totalTreatedAssetValue."
      }
    ],
    ...overrides
  };
}

function createLensModel(projectedAssetOffsetOverrides) {
  return {
    projectedAssetGrowth: createProjectedAssetGrowth(),
    projectedAssetOffset: createProjectedAssetOffset(projectedAssetOffsetOverrides),
    treatedAssetOffsets: {
      totalTreatedAssetValue: 345000
    }
  };
}

function createAssetOffsetTrace(options = {}) {
  const projectedConsumed = options.projectedConsumed === true;
  const fallbackUsed = options.fallbackUsed === true;
  const value = options.value == null ? (projectedConsumed ? 411000 : 345000) : options.value;
  return {
    key: "assetOffset",
    label: "Asset Offset",
    formula: projectedConsumed
      ? "projectedAssetOffset.effectiveProjectedAssetOffset"
      : "treatedAssetOffsets.totalTreatedAssetValue",
    value,
    sourcePaths: projectedConsumed
      ? [
          "projectedAssetOffset.effectiveProjectedAssetOffset",
          "projectedAssetOffset.currentTreatedAssetOffset",
          "projectedAssetOffset.projectedGrowthAdjustment",
          "projectedAssetOffset.projectionYears",
          "settings.assetGrowthProjectionAssumptions.mode",
          "settings.projectedAssetOffsetAssumptions.enabled",
          "settings.projectedAssetOffsetAssumptions.consumptionStatus",
          "settings.projectedAssetOffsetAssumptions.activationVersion",
          "settings.includeOffsetAssets"
        ]
      : [
          "treatedAssetOffsets.totalTreatedAssetValue",
          "projectedAssetOffset.effectiveProjectedAssetOffset",
          "settings.includeOffsetAssets"
        ],
    inputs: {
      includeOffsetAssets: true,
      assetOffsetSource: projectedConsumed || fallbackUsed ? "projectedAssetOffset" : "treated",
      requestedAssetOffsetSource: projectedConsumed || fallbackUsed ? "projectedAssetOffset" : "treated",
      effectiveAssetOffsetSource: projectedConsumed ? "projectedAssetOffset" : "treated",
      fallbackToLegacyOffsetAssets: false,
      fallbackUsed,
      assetOffsetStatus: projectedConsumed
        ? "projected-active-used"
        : (fallbackUsed ? "projected-invalid-fallback-to-treated" : "treated-used"),
      selectedAssetOffsetValue: value,
      treatedAssetOffsetsAvailable: true,
      legacyOffsetAssetsAvailable: false,
      projectedAssetOffsetGateActive: projectedConsumed || fallbackUsed,
      projectedAssetOffsetConsumed: projectedConsumed,
      projectedAssetOffsetSourceMode: "projectedOffsets",
      projectedAssetOffsetSourceModeSourcePath: "settings.assetGrowthProjectionAssumptions.mode",
      projectedAssetOffsetActivationEnabled: projectedConsumed || fallbackUsed,
      projectedAssetOffsetActivationVersion: 1,
      projectedAssetOffsetConsumptionStatus: "method-active",
      projectedAssetOffsetActivationSourcePath: "settings.projectedAssetOffsetAssumptions",
      projectedAssetOffsetFallbackReason: fallbackUsed
        ? "invalid-effective-projected-asset-offset"
        : null,
      currentTreatedAssetOffset: 345000,
      projectedGrowthAdjustment: 66000,
      effectiveProjectedAssetOffset: options.rejectedProjectedOffsetValue == null
        ? 411000
        : options.rejectedProjectedOffsetValue,
      projectionYears: 10
    }
  };
}

function createNeedsResult(assetOffsetTrace) {
  const assetOffset = assetOffsetTrace.value || 0;
  return {
    method: "needsAnalysis",
    label: "LENS Analysis",
    grossNeed: 900000,
    netCoverageGap: Math.max(900000 - assetOffset, 0),
    components: {
      debtPayoff: 100000,
      essentialSupport: 600000,
      education: 100000,
      finalExpenses: 50000,
      healthcareExpenses: 0,
      transitionNeeds: 50000,
      discretionarySupport: 0
    },
    commonOffsets: {
      existingCoverageOffset: 0,
      assetOffset,
      survivorIncomeOffset: 0,
      totalOffset: assetOffset
    },
    assumptions: {
      includeAssetOffsets: true
    },
    warnings: assetOffsetTrace.inputs.fallbackUsed
      ? [
          {
            code: "projected-asset-offset-active-invalid-treated-fallback",
            message: "Projected asset offset active marker was present for LENS Analysis, but the prepared projected asset offset was invalid; treated asset offsets were used instead.",
            severity: "warning"
          }
        ]
      : [],
    trace: [assetOffsetTrace]
  };
}

function createDimeResult() {
  return {
    method: "dime",
    grossNeed: 111000,
    netCoverageGap: 111000,
    components: {
      debt: 10000,
      income: 90000,
      mortgage: 0,
      education: 11000
    },
    commonOffsets: {
      existingCoverageOffset: 0,
      assetOffset: 0,
      totalOffset: 0
    },
    assumptions: {},
    warnings: [],
    trace: []
  };
}

function createHlvResult() {
  return {
    method: "humanLifeValue",
    grossHumanLifeValue: 333000,
    netCoverageGap: 333000,
    components: {
      annualIncomeValue: 111000,
      projectionYears: 3,
      simpleHumanLifeValue: 333000
    },
    commonOffsets: {
      existingCoverageOffset: 0,
      assetOffset: 0,
      totalOffset: 0
    },
    assumptions: {},
    warnings: [],
    trace: []
  };
}

function renderScenario(options = {}) {
  const hosts = {
    "[data-step-three-dime-analysis]": { innerHTML: "" },
    "[data-step-three-needs-analysis]": { innerHTML: "" },
    "[data-step-three-human-life-value-analysis]": { innerHTML: "" }
  };
  const lensModel = createLensModel(options.projectedAssetOffsetOverrides);
  const lensModelBefore = cloneJson(lensModel);
  const needsResult = createNeedsResult(options.assetOffsetTrace || createAssetOffsetTrace());
  let readyCallback = null;
  const profileRecord = {
    analysisSettings: {},
    protectionModeling: {
      data: {
        annualGrossIncome: 100000
      }
    }
  };
  const context = {
    console,
    Intl,
    URLSearchParams,
    window: null,
    document: {
      querySelector(selector) {
        return hosts[selector] || null;
      },
      addEventListener(eventName, callback) {
        if (eventName === "DOMContentLoaded") {
          readyCallback = callback;
        }
      }
    },
    location: {
      search: ""
    },
    LensApp: {
      clientRecords: {
        getCurrentLinkedRecord() {
          return profileRecord;
        }
      },
      lensAnalysis: {
        buildLensModelFromSavedProtectionModeling() {
          return {
            lensModel,
            warnings: []
          };
        },
        analysisSettingsAdapter: {
          createAnalysisMethodSettings() {
            return {
              dimeSettings: {},
              needsAnalysisSettings: {},
              humanLifeValueSettings: {},
              warnings: []
            };
          }
        },
        analysisMethods: {
          runDimeAnalysis() {
            return createDimeResult();
          },
          runNeedsAnalysis() {
            return needsResult;
          },
          runHumanLifeValueAnalysis() {
            return createHlvResult();
          }
        }
      }
    }
  };
  context.window = context;
  context.globalThis = context;

  vm.createContext(context);
  vm.runInContext(
    readRepoFile("app/features/lens-analysis/step-three-analysis-display.js"),
    context,
    { filename: "app/features/lens-analysis/step-three-analysis-display.js" }
  );

  assert.equal(typeof readyCallback, "function", "Step 3 display should register DOMContentLoaded.");
  readyCallback();
  assert.deepEqual(lensModel, lensModelBefore, "Step 3 display should not mutate lensModel.");

  return {
    dimeHtml: hosts["[data-step-three-dime-analysis]"].innerHTML,
    needsHtml: hosts["[data-step-three-needs-analysis]"].innerHTML,
    hlvHtml: hosts["[data-step-three-human-life-value-analysis]"].innerHTML
  };
}

const activeScenario = renderScenario({
  assetOffsetTrace: createAssetOffsetTrace({ projectedConsumed: true })
});
assert.match(activeScenario.needsHtml, /Projected Asset Offset — Active in LENS/);
assert.match(activeScenario.needsHtml, /Active; LENS used projected asset offset/);
assert.match(activeScenario.needsHtml, /Effective LENS asset offset used/);
assert.match(activeScenario.needsHtml, /\$411,000/);
assert.match(activeScenario.needsHtml, /Current treated asset offset/);
assert.match(activeScenario.needsHtml, /\$345,000/);
assert.match(activeScenario.needsHtml, /Eligible treated base/);
assert.match(activeScenario.needsHtml, /\$300,000/);
assert.match(activeScenario.needsHtml, /Projected treated value/);
assert.match(activeScenario.needsHtml, /\$366,000/);
assert.match(activeScenario.needsHtml, /Projected growth adjustment/);
assert.match(activeScenario.needsHtml, /\$66,000/);
assert.match(activeScenario.needsHtml, /10 years/);
assert.match(activeScenario.needsHtml, /Source mode/);
assert.match(activeScenario.needsHtml, /Projected offsets/);
assert.match(activeScenario.needsHtml, /Consumption status/);
assert.match(activeScenario.needsHtml, /Method active/);
assert.match(activeScenario.needsHtml, /Activation version/);
assert.match(activeScenario.needsHtml, />1</);
assert.match(activeScenario.needsHtml, /Consumed by methods/);
assert.match(activeScenario.needsHtml, />Yes</);
assert.match(activeScenario.needsHtml, /Source path consumed/);
assert.match(activeScenario.needsHtml, /projectedAssetOffset\.effectiveProjectedAssetOffset/);
assert.match(activeScenario.needsHtml, /Included Projected Offset Categories/);
assert.match(activeScenario.needsHtml, /treated value/);
assert.match(activeScenario.needsHtml, /incremental projected growth/);
assert.match(activeScenario.needsHtml, /Excluded Projected Offset Categories/);
assert.match(activeScenario.needsHtml, /Emergency Fund/);
assert.doesNotMatch(activeScenario.dimeHtml, /Projected Asset Offset/);
assert.doesNotMatch(activeScenario.hlvHtml, /Projected Asset Offset/);

const inactiveScenario = renderScenario({
  assetOffsetTrace: createAssetOffsetTrace({ projectedConsumed: false })
});
assert.doesNotMatch(inactiveScenario.needsHtml, /Projected Asset Offset — Active in LENS/);
assert.doesNotMatch(inactiveScenario.needsHtml, /Projected Asset Offset — Not Used/);
assert.match(inactiveScenario.needsHtml, /Projected Asset Growth — Reporting Only/);
assert.match(inactiveScenario.needsHtml, /Reporting only; projected values are not used in current DIME, LENS, or HLV outputs/);

const modelFlagOnlyScenario = renderScenario({
  assetOffsetTrace: createAssetOffsetTrace({ projectedConsumed: false }),
  projectedAssetOffsetOverrides: {
    consumedByMethods: true
  }
});
assert.doesNotMatch(
  modelFlagOnlyScenario.needsHtml,
  /Projected Asset Offset — Active in LENS/,
  "Step 3 must use method trace, not lensModel.projectedAssetOffset.consumedByMethods."
);

const fallbackScenario = renderScenario({
  assetOffsetTrace: createAssetOffsetTrace({
    projectedConsumed: false,
    fallbackUsed: true,
    rejectedProjectedOffsetValue: null
  })
});
assert.match(fallbackScenario.needsHtml, /Projected Asset Offset — Not Used/);
assert.match(fallbackScenario.needsHtml, /Active marker present; current treated asset offset used/);
assert.match(fallbackScenario.needsHtml, /Asset offset actually used/);
assert.match(fallbackScenario.needsHtml, /\$345,000/);
assert.match(fallbackScenario.needsHtml, /Rejected projected offset value/);
assert.match(fallbackScenario.needsHtml, /Fallback reason/);
assert.match(fallbackScenario.needsHtml, /Invalid effective projected asset offset/);
assert.match(fallbackScenario.needsHtml, /Source path used/);
assert.match(fallbackScenario.needsHtml, /treatedAssetOffsets\.totalTreatedAssetValue/);
assert.match(fallbackScenario.needsHtml, /Projected offset consumed/);
assert.match(fallbackScenario.needsHtml, />No</);
assert.match(
  fallbackScenario.needsHtml,
  /Projected asset offset was not used because the prepared candidate was invalid\. LENS used the current treated asset offset instead\./
);
assert.doesNotMatch(fallbackScenario.needsHtml, /projected offsets reduced/i);

const quickResultSources = [
  readRepoFile("pages/dime-results.html"),
  readRepoFile("pages/hlv-results.html"),
  readRepoFile("pages/simple-needs-results.html"),
  readRepoFile("app/features/lens-analysis/simple-needs-results-display.js")
].join("\n");
assert.doesNotMatch(
  quickResultSources,
  /Projected Asset Offset|projectedAssetOffset/,
  "Quick result pages should not render projected asset offset sections."
);
assert.match(
  readRepoFile("pages/analysis-setup.html"),
  /Use Projected Asset Offset in LENS/,
  "Analysis Setup should own the advisor-facing projected offset activation switch."
);
assert.doesNotMatch(
  readRepoFile("app/features/lens-analysis/schema.js"),
  /projectedAssetOffsetAssumptions|activationVersion/,
  "Saved defaults should not create projected offset activation."
);
assert.deepEqual(
  getChangedFiles([
    "app/features/lens-analysis/analysis-methods.js",
    "app/features/lens-analysis/lens-model-builder.js",
    "app/features/lens-analysis/projected-asset-offset-calculations.js"
  ]),
  [],
  "Step 3 display pass should not change methods, model builder, or projected asset offset helper."
);

console.log("step-three-projected-asset-offset-display-check passed");
