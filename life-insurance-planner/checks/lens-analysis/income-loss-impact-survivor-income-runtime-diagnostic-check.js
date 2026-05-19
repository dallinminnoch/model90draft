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

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function createClassList() {
  const values = new Set();
  return {
    add(name) {
      values.add(name);
    },
    remove(name) {
      values.delete(name);
    },
    toggle(name, force) {
      const shouldAdd = force == null ? !values.has(name) : Boolean(force);
      if (shouldAdd) {
        values.add(name);
      } else {
        values.delete(name);
      }
      return shouldAdd;
    },
    contains(name) {
      return values.has(name);
    }
  };
}

function createElement(initial = {}) {
  const listeners = {};
  return {
    hidden: Boolean(initial.hidden),
    disabled: Boolean(initial.disabled),
    innerHTML: initial.innerHTML || "",
    textContent: initial.textContent || "",
    min: initial.min || "",
    max: initial.max || "",
    step: initial.step || "",
    value: initial.value || "",
    checked: Boolean(initial.checked),
    attributes: Object.assign({}, initial.attributes || {}),
    children: Object.assign({}, initial.children || {}),
    selectorResults: Object.assign({}, initial.selectorResults || {}),
    classList: createClassList(),
    listeners,
    setAttribute(name, value) {
      this.attributes[name] = String(value);
    },
    getAttribute(name) {
      return Object.prototype.hasOwnProperty.call(this.attributes, name)
        ? this.attributes[name]
        : null;
    },
    addEventListener(eventName, callback) {
      listeners[eventName] = callback;
    },
    matches(selector) {
      if (selector === "[data-income-impact-scenario-select]") {
        return this.getAttribute("data-income-impact-scenario-select") != null;
      }
      return false;
    },
    closest(selector) {
      return this.matches(selector) ? this : null;
    },
    querySelector(selector) {
      return this.children[selector] || null;
    },
    querySelectorAll(selector) {
      return this.selectorResults[selector] || [];
    }
  };
}

function makePostDeathSeries(includeSurvivorIncome) {
  const startingResources = 120000;
  const survivorNeeds = 9000;
  const monthlySurvivorIncome = includeSurvivorIncome ? 7500 : 0;
  const startDelayMonths = 12;
  let endingResources = startingResources;
  const points = [];

  for (let monthIndex = 1; monthIndex <= 30; monthIndex += 1) {
    const survivorIncome = includeSurvivorIncome && monthIndex > startDelayMonths
      ? monthlySurvivorIncome
      : 0;
    const netUse = survivorNeeds - survivorIncome;
    endingResources = Math.round((endingResources - netUse) * 100) / 100;
    points.push({
      date: `2026-${String(monthIndex).padStart(2, "0")}-01`,
      monthIndex,
      survivorIncome,
      survivorNeeds,
      scheduledObligations: 0,
      netUse,
      endingResources,
      availableResources: Math.max(0, endingResources)
    });
  }

  return {
    points,
    depletion: {
      depleted: endingResources <= 0,
      depletionMonthIndex: includeSurvivorIncome ? 20 : 14,
      monthsCovered: includeSurvivorIncome ? 20 : 14,
      precision: "monthly"
    }
  };
}

function makeLifestyleComparisonScenario(input) {
  const basePoints = Array.isArray(input?.basePostDeathSeries?.points) ? input.basePostDeathSeries.points : [];
  let endingResources = 120000;
  const points = basePoints.map(function (point) {
    const survivorIncome = point.survivorIncome || 0;
    const survivorNeeds = (point.survivorNeeds || 0) + 1000;
    const netUse = survivorNeeds - survivorIncome;
    endingResources = Math.round((endingResources - netUse) * 100) / 100;
    return {
      date: point.date,
      monthIndex: point.monthIndex,
      survivorIncome,
      survivorNeeds,
      scheduledObligations: point.scheduledObligations || 0,
      netUse,
      endingResources,
      availableResources: Math.max(0, endingResources)
    };
  });
  return {
    status: "complete",
    sliderValue: input?.sliderValue ?? 0,
    monthlyDelta: 1000,
    comparisonScenario: {
      scenarioId: "diagnostic-lifestyle-comparison",
      kind: "lifestyleComparison",
      label: "Diagnostic lifestyle comparison",
      postDeathSeries: {
        points,
        depletion: {
          depleted: false,
          depletionMonthIndex: null,
          monthsCovered: points.length,
          precision: "monthly"
        }
      },
      trace: {
        monthlyDelta: 1000,
        graphMonthlyDelta: 1000
      }
    }
  };
}

