#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const repoRoot = path.resolve(__dirname, "..", "..");

function readRepoFile(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

function loadScript(context, relativePath) {
  vm.runInContext(readRepoFile(relativePath), context, {
    filename: path.join(repoRoot, relativePath)
  });
}

function createContext() {
  const context = {
    console,
    LensApp: {
      lensAnalysis: {}
    }
  };
  context.globalThis = context;
  vm.createContext(context);
  return context;
}

function loadLedgerBuilder() {
  const context = createContext();
  loadScript(context, "app/features/lens-analysis/coverage-strategy-obligation-ledger.js");
  return context.LensApp.lensAnalysis.buildCoverageStrategyObligationLedger;
}

function loadNeedLineBuilder(options = {}) {
  const context = createContext();
  [
    "app/features/lens-analysis/coverage-strategy-mortgage-lifetime-projection.js",
    "app/features/lens-analysis/coverage-strategy-debt-lifetime-projection.js",
    "app/features/lens-analysis/coverage-strategy-healthcare-lifetime-projection.js",
    "app/features/lens-analysis/coverage-strategy-final-expense-lifetime-projection.js",
    "app/features/lens-analysis/coverage-strategy-transition-needs-lifetime-projection.js",
    "app/features/lens-analysis/coverage-strategy-education-lifetime-projection.js",
    "app/features/lens-analysis/coverage-strategy-scenario-settings.js"
  ].forEach((relativePath) => loadScript(context, relativePath));
  if (options.withLedger !== false) {
    loadScript(context, "app/features/lens-analysis/coverage-strategy-obligation-ledger.js");
  }
  loadScript(context, "app/features/lens-analysis/coverage-strategy-need-line-adapter.js");
  return context.LensApp.lensAnalysis.buildCoverageStrategyNeedLine;
}

function loadDiagnosticSnapshotBuilder() {
  const context = createContext();
  loadScript(context, "app/features/lens-analysis/coverage-strategy-diagnostic-export.js");
  return context.LensApp.lensAnalysis.buildCoverageStrategyDiagnosticExportSnapshot;
}

function createNeedPoints() {
  return [
    {
      yearIndex: 0,
      calendarYear: 2026,
      needAmount: 312000,
      grossNeedAmount: 312000,
      componentAmounts: {
        debtPayoff: 12000,
        mortgage: 150000,
        essentialSupport: 50000,
        discretionarySupport: 10000,
        transitionNeeds: 15000,
        education: 20000,
        finalExpenses: 25000,
        healthcareExpenses: 30000
      },
      supportTrace: {
        reconstructionStatus: "current-output"
      },
      trace: {
        componentTiming: {
          debtPayoff: "projected-non-mortgage-debt-payoff",
          mortgage: "projected-payoff-amortized",
          essentialSupport: "remaining-support-duration",
          discretionarySupport: "remaining-support-duration",
          transitionNeeds: "transition-needs-deathTriggeredAtEachProjectionPoint",
          education: "record-level-education-obligation-schedule",
          finalExpenses: "record-level-death-year-final-expense-schedule",
          healthcareExpenses: "record-level-healthcare-lifetime-schedule"
        },
        educationProjection: {
          grossEducationNeedAmount: 25000,
          educationSavingsOffsetAmount: 5000,
          netEducationNeedAmount: 20000,
          effectiveEducationTreatmentMode: "scheduleRemainingNeed"
        }
      }
    },
    {
      yearIndex: 1,
      calendarYear: 2027,
      needAmount: 252000,
      grossNeedAmount: 252000,
      componentAmounts: {
        debtPayoff: 10000,
        mortgage: 140000,
        essentialSupport: 40000,
        discretionarySupport: 0,
        transitionNeeds: 15000,
        education: 0,
        finalExpenses: 25000,
        healthcareExpenses: 22000
      },
      supportTrace: {
        reconstructionStatus: "current-output"
      },
      trace: {
        componentTiming: {
          debtPayoff: "projected-non-mortgage-debt-payoff",
          mortgage: "projected-payoff-amortized",
          essentialSupport: "remaining-support-duration",
          discretionarySupport: "excluded",
          transitionNeeds: "transition-needs-deathTriggeredAtEachProjectionPoint",
          education: "record-level-education-obligation-schedule",
          finalExpenses: "record-level-death-year-final-expense-schedule",
          healthcareExpenses: "record-level-healthcare-lifetime-schedule"
        },
        educationProjection: {
          grossEducationNeedAmount: 0,
          educationSavingsOffsetAmount: 0,
          netEducationNeedAmount: 0,
          effectiveEducationTreatmentMode: "scheduleRemainingNeed"
        }
      }
    }
  ];
}

function createComponentModels() {
  return {
    mortgageLifetimeProjection: {
      status: "complete",
      assumptionsUsed: {
        projectionMode: "amortized"
      }
    },
    nonMortgageDebtLifetimeProjection: {
      status: "complete",
      assumptionsUsed: {
        projectionModeCounts: {
          amortized: 1
        }
      }
    },
    education: {
      lifetimeProjection: {
        status: "complete",
        educationTreatment: {
          effectiveMode: "scheduleRemainingNeed"
        }
      }
    },
    healthcare: {
      lifetimeProjection: {
        status: "complete",
        supportOwnedHealthcareExpenseExcludedCount: 1
      }
    },
    finalExpenses: {
      lifetimeProjection: {
        status: "complete"
      }
    },
    transitionNeeds: {
      lifetimeProjection: {
        status: "complete",
        projectionMode: "deathTriggeredAtEachProjectionPoint"
      }
    },
    support: {
      reconstructionStatus: "current-output"
    },
    discretionarySupport: {
      included: true
    }
  };
}

function createNeedsResult() {
  return {
    method: "needsAnalysis",
    assumptions: {
      valuationDate: "2026-01-01"
    },
    components: {
      debtPayoff: 12000,
      essentialSupport: 50000,
      education: 20000,
      finalExpenses: 25000,
      healthcareExpenses: 30000,
      transitionNeeds: 15000,
      discretionarySupport: 10000
    },
    trace: [
      {
        key: "essentialSupport",
        inputs: {
          annualTotalEssentialSupportCost: 50000,
          supportBasisSourcePath: "treatedOngoingSupport.mortgageAdjusted.annualTotalEssentialSupportCost"
        }
      },
      {
        key: "discretionarySupport",
        inputs: {
          annualDiscretionaryPersonalSpending: 10000
        }
      }
    ]
  };
}

const ledgerSource = readRepoFile("app/features/lens-analysis/coverage-strategy-obligation-ledger.js");
const needLineSource = readRepoFile("app/features/lens-analysis/coverage-strategy-need-line-adapter.js");
const diagnosticSource = readRepoFile("app/features/lens-analysis/coverage-strategy-diagnostic-export.js");
const pageSource = readRepoFile("pages/coverage-strategy.html");

assert.match(ledgerSource, /coverage-strategy-obligation-ledger-v1/);
assert.match(ledgerSource, /buildCoverageStrategyObligationLedger/);
assert.match(ledgerSource, /diagnosticOnly:\s*true/);
assert.match(ledgerSource, /ledgerDrivesNeedLine:\s*false/);
assert.doesNotMatch(ledgerSource, /document\.|window\.localStorage|localStorage|sessionStorage|indexedDB/);
assert.doesNotMatch(ledgerSource, /calculateCoverageStrategy.*Projection|buildCoverageStrategyResourceLine|buildCoverageStrategyGapSurplus/);
assert.match(needLineSource, /buildCoverageStrategyObligationLedger/);
assert.match(diagnosticSource, /coverageStrategyObligationLedger/);
assert.ok(
  pageSource.indexOf("coverage-strategy-obligation-ledger.js")
    < pageSource.indexOf("coverage-strategy-need-line-adapter.js"),
  "Obligation ledger helper should load before the Need Line adapter."
);

const buildLedger = loadLedgerBuilder();
assert.equal(typeof buildLedger, "function");

const ledgerInput = {
  needPoints: createNeedPoints(),
  componentModels: createComponentModels()
};
const inputBefore = JSON.stringify(ledgerInput);
const firstLedger = buildLedger(ledgerInput);
const secondLedger = buildLedger(ledgerInput);

assert.equal(JSON.stringify(ledgerInput), inputBefore, "Ledger builder should not mutate inputs.");
assert.deepEqual(secondLedger, firstLedger, "Ledger builder should be deterministic.");
assert.doesNotThrow(() => JSON.stringify(firstLedger), "Ledger output should be serializable.");
assert.equal(firstLedger.diagnosticOnly, true);
assert.equal(firstLedger.ledgerDrivesNeedLine, false);
assert.equal(firstLedger.allYearsMatchNeedLine, true);
assert.equal(firstLedger.allYearsMatchComponentAmounts, true);
assert.equal(firstLedger.maxDifference, 0);
assert.equal(firstLedger.tolerance, 0.01);

const rowByOwner = new Map(firstLedger.rows.map((row) => [row.ownerComponent, row]));
assert.equal(rowByOwner.get("mortgage").sourceComponentKey, "mortgage");
assert.equal(rowByOwner.get("nonMortgageDebt").sourceComponentKey, "debtPayoff");
assert.equal(rowByOwner.get("education").sourceComponentKey, "education");
assert.equal(rowByOwner.get("healthcare").sourceComponentKey, "healthcareExpenses");
assert.equal(rowByOwner.get("finalExpense").sourceComponentKey, "finalExpenses");
assert.equal(rowByOwner.get("transitionNeeds").sourceComponentKey, "transitionNeeds");
assert.equal(rowByOwner.get("essentialSupport").sourceComponentKey, "essentialSupport");
assert.equal(rowByOwner.get("discretionarySupport").sourceComponentKey, "discretionarySupport");
assert.equal(rowByOwner.get("education").annualAmountsByYear[0].grossAmount, 25000);
assert.equal(rowByOwner.get("education").annualAmountsByYear[0].offsetAmount, 5000);
assert.equal(rowByOwner.get("education").annualAmountsByYear[0].netAmount, 20000);

firstLedger.annualParity.forEach((parity) => {
  assert.equal(parity.matchesNeedLine, true);
  assert.equal(parity.matchesComponentAmounts, true);
  assert.equal(parity.differenceFromNeedLine, 0);
  assert.equal(parity.differenceFromComponentAmounts, 0);
});

const zeroOnlyLedger = buildLedger({
  needPoints: [{
    yearIndex: 0,
    calendarYear: 2026,
    needAmount: 0,
    componentAmounts: {
      debtPayoff: 0,
      mortgage: 0,
      education: 0,
      healthcareExpenses: 0,
      finalExpenses: 0,
      transitionNeeds: 0,
      essentialSupport: 0,
      discretionarySupport: 0
    },
    trace: {
      componentTiming: {}
    }
  }],
  componentModels: {}
});
assert.equal(zeroOnlyLedger.rows.length, 0);
assert.equal(zeroOnlyLedger.omittedZeroComponentCount, 8);
assert.equal(
  JSON.stringify(zeroOnlyLedger.omittedZeroComponents.map((row) => row.ownerComponent).sort()),
  JSON.stringify([
    "discretionarySupport",
    "education",
    "essentialSupport",
    "finalExpense",
    "healthcare",
    "mortgage",
    "nonMortgageDebt",
    "transitionNeeds"
  ].sort())
);

const diagnosticZeroLedger = buildLedger({
  needPoints: [{
    yearIndex: 0,
    calendarYear: 2026,
    needAmount: 0,
    componentAmounts: {
      debtPayoff: 0,
      mortgage: 0,
      education: 0,
      healthcareExpenses: 0,
      finalExpenses: 0,
      transitionNeeds: 0,
      essentialSupport: 0,
      discretionarySupport: 0
    }
  }],
  componentModels: {
    healthcare: {
      lifetimeProjection: {
        status: "partial",
        warnings: [{ code: "healthcare-diagnostic-warning" }],
        dataGaps: []
      }
    }
  }
});
assert.equal(diagnosticZeroLedger.rows.length, 1);
assert.equal(diagnosticZeroLedger.rows[0].ownerComponent, "healthcare");
assert.equal(diagnosticZeroLedger.rows[0].warnings[0].code, "healthcare-diagnostic-warning");

const buildNeedLineWithLedger = loadNeedLineBuilder({ withLedger: true });
const buildNeedLineWithoutLedger = loadNeedLineBuilder({ withLedger: false });
const needLineInput = {
  lensModel: {},
  needsResult: createNeedsResult(),
  analysisSettings: {
    needsSupportDurationYears: 2,
    includeDiscretionarySupport: true
  },
  valuationDate: "2026-01-01",
  currentAge: 40,
  horizonYears: 2
};
const needLineWithLedger = buildNeedLineWithLedger(needLineInput);
const needLineWithoutLedger = buildNeedLineWithoutLedger(needLineInput);

assert.ok(needLineWithLedger.coverageStrategyObligationLedger);
assert.equal(needLineWithLedger.coverageStrategyObligationLedger.ledgerDrivesNeedLine, false);
assert.equal(needLineWithLedger.coverageStrategyObligationLedger.diagnosticOnly, true);
assert.equal(needLineWithLedger.coverageStrategyObligationLedger.allYearsMatchNeedLine, true);
assert.equal(JSON.stringify(needLineWithLedger.needPoints), JSON.stringify(needLineWithoutLedger.needPoints));
assert.equal(JSON.stringify(needLineWithLedger.componentPoints), JSON.stringify(needLineWithoutLedger.componentPoints));

const buildSnapshot = loadDiagnosticSnapshotBuilder();
const snapshot = buildSnapshot({
  needLine: {
    needPoints: createNeedPoints(),
    componentModels: createComponentModels(),
    coverageStrategyObligationLedger: firstLedger
  },
  resourceLine: {
    resourcePoints: [{ yearIndex: 0, resourceAmount: 100000 }]
  },
  gapSurplus: {
    gapSurplusPoints: [{ yearIndex: 0, remainingExposureAmount: 10000 }]
  },
  chartModel: {
    summary: { yAxisMode: "dollars" }
  }
});
assert.ok(snapshot.coverageStrategyGeneratedOutputs.coverageStrategyObligationLedger);
assert.equal(
  snapshot.coverageStrategyGeneratedOutputs.coverageStrategyObligationLedger.ledgerDrivesNeedLine,
  false
);
assert.equal(
  snapshot.coverageStrategyGeneratedOutputs.coverageStrategyObligationLedger.diagnosticOnly,
  true
);
assert.equal(
  snapshot.coverageStrategyGeneratedOutputs.coverageStrategyObligationLedger.allYearsMatchNeedLine,
  true
);
