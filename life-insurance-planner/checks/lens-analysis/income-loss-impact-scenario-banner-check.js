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

function getSelectedAppliedScenario(state) {
  const scenarios = Array.isArray(state?.appliedScenarios) ? state.appliedScenarios : [];
  return scenarios.find(function (scenario) {
    return scenario?.scenarioId === state?.selectedScenarioId;
  }) || null;
}

function getInitialAppliedScenario(state) {
  const scenarios = Array.isArray(state?.appliedScenarios) ? state.appliedScenarios : [];
  return scenarios.find(function (scenario) {
    return scenario?.scenarioId === "income-impact-current-scenario";
  }) || null;
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
    attributes: Object.assign({}, initial.attributes || {}),
    children: Object.assign({}, initial.children || {}),
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
    querySelector(selector) {
      return this.children[selector] || null;
    },
    querySelectorAll() {
      return [];
    }
  };
}

function createHarness() {
  const displaySource = readRepoFile("app/features/lens-analysis/income-loss-impact-display.js");
  const composerCalls = [];
  const riskEvaluatorCalls = [];
  const graphModelCalls = [];
  const storageWrites = [];
  const profileRecord = {
    id: "scenario-banner-profile",
    caseRef: "CL/90001",
    displayName: "Scenario Banner Profile",
    analysisSettings: {
      valuationDate: "2026-01-01"
    },
    protectionModeling: {
      data: {
        grossAnnualIncome: 120000
      }
    }
  };
  const lensModel = {
    profileFacts: {
      clientDateOfBirth: "1980-06-15"
    },
    assetFacts: {
      assets: []
    }
  };
  const host = createElement();
  const slider = createElement({ disabled: true, value: "0" });
  const sliderRow = createElement({ hidden: true });
  const ageValue = createElement({ textContent: "Not available" });
  const dateValue = createElement({ textContent: "Not available" });
  const warning = createElement({ hidden: true });
  const control = createElement({
    hidden: true,
    children: {
      "[data-income-impact-death-age-slider-row]": sliderRow,
      "[data-income-impact-death-age-slider]": slider,
      "[data-income-impact-death-age-warning]": warning
    }
  });
  const toggle = createElement({ attributes: { "aria-expanded": "true" }, textContent: "Hide controls" });
  const content = createElement({ hidden: false });
  const projectionHorizon = createElement({ value: "40" });
  const projectionHorizonValue = createElement({ textContent: "40 years" });
  const mortgageTreatment = createElement({ value: "followAssumptions" });
  const mortgageTreatmentValue = createElement({ textContent: "Follow Assumption Controls" });
  const lifestyleSlider = createElement({ value: "0" });
  const lifestyleValue = createElement({ textContent: "Current" });
  const reevaluateButton = createElement({ disabled: true, textContent: "Reevaluate" });
  const draftStatus = createElement({ textContent: "Scenario applied" });
  const scenarioSummary = createElement();
  const banner = createElement({
    children: {
      "[data-income-impact-scenario-toggle]": toggle,
      "[data-income-impact-scenario-content]": content,
      "[data-income-impact-projection-horizon]": projectionHorizon,
      "[data-income-impact-projection-horizon-value]": projectionHorizonValue,
      "[data-income-impact-mortgage-treatment]": mortgageTreatment,
      "[data-income-impact-mortgage-treatment-value]": mortgageTreatmentValue,
      "[data-income-impact-lifestyle-slider]": lifestyleSlider,
      "[data-income-impact-lifestyle-value]": lifestyleValue,
      "[data-income-impact-reevaluate]": reevaluateButton,
      "[data-income-impact-draft-status]": draftStatus,
      "[data-income-impact-scenario-summary]": scenarioSummary
    }
  });
  const links = [
    createElement({ attributes: { href: "analysis-setup.html" } }),
    createElement({ attributes: { href: "analysis-estimate.html" } })
  ];
  let readyCallback = null;
  const document = {
    querySelector(selector) {
      if (selector === "[data-income-impact-display]") {
        return host;
      }
      if (selector === "[data-income-impact-death-age-control]") {
        return control;
      }
      if (selector === "[data-income-impact-death-age-value]") {
        return ageValue;
      }
      if (selector === "[data-income-impact-death-date-value]") {
        return dateValue;
      }
      if (selector === "[data-income-impact-scenario-banner]") {
        return banner;
      }
      return null;
    },
    querySelectorAll(selector) {
      if (selector === "[data-income-impact-route-link]") {
        return links;
      }
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
        href: "http://127.0.0.1/pages/income-loss-impact.html?caseRef=CL%2F90001&profileId=scenario-banner-profile",
        search: "?caseRef=CL%2F90001&profileId=scenario-banner-profile"
      },
      localStorage: {
        setItem(key, value) {
          storageWrites.push({ storage: "localStorage", key, value });
        }
      },
      sessionStorage: {
        setItem(key, value) {
          storageWrites.push({ storage: "sessionStorage", key, value });
        }
      },
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
            return {
              lensModel: cloneJson(lensModel),
              warnings: [],
              input
            };
          },
          composeIncomeImpactScenario(input) {
            composerCalls.push(cloneJson(input));
            return {
              status: "complete",
              scenario: {
                valuationDate: input.valuationDate,
                selectedDeathDate: input.selectedDeathDate,
                selectedDeathAge: input.selectedDeathAge,
                projectionHorizonMonths: input.projectionHorizonMonths,
                mortgageTreatmentOverride: input.scenarioOptions?.mortgageTreatmentOverride || null
              },
              deathEvent: {
                date: input.selectedDeathDate,
                age: input.selectedDeathAge,
                immediateObligations: 100000,
                layer2: {
                  resources: {
                    totalResourcesBeforeObligations: 600000
                  }
                }
              },
              timelineFacts: {
                assetsBeforeDeath: 250000 + input.projectionHorizonMonths,
                survivorAvailableTreatedAssets: 100000,
                coverageAdded: 500000,
                resourcesAfterObligations: 500000,
                monthsCovered: 100,
                depletionDate: "2034-10-15",
                accumulatedUnmetNeed: 0
              },
              warnings: [],
              dataGaps: []
            };
          },
          evaluateIncomeImpactRiskEvents(input) {
            riskEvaluatorCalls.push(cloneJson(input));
            return {
              status: "complete",
              events: [
                {
                  id: "survivor-resources-depleted",
                  ruleId: "survivor-resources-depleted",
                  category: "runway",
                  severity: "critical",
                  title: "Survivor resources deplete",
                  summary: "Resources deplete on 2034-10-15.",
                  date: "2034-10-15",
                  monthIndex: 100,
                  phase: "postDeath",
                  evidence: [
                    {
                      path: "timelineFacts.monthsCovered",
                      value: input.scenario?.timelineFacts?.monthsCovered
                    }
                  ],
                  sourcePaths: ["timelineFacts.monthsCovered"]
                }
              ],
              stableEvents: [
                {
                  id: "coverage-added-at-death",
                  ruleId: "coverage-added-at-death",
                  category: "coverage",
                  severity: "stable",
                  title: "Coverage added at death",
                  summary: "Coverage is added at the death event.",
                  date: input.scenario?.scenario?.selectedDeathDate,
                  monthIndex: 0,
                  phase: "deathEvent",
                  evidence: [
                    {
                      path: "deathEvent.coverageAdded",
                      value: input.scenario?.timelineFacts?.coverageAdded
                    }
                  ],
                  sourcePaths: ["deathEvent.coverageAdded"]
                }
              ],
              dataGaps: [],
              warnings: []
            };
          },
          buildIncomeImpactTimelineGraphModel(input) {
            graphModelCalls.push(cloneJson(input));
            return {
              status: "complete",
              phases: {
                preDeath: { available: false },
                deathEvent: { xRatio: 0, date: input.scenario?.scenario?.selectedDeathDate },
                postDeath: { available: true }
              },
              series: {
                preDeathAssets: [],
                currentAnchor: {
                  xRatio: 0,
                  yRatio: 0.25,
                  value: input.scenario?.timelineFacts?.assetsBeforeDeath
                },
                deathTransition: [
                  { xRatio: 0, yRatio: 0.25, value: input.scenario?.timelineFacts?.assetsBeforeDeath },
                  { xRatio: 0, yRatio: 0.4, value: input.scenario?.timelineFacts?.resourcesAfterObligations }
                ],
                postDeathResources: [
                  { xRatio: 0.1, yRatio: 0.42, value: input.scenario?.timelineFacts?.resourcesAfterObligations },
                  { xRatio: 0.8, yRatio: 0.8, value: 0 }
                ]
              },
              axes: {
                x: {
                  ticks: [
                    { id: "death", label: "Death", date: input.scenario?.scenario?.selectedDeathDate, xRatio: 0 },
                    { id: "horizon", label: "Horizon", date: "2066-01-01", xRatio: 1 }
                  ]
                },
                y: {
                  signed: false,
                  zeroYRatio: 0.85,
                  ticks: [
                    { value: 0, yRatio: 0.85 },
                    { value: 500000, yRatio: 0.25 }
                  ]
                }
              },
              markers: [],
              selectedEvent: null,
              callouts: [
                {
                  id: "resources-after-obligations",
                  label: "Resources after obligations",
                  value: input.scenario?.timelineFacts?.resourcesAfterObligations,
                  kind: "currency",
                  phase: "deathEvent"
                }
              ],
              warnings: [],
              dataGaps: [],
              trace: {
                calculationMethod: "income-impact-timeline-graph-model-v1"
              }
            };
          }
        }
      }
    }
  };
  sandbox.globalThis = sandbox;
  sandbox.LensApp = sandbox.window.LensApp;
  vm.createContext(sandbox);
  vm.runInContext(displaySource, sandbox, {
    filename: "income-loss-impact-display.js"
  });
  assert.equal(typeof readyCallback, "function", "display should register DOMContentLoaded.");

  return {
    readyCallback,
    composerCalls,
    riskEvaluatorCalls,
    graphModelCalls,
    storageWrites,
    host,
    banner,
    toggle,
    content,
    control,
    slider,
    sliderRow,
    ageValue,
    dateValue,
    warning,
    projectionHorizon,
    projectionHorizonValue,
    mortgageTreatment,
    mortgageTreatmentValue,
    lifestyleSlider,
    lifestyleValue,
    reevaluateButton,
    draftStatus,
    scenarioSummary,
    getScenarioComparisonStateSnapshot() {
      return cloneJson(
        sandbox.window.LensApp.lensAnalysis.incomeLossImpactDisplay.getScenarioComparisonStateSnapshot()
      );
    }
  };
}

