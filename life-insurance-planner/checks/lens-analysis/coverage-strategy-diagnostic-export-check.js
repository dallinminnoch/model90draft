#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const repoRoot = path.resolve(__dirname, "..", "..");
const modulePath = path.join(
  repoRoot,
  "app",
  "features",
  "lens-analysis",
  "coverage-strategy-diagnostic-export.js"
);
const pagePath = path.join(repoRoot, "pages", "coverage-strategy.html");
const controllerPath = path.join(
  repoRoot,
  "app",
  "features",
  "lens-analysis",
  "coverage-strategy-page.js"
);
const componentsPath = path.join(repoRoot, "components.css");
const stylesPath = path.join(repoRoot, "styles.css");

const moduleSource = fs.readFileSync(modulePath, "utf8");
const pageSource = fs.readFileSync(pagePath, "utf8");
const controllerSource = fs.readFileSync(controllerPath, "utf8");
const componentsSource = fs.readFileSync(componentsPath, "utf8");
const stylesSource = fs.readFileSync(stylesPath, "utf8");

assert.match(moduleSource, /TEMPORARY DIAGNOSTIC EXPORT - safe to remove/);
assert.match(moduleSource, /coverage-strategy-diagnostic-export-v1/);
assert.match(moduleSource, /module\.exports/);
assert.match(moduleSource, /buildCoverageStrategyDiagnosticExportSnapshot/);
assert.match(moduleSource, /exportCoverageStrategyDiagnosticPdf/);
assert.doesNotMatch(moduleSource, /localStorage|sessionStorage|setItem|indexedDB/);
assert.doesNotMatch(moduleSource, /jsPDF|pdfmake|html2pdf|external library/i);

assert.ok(
  pageSource.indexOf("coverage-strategy-diagnostic-export.js")
    < pageSource.indexOf("coverage-strategy-page.js"),
  "Diagnostic export module should load before the Coverage Strategy page controller."
);

assert.match(controllerSource, /Export Diagnostic PDF/);
assert.match(controllerSource, /data-coverage-strategy-diagnostic-export/);
assert.match(controllerSource, /exportCoverageStrategyDiagnosticPdf/);
assert.match(controllerSource, /currentDiagnosticExportContext/);
assert.match(controllerSource, /profileRecord/);
assert.match(controllerSource, /protectionModelingPayload/);
assert.match(controllerSource, /builderResult/);
assert.match(controllerSource, /needsResult/);
assert.match(controllerSource, /needLine/);
assert.match(controllerSource, /resourceLine/);
assert.match(controllerSource, /existingCoverageLine/);
assert.match(controllerSource, /gapSurplus/);
assert.match(controllerSource, /chartModel/);

