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

function createHarness(options = {}) {
  const displaySource = readRepoFile("app/features/lens-analysis/income-loss-impact-display.js");
  const helperCalls = [];
  const storageWrites = [];
  const profileRecord = {
    id: "slider-profile",
    caseRef: "CL/90001",
    displayName: "Slider Profile",
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
      clientDateOfBirth: options.missingDob ? "" : "1980-06-15"
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
      "[data-income-impact-death-age-value]": ageValue,
      "[data-income-impact-death-date-value]": dateValue,
      "[data-income-impact-death-age-warning]": warning
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
        href: "http://127.0.0.1/pages/income-loss-impact.html?caseRef=CL%2F90001&profileId=slider-profile",
        search: "?caseRef=CL%2F90001&profileId=slider-profile"
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
            const age = input.selectedDeathAge == null ? null : Number(input.selectedDeathAge);
            const date = age == null
              ? null
              : (age <= 45 ? input.valuationDate : `${1980 + age}-06-15`);
            return {
              selectedDeath: {
                age,
                date
              },
              summaryCards: [
                {
                  id: "yearsOfFinancialSecurity",
                  displayValue: age == null ? "Not available" : `${age} years 0 months`,
                  status: age == null ? "notAvailable" : "available"
                }
              ],
              timelineEvents: age == null
                ? []
                : [
                    {
                      type: "death",
                      date,
                      age,
                      label: `Death at ${age}`
                    }
                  ],
              dataGaps: options.missingDob
                ? [
                    {
                      code: "missing-client-dob",
                      label: "Client date of birth is missing or invalid."
                    }
                  ]
                : [],
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
    control,
    slider,
    sliderRow,
    ageValue,
    dateValue,
    warning
  };
}

const pageSource = readRepoFile("pages/income-loss-impact.html");
const displaySource = readRepoFile("app/features/lens-analysis/income-loss-impact-display.js");

[
  "data-income-impact-death-age-control",
  "data-income-impact-death-age-slider",
  "data-income-impact-death-age-value",
  "data-income-impact-death-date-value",
  "data-income-impact-death-age-warning"
].forEach((selector) => {
  assert.match(pageSource, new RegExp(selector), `page should include ${selector}`);
});
assert.doesNotMatch(displaySource, /runNeedsAnalysis/);
assert.doesNotMatch(displaySource, /needsResult/);
assert.doesNotMatch(
  displaySource,
  /(?:localStorage|sessionStorage)\.setItem|updateClientRecord|updateClientRecordByCaseRef|saveAnalysisSetupSettings|saveJson\(/,
  "slider state should not be persisted"
);
assert.match(displaySource, /selectedDeathAge/, "display should pass selectedDeathAge into the timeline helper.");
assert.match(displaySource, /addEventListener\("input", updateSelectedDeathAge\)/);
assert.match(displaySource, /addEventListener\("change", updateSelectedDeathAge\)/);

const available = createHarness();
available.readyCallback();
assert.equal(available.control.hidden, false, "death-age control should be shown when the page initializes.");
assert.equal(available.sliderRow.hidden, false, "slider row should be visible when DOB is available.");
assert.equal(available.slider.disabled, false, "slider should be enabled when DOB is available.");
assert.equal(available.slider.min, "45", "slider min should be the current age from DOB and valuation date.");
assert.equal(available.slider.max, "85", "slider max should be current age plus 40, capped by the display rule.");
assert.equal(available.slider.value, "45", "slider should default to current age.");
assert.equal(available.ageValue.textContent, "45");
assert.equal(available.dateValue.textContent, "2026-01-01");
assert.equal(available.helperCalls.length, 1);
assert.equal(available.helperCalls[0].selectedDeathAge, 45);
assert.match(available.host.innerHTML, /45 years 0 months/);
assert.match(available.host.innerHTML, /Death at 45/);

available.slider.value = "44";
available.slider.listeners.input({ target: available.slider });
assert.equal(available.helperCalls.length, 2);
assert.equal(available.helperCalls[1].selectedDeathAge, 45);
assert.equal(available.slider.value, "45");
assert.equal(available.ageValue.textContent, "45");
assert.equal(available.dateValue.textContent, "2026-01-01");

available.slider.value = "50";
available.slider.listeners.input({ target: available.slider });
assert.equal(available.helperCalls.length, 3);
assert.equal(available.helperCalls[2].selectedDeathAge, 50);
assert.equal(available.slider.value, "50");
assert.equal(available.ageValue.textContent, "50");
assert.equal(available.dateValue.textContent, "2030-06-15");
assert.match(available.host.innerHTML, /50 years 0 months/);
assert.match(available.host.innerHTML, /Death at 50/);
assert.deepEqual(available.storageWrites, [], "slider changes should not write to browser storage.");

const missingDob = createHarness({ missingDob: true });
missingDob.readyCallback();
assert.equal(missingDob.control.hidden, false, "missing-DOB control should still show a truthful warning.");
assert.equal(missingDob.sliderRow.hidden, true, "slider row should be hidden when DOB is missing.");
assert.equal(missingDob.slider.disabled, true, "slider should remain disabled when DOB is missing.");
assert.equal(missingDob.ageValue.textContent, "Not available");
assert.equal(missingDob.dateValue.textContent, "Not available");
assert.equal(missingDob.warning.hidden, false);
assert.match(missingDob.warning.textContent, /Add insured date of birth to preview by age\./);
assert.equal(missingDob.helperCalls.length, 1);
assert.equal(
  Object.prototype.hasOwnProperty.call(missingDob.helperCalls[0], "selectedDeathAge"),
  false,
  "missing-DOB helper call should not pass a broken selectedDeathAge."
);
assert.deepEqual(missingDob.storageWrites, [], "missing-DOB path should not write slider state.");

console.log("income-loss-impact-death-age-slider-check passed");
