#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const {
  isAllowedAnalysisSetupEducationControlAlignmentCssDiff,
  isAllowedAnalysisSetupStyleFoundationDiff
} = require("./analysis-setup-style-guard-utils");

const repoRoot = path.resolve(__dirname, "..", "..");

function readRepoFile(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

function loadScript(context, relativePath) {
  vm.runInContext(readRepoFile(relativePath), context, { filename: relativePath });
}

function createContext() {
  const context = {
    console,
    document: {
      addEventListener: () => {}
    },
    window: null
  };
  context.window = context;
  context.globalThis = context;
  context.LensApp = {
    analysisSetup: {},
    lensAnalysis: {}
  };
  context.window.LensApp = context.LensApp;
  vm.createContext(context);

  loadScript(context, "app/features/lens-analysis/debt-taxonomy.js");
  loadScript(context, "app/features/lens-analysis/debt-treatment-calculations.js");
  loadScript(context, "app/features/lens-analysis/analysis-setup.js");

  return context;
}

function createPreviewHarnessContext() {
  const context = {
    console,
    document: {
      addEventListener: () => {},
      querySelector: () => null
    },
    window: null
  };
  context.window = context;
  context.globalThis = context;
  context.LensApp = {
    analysisSetup: {},
    lensAnalysis: {}
  };
  context.window.LensApp = context.LensApp;
  vm.createContext(context);

  loadScript(context, "app/features/lens-analysis/debt-taxonomy.js");
  loadScript(context, "app/features/lens-analysis/debt-treatment-calculations.js");
  const instrumentedSource = readRepoFile("app/features/lens-analysis/analysis-setup.js").replace(
    /renderLivingFloorReadinessNoticeModel\s*\n\s*\}\);/,
    "renderLivingFloorReadinessNoticeModel,\n    __getMortgagePaymentPlanPreviewInput: getMortgagePaymentPlanPreviewInput\n  });"
  );
  vm.runInContext(instrumentedSource, context, {
    filename: "app/features/lens-analysis/analysis-setup.js"
  });

  return context;
}

function monthlyPayment(principal, annualRatePercent, months) {
  const monthlyRate = annualRatePercent / 1200;
  return Math.round((principal * (monthlyRate / (1 - Math.pow(1 + monthlyRate, -months)))) * 100) / 100;
}

function toPlainObject(value) {
  return JSON.parse(JSON.stringify(value));
}

function extractFunctionBody(source, functionName, nextFunctionName) {
  const start = source.indexOf(`function ${functionName}`);
  const end = source.indexOf(`function ${nextFunctionName}`, start);
  assert.notEqual(start, -1, `${functionName} should exist`);
  assert.notEqual(end, -1, `${nextFunctionName} should follow ${functionName}`);
  return source.slice(start, end);
}

function createRawEquivalentCategoryTreatment(overrides = {}) {
  return {
    include: true,
    mode: "payoff",
    payoffPercent: 100,
    ...overrides
  };
}

function assertRawEquivalentTreatment(treatment, message) {
  assert.deepEqual(toPlainObject(treatment), {
    include: true,
    mode: "payoff",
    payoffPercent: 100
  }, message);
}

function isAllowedDebtTreatmentCssDiff() {
  const diff = execFileSync("git", ["diff", "--", "components.css"], {
    cwd: repoRoot,
    encoding: "utf8"
  });
  const hunks = diff.split(/^@@/m).slice(1);
  return hunks.length > 0
    && hunks.every((hunk) => hunk.includes("analysis-setup-debt-"));
}

function isAllowedAssumptionControlsStructuralCssDiff() {
  const diff = execFileSync("git", ["diff", "--", "components.css"], {
    cwd: repoRoot,
    encoding: "utf8"
  });
  const hunks = diff.split(/^@@/m).slice(1);
  return hunks.length > 0
    && hunks.every((hunk) => {
      return hunk.includes("analysis-setup")
        && (
          hunk.includes("data-analysis-setup-view-panel")
          || hunk.includes("data-analysis-setup-current-view")
          || (
            hunk.includes("analysis-setup-control-group--calculation-inclusion")
            && hunk.includes("order: 1")
            && hunk.includes("grid-row: 1")
          )
        );
    });
}

function isAllowedAssetTreatmentCardStyleCssDiff() {
  const diff = execFileSync("git", ["diff", "--", "components.css"], {
    cwd: repoRoot,
    encoding: "utf8"
  });
  const hunks = diff.split(/^@@/m).slice(1);
  return hunks.length > 0
    && hunks.every((hunk) => {
      return hunk.includes("analysis-setup-asset")
        || hunk.includes("analysis-setup-control-group--assets");
    });
}

function isAllowedCashReserveCardStyleCssDiff() {
  const diff = execFileSync("git", ["diff", "--", "components.css"], {
    cwd: repoRoot,
    encoding: "utf8"
  });
  const hunks = diff.split(/^@@/m).slice(1);
  return hunks.length > 0
    && hunks.every((hunk) => hunk.includes("analysis-setup-cash-reserve"));
}

