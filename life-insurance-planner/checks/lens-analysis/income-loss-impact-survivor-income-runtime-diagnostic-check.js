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
  const startDelayMonths = 3;
  let endingResources = startingResources;
  const points = [];

  for (let monthIndex = 1; monthIndex <= 12; monthIndex += 1) {
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

function createHarness() {
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
          survivorIncomeStartDelayMonths: 3
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
      survivorIncomeStartDelayMonths: 3,
      survivorIncomeDerivation: {
        survivorIncomeSource: "derived-from-spouse-income",
        includeSurvivorIncomeOffset: true,
        rawSpouseIncome: 120000,
        survivorIncomeDerivedFromSpouseIncome: true,
        survivorContinuesWorking: true,
        expectedSurvivorWorkReductionPercent: 25,
        adjustedSurvivorGrossIncome: 90000,
        survivorNetAnnualIncomePrepared: 90000,
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
            return {
              status: "complete",
              scenarioId: includeSurvivorIncome ? "included-survivor-income" : "excluded-survivor-income",
              scenario: {
                selectedDeathAge: input.selectedDeathAge,
                selectedDeathDate: input.selectedDeathDate,
                projectionHorizonMonths: input.projectionHorizonMonths
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
              dataGaps: []
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
            const points = (input.scenario?.postDeathSeries?.points || []).map(function (point) {
              return {
                value: point.endingResources,
                endingResources: point.endingResources,
                availableResources: point.availableResources,
                monthIndex: point.monthIndex
              };
            });
            return {
              status: "complete",
              series: {
                postDeathResources: points
              },
              trace: {
                selectedAppliedScenarioPathId: "postDeathResources"
              },
              dataGaps: [],
              warnings: []
            };
          }
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
assert.equal(snapshot.survivorScenario.survivorNetAnnualIncome, 90000);
assert.equal(snapshot.survivorScenario.survivorIncomeStartDelayMonths, 3);
assert.equal(snapshot.survivorScenario.survivorSupportSettingsSource, "profileRecord.analysisSettings");
assert.equal(
  snapshot.survivorScenario.survivorSupportAssumptionsSourcePath,
  "profileRecord.analysisSettings.survivorSupportAssumptions"
);

assert.equal(snapshot.included.rawBaselineFirstPoints[0].survivorIncome, 0, "month 1 can be zero before the start delay.");
assert.equal(snapshot.included.rawBaselineFirstPoints[2].survivorIncome, 0, "month 3 can still be zero with a 3-month delay.");
assert.equal(snapshot.included.rawBaselineFirstPoints[3].survivorIncome, 7500, "month 4 should show survivor income after the delay.");
assert.equal(snapshot.excluded.rawBaselineFirstPoints[3].survivorIncome, 0, "excluded scenario should have no survivor income.");
assert.equal(snapshot.included.rawBaselineFirstPoints[3].netUse, 1500);
assert.equal(snapshot.excluded.rawBaselineFirstPoints[3].netUse, 9000);
assert.notEqual(snapshot.included.rawBaselineDepletionMonth, snapshot.excluded.rawBaselineDepletionMonth);
assert.equal(snapshot.conclusions.survivorNetAnnualIncomePositive, true);
assert.equal(snapshot.conclusions.includedScenarioHasSurvivorIncomeAfterDelay, true);
assert.equal(snapshot.conclusions.excludedScenarioHasSurvivorIncome, false);
assert.equal(snapshot.conclusions.includedExcludedDiffer, true);
assert.equal(snapshot.conclusions.graphLineValuesDiffer, true);
assert.equal(snapshot.included.graph.firstPointValue, 111000);
assert.notEqual(snapshot.included.graph.lastPointValue, snapshot.excluded.graph.lastPointValue);
assert.ok(harness.composerCalls.some(function (call) {
  return call.scenarioOptions?.includeSurvivorIncome === true;
}));
assert.ok(harness.composerCalls.some(function (call) {
  return call.scenarioOptions?.includeSurvivorIncome === false;
}));

console.log("income-loss-impact-survivor-income-runtime-diagnostic-check passed");
