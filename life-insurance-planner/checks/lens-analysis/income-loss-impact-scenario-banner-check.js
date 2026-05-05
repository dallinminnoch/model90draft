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

function createProjectionPoints(projectionYears, selectedDeathAge, selectedDeathDate) {
  return [
    {
      yearIndex: 0,
      date: selectedDeathDate,
      age: selectedDeathAge,
      startingBalance: 500000,
      annualShortfall: 60000,
      endingBalance: 500000,
      status: "starting"
    },
    {
      yearIndex: projectionYears,
      date: `${Number(selectedDeathDate.slice(0, 4)) + projectionYears}${selectedDeathDate.slice(4)}`,
      age: selectedDeathAge + projectionYears,
      startingBalance: 500000 - (projectionYears - 1) * 60000,
      annualShortfall: 60000,
      endingBalance: 500000 - projectionYears * 60000,
      status: projectionYears >= 9 ? "depleted" : "available"
    }
  ];
}

function createHarness() {
  const displaySource = readRepoFile("app/features/lens-analysis/income-loss-impact-display.js");
  const helperCalls = [];
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
          calculateIncomeLossImpactTimeline(input) {
            helperCalls.push(cloneJson(input));
            const selectedDeathAge = Number(input.selectedDeathAge);
            const selectedDeathDate = selectedDeathAge <= 45 ? input.valuationDate : `${1980 + selectedDeathAge}-06-15`;
            const projectionYears = Number(input.options?.scenario?.projectionHorizonYears || 40);
            return {
              selectedDeath: {
                age: selectedDeathAge,
                date: selectedDeathDate
              },
              financialRunway: {
                status: "complete",
                startingResources: 600000,
                existingCoverage: 500000,
                availableAssets: 100000,
                immediateObligations: 100000,
                netAvailableResources: 500000,
                annualHouseholdNeed: 90000,
                annualSurvivorIncome: 30000,
                annualShortfall: 60000,
                yearsOfSecurity: 8,
                monthsOfSecurity: 4,
                totalMonthsOfSecurity: 100,
                depletionDate: "2034-10-15",
                depletionYear: 2034,
                projectionYears,
                projectionPoints: createProjectionPoints(projectionYears, selectedDeathAge, selectedDeathDate),
                warnings: [],
                dataGaps: []
              },
              summaryCards: [
                {
                  id: "yearsOfFinancialSecurity",
                  displayValue: `${projectionYears} year scenario`,
                  status: "complete"
                }
              ],
              timelineEvents: [
                {
                  type: "death",
                  date: selectedDeathDate,
                  age: selectedDeathAge,
                  label: `Death at ${selectedDeathAge}`
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
    helperCalls,
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
assert.match(displaySource, /mortgageTreatmentOverride/);
assert.match(displaySource, /options:\s*\{\s*scenario:\s*\{/);
assert.doesNotMatch(displaySource, /runNeedsAnalysis|needsResult/);
assert.doesNotMatch(
  displaySource,
  /(?:localStorage|sessionStorage)\.setItem|updateClientRecord|updateClientRecordByCaseRef|saveAnalysisSetupSettings|saveJson\(/,
  "scenario state should not be persisted."
);
assert.match(layoutSource, /body\[data-step="income-impact"\] \.income-impact-scenario-banner[\s\S]*position: sticky;/);
assert.match(
  layoutSource,
  /body\[data-step="income-impact"\] \.actions-row[\s\S]*margin-bottom: 0\.75rem;/,
  "Income Impact actions should keep spacing from the sticky scenario banner."
);
assert.match(componentsSource, /\.income-impact-scenario-banner/);
assert.match(componentsSource, /\.income-impact-scenario-content/);
assert.match(
  componentsSource,
  /\.income-impact-scenario-content\[hidden\]\s*\{[\s\S]*display: none;/,
  "collapsed scenario controls should not be overridden by grid display styling."
);

const harness = createHarness();
harness.readyCallback();

assert.equal(harness.helperCalls.length, 1, "initial render should call helper once.");
assert.equal(harness.helperCalls[0].selectedDeathAge, 45);
assert.equal(harness.helperCalls[0].options.scenario.deathAge, 45);
assert.equal(harness.helperCalls[0].options.scenario.projectionHorizonYears, 40);
assert.equal(harness.helperCalls[0].options.scenario.mortgageTreatmentOverride, "followAssumptions");
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
assert.match(harness.host.innerHTML, /data-income-impact-runway-point-year-index="40"/);

harness.projectionHorizon.value = "4";
harness.projectionHorizon.listeners.input({ target: harness.projectionHorizon });
assert.equal(harness.helperCalls.length, 2);
assert.equal(harness.helperCalls[1].options.scenario.projectionHorizonYears, 5);
assert.equal(harness.projectionHorizon.value, "5");
assert.equal(harness.projectionHorizonValue.textContent, "5 years");
assert.match(harness.host.innerHTML, /data-income-impact-runway-point-year-index="5"/);

harness.projectionHorizon.value = "125";
harness.projectionHorizon.listeners.change({ target: harness.projectionHorizon });
assert.equal(harness.helperCalls.length, 3);
assert.equal(harness.helperCalls[2].options.scenario.projectionHorizonYears, 100);
assert.equal(harness.projectionHorizon.value, "100");
assert.equal(harness.projectionHorizonValue.textContent, "100 years");
assert.match(harness.host.innerHTML, /data-income-impact-runway-point-year-index="100"/);

harness.mortgageTreatment.value = "payOffMortgage";
harness.mortgageTreatment.listeners.change({ target: harness.mortgageTreatment });
assert.equal(harness.helperCalls.length, 4);
assert.equal(harness.helperCalls[3].options.scenario.mortgageTreatmentOverride, "payOffMortgage");
assert.equal(harness.mortgageTreatment.value, "payOffMortgage");
assert.equal(harness.mortgageTreatmentValue.textContent, "Pay off mortgage");
assert.equal(harness.scenarioSummary.getAttribute("data-income-impact-mortgage-treatment-label"), "Pay off mortgage");

harness.toggle.listeners.click();
assert.equal(harness.helperCalls.length, 4, "collapsing should not rerun helper.");
assert.equal(harness.toggle.getAttribute("aria-expanded"), "false");
assert.equal(harness.toggle.textContent, "Show controls");
assert.equal(harness.content.hidden, true);
assert.equal(harness.banner.getAttribute("data-income-impact-scenario-state"), "collapsed");
assert.equal(harness.banner.classList.contains("is-collapsed"), true);

harness.toggle.listeners.click();
assert.equal(harness.helperCalls.length, 4, "expanding should not rerun helper.");
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