function isAllowedAnalysisSetupComponentsCssDiff() {
  const diff = execFileSync("git", ["diff", "--", "components.css"], {
    cwd: repoRoot,
    encoding: "utf8"
  });
  const hunks = diff.split(/^@@/m).slice(1);
  const isEducationControlAlignmentHunk = (hunk) => {
    return hunk.includes("analysis-setup-education")
      && (
        hunk.includes("--analysis-setup-education-control-rail-width")
        || hunk.includes(".analysis-setup-education-toggle")
        || hunk.includes(".analysis-setup-education-card .settings-toggle-row + .settings-toggle-row")
        || hunk.includes(".analysis-setup-education-control-row")
      );
  };
  const survivorSupportStyleDiff = diff.includes(".analysis-setup-survivor-grid")
    && diff.includes(".analysis-setup-survivor-card")
    && diff.includes(".analysis-setup-survivor-control-row")
    && diff.includes(".analysis-setup-survivor-preview")
    && !diff.includes(".analysis-setup-control-group--education")
    && !diff.includes(".analysis-setup-control-group--policy-returns");
  const educationAssumptionsStyleDiff = diff.includes(".analysis-setup-control-group--education")
    && diff.includes(".analysis-setup-education-grid")
    && diff.includes(".analysis-setup-education-card")
    && diff.includes(".analysis-setup-education-control-row")
    && diff.includes(".analysis-setup-education-preview")
    && !diff.includes("+.analysis-setup-control-group--recommendation")
    && !diff.includes("-.analysis-setup-control-group--recommendation")
    && !diff.includes("+.analysis-setup-control-group--policy-returns")
    && !diff.includes("-.analysis-setup-control-group--policy-returns");
  const autoCompressScenarioFieldHookDiff = hunks.length > 0
    && hunks.every((hunk) => {
      return hunk.includes(".income-impact-scenario-field--auto-compress > span")
        && hunk.includes("display: flex")
        && hunk.includes("align-items: center")
        && hunk.includes("gap: 0.42rem")
        && hunk.includes(".income-impact-scenario-field--auto-compress input[type=\"checkbox\"]")
        && hunk.includes("flex: 0 0 auto");
    });
  return survivorSupportStyleDiff
    || educationAssumptionsStyleDiff
    || autoCompressScenarioFieldHookDiff
    || hunks.length > 0
    && hunks.every((hunk) => {
      return hunk.includes("analysis-setup-debt-")
        || hunk.includes("analysis-setup-cash-reserve")
        || hunk.includes("analysis-setup-coverage")
        || hunk.includes("analysis-setup-asset")
        || hunk.includes("analysis-setup-control-group--assets")
        || hunk.includes("analysis-setup-survivor")
        || hunk.includes("analysis-setup-control-group--survivor-support")
        || (
          hunk.includes("analysis-setup-control-group--calculation-inclusion .settings-toggle-label")
          && hunk.includes("font-family: \"Inter\", sans-serif")
          && hunk.includes("font-size: 0.82rem")
          && hunk.includes("font-weight: 650")
        )
        || (
          hunk.includes("analysis-setup-control-group--calculation-inclusion .analysis-setup-control-heading h3")
          && hunk.includes("analysis-setup-control-group--inflation .analysis-setup-control-heading h3")
          && hunk.includes("font-size: 0.92rem")
        )
        || (
          hunk.includes("font-family: \"Inter\", sans-serif")
          && hunk.includes("-  color: #6b7280")
          && hunk.includes("+  color: #374151")
          && hunk.includes("font-size: 12.5px")
          && hunk.includes("font-weight: 500")
          && hunk.includes("text-transform: none")
        )
        || (
          hunk.includes("analysis-setup-control-group--inflation .analysis-setup-rate-control:not(.analysis-setup-return-basis-control) .analysis-setup-rate-slider")
          && hunk.includes("justify-self: end")
          && hunk.includes("width: 50%")
          && hunk.includes("inline-size: 50%")
        )
        || (
          hunk.includes("analysis-setup-control-group--growth .analysis-setup-rate-control:not(.analysis-setup-return-basis-control) .analysis-setup-rate-slider")
          && hunk.includes("justify-self: stretch")
          && hunk.includes("width: 100%")
          && hunk.includes("inline-size: 100%")
        )
        || (
          hunk.includes("-.analysis-setup-control-group--inflation .analysis-setup-rate-control:not(.analysis-setup-return-basis-control) > label")
          && hunk.includes(".analysis-setup-control-group--growth .analysis-setup-rate-control:not(.analysis-setup-return-basis-control) > label")
          && hunk.includes(".analysis-setup-asset-row--head span")
        )
        || isEducationControlAlignmentHunk(hunk)
        || (
          hunk.includes("analysis-setup")
          && (
            hunk.includes("data-analysis-setup-view-panel")
            || hunk.includes("data-analysis-setup-current-view")
            || (
              hunk.includes("analysis-setup-control-group--calculation-inclusion")
              && hunk.includes("order: 1")
              && hunk.includes("grid-row: 1")
            )
          )
        );
    });
}