assert.match(componentsSource, /\.coverage-strategy-diagnostic-export-button\s*\{/);
assert.match(componentsSource, /\.coverage-strategy-scenario-tray-placeholder\.is-diagnostic-export\s*\{/);
assert.doesNotMatch(stylesSource, /coverage-strategy-diagnostic-export|coverage-strategy-scenario-tray-placeholder\.is-diagnostic-export/);

const context = {
  console,
  LensApp: {
    lensAnalysis: {}
  },
  location: {
    href: "http://localhost/pages/coverage-strategy.html"
  }
};
context.globalThis = context;
vm.createContext(context);
vm.runInContext(moduleSource, context, { filename: modulePath });

const buildSnapshot = context.LensApp.lensAnalysis.buildCoverageStrategyDiagnosticExportSnapshot;
const renderHtml = context.LensApp.lensAnalysis.renderCoverageStrategyDiagnosticExportHtml;
assert.equal(typeof buildSnapshot, "function");
assert.equal(typeof renderHtml, "function");

const diagnosticInput = {
  profileRecord: {
    displayName: "Diagnostic Client",
    dateOfBirth: "1986-01-01",
    spouseName: "Diagnostic Spouse",
    spouseDateOfBirth: "1987-06-01",
    dependentDetails: [
      {
        id: "child-a",
        name: "Child A",
        dateOfBirth: "2014-01-01"
      }
    ],
    householdMemberCount: 4,
    analysisSettings: {
      needsSupportDurationYears: 20,
      mortgageTreatment: {
        mode: "payoff"
      },
      debtTreatmentAssumptions: {
        enabled: true
      },
      assetTreatmentAssumptions: {
        enabled: true
      },
      existingCoverageTreatment: {
        includeExistingCoverageOffset: true
      }
    },
    coveragePolicies: [
      {
        policyId: "policy-a",
        type: "term",
        coverageAmount: 500000
      }
    ]
  },
  protectionModelingPayload: {
    savedAt: "2026-05-28T12:00:00.000Z",
    data: {
      grossAnnualIncome: 150000,
      netAnnualIncome: 105000,
      spouseIncome: 80000,
      survivorIncome: 50000,
      expenseRecords: [{ label: "Utilities", amount: 300 }],
      healthcareExpenseRecords: [{ label: "Premium", amount: 400 }],
      debtRecords: [{ debtId: "auto", currentBalance: 12000 }],
      mortgageBalance: 400000,
      assetRecords: [{ label: "Brokerage", value: 100000 }],
      savingsHabitRecords: [{ label: "Monthly savings", amount: 1000 }],
      currentDependentDetails: [{ name: "Child A", dateOfBirth: "2014-01-01" }]
    }
  },
  lensModel: {
    profileFacts: {
      clientDateOfBirth: "1986-01-01"
    },
    debtFacts: {
      debts: [{ debtFactId: "auto", currentBalance: 12000 }]
    },
    treatedDebtPayoff: {
      needs: { nonMortgageDebtAmount: 12000 }
    },
    treatedMortgagePaymentPlan: {
      mode: "payOff"
    },
    resourceProjectionInputs: {
      savingAllocations: [{ targetAssetCategoryKey: "taxableInvestments" }]
    },
    savingsContributionFacts: {
      records: [{ amount: 1000 }]
    },
    educationSupport: {
      currentDependentDetails: [{ id: "child-a", dateOfBirth: "2014-01-01" }]
    }
  },
  methodSettings: {
    needsAnalysisSettings: {
      includeEducationFunding: true
    }
  },
  needsResult: {
    assumptions: {
      valuationDate: "2026-01-01"
    }
  },
  needLine: {
    valuationDate: "2026-01-01",
    needPoints: [{ yearIndex: 0, grossNeedAmount: 1000000 }],
    componentModels: {
      mortgageLifetimeProjection: { assumptionsUsed: { projectionMode: "amortized" } },
      debtLifetimeProjection: { assumptionsUsed: { projectionModeCounts: { amortized: 1 } } }
    },
    warnings: [{ code: "need-warning" }],
    dataGaps: [{ code: "need-gap" }]
  },
  resourceLine: {
    resourcePoints: [{ yearIndex: 0, resourceAmount: 100000 }]
  },
  existingCoverageLine: {
    coveragePoints: [{ yearIndex: 0, existingCoverageAmount: 500000 }],
    layers: [{ id: "policy-a" }]
  },
  gapSurplus: {
    gapSurplusPoints: [{ yearIndex: 0, remainingExposureAmount: 400000 }]
  },
  chartModel: {
    summary: { yAxisMode: "dollars" }
  },
  projectionHorizonYears: 64,
  age110Horizon: {
    horizonYears: 70
  },
  route: "http://localhost/pages/coverage-strategy.html"
};
const inputBefore = JSON.stringify(diagnosticInput);
const snapshot = buildSnapshot(diagnosticInput);
assert.equal(JSON.stringify(diagnosticInput), inputBefore, "Diagnostic export should not mutate calculation data.");

assert.ok(snapshot.exportMetadata);
assert.match(snapshot.exportMetadata.privacyNote, /personal and financial data/i);
assert.equal(snapshot.profileHousehold.client.name, "Diagnostic Client");
assert.equal(snapshot.profileHousehold.client.currentAge, 40);
assert.equal(snapshot.profileHousehold.spouseOrPartner.name, "Diagnostic Spouse");
assert.equal(snapshot.profileHousehold.dependents[0].name, "Child A");
assert.equal(snapshot.pmiProtectionModelingInputs.data.grossAnnualIncome, 150000);
assert.ok(snapshot.pmiProtectionModelingInputs.data.expenseRecords);
assert.ok(snapshot.pmiProtectionModelingInputs.data.debtRecords);
assert.ok(snapshot.pmiProtectionModelingInputs.data.assetRecords);
assert.ok(snapshot.pmiProtectionModelingInputs.data.savingsHabitRecords);
assert.ok(snapshot.analysisSetupAssumptions.savedAnalysisSettings);
assert.ok(snapshot.analysisSetupAssumptions.resolvedMethodSettings);
assert.ok(snapshot.lensModelNormalizedFactsSnapshot.profileFacts);
assert.ok(snapshot.lensModelNormalizedFactsSnapshot.debtFacts);
assert.ok(snapshot.lensModelNormalizedFactsSnapshot.treatedDebtPayoff);
assert.ok(snapshot.lensModelNormalizedFactsSnapshot.treatedMortgagePaymentPlan);
assert.ok(snapshot.lensModelNormalizedFactsSnapshot.resourceProjectionInputs);
assert.ok(snapshot.lensModelNormalizedFactsSnapshot.savingsContributionFacts);
assert.ok(snapshot.coverageStrategyGeneratedOutputs.needPoints);
assert.ok(snapshot.coverageStrategyGeneratedOutputs.resourcePoints);
assert.ok(snapshot.coverageStrategyGeneratedOutputs.existingCoveragePoints);
assert.ok(snapshot.coverageStrategyGeneratedOutputs.gapSurplusPoints);
assert.ok(snapshot.coverageStrategyGeneratedOutputs.chartModelSummary);
assert.ok(snapshot.coverageStrategyGeneratedOutputs.warnings);
assert.ok(snapshot.coverageStrategyGeneratedOutputs.dataGaps);
assert.ok(snapshot.coverageStrategyGeneratedOutputs.mortgageLifetimeProjectionTraces);
assert.ok(snapshot.coverageStrategyGeneratedOutputs.debtLifetimeProjectionTraces);

const html = renderHtml(snapshot);
assert.match(html, /Coverage Strategy Diagnostic Export/);
assert.match(html, /A\. Export Metadata/);
assert.match(html, /B\. Profile \/ Household/);
assert.match(html, /C\. PMI \/ Protection Modeling Inputs/);
assert.match(html, /D\. Analysis Setup \/ Assumption Controls/);
assert.match(html, /E\. Lens Model \/ Normalized Facts Snapshot/);
assert.match(html, /F\. Coverage Strategy Generated Outputs/);
assert.match(html, /G\. Checks \/ Version Info/);
assert.match(html, /This diagnostic file may contain personal and financial data/);

assert.doesNotMatch(moduleSource + controllerSource, /proposed coverage|recommendation score|strategy score|\bAI\b/i);

console.log("coverage strategy diagnostic export check passed");