function createHarness(options = {}) {
  const displaySource = readRepoFile("app/features/lens-analysis/income-loss-impact-display.js");
  const composerCalls = [];
  const graphModelCalls = [];
  const profileRecord = {
    id: "runtime-diagnostic-profile",
    caseRef: "CL/DIAG",
    displayName: "Runtime Diagnostic Profile",
    analysisSettings: {
      valuationDate: "2026-01-01",
      survivorSupportAssumptions: {
        survivorIncomeTreatment: {
          includeSurvivorIncome: true,
          applyStartDelay: true
        },
        survivorScenario: {
          survivorContinuesWorking: true,
          expectedSurvivorWorkReductionPercent: 25,
          survivorIncomeStartDelayMonths: 12
        },
        supportTreatment: {
          transitionPeriodMonths: 7
        }
      }
    },
    protectionModeling: {
      data: {
        grossAnnualIncome: 160000,
        spouseIncome: 120000
      }
    }
  };
  const lensModel = {
    profileFacts: {
      clientDateOfBirth: "1981-01-01"
    },
    survivorScenario: {
      survivorNetAnnualIncome: 90000,
      survivorIncomeStartDelayMonths: 12,
      survivorIncomeDerivation: {
        survivorIncomeSource: "derived-from-spouse-income",
        includeSurvivorIncomeOffset: true,
        rawSpouseIncome: 120000,
        survivorIncomeDerivedFromSpouseIncome: true,
        survivorContinuesWorking: true,
        expectedSurvivorWorkReductionPercent: 25,
        adjustedSurvivorGrossIncome: 90000,
        survivorNetAnnualIncomePrepared: 90000,
        survivorIncomeStartDelayMonths: 12,
        survivorSupportSettingsSource: "profileRecord.analysisSettings",
        survivorSupportAssumptionsSourcePath: "profileRecord.analysisSettings.survivorSupportAssumptions"
      }
    }
  };

  const host = createElement();
  const toggle = createElement({ attributes: { "aria-expanded": "true" }, textContent: "Hide controls" });
  const content = createElement();
  const mortgageTreatment = createElement({ value: "followAssumptions" });
  const mortgageTreatmentValue = createElement();
  const survivorIncome = createElement({ checked: true });
  const survivorIncomeValue = createElement();
  const lifestyleSlider = createElement({ value: "0" });
  const lifestyleValue = createElement();
  const reevaluateButton = createElement();
  const reevaluateControl = createElement();
  const reevaluateAction = createElement();
  const draftStatus = createElement();
  const selectedScenarioChip = createElement();
  const selectedScenarioLabel = createElement();
  const scenarioSummary = createElement();
  const banner = createElement({
    children: {
      "[data-income-impact-scenario-toggle]": toggle,
      "[data-income-impact-scenario-content]": content,
      "[data-income-impact-mortgage-treatment]": mortgageTreatment,
      "[data-income-impact-mortgage-treatment-value]": mortgageTreatmentValue,
      "[data-income-impact-survivor-income]": survivorIncome,
      "[data-income-impact-survivor-income-value]": survivorIncomeValue,
      "[data-income-impact-lifestyle-slider]": lifestyleSlider,
      "[data-income-impact-lifestyle-value]": lifestyleValue,
      "[data-income-impact-reevaluate]": reevaluateButton,
      "[data-income-impact-reevaluate-control]": reevaluateControl,
      "[data-income-impact-reevaluate-action]": reevaluateAction,
      "[data-income-impact-draft-status]": draftStatus,
      "[data-income-impact-selected-scenario-chip]": selectedScenarioChip,
      "[data-income-impact-selected-scenario-label]": selectedScenarioLabel,
      "[data-income-impact-scenario-summary]": scenarioSummary
    }
  });
  const sliderRow = createElement();
  const slider = createElement();
  const warning = createElement();
  const deathAgeControl = createElement({
    children: {
      "[data-income-impact-death-age-slider-row]": sliderRow,
      "[data-income-impact-death-age-slider]": slider,
      "[data-income-impact-death-age-warning]": warning
    }
  });
  const ageValue = createElement();
  const dateValue = createElement();
  let readyCallback = null;
  const document = {
    querySelector(selector) {
      if (selector === "[data-income-impact-display]") {
        return host;
      }
      if (selector === "[data-income-impact-scenario-banner]") {
        return banner;
      }
      if (selector === "[data-income-impact-death-age-control]") {
        return deathAgeControl;
      }
      if (selector === "[data-income-impact-death-age-value]") {
        return ageValue;
      }
      if (selector === "[data-income-impact-death-date-value]") {
        return dateValue;
      }
      return null;
    },
    querySelectorAll() {
      return [];
    },
    addEventListener(eventName, callback) {
      if (eventName === "DOMContentLoaded") {
        readyCallback = callback;
      }
    }
  };
  const sandbox = {
    console,
    document,
    Intl,
    URL,
    URLSearchParams,
    window: {
      document,
      location: {
        search: "?caseRef=CL%2FDIAG&profileId=runtime-diagnostic-profile",
        href: "http://127.0.0.1/pages/income-loss-impact.html?caseRef=CL%2FDIAG&profileId=runtime-diagnostic-profile"
      },
      localStorage: {},
      sessionStorage: {},
      LensApp: {
        clientRecords: {
          getCurrentLinkedRecord() {
            return profileRecord;
          },
          getClientRecordByReference() {
            return profileRecord;
          }
        },
        lensAnalysis: {
          buildLensModelFromSavedProtectionModeling(input) {
            assert.equal(input.analysisSettings, profileRecord.analysisSettings);
            return {
              lensModel: cloneJson(lensModel),
              warnings: []
            };
          },
          composeIncomeImpactScenario(input) {
            composerCalls.push(cloneJson(input));
            const includeSurvivorIncome = input.scenarioOptions?.includeSurvivorIncome !== false;
            const postDeathSeries = makePostDeathSeries(includeSurvivorIncome);
            const transitionPeriodMonths = input.analysisSettings?.survivorSupportAssumptions?.supportTreatment?.transitionPeriodMonths ?? 3;
            return {
              status: "complete",
              scenarioId: includeSurvivorIncome ? "included-survivor-income" : "excluded-survivor-income",
              scenario: {
                selectedDeathAge: input.selectedDeathAge,
                selectedDeathDate: input.selectedDeathDate,
                projectionHorizonMonths: input.projectionHorizonMonths,
                transitionPeriod: {
                  lengthMonths: transitionPeriodMonths,
                  sourcePath: "analysisSettings.survivorSupportAssumptions.supportTreatment.transitionPeriodMonths",
                  bridgeMode: "flatBridge",
                  cashFlowMode: "not-modeled-v1",
                  shiftsRunwayVisually: true
                }
              },
              postDeathSeries,
              timelineFacts: {
                resourcesAfterObligations: 120000,
                monthsCovered: postDeathSeries.depletion.monthsCovered,
                depletionDate: null
              },
              deathEvent: {
                resourcesAfterObligations: 120000,
                layer2: {
                  resources: {
                    totalResourcesBeforeObligations: 120000
                  }
                }
              },
              warnings: [],
              dataGaps: [],
              trace: {
                layer3: {
                  transitionPeriod: {
                    lengthMonths: transitionPeriodMonths,
                    source: "analysis-settings",
                    sourcePath: "analysisSettings.survivorSupportAssumptions.supportTreatment.transitionPeriodMonths",
                    bridgeMode: "flatBridge",
                    cashFlowMode: "not-modeled-v1",
                    noFinancialCalculationChanged: true
                  }
                }
              }
            };
          },
          evaluateIncomeImpactRiskEvents() {
            return {
              status: "complete",
              events: [],
              dataGaps: [],
              warnings: []
            };
          },
          buildIncomeImpactTimelineGraphModel(input) {
            graphModelCalls.push(cloneJson(input));
            const transitionPeriodMonths = input.scenario?.scenario?.transitionPeriod?.lengthMonths || 0;
            const projectionMonths = 30 + transitionPeriodMonths;
            const yDomainMax = 120000;
            function toGraphPoint(point) {
              const rawMonthIndex = point.monthIndex;
              const visualMonthIndex = transitionPeriodMonths + rawMonthIndex;
              return {
                value: point.endingResources,
                endingResources: point.endingResources,
                availableResources: point.availableResources,
                monthIndex: rawMonthIndex,
                rawMonthIndex,
                visualMonthIndex,
                transitionPeriodMonths,
                transitionBridgeMode: "flatBridge",
                xRatio: rawMonthIndex / Math.max(projectionMonths, 1),
                yRatio: Math.max(0, Math.min(1, 1 - (point.endingResources / yDomainMax)))
              };
            }
            const transitionBridgePoints = transitionPeriodMonths > 0
              ? [
                  {
                    value: 120000,
                    endingResources: 120000,
                    availableResources: 120000,
                    monthIndex: 0,
                    rawMonthIndex: 0,
                    visualMonthIndex: 0,
                    transitionPeriodMonths,
                    transitionBridge: true,
                    transitionBridgeMode: "flatBridge",
                    phase: "deathEvent",
                    xRatio: 0,
                    yRatio: 0
                  },
                  {
                    value: 120000,
                    endingResources: 120000,
                    availableResources: 120000,
                    monthIndex: 0,
                    rawMonthIndex: 0,
                    visualMonthIndex: transitionPeriodMonths,
                    transitionPeriodMonths,
                    transitionBridge: true,
                    transitionBridgeMode: "flatBridge",
                    xRatio: transitionPeriodMonths / Math.max(projectionMonths, 1),
                    yRatio: 0
                  }
                ]
              : [];
            const points = (input.scenario?.postDeathSeries?.points || []).map(function (point) {
              return toGraphPoint(point);
            });
            const comparisonPostDeathResources = (input.comparisonScenarios || []).map(function (scenario) {
              return {
                scenarioId: scenario.scenarioId,
                pathId: scenario.pathId || scenario.graphPathId || "diagnostic-lifestyle-comparison-path",
                label: scenario.label,
                points: (scenario.postDeathSeries?.points || []).map(function (point) {
                  return toGraphPoint(point);
                })
              };
            });
            return {
              status: "complete",
              transitionPeriod: {
                lengthMonths: transitionPeriodMonths,
                bridgeMode: "flatBridge",
                cashFlowMode: "not-modeled-v1",
                visualOnly: true,
                noFinancialCalculationChanged: true
              },
              layoutFrame: {
                mode: "stableRunoutAnchoredFrame",
                plotLeft: 74,
                plotRight: 958,
                plotTop: 36,
                plotBottom: 354,
                deathXRatio: 0.125,
                zeroYRatio: 0.72,
                runoutAnchorXRatio: 0.8,
                negativeSupportBandRatio: 0.28,
                xDomainMonths: projectionMonths,
                yDomain: {
                  min: -60000,
                  max: yDomainMax
                },
                zeroCrossingAnchorScenarioId: input.scenario?.scenarioId || null,
                zeroCrossingAnchorMonth: transitionPeriodMonths + (input.scenario?.postDeathSeries?.depletion?.depletionMonthIndex || 20),
                zeroCrossingAnchorSource: "selected-scenario"
              },
              series: {
                postDeathResources: points,
                transitionBridge: transitionBridgePoints,
                comparisonPostDeathResources,
                appliedRunwayScenarios: [
                  {
                    scenarioId: input.scenario?.scenarioId || "diagnostic-current",
                    pathId: "postDeathResources",
                    label: "Current rendered scenario",
                    selected: true,
                    pathMode: "linear",
                    fundedRunwayPoints: transitionBridgePoints.concat(points)
                  }
                ].concat(comparisonPostDeathResources.map(function (scenario) {
                  return {
                    scenarioId: scenario.scenarioId,
                    pathId: scenario.pathId,
                    label: scenario.label,
                    selected: false,
                    pathMode: "linear",
                    fundedRunwayPoints: transitionBridgePoints.concat(scenario.points)
                  };
                }))
              },
              trace: {
                selectedAppliedScenarioPathId: "postDeathResources",
                renderedAppliedScenarioCount: comparisonPostDeathResources.length + 1,
                appliedScenarioPathsEnabled: true,
                comparisonScenariosEnabled: comparisonPostDeathResources.length > 0,
                comparisonScenarioCount: comparisonPostDeathResources.length
              },
              dataGaps: [],
              warnings: []
            };
          },
          incomeImpactLifestyleScenarioCalculations: options.lifestyleComparison
            ? {
                calculateIncomeImpactLifestyleScenario: makeLifestyleComparisonScenario
              }
            : null
        }
      }
    }
  };
  sandbox.globalThis = sandbox;
  sandbox.window.window = sandbox.window;
  vm.createContext(sandbox);
  vm.runInContext(displaySource, sandbox, {
    filename: "income-loss-impact-display.js"
  });

  return {
    readyCallback,
    composerCalls,
    graphModelCalls,
    debug: sandbox.window.__MODEL90_INCOME_IMPACT_DEBUG__,
    displayApi: sandbox.window.LensApp.lensAnalysis.incomeLossImpactDisplay
  };
}