function assertNoProtectedDiffs() {
  function isAllowedSurvivorIncomeSourceFix(filePath) {
    if (filePath !== "app/features/lens-analysis/lens-model-builder.js") {
      return false;
    }
    const diff = execFileSync("git", ["diff", "--", filePath], {
      cwd: repoRoot,
      encoding: "utf8"
    });
    return diff.includes("resolveSurvivorSupportSettingsContext")
      && diff.includes("getSurvivorSupportAssumptionContext(input, profileRecord)")
      && diff.includes("survivorSupportSettingsSource")
      && diff.includes("survivorSupportAssumptionsSourcePath")
      && diff.includes("input.analysisSettings")
      && diff.includes("profileRecord.analysisSettings");
  }

  function isAllowedSurvivorGrossToNetDerivationFix(filePath) {
    if (filePath !== "app/features/lens-analysis/lens-model-builder.js") {
      return false;
    }
    const diff = execFileSync("git", ["diff", "--", filePath], {
      cwd: repoRoot,
      encoding: "utf8"
    });
    return diff.includes("getSurvivorNetIncomeFailureReason")
      && diff.includes("baseSurvivorNetIncomeSource")
      && diff.includes("protectionModeling.data.spouseNetAnnualIncome")
      && diff.includes("calculated-tax-net-from-spouse-income")
      && diff.includes("conservative-gross-income-fallback")
      && diff.includes("survivorNetIncomeWorkReductionAppliedAfterTax")
      && diff.includes("missing-tax-config")
      && diff.includes("conservativeGrossIncomeFallbackUsed");
  }

  const protectedFiles = new Set([
    "app/features/lens-analysis/analysis-settings-adapter.js",
    "app/features/lens-analysis/analysis-methods.js",
    "app/features/lens-analysis/step-three-analysis-display.js",
    "app/features/lens-analysis/normalize-lens-model.js",
    "app/features/lens-analysis/blocks/debt-payoff.js",
    "app/features/lens-analysis/debt-treatment-calculations.js",
    "app/features/lens-analysis/lens-model-builder.js",
    "pages/next-step.html",
    "pages/confidential-inputs.html",
    "pages/manual-protection-modeling-inputs.html",
    "components.css",
    "styles.css",
    "app.js"
  ]);
  const status = execFileSync("git", ["status", "--short"], {
    cwd: repoRoot,
    encoding: "utf8"
  });
  const protectedChanged = status
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => line.slice(3).trim())
    .filter((filePath) => {
      if (!protectedFiles.has(filePath)) {
        return false;
      }
      if (filePath === "components.css") {
        return !(isAllowedAnalysisSetupComponentsCssDiff()
          || isAllowedAnalysisSetupEducationControlAlignmentCssDiff(repoRoot, filePath));
      }
      if (filePath === "styles.css") {
        return !isAllowedAnalysisSetupStyleFoundationDiff(repoRoot, filePath);
      }
      if (isAllowedSurvivorIncomeSourceFix(filePath) || isAllowedSurvivorGrossToNetDerivationFix(filePath)) {
        return false;
      }
      return true;
    });
  assert.deepEqual(protectedChanged, [], "Only Analysis Setup and focused check files should change in this pass.");
}

const context = createContext();
const analysisSetup = context.LensApp.analysisSetup;
const taxonomy = context.LensApp.lensAnalysis.debtTaxonomy;
const paymentPlanHelper = context.LensApp.lensAnalysis.calculateTreatedMortgagePaymentPlan;
const previewHarness = createPreviewHarnessContext().LensApp.analysisSetup;
const source = readRepoFile("app/features/lens-analysis/analysis-setup.js");
const html = readRepoFile("pages/analysis-setup.html");

assert.equal(typeof analysisSetup.getDebtTreatmentAssumptions, "function");
assert.equal(typeof analysisSetup.getDebtCategoryTreatmentItems, "function");
assert.equal(typeof analysisSetup.getSurvivorSupportAssumptions, "function");
assert.equal(typeof analysisSetup.normalizeSurvivorSupportTransitionPeriodMonths, "function");
assert.equal(typeof paymentPlanHelper, "function", "Analysis Setup context should load the mortgage payment-plan helper.");
assert.equal(typeof previewHarness.__getMortgagePaymentPlanPreviewInput, "function", "Preview input harness should expose the Analysis Setup preview input builder.");

const defaultSurvivorSupportAssumptions = analysisSetup.DEFAULT_SURVIVOR_SUPPORT_ASSUMPTIONS;
assert.equal(
  defaultSurvivorSupportAssumptions.supportTreatment.transitionPeriodMonths,
  3,
  "Survivor & Support default transition period should be 3 months."
);
assert.equal(analysisSetup.normalizeSurvivorSupportTransitionPeriodMonths(0, 3), 0, "0 months should be valid and mean no transition.");
assert.equal(analysisSetup.normalizeSurvivorSupportTransitionPeriodMonths(24, 3), 24, "24 months should be the valid max.");
assert.equal(analysisSetup.normalizeSurvivorSupportTransitionPeriodMonths(-3, 3), 0, "Negative transition months should clamp to 0.");
assert.equal(analysisSetup.normalizeSurvivorSupportTransitionPeriodMonths(99, 3), 24, "Transition months over 24 should clamp to 24.");
assert.equal(analysisSetup.normalizeSurvivorSupportTransitionPeriodMonths("not-a-number", 3), 3, "Nonnumeric transition months should normalize to default.");
assert.equal(analysisSetup.normalizeSurvivorSupportTransitionPeriodMonths("", 3), 3, "Blank transition months should normalize to default.");

const survivorTransitionSaved = analysisSetup.getSurvivorSupportAssumptions({
  analysisSettings: {
    survivorSupportAssumptions: {
      supportTreatment: {
        transitionPeriodMonths: 12
      }
    }
  }
});
assert.equal(
  survivorTransitionSaved.supportTreatment.transitionPeriodMonths,
  12,
  "Saved transition period should load under supportTreatment.transitionPeriodMonths."
);
assert.equal(
  Object.prototype.hasOwnProperty.call(survivorTransitionSaved, "transitionPeriodAssumptions"),
  false,
  "Transition period should not create a top-level transitionPeriodAssumptions shape."
);
assert.equal(
  analysisSetup.getSurvivorSupportAssumptions({
    analysisSettings: {
      survivorSupportAssumptions: {
        supportTreatment: {
          transitionPeriodMonths: 0
        }
      }
    }
  }).supportTreatment.transitionPeriodMonths,
  0,
  "Saved 0 transition months should remain valid on reload."
);
assert.equal(
  analysisSetup.getSurvivorSupportAssumptions({
    analysisSettings: {
      survivorSupportAssumptions: {
        supportTreatment: {
          transitionPeriodMonths: 27
        }
      }
    }
  }).supportTreatment.transitionPeriodMonths,
  24,
  "Saved transition months should clamp to 24 on reload."
);

