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

assert.match(controllerSource, /Export Diagnostic Report/);
assert.doesNotMatch(controllerSource, /Export Diagnostic PDF/);
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
assert.match(controllerSource, /coverage-strategy-scenario-footer/);
assert.doesNotMatch(controllerSource, /coverage-strategy-scenario-control is-diagnostic-export/);
assert.doesNotMatch(stylesSource, /coverage-strategy-diagnostic-export|coverage-strategy-scenario-control\.is-diagnostic-export/);

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
  coverageStrategyScenarioSettings: {
    version: 1,
    source: "runtimeScenarioSettings",
    persisted: false,
    persistenceStatus: "runtime-default-resolved",
    visibleControlsAdded: false,
    controlsVisible: false,
    education: {
      educationTreatmentMode: "planAsUnfundedNeed",
      educationPaymentScheduleMode: "lumpSumAtStart",
      useEducationSavingsOffset: true,
      educationResourceSpendingMode: "off",
      projectedDependentTimingMode: "untimedKeepThroughHorizon",
      projectedDependentTimingRows: [
        {
          id: "projected-dependent-1",
          label: "Projected dependent 1",
          expectedBirthYear: 2026,
          rawExpectedBirthYear: "2026",
          validationStatus: "valid"
        }
      ]
    },
    trace: {
      fieldSources: {
        "education.useEducationSavingsOffset": "runtimeScenarioSettings.education.useEducationSavingsOffset",
        "education.educationPaymentScheduleMode": "runtimeScenarioSettings.education.educationPaymentScheduleMode"
      },
      visibleControlsAdded: false
    }
  },
  visibleScenarioControls: {
    projectionHorizon: true,
    educationResourceSpendingMode: true,
    educationResourceSpending: true,
    educationPaymentScheduleMode: true,
    educationPaymentSchedule: true,
    projectedDependentBirthYear: true,
    diagnosticExport: true
  },
  needLine: {
    valuationDate: "2026-01-01",
    needPoints: [{ yearIndex: 0, grossNeedAmount: 1000000 }],
    componentModels: {
      mortgageLifetimeProjection: { assumptionsUsed: { projectionMode: "amortized" } },
      debtLifetimeProjection: { assumptionsUsed: { projectionModeCounts: { amortized: 1 } } },
      education: {
        lifetimeProjection: {
          status: "complete",
          aggregateFallbackUsed: false,
          assumptionsUsed: {
            educationTreatmentMode: "planAsUnfundedNeed",
            effectiveEducationTreatmentMode: "scheduleRemainingNeed",
            educationPaymentScheduleMode: "lumpSumAtStart",
            educationResourceSpendingMode: "eligibleResourcesAfterEducationSavings",
            effectiveEducationResourceSpendingMode: "eligibleResourcesAfterEducationSavings",
            paymentYearCount: 1,
            resourceSpendingApplied: false,
            generalResourceReductionApplied: false
          },
          educationTreatment: {
            selectedMode: "planAsUnfundedNeed",
            effectiveMode: "scheduleRemainingNeed",
            needLineTreatment: "scheduled-remaining-need",
            scheduledRemainingNeedApplied: true,
            needDeclineReason: "dependent-schedule-obligations-no-longer-remaining",
            resourceLineReductionApplied: false,
            visibleEducationTreatmentControl: false
          },
          educationResourceSpending: {
            selectedMode: "eligibleResourcesAfterEducationSavings",
            effectiveMode: "eligibleResourcesAfterEducationSavings",
            broaderEligibleResourcesRequested: true,
            broaderEligibleResourceStatus: "unavailable",
            broaderEligibleResourceOffsetApplied: 0,
            generalResourceReductionApplied: false,
            visibleResourceSpendingControl: false
          },
          educationPoints: [{
            yearIndex: 0,
            grossEducationNeedAmount: 60000,
            educationSavingsOffsetAmount: 10000,
            broaderEligibleResourceOffsetAmount: 0,
            netEducationNeedAmount: 50000,
            educationNeedAmount: 50000,
            trace: {
              educationTreatmentMode: "planAsUnfundedNeed",
              effectiveEducationTreatmentMode: "scheduleRemainingNeed",
              visibleEducationTreatmentControl: false,
              educationPaymentScheduleMode: "lumpSumAtStart",
              educationResourceSpendingMode: "eligibleResourcesAfterEducationSavings",
              effectiveEducationResourceSpendingMode: "eligibleResourcesAfterEducationSavings",
              broaderEligibleResourceStatus: "unavailable",
              broaderEligibleResourceOffsetApplied: 0,
              lumpSumAtStartScheduleUsed: true
            }
          }],
          educationSavingsOffset: {
            active: true,
            totalEducationSavingsAvailable: 10000,
            totalEducationSavingsApplied: 10000,
            eligibleEducationSavingsAssets: [{ assetId: "plan-529", categoryKey: "educationSpecificSavings" }],
            excludedEducationSavingsAssets: [],
            resourceReductionApplied: false
          },
          currentDependentSchedules: [{
            id: "child-a",
            educationStartYear: 2032,
            trace: {
              educationPaymentScheduleMode: "lumpSumAtStart"
            },
            payments: [{ paymentYear: 2032, paymentScheduleMode: "lumpSumAtStart" }]
          }],
          projectedDependentSchedules: [],
          untimedProjectedDependents: [{ amount: 20000 }]
        }
      },
      healthcare: {
        lifetimeProjection: {
          status: "complete",
          aggregateFallbackUsed: false,
          healthcarePoints: [{ yearIndex: 0, healthcareNeedAmount: 120000 }],
          includedRecordCount: 2,
          excludedRecordCount: 1,
          supportOwnedHealthcareExpenseExcludedCount: 1,
          healthcareLookingExcludedRecords: [{
            expenseFactId: "expense_record_starter_expense_medicalOutOfPocket",
            typeKey: "medicalOutOfPocket",
            categoryKey: "otherLivingExpense",
            compressionCategoryKey: "ongoingHealthcare",
            exclusionCode: "support-owned-healthcare-expense-excluded",
            exclusionReason: "Healthcare-looking expense is owned by ongoing support through monthlyHealthcareOutOfPocketCost and is excluded from healthcare lifetime projection to avoid double-counting.",
            trace: {
              ownedByField: "monthlyHealthcareOutOfPocketCost",
              sourceOwnedBy: "ongoingSupport",
              overlapRiskWithEssentialSupport: true,
              mathChanged: false
            }
          }],
          excludedRecords: [{
            expenseFactId: "expense_record_starter_expense_medicalOutOfPocket",
            typeKey: "medicalOutOfPocket",
            categoryKey: "otherLivingExpense",
            compressionCategoryKey: "ongoingHealthcare",
            exclusionCode: "support-owned-healthcare-expense-excluded",
            exclusionReason: "Healthcare-looking expense is owned by ongoing support through monthlyHealthcareOutOfPocketCost and is excluded from healthcare lifetime projection to avoid double-counting.",
            trace: {
              ownedByField: "monthlyHealthcareOutOfPocketCost",
              sourceOwnedBy: "ongoingSupport",
              defaultInflationRole: "householdInflation",
              overlapRiskWithEssentialSupport: true,
              mathChanged: false
            }
          }],
          warnings: [{
            code: "support-owned-healthcare-expense-excluded-from-healthcare-lifetime",
            details: {
              sourcePaths: [
                "expenseFacts.expenses",
                "ongoingSupport.monthlyHealthcareOutOfPocketCost",
                "coverageStrategy.healthcareLifetimeProjection"
              ]
            }
          }]
        }
      },
      finalExpenses: {
        lifetimeProjection: {
          status: "complete",
          staticFallbackUsed: false,
          finalExpensePoints: [{ yearIndex: 0, finalExpenseNeedAmount: 25000 }],
          includedRecordCount: 4,
          excludedRecordCount: 2
        }
      }
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
assert.equal(snapshot.exportMetadata.exportFormat, "html");
assert.equal(snapshot.exportMetadata.exportFileType, "html");
assert.equal(snapshot.exportMetadata.temporaryDiagnosticExport, true);
assert.equal(snapshot.exportMetadata.notPdf, true);
assert.match(moduleSource, /coverage-strategy-diagnostic-report\.html/);
assert.doesNotMatch(moduleSource, /coverage-strategy-diagnostic-export\.html|print-to-pdf-opened/);
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
assert.ok(snapshot.analysisSetupAssumptions.coverageStrategyScenarioSettings);
assert.equal(snapshot.analysisSetupAssumptions.coverageStrategyScenarioSettings.education.useEducationSavingsOffset, true);
assert.equal(snapshot.analysisSetupAssumptions.coverageStrategyScenarioSettings.education.educationPaymentScheduleMode, "lumpSumAtStart");
assert.equal(snapshot.analysisSetupAssumptions.coverageStrategyScenarioSettings.visibleControlsAdded, true);
assert.equal(snapshot.analysisSetupAssumptions.coverageStrategyScenarioSettings.controlsVisible, true);
assert.equal(snapshot.analysisSetupAssumptions.coverageStrategyScenarioSettings.trace.visibleControlsAdded, true);
assert.equal(snapshot.analysisSetupAssumptions.coverageStrategyScenarioSettingsTrace.visibleControlsAdded, true);
assert.equal(snapshot.analysisSetupAssumptions.coverageStrategyScenarioSettings.visibleScenarioControls.projectionHorizon, true);
assert.equal(snapshot.analysisSetupAssumptions.coverageStrategyScenarioSettings.visibleScenarioControls.diagnosticExport, true);
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
assert.ok(snapshot.coverageStrategyGeneratedOutputs.educationLifetimeProjection);
assert.equal(snapshot.coverageStrategyGeneratedOutputs.educationLifetimeProjection.aggregateFallbackUsed, false);
assert.ok(snapshot.coverageStrategyGeneratedOutputs.educationSavingsOffset);
assert.equal(snapshot.coverageStrategyGeneratedOutputs.educationSavingsOffset.active, true);
assert.equal(snapshot.coverageStrategyGeneratedOutputs.educationSavingsOffset.resourceReductionApplied, false);
assert.ok(snapshot.coverageStrategyGeneratedOutputs.coverageStrategyScenarioSettings);
assert.equal(snapshot.coverageStrategyGeneratedOutputs.educationScenarioSettingsConsumed.useEducationSavingsOffset, true);
assert.equal(snapshot.coverageStrategyGeneratedOutputs.educationScenarioSettingsConsumed.educationTreatmentMode, "planAsUnfundedNeed");
assert.equal(snapshot.coverageStrategyGeneratedOutputs.educationTreatmentMode, "planAsUnfundedNeed");
assert.equal(snapshot.coverageStrategyGeneratedOutputs.effectiveEducationTreatmentMode, "scheduleRemainingNeed");
assert.equal(snapshot.coverageStrategyGeneratedOutputs.educationTreatment.visibleEducationTreatmentControl, false);
assert.equal(snapshot.coverageStrategyGeneratedOutputs.visibleEducationTreatmentControl, false);
assert.equal(snapshot.coverageStrategyGeneratedOutputs.educationScenarioSettingsConsumed.educationPaymentScheduleMode, "lumpSumAtStart");
assert.equal(snapshot.coverageStrategyGeneratedOutputs.educationPaymentScheduleMode, "lumpSumAtStart");
assert.equal(snapshot.coverageStrategyGeneratedOutputs.educationResourceSpendingMode, "off");
assert.equal(snapshot.coverageStrategyGeneratedOutputs.educationResourceSpending.effectiveMode, "eligibleResourcesAfterEducationSavings");
assert.equal(snapshot.coverageStrategyGeneratedOutputs.educationResourceSpendingTrace.broaderEligibleResourceStatus, "unavailable");
assert.equal(snapshot.coverageStrategyGeneratedOutputs.visibleEducationResourceSpendingControl, true);
assert.equal(snapshot.coverageStrategyGeneratedOutputs.visiblePaymentScheduleControl, true);
assert.equal(
  snapshot.coverageStrategyGeneratedOutputs.educationLifetimeProjection.currentDependentSchedules[0].trace.educationPaymentScheduleMode,
  "lumpSumAtStart"
);
assert.equal(snapshot.coverageStrategyGeneratedOutputs.projectedDependentTimingRowsConsumed[0].expectedBirthYear, 2026);
assert.equal(
  snapshot.coverageStrategyGeneratedOutputs.projectedDependentDefaultTimingMode,
  "untimedKeepThroughHorizon"
);
assert.equal(snapshot.coverageStrategyGeneratedOutputs.projectedDependentRowTimingOverridesApplied, true);
assert.equal(snapshot.coverageStrategyGeneratedOutputs.projectedDependentTimedRowCount, 1);
assert.equal(snapshot.coverageStrategyGeneratedOutputs.projectedDependentUntimedRowCount, 0);
assert.match(
  snapshot.coverageStrategyGeneratedOutputs.projectedDependentTimingMetadata.effectiveProjectedDependentTimingSummary,
  /Default mode keeps untimed projected dependents through the horizon; 1 row-level expected birth year override was applied\./
);
assert.equal(snapshot.coverageStrategyGeneratedOutputs.coverageStrategyVisibleScenarioControlsAdded, true);
assert.equal(snapshot.coverageStrategyGeneratedOutputs.visibleScenarioControls.educationResourceSpendingMode, true);
assert.equal(snapshot.coverageStrategyGeneratedOutputs.visibleScenarioControls.educationResourceSpending, true);
assert.equal(snapshot.coverageStrategyGeneratedOutputs.visibleScenarioControls.educationPaymentScheduleMode, true);
assert.equal(snapshot.coverageStrategyGeneratedOutputs.visibleScenarioControls.educationPaymentSchedule, true);
assert.equal(snapshot.coverageStrategyGeneratedOutputs.visibleScenarioControls.projectedDependentBirthYear, true);
assert.equal(snapshot.coverageStrategyGeneratedOutputs.visibleScenarioControls.projectionHorizon, true);
assert.equal(snapshot.coverageStrategyGeneratedOutputs.visibleScenarioControls.diagnosticExport, true);
assert.equal(snapshot.coverageStrategyGeneratedOutputs.coverageStrategyScenarioSettingsPersistence, "runtime-default-resolved");
assert.ok(snapshot.coverageStrategyGeneratedOutputs.healthcareLifetimeProjection);
assert.equal(snapshot.coverageStrategyGeneratedOutputs.healthcareLifetimeProjection.aggregateFallbackUsed, false);
assert.equal(snapshot.coverageStrategyGeneratedOutputs.healthcareLifetimeProjection.supportOwnedHealthcareExpenseExcludedCount, 1);
assert.equal(
  snapshot.coverageStrategyGeneratedOutputs.healthcareLifetimeProjection.healthcareLookingExcludedRecords[0].exclusionCode,
  "support-owned-healthcare-expense-excluded"
);
assert.equal(
  snapshot.coverageStrategyGeneratedOutputs.healthcareLifetimeProjection.healthcareLookingExcludedRecords[0].trace.ownedByField,
  "monthlyHealthcareOutOfPocketCost"
);
assert.equal(
  snapshot.coverageStrategyGeneratedOutputs.healthcareLifetimeProjection.warnings[0].code,
  "support-owned-healthcare-expense-excluded-from-healthcare-lifetime"
);
assert.ok(snapshot.coverageStrategyGeneratedOutputs.finalExpenseLifetimeProjection);
assert.equal(snapshot.coverageStrategyGeneratedOutputs.finalExpenseLifetimeProjection.staticFallbackUsed, false);

const html = renderHtml(snapshot);
assert.match(html, /Coverage Strategy Diagnostic Report/);
assert.doesNotMatch(html, /Coverage Strategy Diagnostic Export/);
assert.match(html, /A\. Export Metadata/);
assert.match(html, /B\. Profile \/ Household/);
assert.match(html, /C\. PMI \/ Protection Modeling Inputs/);
assert.match(html, /D\. Analysis Setup \/ Assumption Controls/);
assert.match(html, /E\. Lens Model \/ Normalized Facts Snapshot/);
assert.match(html, /F\. Coverage Strategy Generated Outputs/);
assert.match(html, /healthcareLifetimeProjection/);
assert.match(html, /support-owned-healthcare-expense-excluded/);
assert.match(html, /monthlyHealthcareOutOfPocketCost/);
assert.match(html, /educationLifetimeProjection/);
assert.match(html, /educationSavingsOffset/);
assert.match(html, /coverageStrategyScenarioSettings/);
assert.match(html, /educationScenarioSettingsConsumed/);
assert.match(html, /educationTreatmentMode/);
assert.match(html, /scheduleRemainingNeed/);
assert.match(html, /visibleEducationTreatmentControl/);
assert.match(html, /educationPaymentScheduleMode/);
assert.match(html, /lumpSumAtStart/);
assert.match(html, /projectedDependentTimingRowsConsumed/);
assert.match(html, /projectedDependentDefaultTimingMode/);
assert.match(html, /projectedDependentRowTimingOverridesApplied/);
assert.match(html, /effectiveProjectedDependentTimingSummary/);
assert.match(html, /finalExpenseLifetimeProjection/);
assert.match(html, /G\. Checks \/ Version Info/);
assert.match(html, /This diagnostic file may contain personal and financial data/);

assert.doesNotMatch(moduleSource + controllerSource, /proposed coverage|recommendation score|strategy score|\bAI\b/i);

console.log("coverage strategy diagnostic export check passed");