const pageSource = readRepoFile("pages/income-loss-impact.html");
const displaySource = readRepoFile("app/features/lens-analysis/income-loss-impact-display.js");
const layoutSource = readRepoFile("layout.css");
const componentsSource = readRepoFile("components.css");
const scenarioLayoutBlock = layoutSource.match(
  /body\[data-step="income-impact"\] \.income-impact-scenario-banner\s*\{[\s\S]*?\n  \}/
)?.[0] || "";

[
  "data-income-impact-scenario-banner",
  "data-income-impact-scenario-toggle",
  "data-income-impact-scenario-content",
  "data-income-impact-projection-horizon",
  "data-income-impact-projection-horizon-value",
  "data-income-impact-mortgage-treatment",
  "data-income-impact-lifestyle-slider",
  "data-income-impact-lifestyle-value",
  "data-income-impact-reevaluate",
  "data-income-impact-draft-status",
  "data-income-impact-death-age-control",
  "data-income-impact-death-age-slider",
  "data-income-impact-death-age-value",
  "data-income-impact-death-date-value",
  "data-income-impact-death-age-warning"
].forEach(function (selector) {
  assert.match(pageSource, new RegExp(selector), `page should include ${selector}.`);
});
assert.equal(
  (pageSource.match(/data-income-impact-death-age-slider(?:\s|>)/g) || []).length,
  1,
  "death-age slider should exist exactly once."
);
assert.equal(
  (pageSource.match(/data-income-impact-projection-horizon(?:\s|>)/g) || []).length,
  1,
  "projection horizon control should exist exactly once."
);
assert.equal(
  (pageSource.match(/data-income-impact-mortgage-treatment(?:\s|>)/g) || []).length,
  1,
  "mortgage treatment control should exist exactly once."
);
assert.match(pageSource, /Scenario Controls/);
assert.match(pageSource, /Preview only\. These controls do not change the LENS recommendation\./);
assert.doesNotMatch(pageSource, /Death Age Scenario/);
assert.match(
  pageSource,
  /data-income-impact-projection-horizon[\s\S]*min="5"[\s\S]*max="100"[\s\S]*value="40"|min="5"[\s\S]*max="100"[\s\S]*value="40"[\s\S]*data-income-impact-projection-horizon/,
  "projection horizon should default to a 5-100 year local range."
);
assert.match(pageSource, /value="followAssumptions"[\s\S]*Follow Assumption Controls/);
assert.match(pageSource, /value="payOffMortgage"[\s\S]*Pay off mortgage/);
assert.match(pageSource, /value="continueMortgagePayments"[\s\S]*Continue mortgage payments/);
assert.match(displaySource, /projectionHorizonYears/);
assert.match(displaySource, /projectionHorizonMonths/);
assert.match(displaySource, /mortgageTreatmentOverride/);
assert.match(displaySource, /draftScenarioControls/);
assert.match(displaySource, /appliedScenarios/);
assert.match(displaySource, /selectedScenarioId/);
assert.match(displaySource, /applyDraftScenarioControlsToRuntimeState/);
assert.match(displaySource, /hasDraftScenarioChanges/);
assert.match(displaySource, /composeIncomeImpactScenario/);
assert.match(displaySource, /evaluateIncomeImpactRiskEvents/);
assert.match(displaySource, /includeDiscretionaryNeeds:\s*true/);
assert.match(pageSource, /data-income-impact-reevaluate[\s\S]*disabled[\s\S]*Reevaluate|disabled[\s\S]*data-income-impact-reevaluate[\s\S]*Reevaluate/);
assert.match(pageSource, /data-income-impact-draft-status[\s\S]*Scenario applied/);
assert.doesNotMatch(displaySource, /calculateIncomeLossImpactTimeline/);
assert.doesNotMatch(displaySource, /evaluateIncomeImpactWarningEvents/);
assert.doesNotMatch(displaySource, /runNeedsAnalysis|needsResult/);
assert.doesNotMatch(
  displaySource,
  /(?:localStorage|sessionStorage)\.setItem|updateClientRecord|updateClientRecordByCaseRef|saveAnalysisSetupSettings|saveJson\(/,
  "scenario state should not be persisted."
);
assert.doesNotMatch(
  scenarioLayoutBlock,
  /position: fixed;/,
  "Scenario controls should no longer be fixed over the Income Impact chart."
);
assert.doesNotMatch(
  layoutSource,
  /--income-impact-scenario-banner-reserve/,
  "Income Impact should not reserve space for a fixed scenario banner."
);
assert.match(
  scenarioLayoutBlock,
  /position: static;[\s\S]*max-height: none;[\s\S]*overflow: visible;/,
  "Desktop/tablet scenario controls should render inline so they do not overlap the chart."
);
assert.match(
  layoutSource,
  /body\[data-step="income-impact"\] \.lens-workflow-pane[\s\S]*padding-bottom:\s*0;[\s\S]*scroll-padding-bottom:\s*0;/,
  "Income Impact content should not reserve bottom space now that controls are inline."
);
assert.match(
  layoutSource,
  /body\[data-step="income-impact"\] \.actions-row[\s\S]*margin-bottom:\s*0;[\s\S]*scroll-margin-bottom:\s*0;/,
  "Income Impact actions should not reserve bottom-banner spacing before the inline scenario controls."
);
assert.match(
  layoutSource,
  /Mobile keeps scenario controls inline[\s\S]*body\[data-step="income-impact"\] \.income-impact-scenario-banner[\s\S]*position: static;[\s\S]*left: auto;[\s\S]*right: auto;[\s\S]*max-height: none;[\s\S]*overflow: visible;/,
  "Mobile scenario banner behavior should be explicit and inline."
);
assert.match(componentsSource, /\.income-impact-scenario-banner/);
assert.match(componentsSource, /\.income-impact-scenario-content/);
assert.match(
  componentsSource,
  /@media \(max-width: 980px\)[\s\S]*\.income-impact-scenario-content[\s\S]*grid-template-columns:\s*repeat\(2, minmax\(8rem, 1fr\)\);/,
  "Tablet scenario controls should use the committed compact two-column layout."
);
assert.match(
  componentsSource,
  /@media \(min-width: 721px\) and \(max-height: 700px\)[\s\S]*\.income-impact-scenario-banner[\s\S]*padding: 0\.44rem 0\.64rem;/,
  "Short-height scenario banner should use tighter spacing."
);
assert.match(
  componentsSource,
  /@media \(max-width: 720px\)[\s\S]*\.income-impact-scenario-header,[\s\S]*\.income-impact-scenario-content[\s\S]*grid-template-columns: 1fr;/,
  "Mobile scenario controls should use an intentional inline single-column layout."
);
assert.match(
  componentsSource,
  /\.income-impact-scenario-content\[hidden\]\s*\{[\s\S]*display: none;/,
  "collapsed scenario controls should not be overridden by grid display styling."
);

const harness = createHarness();
harness.readyCallback();

assert.equal(harness.composerCalls.length, 1, "initial render should call composer once.");
assert.equal(harness.riskEvaluatorCalls.length, 1, "initial render should evaluate Layer 4 risk events once.");
assert.equal(harness.graphModelCalls.length, 1, "initial render should build the Graph V1 model once.");
assert.equal(harness.composerCalls[0].selectedDeathAge, 45);
assert.equal(harness.composerCalls[0].selectedDeathDate, "2026-01-01");
assert.equal(harness.composerCalls[0].projectionHorizonMonths, 480);
assert.equal(harness.composerCalls[0].scenarioOptions.mortgageTreatmentOverride, "followAssumptions");
assert.equal(harness.composerCalls[0].scenarioOptions.includeDiscretionaryNeeds, true);
assert.equal(harness.composerCalls[0].scenarioOptions.projectionCadence, "monthly");
assert.equal(harness.riskEvaluatorCalls[0].scenario.scenario.selectedDeathAge, 45);
assert.equal(harness.graphModelCalls[0].selectedScenarioId, "income-impact-current-scenario");
assert.equal(harness.graphModelCalls[0].appliedScenarios.length, 1, "display should pass appliedScenarios into the graph model.");
assert.equal(harness.graphModelCalls[0].appliedScenarios[0].scenarioId, "income-impact-current-scenario");
assert.equal(harness.graphModelCalls[0].appliedScenarios[0].label, "Death tomorrow");
assert.equal(harness.graphModelCalls[0].appliedScenarios[0].settings.selectedDeathAge, 45);
assert.equal(harness.graphModelCalls[0].appliedScenarios[0].scenario.scenario.selectedDeathAge, 45);
assert.deepEqual(harness.graphModelCalls[0].appliedScenarios[0].comparisonScenarios, []);
const initialScenarioComparisonState = harness.getScenarioComparisonStateSnapshot();
assert.deepEqual(
  initialScenarioComparisonState.draftScenarioControls,
  {
    selectedDeathAge: 45,
    selectedDeathDate: "2026-01-01",
    projectionHorizonYears: 40,
    mortgageTreatmentOverride: "followAssumptions",
    lifestyleSliderValue: 0
  },
  "initial draft scenario controls should mirror the currently evaluated control defaults."
);
assert.equal(initialScenarioComparisonState.appliedScenarios.length, 1, "initial evaluated scenario should be stored as appliedScenarios[0].");
assert.equal(initialScenarioComparisonState.appliedScenarios[0].scenarioId, "income-impact-current-scenario");
assert.equal(initialScenarioComparisonState.selectedScenarioId, initialScenarioComparisonState.appliedScenarios[0].scenarioId);
assert.equal(initialScenarioComparisonState.appliedScenarios[0].label, "Death tomorrow");
assert.deepEqual(initialScenarioComparisonState.appliedScenarios[0].settings, initialScenarioComparisonState.draftScenarioControls);
assert.equal(initialScenarioComparisonState.appliedScenarios[0].scenario.scenario.selectedDeathAge, 45);
assert.equal(initialScenarioComparisonState.appliedScenarios[0].riskEvaluation.events[0].ruleId, "survivor-resources-depleted");
assert.equal(initialScenarioComparisonState.appliedScenarios[0].lifestyleAdjustment.sliderValue, 0);
assert.equal(initialScenarioComparisonState.appliedScenarios[0].lifestyleAdjustment.label, "Current");
assert.equal(initialScenarioComparisonState.hasDraftChanges, false);
assert.equal(harness.control.hidden, false);
assert.equal(harness.sliderRow.hidden, false);
assert.equal(harness.slider.disabled, false);
assert.equal(harness.slider.min, "45");
assert.equal(harness.slider.max, "85");
assert.equal(harness.slider.value, "45");
assert.equal(harness.ageValue.textContent, "45");
assert.equal(harness.dateValue.textContent, "2026-01-01");
assert.equal(harness.projectionHorizon.min, "5");
assert.equal(harness.projectionHorizon.max, "100");
assert.equal(harness.projectionHorizon.step, "1");
assert.equal(harness.projectionHorizon.value, "40");
assert.equal(harness.projectionHorizonValue.textContent, "40 years");
assert.equal(harness.mortgageTreatment.value, "followAssumptions");
assert.equal(harness.mortgageTreatmentValue.textContent, "Follow Assumption Controls");
assert.equal(harness.lifestyleSlider.value, "0");
assert.equal(harness.lifestyleValue.textContent, "Current");
assert.equal(harness.reevaluateButton.disabled, true);
assert.equal(harness.reevaluateButton.getAttribute("aria-disabled"), "true");
assert.equal(harness.draftStatus.textContent, "Scenario applied");
assert.equal(harness.draftStatus.getAttribute("data-income-impact-draft-status-state"), "applied");
assert.equal(harness.toggle.getAttribute("aria-expanded"), "true");
assert.equal(harness.toggle.textContent, "Hide controls");
assert.equal(harness.content.hidden, false);
assert.equal(harness.banner.getAttribute("data-income-impact-scenario-state"), "expanded");
assert.equal(harness.banner.getAttribute("data-income-impact-draft-state"), "applied");
assert.equal(harness.banner.classList.contains("is-collapsed"), false);
assert.match(harness.host.innerHTML, /data-income-impact-graph/);
assert.match(harness.host.innerHTML, /data-income-impact-graph-svg/);
assert.match(harness.host.innerHTML, /data-income-impact-graph-callout="resources-after-obligations"/);
assert.match(harness.host.innerHTML, /Survivor resources deplete/);
assert.match(harness.host.innerHTML, /Coverage added at death/);
assert.doesNotMatch(harness.host.innerHTML, /data-income-impact-runway-point-year-index/);
assert.doesNotMatch(harness.host.innerHTML, /data-income-impact-runway-svg/);

harness.slider.value = "50";
harness.slider.listeners.input({ target: harness.slider });
assert.equal(harness.composerCalls.length, 1, "draft death age should not rerun composer before Reevaluate.");
assert.equal(harness.riskEvaluatorCalls.length, 1, "draft death age should not rerun risk evaluator before Reevaluate.");
assert.equal(harness.graphModelCalls.length, 1, "draft death age should not rebuild graph before Reevaluate.");
assert.equal(harness.slider.value, "50");
assert.equal(harness.ageValue.textContent, "50");
assert.equal(harness.dateValue.textContent, "2030-06-15");
let draftState = harness.getScenarioComparisonStateSnapshot();
assert.equal(draftState.draftScenarioControls.selectedDeathAge, 50);
assert.equal(draftState.appliedScenarios[0].settings.selectedDeathAge, 45);
assert.equal(draftState.hasDraftChanges, true);
assert.equal(harness.reevaluateButton.disabled, false);
assert.equal(harness.reevaluateButton.getAttribute("aria-disabled"), "false");
assert.equal(harness.draftStatus.textContent, "Draft changes not applied");
assert.equal(harness.banner.getAttribute("data-income-impact-draft-state"), "dirty");

harness.reevaluateButton.listeners.click();
assert.equal(harness.composerCalls.length, 2, "Reevaluate should apply draft death age.");
assert.equal(harness.riskEvaluatorCalls.length, 2);
assert.equal(harness.graphModelCalls.length, 2);
assert.equal(harness.composerCalls[1].selectedDeathAge, 50);
assert.equal(harness.composerCalls[1].selectedDeathDate, "2030-06-15");
draftState = harness.getScenarioComparisonStateSnapshot();
const initialScenarioAfterSecondApply = getInitialAppliedScenario(draftState);
const selectedSecondScenario = getSelectedAppliedScenario(draftState);
assert.equal(draftState.appliedScenarios.length, 2, "changed death age should add a second applied scenario.");
assert.ok(initialScenarioAfterSecondApply, "initial scenario should remain available for comparison.");
assert.ok(selectedSecondScenario, "newly added scenario should be selected.");
assert.notEqual(draftState.selectedScenarioId, "income-impact-current-scenario");
assert.equal(initialScenarioAfterSecondApply.settings.selectedDeathAge, 45);
assert.equal(initialScenarioAfterSecondApply.label, "Death tomorrow");
assert.equal(selectedSecondScenario.settings.selectedDeathAge, 50);
assert.equal(selectedSecondScenario.scenario.scenario.selectedDeathAge, 50);
assert.equal(selectedSecondScenario.label, "Death in 5 years");
assert.equal(harness.graphModelCalls[1].selectedScenarioId, draftState.selectedScenarioId);
assert.equal(harness.graphModelCalls[1].appliedScenarios.length, 2);
assert.equal(draftState.hasDraftChanges, false);
assert.equal(harness.reevaluateButton.disabled, true);
assert.equal(harness.draftStatus.textContent, "Scenario applied");

const graphCallCountBeforeDuplicateReevaluate = harness.graphModelCalls.length;
harness.reevaluateButton.listeners.click();
assert.equal(harness.composerCalls.length, 2, "Reevaluate without draft changes should not rerun composer.");
assert.equal(harness.riskEvaluatorCalls.length, 2, "Reevaluate without draft changes should not rerun risk evaluator.");
assert.equal(harness.graphModelCalls.length, graphCallCountBeforeDuplicateReevaluate, "Reevaluate without draft changes should not rebuild the graph.");
assert.equal(harness.getScenarioComparisonStateSnapshot().appliedScenarios.length, 2, "Reevaluate without draft changes should not add duplicate scenarios.");

harness.projectionHorizon.value = "4";
harness.projectionHorizon.listeners.input({ target: harness.projectionHorizon });
assert.equal(harness.composerCalls.length, 2, "draft projection horizon should not rerun composer before Reevaluate.");
assert.equal(harness.riskEvaluatorCalls.length, 2);
assert.equal(harness.graphModelCalls.length, 2);
assert.equal(harness.projectionHorizon.value, "5");
assert.equal(harness.projectionHorizonValue.textContent, "5 years");
const minimumHorizonScenarioComparisonState = harness.getScenarioComparisonStateSnapshot();
assert.equal(minimumHorizonScenarioComparisonState.draftScenarioControls.projectionHorizonYears, 5);
assert.equal(getSelectedAppliedScenario(minimumHorizonScenarioComparisonState).settings.projectionHorizonYears, 40);
assert.notEqual(minimumHorizonScenarioComparisonState.selectedScenarioId, "income-impact-current-scenario");
assert.equal(minimumHorizonScenarioComparisonState.hasDraftChanges, true);
assert.match(harness.host.innerHTML, /data-income-impact-graph/);
assert.doesNotMatch(harness.host.innerHTML, /data-income-impact-runway-point-year-index/);

harness.reevaluateButton.listeners.click();
assert.equal(harness.composerCalls.length, 3, "Reevaluate should apply draft projection horizon.");
assert.equal(harness.riskEvaluatorCalls.length, 3);
assert.equal(harness.graphModelCalls.length, 3);
assert.equal(harness.composerCalls[2].projectionHorizonMonths, 60);
assert.equal(harness.graphModelCalls[2].selectedScenarioId, draftState.selectedScenarioId);
assert.equal(harness.graphModelCalls[2].appliedScenarios.length, 2);
assert.equal(getSelectedAppliedScenario({ appliedScenarios: harness.graphModelCalls[2].appliedScenarios, selectedScenarioId: harness.graphModelCalls[2].selectedScenarioId }).settings.projectionHorizonYears, 5);
assert.equal(harness.getScenarioComparisonStateSnapshot().hasDraftChanges, false);

harness.projectionHorizon.value = "125";
harness.projectionHorizon.listeners.change({ target: harness.projectionHorizon });
assert.equal(harness.composerCalls.length, 3, "draft maximum horizon should not rerun composer before Reevaluate.");
assert.equal(harness.riskEvaluatorCalls.length, 3);
assert.equal(harness.graphModelCalls.length, 3);
assert.equal(harness.projectionHorizon.value, "100");
assert.equal(harness.projectionHorizonValue.textContent, "100 years");
const maximumHorizonScenarioComparisonState = harness.getScenarioComparisonStateSnapshot();
assert.equal(maximumHorizonScenarioComparisonState.draftScenarioControls.projectionHorizonYears, 100);
assert.equal(getSelectedAppliedScenario(maximumHorizonScenarioComparisonState).settings.projectionHorizonYears, 5);
assert.equal(maximumHorizonScenarioComparisonState.appliedScenarios.length, 2);
assert.match(harness.host.innerHTML, /data-income-impact-graph/);
assert.doesNotMatch(harness.host.innerHTML, /data-income-impact-runway-point-year-index/);

harness.reevaluateButton.listeners.click();
assert.equal(harness.composerCalls.length, 4, "Reevaluate should apply draft maximum horizon.");
assert.equal(harness.riskEvaluatorCalls.length, 4);
assert.equal(harness.graphModelCalls.length, 4);
assert.equal(harness.composerCalls[3].projectionHorizonMonths, 1200);
assert.equal(harness.getScenarioComparisonStateSnapshot().appliedScenarios.length, 2);
assert.equal(getSelectedAppliedScenario(harness.getScenarioComparisonStateSnapshot()).settings.projectionHorizonYears, 100);

harness.mortgageTreatment.value = "payOffMortgage";
harness.mortgageTreatment.listeners.change({ target: harness.mortgageTreatment });
assert.equal(harness.composerCalls.length, 4, "draft mortgage treatment should not rerun composer before Reevaluate.");
assert.equal(harness.riskEvaluatorCalls.length, 4);
assert.equal(harness.graphModelCalls.length, 4);
assert.equal(harness.mortgageTreatment.value, "payOffMortgage");
assert.equal(harness.mortgageTreatmentValue.textContent, "Pay off mortgage");
assert.equal(harness.scenarioSummary.getAttribute("data-income-impact-mortgage-treatment-label"), "Pay off mortgage");
const mortgageScenarioComparisonState = harness.getScenarioComparisonStateSnapshot();
assert.equal(mortgageScenarioComparisonState.draftScenarioControls.mortgageTreatmentOverride, "payOffMortgage");
assert.equal(getSelectedAppliedScenario(mortgageScenarioComparisonState).settings.mortgageTreatmentOverride, "followAssumptions");
assert.equal(mortgageScenarioComparisonState.appliedScenarios.length, 2);

harness.reevaluateButton.listeners.click();
assert.equal(harness.composerCalls.length, 5, "Reevaluate should apply draft mortgage treatment.");
assert.equal(harness.riskEvaluatorCalls.length, 5);
assert.equal(harness.graphModelCalls.length, 5);
assert.equal(harness.composerCalls[4].scenarioOptions.mortgageTreatmentOverride, "payOffMortgage");
assert.notEqual(harness.graphModelCalls[4].selectedScenarioId, "income-impact-current-scenario");
assert.equal(harness.graphModelCalls[4].appliedScenarios.length, 2);
assert.equal(getSelectedAppliedScenario({ appliedScenarios: harness.graphModelCalls[4].appliedScenarios, selectedScenarioId: harness.graphModelCalls[4].selectedScenarioId }).settings.mortgageTreatmentOverride, "payOffMortgage");
assert.equal(harness.getScenarioComparisonStateSnapshot().hasDraftChanges, false);

harness.lifestyleSlider.value = "-100";
harness.lifestyleSlider.listeners.input({ target: harness.lifestyleSlider });
assert.equal(harness.composerCalls.length, 5, "draft lifestyle slider should not rerun composer before Reevaluate.");
assert.equal(harness.riskEvaluatorCalls.length, 5);
assert.equal(harness.graphModelCalls.length, 5);
assert.equal(harness.lifestyleSlider.value, "-100");
assert.equal(harness.lifestyleValue.textContent, "Conservative");
assert.equal(harness.scenarioSummary.getAttribute("data-income-impact-lifestyle-label"), "Conservative");
const lifestyleDraftScenarioComparisonState = harness.getScenarioComparisonStateSnapshot();
assert.equal(lifestyleDraftScenarioComparisonState.draftScenarioControls.lifestyleSliderValue, -100);
assert.equal(getSelectedAppliedScenario(lifestyleDraftScenarioComparisonState).settings.lifestyleSliderValue, 0);
assert.equal(lifestyleDraftScenarioComparisonState.hasDraftChanges, true);

harness.reevaluateButton.listeners.click();
assert.equal(harness.composerCalls.length, 6, "Reevaluate should apply draft lifestyle slider.");
assert.equal(harness.riskEvaluatorCalls.length, 6);
assert.equal(harness.graphModelCalls.length, 6);
const lifestyleAppliedScenarioComparisonState = harness.getScenarioComparisonStateSnapshot();
const selectedLifestyleScenario = getSelectedAppliedScenario(lifestyleAppliedScenarioComparisonState);
assert.equal(selectedLifestyleScenario.settings.lifestyleSliderValue, -100);
assert.equal(selectedLifestyleScenario.lifestyleAdjustment.sliderValue, -100);
assert.equal(selectedLifestyleScenario.lifestyleAdjustment.label, "Conservative");
assert.equal(lifestyleAppliedScenarioComparisonState.appliedScenarios.length, 2, "Reevaluate should keep V1 capped at two applied scenarios.");
assert.equal(lifestyleAppliedScenarioComparisonState.hasDraftChanges, false);

harness.toggle.listeners.click();
assert.equal(harness.composerCalls.length, 6, "collapsing should not rerun composer.");
assert.equal(harness.riskEvaluatorCalls.length, 6, "collapsing should not rerun risk evaluator.");
assert.equal(harness.graphModelCalls.length, 6, "collapsing should not rebuild the graph model.");
assert.equal(harness.toggle.getAttribute("aria-expanded"), "false");
assert.equal(harness.toggle.textContent, "Show controls");
assert.equal(harness.content.hidden, true);
assert.equal(harness.banner.getAttribute("data-income-impact-scenario-state"), "collapsed");
assert.equal(harness.banner.classList.contains("is-collapsed"), true);

harness.toggle.listeners.click();
assert.equal(harness.composerCalls.length, 6, "expanding should not rerun composer.");
assert.equal(harness.riskEvaluatorCalls.length, 6, "expanding should not rerun risk evaluator.");
assert.equal(harness.graphModelCalls.length, 6, "expanding should not rebuild the graph model.");
assert.equal(harness.toggle.getAttribute("aria-expanded"), "true");
assert.equal(harness.toggle.textContent, "Hide controls");
assert.equal(harness.content.hidden, false);
assert.equal(harness.banner.getAttribute("data-income-impact-scenario-state"), "expanded");
assert.equal(harness.banner.classList.contains("is-collapsed"), false);
assert.deepEqual(harness.storageWrites, [], "scenario controls should not write browser storage.");

const protectedChanges = getChangedFiles([
  "styles.css",
  "layout.css",
  "components.css",
  "app.js",
  "app/features/account-settings/household-expense-account-policy-storage.js",
  "app/features/lens-analysis/analysis-methods.js",
  "app/features/lens-analysis/lens-model-builder.js",
  "app/features/lens-analysis/analysis-settings-adapter.js",
  "app/features/lens-analysis/income-impact-lifestyle-scenario-calculations.js",
  "app/features/lens-analysis/income-impact-base-household-expense-stream.js",
  "app/features/lens-analysis/income-impact-household-expense-adjustment-engine.js",
  "app/features/lens-analysis/normalize-lens-model.js",
  "app/features/lens-analysis/step-three-analysis-display.js",
  "pages/analysis-estimate.html",
  "pages/dime-entry.html",
  "pages/dime-results.html",
  "pages/simple-needs-entry.html",
  "pages/simple-needs-results.html",
  "pages/hlv-entry.html",
  "pages/hlv-results.html"
]);
assert.deepEqual(
  protectedChanges,
  [],
  "Scenario banner check should not see CSS, app, storage, admin-adjacent, calculation, normalization, Step 3, result-page, or quick-flow changes."
);

console.log("income-loss-impact-scenario-banner-check passed");