const expectedCategoryKeys = toPlainObject(taxonomy.DEFAULT_DEBT_CATEGORY_KEYS);
const defaultAssumptions = analysisSetup.DEFAULT_DEBT_TREATMENT_ASSUMPTIONS;
assert.equal(defaultAssumptions.schemaVersion, 2);
assert.equal(defaultAssumptions.enabled, true, "Debt treatment assumptions should be active for DIME and Needs.");
assert.equal(defaultAssumptions.mortgageTreatment.mode, "payoff");
assert.equal(defaultAssumptions.mortgageTreatment.payoffPercent, 100);
assert.equal(defaultAssumptions.mortgageTreatment.manualYearsRemainingOverride, null);
assert.equal(
  Object.prototype.hasOwnProperty.call(defaultAssumptions.mortgageTreatment, "include"),
  false,
  "active mortgageTreatment defaults should not expose legacy include."
);
assert.equal(
  Object.prototype.hasOwnProperty.call(defaultAssumptions.mortgageTreatment, "paymentSupportYears"),
  false,
  "active mortgageTreatment defaults should not expose legacy paymentSupportYears."
);
assert.ok(defaultAssumptions.debtCategoryTreatment, "default assumptions should expose debtCategoryTreatment");
assert.equal(
  Object.prototype.hasOwnProperty.call(defaultAssumptions, "nonMortgageDebtTreatment"),
  false,
  "default assumptions should not expose scalar-era nonMortgageDebtTreatment"
);
assert.deepEqual(toPlainObject(Object.keys(defaultAssumptions.debtCategoryTreatment)), expectedCategoryKeys);
expectedCategoryKeys.forEach((categoryKey) => {
  assertRawEquivalentTreatment(
    defaultAssumptions.debtCategoryTreatment[categoryKey],
    `${categoryKey} should use raw-equivalent default treatment`
  );
});

const rows = analysisSetup.getDebtCategoryTreatmentItems();
assert.deepEqual(toPlainObject(rows.map((row) => row.key)), expectedCategoryKeys);
assert.equal(rows.find((row) => row.key === "realEstateSecuredDebt").label, "Real Estate Secured Debt");
assert.deepEqual(toPlainObject(rows.find((row) => row.key === "realEstateSecuredDebt").sourceFields), ["otherRealEstateLoans"]);
assert.deepEqual(toPlainObject(rows.find((row) => row.key === "unsecuredConsumerDebt").sourceFields), ["creditCardDebt", "personalLoans"]);
assert.deepEqual(toPlainObject(rows.find((row) => row.key === "medicalDebt").sourceFields), []);

const broadSaved = analysisSetup.getDebtTreatmentAssumptions({
  analysisSettings: {
    debtTreatmentAssumptions: {
      schemaVersion: 2,
      enabled: false,
      globalTreatmentProfile: "balanced",
      mortgageTreatment: {
        mode: "payoff",
        payoffPercent: 100
      },
      debtCategoryTreatment: {
        securedConsumerDebt: createRawEquivalentCategoryTreatment({ payoffPercent: 50 })
      },
      nonMortgageDebtTreatment: {
        autoLoans: { include: false, mode: "exclude", payoffPercent: 0 }
      },
      source: "analysis-setup"
    }
  }
});
assert.equal(broadSaved.schemaVersion, 2);
assert.equal(broadSaved.enabled, true, "Legacy false enabled flags should not make active DIME/Needs treatment look inactive.");
assert.equal(broadSaved.debtCategoryTreatment.securedConsumerDebt.payoffPercent, 50);
assert.equal(broadSaved.debtCategoryTreatment.securedConsumerDebt.include, true);
assert.equal(
  Object.prototype.hasOwnProperty.call(broadSaved, "nonMortgageDebtTreatment"),
  false,
  "normalized assumptions should not carry scalar-era nonMortgageDebtTreatment"
);

const oldPayoffMortgage = analysisSetup.getDebtTreatmentAssumptions({
  analysisSettings: {
    debtTreatmentAssumptions: {
      schemaVersion: 2,
      mortgageTreatment: {
        include: false,
        mode: "payoff",
        payoffPercent: 25,
        paymentSupportYears: 12,
        manualYearsRemainingOverride: 20
      },
      source: "analysis-setup"
    }
  }
}).mortgageTreatment;
assert.equal(oldPayoffMortgage.mode, "payoff", "old payoff mode should remain payoff.");
assert.equal(oldPayoffMortgage.payoffPercent, 100, "payoff mode should normalize to full payoff.");
assert.equal(oldPayoffMortgage.manualYearsRemainingOverride, null, "payoff mode should clear manual mortgage term override.");
assert.equal(Object.prototype.hasOwnProperty.call(oldPayoffMortgage, "include"), false, "old include should be dropped from active mortgageTreatment.");
assert.equal(Object.prototype.hasOwnProperty.call(oldPayoffMortgage, "paymentSupportYears"), false, "old paymentSupportYears should be dropped from active mortgageTreatment.");

const oldSupportMortgage = analysisSetup.getDebtTreatmentAssumptions({
  analysisSettings: {
    debtTreatmentAssumptions: {
      schemaVersion: 2,
      mortgageTreatment: {
        include: true,
        mode: "support",
        payoffPercent: 35,
        paymentSupportYears: 7
      },
      source: "analysis-setup"
    }
  }
}).mortgageTreatment;
assert.equal(oldSupportMortgage.mode, "support", "old support mode should remain support for future Continue Payments.");
assert.equal(oldSupportMortgage.payoffPercent, 35, "support mode payoffPercent should remain an immediate partial payoff percent.");
assert.equal(oldSupportMortgage.manualYearsRemainingOverride, null, "paymentSupportYears must not map to manualYearsRemainingOverride.");
assert.equal(Object.prototype.hasOwnProperty.call(oldSupportMortgage, "include"), false, "old include should be dropped from active support mortgageTreatment.");
assert.equal(Object.prototype.hasOwnProperty.call(oldSupportMortgage, "paymentSupportYears"), false, "old paymentSupportYears should be dropped from active support mortgageTreatment.");

assert.equal(typeof analysisSetup.normalizeMortgageTreatmentAssumption, "function");
assert.equal(typeof analysisSetup.normalizeMortgageManualYearsRemainingOverride, "function");