const displaySource = readRepoFile("app/features/lens-analysis/income-loss-impact-display.js");
assert.match(displaySource, /__MODEL90_INCOME_IMPACT_DEBUG__/);
assert.match(displaySource, /getSurvivorIncomeSnapshot/);
assert.match(displaySource, /buildSurvivorDiagnosticScenarioSummary/);

const harness = createHarness();
assert.equal(typeof harness.readyCallback, "function", "display should register DOMContentLoaded.");
assert.equal(typeof harness.debug.getSurvivorIncomeSnapshot, "function", "window debug snapshot should exist.");
assert.equal(typeof harness.displayApi.getSurvivorIncomeSnapshot, "function", "display API snapshot should exist.");

harness.readyCallback();
const snapshot = harness.debug.getSurvivorIncomeSnapshot();

assert.equal(snapshot.status, "ready");
assert.equal(snapshot.linkedProfile.id, "runtime-diagnostic-profile");
assert.equal(snapshot.linkedProfile.name, "Runtime Diagnostic Profile");
assert.equal(snapshot.linkedProfile.caseRef, "CL/DIAG");
assert.equal(snapshot.analysisSettings.source, "profileRecord.analysisSettings");
assert.equal(snapshot.analysisSettings.transitionPeriodMonths, 7);
assert.equal(snapshot.survivorScenario.survivorNetAnnualIncome, 90000);
assert.equal(snapshot.survivorScenario.survivorIncomeStartDelayMonths, 12);
assert.equal(snapshot.survivorScenario.survivorSupportSettingsSource, "profileRecord.analysisSettings");
assert.equal(
  snapshot.survivorScenario.survivorSupportAssumptionsSourcePath,
  "profileRecord.analysisSettings.survivorSupportAssumptions"
);

