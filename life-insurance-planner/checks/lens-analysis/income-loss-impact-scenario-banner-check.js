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
  const scenarioSummary = createElement();
  const banner = createElement({
    children: {
      "[data-income-impact-scenario-toggle]": toggle,
      "[data-income-impact-scenario-content]": content,
      "[data-income-impact-projection-horizon]": projectionHorizon,
      "[data-income-impact-projection-horizon-value]": projectionHorizonValue,
      "[data-income-impact-mortgage-treatment]": mortgageTreatment,
      "[data-income-impact-mortgage-treatment-value]": mortgageTreatmentValue,
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
    scenarioSummary
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
assert.match(displaySource, /composeIncomeImpactScenario/);
assert.match(displaySource, /evaluateIncomeImpactRiskEvents/);
assert.match(displaySource, /includeDiscretionaryNeeds:\s*true/);
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
  /body\[data-step="income-impact"\] \.lens-workflow-pane[\s\S]*scroll-padding-bottom:\s*1rem;/,
  "Income Impact content should use normal scroll padding now that controls are inline."
);
assert.match(
  layoutSource,
  /body\[data-step="income-impact"\] \.actions-row[\s\S]*margin-bottom:\s*0\.75rem;[\s\S]*scroll-margin-bottom:\s*1rem;/,
  "Income Impact actions should use normal spacing before the inline scenario controls."
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
  /@media \(max-width: 980px\)[\s\S]*\.income-impact-scenario-content[\s\S]*grid-template-columns: minmax\(8rem, 1fr\) minmax\(8rem, 1fr\) minmax\(11rem, 1\.1fr\);/,
  "Tablet scenario controls should use a compact three-column layout."
);
assert.match(
  componentsSource,
  /@media \(min-width: 721px\) and \(max-height: 700px\)[\s\S]*\.income-impact-scenario-banner[\s\S]*padding: 0\.58rem 0\.72rem;/,
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
assert.equal(harness.composerCalls[0].selectedDeathAge, 45);
assert.equal(harness.composerCalls[0].selectedDeathDate, "2026-01-01");
assert.equal(harness.composerCalls[0].projectionHorizonMonths, 480);
assert.equal(harness.composerCalls[0].scenarioOptions.mortgageTreatmentOverride, "followAssumptions");
assert.equal(harness.composerCalls[0].scenarioOptions.includeDiscretionaryNeeds, true);
assert.equal(harness.composerCalls[0].scenarioOptions.projectionCadence, "monthly");
assert.equal(harness.riskEvaluatorCalls[0].scenario.scenario.selectedDeathAge, 45);
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
assert.equal(harness.toggle.getAttribute("aria-expanded"), "true");
assert.equal(harness.toggle.textContent, "Hide controls");
assert.equal(harness.content.hidden, false);
assert.equal(harness.banner.getAttribute("data-income-impact-scenario-state"), "expanded");
assert.equal(harness.banner.classList.contains("is-collapsed"), false);
assert.match(harness.host.innerHTML, /data-income-impact-timeline-paused/);
assert.match(harness.host.innerHTML, /data-income-impact-paused-fact="assets-before-death"/);
assert.match(harness.host.innerHTML, /data-income-impact-paused-fact="resources-after-obligations"/);
assert.match(harness.host.innerHTML, /Survivor resources deplete/);
assert.match(harness.host.innerHTML, /Coverage added at death/);
assert.doesNotMatch(harness.host.innerHTML, /data-income-impact-runway-point-year-index/);
assert.doesNotMatch(harness.host.innerHTML, /data-income-impact-runway-svg/);

harness.projectionHorizon.value = "4";
harness.projectionHorizon.listeners.input({ target: harness.projectionHorizon });
assert.equal(harness.composerCalls.length, 2);
assert.equal(harness.riskEvaluatorCalls.length, 2);
assert.equal(harness.composerCalls[1].projectionHorizonMonths, 60);
assert.equal(harness.projectionHorizon.value, "5");
assert.equal(harness.projectionHorizonValue.textContent, "5 years");
assert.match(harness.host.innerHTML, /data-income-impact-timeline-paused/);
assert.doesNotMatch(harness.host.innerHTML, /data-income-impact-runway-point-year-index/);

harness.projectionHorizon.value = "125";
harness.projectionHorizon.listeners.change({ target: harness.projectionHorizon });
assert.equal(harness.composerCalls.length, 3);
assert.equal(harness.riskEvaluatorCalls.length, 3);
assert.equal(harness.composerCalls[2].projectionHorizonMonths, 1200);
assert.equal(harness.projectionHorizon.value, "100");
assert.equal(harness.projectionHorizonValue.textContent, "100 years");
assert.match(harness.host.innerHTML, /data-income-impact-timeline-paused/);
assert.doesNotMatch(harness.host.innerHTML, /data-income-impact-runway-point-year-index/);

harness.mortgageTreatment.value = "payOffMortgage";
harness.mortgageTreatment.listeners.change({ target: harness.mortgageTreatment });
assert.equal(harness.composerCalls.length, 4);
assert.equal(harness.riskEvaluatorCalls.length, 4);
assert.equal(harness.composerCalls[3].scenarioOptions.mortgageTreatmentOverride, "payOffMortgage");
assert.equal(harness.mortgageTreatment.value, "payOffMortgage");
assert.equal(harness.mortgageTreatmentValue.textContent, "Pay off mortgage");
assert.equal(harness.scenarioSummary.getAttribute("data-income-impact-mortgage-treatment-label"), "Pay off mortgage");

harness.toggle.listeners.click();
assert.equal(harness.composerCalls.length, 4, "collapsing should not rerun composer.");
assert.equal(harness.riskEvaluatorCalls.length, 4, "collapsing should not rerun risk evaluator.");
assert.equal(harness.toggle.getAttribute("aria-expanded"), "false");
assert.equal(harness.toggle.textContent, "Show controls");
assert.equal(harness.content.hidden, true);
assert.equal(harness.banner.getAttribute("data-income-impact-scenario-state"), "collapsed");
assert.equal(harness.banner.classList.contains("is-collapsed"), true);

harness.toggle.listeners.click();
assert.equal(harness.composerCalls.length, 4, "expanding should not rerun composer.");
assert.equal(harness.riskEvaluatorCalls.length, 4, "expanding should not rerun risk evaluator.");
assert.equal(harness.toggle.getAttribute("aria-expanded"), "true");
assert.equal(harness.toggle.textContent, "Hide controls");
assert.equal(harness.content.hidden, false);
assert.equal(harness.banner.getAttribute("data-income-impact-scenario-state"), "expanded");
assert.equal(harness.banner.classList.contains("is-collapsed"), false);
assert.deepEqual(harness.storageWrites, [], "scenario controls should not write browser storage.");

const protectedChanges = getChangedFiles([
  "styles.css",
  "app/features/lens-analysis/analysis-methods.js",
  "app/features/lens-analysis/lens-model-builder.js",
  "app/features/lens-analysis/analysis-settings-adapter.js",
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
  "Scenario banner pass should not change styles.css, methods, model builder, adapter, Step 3, result pages, or quick flows."
);

console.log("income-loss-impact-scenario-banner-check passed");