const supportWithManualMin = analysisSetup.normalizeMortgageTreatmentAssumption({
  mode: "support",
  payoffPercent: 0,
  paymentSupportYears: 15,
  manualYearsRemainingOverride: 1
}, defaultAssumptions.mortgageTreatment);
assert.equal(supportWithManualMin.mode, "support");
assert.equal(supportWithManualMin.payoffPercent, 0);
assert.equal(supportWithManualMin.manualYearsRemainingOverride, 1);
assert.equal(Object.prototype.hasOwnProperty.call(supportWithManualMin, "include"), false);
assert.equal(Object.prototype.hasOwnProperty.call(supportWithManualMin, "paymentSupportYears"), false);

const supportWithManualMax = analysisSetup.normalizeMortgageTreatmentAssumption({
  mode: "support",
  payoffPercent: 99.999,
  manualYearsRemainingOverride: 30
}, defaultAssumptions.mortgageTreatment);
assert.equal(supportWithManualMax.payoffPercent, 99.999);
assert.equal(supportWithManualMax.manualYearsRemainingOverride, 30);

[
  0,
  -1,
  30.01,
  31,
  "abc",
  "",
  null
].forEach((value) => {
  assert.equal(
    analysisSetup.normalizeMortgageManualYearsRemainingOverride(value),
    null,
    `manual years override ${String(value)} should normalize to null.`
  );
});

const payoffNormalized = analysisSetup.normalizeMortgageTreatmentAssumption({
  mode: "payoff",
  include: true,
  payoffPercent: 5,
  paymentSupportYears: 9,
  manualYearsRemainingOverride: 12
}, defaultAssumptions.mortgageTreatment);
assert.equal(payoffNormalized.payoffPercent, 100);
assert.equal(payoffNormalized.manualYearsRemainingOverride, null);
assert.equal(Object.prototype.hasOwnProperty.call(payoffNormalized, "include"), false);
assert.equal(Object.prototype.hasOwnProperty.call(payoffNormalized, "paymentSupportYears"), false);

const previewPayoff = paymentPlanHelper({
  mortgageTreatment: payoffNormalized,
  mortgageFacts: { mortgageBalance: 240000 },
  ongoingSupport: {
    monthlyMortgagePayment: 1600,
    mortgageRemainingTermMonths: 300,
    mortgageInterestRatePercent: 5.5,
    monthlyHousingSupportCost: 2800
  }
});
assert.equal(previewPayoff.mode, "payOff");
assert.equal(previewPayoff.immediatePayoffAmount, 240000);
assert.equal(previewPayoff.finalMonthlyMortgagePayment, 0, "Pay Off preview should produce a $0 final mortgage-only payment.");
assert.equal(previewPayoff.finalRemainingTermMonths, 0);
assert.equal(previewPayoff.associatedHousingCostsPreserved, true);

const previewContinueRaw = paymentPlanHelper({
  mortgageTreatment: {
    mode: "support",
    payoffPercent: 0,
    manualYearsRemainingOverride: null
  },
  mortgageFacts: { mortgageBalance: 240000 },
  ongoingSupport: {
    monthlyMortgagePayment: 1600,
    mortgageRemainingTermMonths: 300,
    mortgageInterestRatePercent: 5.5,
    monthlyHousingSupportCost: 2800
  }
});
assert.equal(previewContinueRaw.mode, "continuePayments");
assert.equal(previewContinueRaw.finalRemainingTermMonths, 300);
assert.equal(previewContinueRaw.yearsRemainingSource, "pmiCalculated");
assert.equal(previewContinueRaw.finalMonthlyMortgagePayment, monthlyPayment(240000, 5.5, 300));

const previewContinuePartial = paymentPlanHelper({
  mortgageTreatment: {
    mode: "support",
    payoffPercent: 25,
    manualYearsRemainingOverride: null
  },
  mortgageFacts: { mortgageBalance: 240000 },
  ongoingSupport: {
    monthlyMortgagePayment: 1600,
    mortgageRemainingTermMonths: 300,
    mortgageInterestRatePercent: 5.5,
    monthlyHousingSupportCost: 2800
  }
});
assert.equal(previewContinuePartial.immediatePayoffAmount, 60000);
assert.equal(previewContinuePartial.remainingPrincipalAfterPayoff, 180000);
assert.ok(
  previewContinuePartial.finalMonthlyMortgagePayment < previewContinueRaw.finalMonthlyMortgagePayment,
  "Partial payoff should lower the helper-derived final payment."
);

const previewManualOverride = paymentPlanHelper({
  mortgageTreatment: {
    mode: "support",
    payoffPercent: 25,
    manualYearsRemainingOverride: 15
  },
  mortgageFacts: { mortgageBalance: 240000 },
  ongoingSupport: {
    monthlyMortgagePayment: 1600,
    mortgageRemainingTermMonths: 300,
    mortgageInterestRatePercent: 5.5,
    monthlyHousingSupportCost: 2800
  }
});
assert.equal(previewManualOverride.finalRemainingTermMonths, 180);
assert.equal(previewManualOverride.yearsRemainingSource, "manualOverride");
assert.notEqual(
  previewManualOverride.finalMonthlyMortgagePayment,
  previewContinuePartial.finalMonthlyMortgagePayment,
  "Manual years override should change the helper-derived final payment."
);

const previewInvalidManual = paymentPlanHelper({
  mortgageTreatment: {
    mode: "support",
    payoffPercent: 25,
    manualYearsRemainingOverride: 35
  },
  mortgageFacts: { mortgageBalance: 240000 },
  ongoingSupport: {
    monthlyMortgagePayment: 1600,
    mortgageRemainingTermMonths: 300,
    mortgageInterestRatePercent: 5.5,
    monthlyHousingSupportCost: 2800
  }
});
assert.equal(previewInvalidManual.finalRemainingTermMonths, 300);
assert.equal(previewInvalidManual.yearsRemainingSource, "pmiCalculated");
assert.match(
  previewInvalidManual.warnings.map((warning) => warning.code).join(" "),
  /mortgage-payment-plan-manual-years-invalid/
);