assert.equal(snapshot.included.rawBaselineFirstPoints[0].survivorIncome, 0, "month 1 can be zero before the start delay.");
assert.equal(snapshot.included.rawBaselineFirstPoints[7].survivorIncome, 0, "first 8 points can all be zero with a 12-month delay.");
assert.equal(snapshot.included.rawBaselineFullPointCount, 30);
assert.equal(snapshot.included.rawBaselinePointsSample.length, 24);
assert.ok(
  snapshot.included.rawBaselinePointsAroundDelay.some(function (point) {
    return point.monthIndex === 13 && point.survivorIncome === 7500;
  }),
  "pointsAroundDelay should expose survivor income after a 12-month delay."
);
assert.equal(snapshot.excluded.rawBaselinePointsAroundDelay.find((point) => point.monthIndex === 13).survivorIncome, 0);
assert.equal(snapshot.included.rawBaselinePointsAroundDelay.find((point) => point.monthIndex === 13).netUse, 1500);
assert.equal(snapshot.excluded.rawBaselinePointsAroundDelay.find((point) => point.monthIndex === 13).netUse, 9000);
assert.equal(snapshot.currentRendered.rawBaselineFullPointCount, 30);
assert.ok(snapshot.currentRendered.rawBaselinePointsAroundDelay.some((point) => point.monthIndex === 13));
assert.equal(snapshot.currentRendered.transitionPeriod.lengthMonths, 7);
assert.equal(snapshot.currentRendered.transitionPeriod.bridgeMode, "flatBridge");
assert.equal(snapshot.currentRendered.transitionPeriod.cashFlowMode, "not-modeled-v1");
assert.equal(snapshot.currentRendered.transitionPeriod.noFinancialCalculationChanged, true);
assert.equal(snapshot.currentRendered.graph.transitionPeriod.lengthMonths, 7);
assert.equal(snapshot.currentRendered.graph.primaryRenderSource, "appliedRunwayScenarios.fundedRunwayPoints");
assert.equal(snapshot.currentRendered.graph.primaryPathId, "postDeathResources");
assert.match(snapshot.currentRendered.graph.primaryPathD, /^M/);
assert.equal(snapshot.currentRendered.graph.transitionBridgeVisible, true);
assert.equal(snapshot.currentRendered.graph.transitionBridgeSource, "series.transitionBridge");
assert.ok(snapshot.currentRendered.graph.transitionBridgeEndX > snapshot.currentRendered.graph.transitionBridgeStartX);
assert.equal(snapshot.currentRendered.graph.firstRenderedGraphPoints[0].transitionBridge, true);
assert.equal(snapshot.currentRendered.graph.firstRenderedGraphPoints[0].visualMonthIndex, 0);
assert.equal(snapshot.currentRendered.graph.firstRenderedGraphPoints[1].transitionBridge, true);
assert.equal(snapshot.currentRendered.graph.firstRenderedGraphPoints[1].visualMonthIndex, 7);
assert.equal(snapshot.currentRendered.graph.firstRenderedGraphPoints[2].rawMonthIndex, 1);
assert.equal(snapshot.currentRendered.graph.firstRenderedGraphPoints[2].visualMonthIndex, 8);
assert.equal(typeof snapshot.currentRendered.graph.firstRenderedGraphPoints[2].x, "number");
assert.equal(typeof snapshot.currentRendered.graph.firstRenderedGraphPoints[2].y, "number");
assert.notEqual(snapshot.included.rawBaselineDepletionMonth, snapshot.excluded.rawBaselineDepletionMonth);
assert.equal(snapshot.conclusions.survivorNetAnnualIncomePositive, true);
assert.equal(snapshot.conclusions.includedScenarioHasSurvivorIncomeAfterDelay, true);
assert.equal(snapshot.conclusions.excludedScenarioHasSurvivorIncome, false);
assert.equal(snapshot.conclusions.diagnosticPointWindowCoversSurvivorDelay, true);
assert.equal(snapshot.conclusions.includedExcludedDiffer, true);
assert.equal(snapshot.conclusions.graphLineValuesDiffer, true);
assert.equal(snapshot.conclusions.lifestyleComparisonActive, false);
assert.equal(snapshot.conclusions.lifestyleComparisonHasSurvivorIncomeAfterDelay, false);
assert.equal(snapshot.conclusions.lifestyleComparisonLineDiffersFromPrimary, false);
assert.deepEqual(Array.from(snapshot.currentRendered.comparisonScenarioIds), []);
assert.equal(snapshot.currentRendered.lifestyleComparison.active, false);
assert.equal(snapshot.lifestyleComparison.active, false);
assert.deepEqual(Array.from(snapshot.included.graph.comparisonScenarioIds), []);
assert.equal(snapshot.included.graph.firstPointValue, 120000);
assert.notEqual(snapshot.included.graph.lastPointValue, snapshot.excluded.graph.lastPointValue);
assert.ok(harness.composerCalls.some(function (call) {
  return call.scenarioOptions?.includeSurvivorIncome === true;
}));
assert.ok(harness.composerCalls.some(function (call) {
  return call.scenarioOptions?.includeSurvivorIncome === false;
}));
assert.ok(harness.composerCalls.every(function (call) {
  return call.analysisSettings?.survivorSupportAssumptions?.supportTreatment?.transitionPeriodMonths === 7;
}));