const previewStraightLine = paymentPlanHelper({
  mortgageTreatment: {
    mode: "support",
    payoffPercent: 0,
    manualYearsRemainingOverride: null
  },
  mortgageFacts: { mortgageBalance: 240000 },
  ongoingSupport: {
    monthlyMortgagePayment: 1600,
    mortgageRemainingTermMonths: 300,
    mortgageInterestRatePercent: 0,
    monthlyHousingSupportCost: 2800
  }
});
assert.equal(previewStraightLine.paymentSource, "straightLineFallback");
assert.match(
  previewStraightLine.warnings.map((warning) => warning.code).join(" "),
  /mortgage-payment-plan-interest-rate-fallback/
);

function makeMortgagePreviewRecord(overrides = {}) {
  return {
    protectionModeling: {
      data: {
        mortgageBalance: 350000,
        monthlyMortgagePaymentOnly: 2000,
        mortgageTermRemainingYears: 10,
        mortgageTermRemainingMonths: 6,
        mortgageInterestRate: 5.75,
        calculatedMonthlyMortgagePayment: 3200,
        ...overrides
      }
    }
  };
}

function makeMortgagePreviewFields(manualYearsRemainingOverride = "") {
  return {
    mortgage: {
      manualYearsRemainingOverride: {
        value: manualYearsRemainingOverride
      }
    }
  };
}

const previewSupportAssumptions = {
  mortgageTreatment: {
    mode: "support",
    payoffPercent: 0,
    paymentSupportYears: 1,
    manualYearsRemainingOverride: null
  }
};

const combinedPmiTermInput = previewHarness.__getMortgagePaymentPlanPreviewInput(
  makeMortgagePreviewRecord(),
  previewSupportAssumptions,
  makeMortgagePreviewFields("")
);
assert.equal(
  combinedPmiTermInput.ongoingSupport.mortgageRemainingTermMonths,
  126,
  "Analysis Setup preview should combine PMI mortgage remaining years and months into total months."
);
const combinedPmiTermPreview = paymentPlanHelper(combinedPmiTermInput);
assert.equal(combinedPmiTermPreview.finalRemainingTermMonths, 126);
assert.equal(combinedPmiTermPreview.yearsRemainingSource, "pmiCalculated");
assert.equal(combinedPmiTermPreview.finalMonthlyMortgagePayment, monthlyPayment(350000, 5.75, 126));

const sixMonthOnlyInput = previewHarness.__getMortgagePaymentPlanPreviewInput(
  makeMortgagePreviewRecord({
    mortgageTermRemainingYears: 0,
    mortgageTermRemainingMonths: 6
  }),
  previewSupportAssumptions,
  makeMortgagePreviewFields("")
);
assert.equal(sixMonthOnlyInput.ongoingSupport.mortgageRemainingTermMonths, 6);
assert.equal(paymentPlanHelper(sixMonthOnlyInput).finalRemainingTermMonths, 6);

const manualTermPreview = paymentPlanHelper(previewHarness.__getMortgagePaymentPlanPreviewInput(
  makeMortgagePreviewRecord(),
  previewSupportAssumptions,
  makeMortgagePreviewFields("15")
));
assert.equal(manualTermPreview.finalRemainingTermMonths, 180);
assert.equal(manualTermPreview.yearsRemainingSource, "manualOverride");
assert.notEqual(
  manualTermPreview.finalMonthlyMortgagePayment,
  combinedPmiTermPreview.finalMonthlyMortgagePayment,
  "Manual years override should replace the combined PMI term and change the final preview payment."
);
assert.notEqual(
  combinedPmiTermInput.ongoingSupport.mortgageRemainingTermMonths,
  previewSupportAssumptions.mortgageTreatment.paymentSupportYears * 12,
  "Legacy paymentSupportYears must not be used as the mortgage remaining term."
);

const legacySaved = analysisSetup.getDebtTreatmentAssumptions({
  analysisSettings: {
    debtTreatmentAssumptions: {
      enabled: false,
      globalTreatmentProfile: "balanced",
      mortgageTreatment: {
        mode: "payoff",
        payoffPercent: 100
      },
      nonMortgageDebtTreatment: {
        autoLoans: { include: true, mode: "payoff", payoffPercent: 50 },
        otherRealEstateLoans: { include: false, mode: "exclude", payoffPercent: 0 }
      },
      source: "analysis-setup"
    }
  }
});
assert.equal(legacySaved.debtCategoryTreatment.securedConsumerDebt.payoffPercent, 50);
assert.equal(legacySaved.debtCategoryTreatment.realEstateSecuredDebt.include, false);
assert.equal(legacySaved.debtCategoryTreatment.realEstateSecuredDebt.mode, "exclude");

const conflictingLegacy = analysisSetup.getDebtTreatmentAssumptions({
  analysisSettings: {
    debtTreatmentAssumptions: {
      nonMortgageDebtTreatment: {
        creditCardDebt: { include: false, mode: "exclude", payoffPercent: 0 },
        personalLoans: { include: true, mode: "payoff", payoffPercent: 50 }
      },
      source: "analysis-setup"
    }
  }
});
assertRawEquivalentTreatment(
  conflictingLegacy.debtCategoryTreatment.unsecuredConsumerDebt,
  "conflicting scalar-era unsecured debt settings should default safely"
);

const saveBody = extractFunctionBody(
  source,
  "readValidatedDebtTreatmentAssumptions",
  "readValidatedSurvivorSupportAssumptions"
);
assert.match(saveBody, /schemaVersion:\s*DEBT_TREATMENT_SCHEMA_VERSION/);
assert.match(saveBody, /enabled:\s*true/);
assert.match(saveBody, /debtCategoryTreatment:\s*\{\}/);
assert.match(saveBody, /normalizeMortgageTreatmentAssumption/);
assert.match(saveBody, /manualYearsRemainingOverride/);
assert.match(saveBody, /mortgageMode === "payoff"\s*\?\s*\{\s*value:\s*100\s*\}/);
assert.match(saveBody, /readOptionalMortgageManualYearsRemainingOverride/);
assert.doesNotMatch(
  saveBody,
  /nonMortgageDebtTreatment/,
  "save output should not write nonMortgageDebtTreatment"
);
assert.doesNotMatch(
  saveBody,
  /lastUpdatedAt/,
  "new debt treatment saved shape should not add save-history metadata"
);

const profileBody = extractFunctionBody(source, "applyDebtTreatmentProfile", "applySurvivorSupportProfile");
assert.match(profileBody, /debtCategoryTreatment/);
assert.doesNotMatch(profileBody, /nonMortgageDebtTreatment/);

const previewBody = extractFunctionBody(source, "syncDebtTreatmentPreview", "syncSurvivorSupportPreview");
assert.match(previewBody, /DIME and LENS use treated debt/);
assert.match(previewBody, /HLV remains unchanged/);
assert.match(previewBody, /Continue Payments uses the treated mortgage payment plan/);
assert.match(previewBody, /Immediate partial payoff reduces principal/);
assert.match(previewBody, /manual years remaining override changes the final term/);
assert.match(previewBody, /Taxes, insurance, HOA, utilities, and maintenance stay in ongoing household expenses/);
assert.match(previewBody, /Non-mortgage custom treatment remains warning-backed until formulas are defined/);
assert.doesNotMatch(previewBody, /Mortgage support mode is deferred/);
assert.doesNotMatch(previewBody, /Support and custom modes use warning-backed raw-equivalent behavior/);
assert.doesNotMatch(previewBody, /current DIME, Needs, HLV/);
assert.doesNotMatch(previewBody, /current methods still use raw debt payoff values/);

const mortgageTreatmentVisibilityBody = extractFunctionBody(
  source,
  "syncMortgageTreatmentControlsVisibility",
  "populateDebtTreatmentFields"
);
assert.match(mortgageTreatmentVisibilityBody, /partialPayoffRow\.hidden\s*=\s*!isContinuePayments/);
assert.match(mortgageTreatmentVisibilityBody, /manualYearsRow\.hidden\s*=\s*!isContinuePayments/);
assert.doesNotMatch(mortgageTreatmentVisibilityBody, /legacySupportYearsRow/);
assert.doesNotMatch(mortgageTreatmentVisibilityBody, /legacyIncludeRow/);
assert.doesNotMatch(mortgageTreatmentVisibilityBody, /mode === "custom"/);