const incomeLossImpactDisplaySource = readRepoFile("app/features/lens-analysis/income-loss-impact-display.js");
assert.match(incomeLossImpactDisplaySource, /resolveAnalysisSettingsTransitionPeriodMonths/);
assert.match(incomeLossImpactDisplaySource, /transitionPeriodMonths:\s*controls\.transitionPeriodMonths/);
assert.match(incomeLossImpactDisplaySource, /transitionPeriodMonths:\s*clampTransitionPeriodMonths\(safeSettings\.transitionPeriodMonths\)/);
assert.match(incomeLossImpactDisplaySource, /transitionPeriod:\s*summarizeScenarioTransitionPeriod\(scenario\)/);

const lifestyleHarness = createHarness({ lifestyleComparison: true });
lifestyleHarness.readyCallback();
const lifestyleSnapshot = lifestyleHarness.debug.getSurvivorIncomeSnapshot();

assert.equal(lifestyleSnapshot.conclusions.lifestyleComparisonActive, true);
assert.equal(lifestyleSnapshot.conclusions.lifestyleComparisonHasSurvivorIncomeAfterDelay, true);
assert.equal(lifestyleSnapshot.conclusions.lifestyleComparisonLineDiffersFromPrimary, true);
assert.deepEqual(Array.from(lifestyleSnapshot.currentRendered.comparisonScenarioIds), ["diagnostic-lifestyle-comparison"]);
assert.equal(lifestyleSnapshot.currentRendered.lifestyleComparison.active, true);
assert.equal(lifestyleSnapshot.currentRendered.lifestyleComparison.scenarioId, "diagnostic-lifestyle-comparison");
assert.equal(lifestyleSnapshot.lifestyleComparison.active, true);
assert.equal(lifestyleSnapshot.lifestyleComparison.scenarioId, "diagnostic-lifestyle-comparison");
assert.equal(lifestyleSnapshot.lifestyleComparison.hasSurvivorIncomeAfterDelay, true);
assert.equal(lifestyleSnapshot.lifestyleComparison.lineValuesDifferFromPrimary, true);
assert.ok(
  lifestyleSnapshot.lifestyleComparison.pointsAroundDelay.some(function (point) {
    return point.monthIndex === 13 && point.survivorIncome === 7500;
  }),
  "Lifestyle comparison should preserve survivor income after the delay when included."
);
assert.equal(
  lifestyleSnapshot.currentRendered.lifestyleComparison.pointsAroundDelay.find((point) => point.monthIndex === 13).netUse,
  2500,
  "Lifestyle comparison netUse should reflect adjusted needs minus survivor income."
);
assert.equal(lifestyleSnapshot.currentRendered.lifestyleComparison.lineValuesDifferFromPrimary, true);
assert.deepEqual(Array.from(lifestyleSnapshot.currentRendered.graph.comparisonScenarioIds), ["diagnostic-lifestyle-comparison"]);
assert.equal(lifestyleSnapshot.currentRendered.graph.comparisonScenarios[0].lineValuesDifferFromPrimary, true);

assert.ok(
  lifestyleSnapshot.excluded.lifestyleComparison.pointsAroundDelay.every(function (point) {
    return (point.survivorIncome || 0) === 0;
  }),
  "Lifestyle comparison should remove survivor income when survivor income is excluded."
);
assert.equal(lifestyleSnapshot.excluded.lifestyleComparison.hasSurvivorIncomeAfterDelay, false);
assert.equal(
  lifestyleSnapshot.excluded.lifestyleComparison.pointsAroundDelay.find((point) => point.monthIndex === 13).netUse,
  10000,
  "Excluded lifestyle comparison netUse should include adjusted needs without survivor income."
);

console.log("income-loss-impact-survivor-income-runtime-diagnostic-check passed");