assert.match(source, /const MORTGAGE_TREATMENT_MODES = Object\.freeze\(\["payoff", "support"\]\)/);
assert.match(source, /manualYearsRemainingOverride:\s*null/);
assert.doesNotMatch(source, /paymentSupportYears/);
assert.doesNotMatch(source, /data-analysis-debt-mortgage-legacy-include-row/);
assert.doesNotMatch(source, /data-analysis-debt-support-years-row/);
assert.doesNotMatch(source, /manualYearsRemainingOverride:\s*normalizeDebtSupportYears\(\s*safeSource\.paymentSupportYears/);
assert.match(source, /Mortgage treatment must be Payoff or Support\./);
assert.doesNotMatch(source, /Mortgage treatment must be Payoff, Support, or Custom\./);
assert.match(source, /LensApp\.lensAnalysis\?\.calculateTreatedMortgagePaymentPlan/);
assert.match(source, /syncMortgagePaymentPlanPreview\(fields, linkedRecord, assumptions\)/);
assert.match(source, /getMortgagePaymentPlanPreviewInput/);
assert.match(source, /getMortgageRemainingTermMonthsForPreview/);
assert.match(source, /return \(years \* 12\) \+ months/);
assert.match(source, /previewTreatment\.manualYearsRemainingOverride\s*=\s*rawManualYears/);
assert.match(source, /monthlyMortgagePaymentOnly/);
assert.match(source, /mortgageTermRemainingYears/);
assert.doesNotMatch(source, /\"mortgageRemainingTermMonths\",\s*\n\s*\"mortgageTermRemainingMonths\"/);
assert.match(source, /formatMortgagePlanSource\(result\.yearsRemainingSource\)/);
assert.doesNotMatch(source, /Math\.pow/);
assert.doesNotMatch(source, /monthlyRate/);
assert.doesNotMatch(saveBody, /finalMonthlyMortgagePayment/);
assert.doesNotMatch(saveBody, /finalRemainingTermMonths/);

const debtHelperScriptIndex = html.indexOf("debt-treatment-calculations.js");
const analysisSetupScriptIndex = html.indexOf("analysis-setup.js");
assert.ok(debtHelperScriptIndex >= 0, "Analysis Setup should load debt-treatment-calculations.js.");
assert.ok(analysisSetupScriptIndex >= 0, "Analysis Setup should load analysis-setup.js.");
assert.ok(
  debtHelperScriptIndex < analysisSetupScriptIndex,
  "Analysis Setup should load debt-treatment-calculations.js before analysis-setup.js."
);

assert.match(html, /Property tax, insurance, HOA, utilities, and maintenance remain ongoing housing expenses/);
assert.doesNotMatch(html, /analysis-setup-control-group--debt/);
assert.match(html, /class="analysis-setup-control-group analysis-setup-debt-mortgage-card"/);
assert.match(html, /class="analysis-setup-control-group analysis-setup-debt-record-card"/);
assert.match(html, /<option value="payoff">Pay Off<\/option>/);
assert.match(html, /<option value="support">Continue Payments<\/option>/);
assert.doesNotMatch(html, /Pay off the mortgage balance at death/);
assert.doesNotMatch(html, /Mortgage-only payment is removed from ongoing support/);
assert.match(html, /Immediate partial payoff percent/);
assert.match(html, /Manual years remaining override/);
assert.doesNotMatch(html, /Reduces the mortgage principal before recalculating the continued payment/);
assert.doesNotMatch(html, /Leave blank to use PMI remaining term\. Valid range: 1-30 years/);
assert.match(html, /Continue Payments uses the treated mortgage payment plan/);
assert.doesNotMatch(
  html,
  /The final monthly mortgage payment will be recalculated from remaining principal, interest rate, and final term\. Associated housing costs remain ongoing expenses\./
);
assert.match(html, /data-analysis-debt-mortgage-partial-payoff-row hidden/);
assert.match(html, /data-analysis-debt-mortgage-manual-years-row hidden/);
assert.doesNotMatch(html, /Include mortgage payoff/);
assert.doesNotMatch(html, /Legacy payment support years/);
assert.doesNotMatch(html, /data-analysis-debt-mortgage-legacy-include-row/);
assert.doesNotMatch(html, /data-analysis-debt-support-years-row/);
assert.doesNotMatch(html, /data-analysis-debt-mortgage-field="include"/);
assert.doesNotMatch(html, /data-analysis-debt-mortgage-field="paymentSupportYears"/);
assert.match(html, /Mortgage payment preview/);
assert.match(html, /data-analysis-debt-mortgage-payment-plan-preview/);
assert.match(html, /data-analysis-debt-mortgage-plan-treatment/);
assert.match(html, /data-analysis-debt-mortgage-plan-payoff/);
assert.match(html, /data-analysis-debt-mortgage-plan-principal/);
assert.match(html, /data-analysis-debt-mortgage-plan-term/);
assert.match(html, /data-analysis-debt-mortgage-plan-years-source/);
assert.match(html, /data-analysis-debt-mortgage-plan-payment/);
assert.match(html, /data-analysis-debt-mortgage-plan-payment-source/);
assert.match(html, /data-analysis-debt-mortgage-plan-associated-costs/);
assert.match(html, /Mortgage-only payment is treated/);
assert.doesNotMatch(html, /data-analysis-debt-mortgage-field="finalMonthlyMortgagePayment"/);
assert.doesNotMatch(html, /data-analysis-debt-mortgage-field="finalRemainingTermMonths"/);
assert.doesNotMatch(html, /<option value="custom">Custom \(deferred\)<\/option>/);
assert.doesNotMatch(html, /Support \(deferred\)/);
assert.doesNotMatch(html, /Support years \(deferred\)/);
assert.doesNotMatch(html, /Support mode uses the current monthly mortgage payment from PMI/);
assert.doesNotMatch(html, /selected support period/);
assert.doesNotMatch(html, /Support and custom modes are deferred and warning-backed/);
assert.doesNotMatch(html, /Support and custom modes use warning-backed raw-equivalent behavior/);
assert.doesNotMatch(html, /Current DIME, Needs, and HLV outputs still use raw debt payoff values/);
assert.doesNotMatch(html, /Debt treatment preview \\(not used by current methods\\)/);
assert.doesNotMatch(html, /Future Defaults:/);

const mortgageSelectMarkup = html.match(/<select class="analysis-setup-asset-select analysis-setup-debt-field" data-analysis-debt-mortgage-field="mode"[\s\S]*?<\/select>/);
assert.ok(mortgageSelectMarkup, "Mortgage treatment mode select should exist.");
const mortgageOptions = Array.from(mortgageSelectMarkup[0].matchAll(/<option value="([^"]+)">/g)).map((match) => match[1]);
assert.deepEqual(mortgageOptions, ["payoff", "support"], "Visible mortgage treatment modes should be payoff and support only.");

const debtCategoryModeOptionsBody = extractFunctionBody(source, "getDebtCategoryModeOptionsMarkup", "renderDebtTreatmentRows");
assert.match(debtCategoryModeOptionsBody, /custom:\s*"Custom \(deferred\)"/);
assert.match(debtCategoryModeOptionsBody, /DEBT_CATEGORY_TREATMENT_MODES/);

const survivorDraftBody = extractFunctionBody(source, "getSurvivorSupportDraftAssumptions", "readEducationDraftBoolean");
assert.match(
  survivorDraftBody,
  /supportTreatment\.transitionPeriodMonths/,
  "Survivor draft assumptions should collect transitionPeriodMonths from supportTreatment."
);
const survivorSaveBody = extractFunctionBody(source, "readValidatedSurvivorSupportAssumptions", "readRequiredEducationPercent");
assert.match(
  survivorSaveBody,
  /transitionPeriodMonths/,
  "Validated survivor assumptions should save transitionPeriodMonths."
);
const survivorPopulateBody = extractFunctionBody(source, "populateSurvivorSupportFields", "populateEducationFields");
assert.match(
  survivorPopulateBody,
  /supportTreatment\.transitionPeriodMonths/,
  "Survivor support fields should reload transitionPeriodMonths into the control."
);
assert.match(html, /Transition period after death/);
assert.match(html, /data-analysis-survivor-field="supportTreatment\.transitionPeriodMonths"/);
assert.match(html, /type="range" min="0" max="24" step="1" value="3"/);
assert.match(html, /data-analysis-survivor-transition-period-value>3 months<\/output>/);
assert.match(
  html,
  /Time between death and the start of the long-term survivor runway\. Used for timeline framing in V1; it does not change death age\/date or model probate, claim processing, or asset liquidity mechanics\./
);

assertNoProtectedDiffs();

console.log("analysis-setup-debt-treatment-saved-shape-check passed");
