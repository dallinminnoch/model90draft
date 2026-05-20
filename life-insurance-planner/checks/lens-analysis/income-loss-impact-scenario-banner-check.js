#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const childProcess = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const {
  isAllowedAnalysisSetupEducationDescriptionRemovalDiff,
  isAllowedAnalysisSetupStyleFoundationDiff
} = require("./analysis-setup-style-guard-utils");

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

function getGitDiff(relativePath) {
  try {
    return childProcess.execFileSync(
      "git",
      ["diff", "--", relativePath],
      {
        cwd: repoRoot,
        encoding: "utf8"
      }
    );
  } catch (_error) {
    return "";
  }
}

function isAllowedIncomeImpactTitleStyleOverride() {
  const diff = getGitDiff("styles.css");
  const changedLines = diff
    .split(/\r?\n/)
    .filter(function (line) {
      return (/^[+-]/).test(line) && !line.startsWith("+++") && !line.startsWith("---");
    });
  if (!changedLines.length) {
    return false;
  }
  const allowedDeclarations = new Set([
    "",
    "}",
    "@layer overrides {",
    "display: block;",
    "margin: 0 0 0.65rem;",
    "padding-bottom: 0.72rem;",
    "border-bottom: 1px solid rgba(223, 229, 238, 0.86);",
    "display: grid;",
    "gap: 0.22rem;",
    "max-width: 46rem;",
    "color: #647184;",
    "font-size: 0.64rem;",
    "letter-spacing: 0.08em;",
    "max-width: none;",
    "margin: 0;",
    "color: #17202c;",
    "font-family: \"Montserrat\", sans-serif;",
    "font-size: clamp(1.34rem, 1.75vw, 1.72rem);",
    "font-weight: 840;",
    "letter-spacing: 0;",
    "line-height: 1.08;",
    "max-width: 36rem;",
    "color: #627086;",
    "font-size: 0.82rem;",
    "line-height: 1.38;",
    "body[data-step=\"income-impact\"] input[data-income-impact-death-age-slider],",
    "body[data-step=\"income-impact\"] input[data-income-impact-lifestyle-slider] {",
    "box-sizing: border-box;",
    "width: 100%;",
    "height: 1.2rem;",
    "min-height: 1.2rem;",
    "padding: 0;",
    "border: 0;",
    "border-radius: 0;",
    "appearance: none;",
    "-webkit-appearance: none;",
    "outline: 0;",
    "background: transparent;",
    "box-shadow: none;"
  ]);
  return changedLines.every(function (line) {
    if (line.startsWith("-")) {
      return line.slice(1).trim() === "font-family: \"Lora\", serif;";
    }
    const text = line.slice(1).trim();
    return text.startsWith('body[data-step="income-impact"] .income-impact-page-intro')
      || allowedDeclarations.has(text);
  });
}

function isAllowedIncomeImpactSidePanelLayoutChange() {
  const diff = getGitDiff("layout.css");
  const changedLines = diff
    .split(/\r?\n/)
    .filter(function (line) {
      return (/^[+-]/).test(line) && !line.startsWith("+++") && !line.startsWith("---");
    });
  if (!changedLines.length) {
    return false;
  }
  const allowedDeclarations = new Set([
    "",
    "}",
    "grid-template-columns: minmax(9.4rem, 10.5rem) minmax(0, 1fr);",
    "grid-template-columns: minmax(9.4rem, 10.5rem) minmax(0, 1fr) minmax(10.5rem, 12rem);",
    "grid-template-columns: minmax(14.75rem, 15.25rem) minmax(0, 1fr) minmax(10.5rem, 12rem);",
    "grid-template-columns: minmax(14rem, 14.5rem) minmax(0, 1fr) minmax(10.5rem, 12rem);",
    "grid-template-columns: minmax(13.5rem, 14rem) minmax(0, 1fr) minmax(10.5rem, 12rem);",
    "grid-template-columns: minmax(10.5rem, 12rem) minmax(0, 1fr) minmax(10.5rem, 12rem);",
    "--income-impact-rail-collapsed-width: clamp(4.5rem, 5vw, 5.5rem);",
    "--income-impact-rail-expanded-width: 12rem;",
    "grid-template-columns: var(--income-impact-rail-collapsed-width) minmax(0, 1fr) var(--income-impact-rail-collapsed-width);",
    "grid-template-columns: minmax(13.5rem, 18rem) minmax(0, 1fr);",
    "display: grid;",
    "grid-template-columns: minmax(0, 1fr) minmax(13.5rem, 18rem);",
    "grid-template-columns: 1fr;",
    "gap: 1rem;",
    "align-items: start;",
    "align-self: stretch;",
    "min-height: 0;",
    "height: 100%;",
    "height: auto;",
    "overflow-y: auto;",
    "overflow: visible;",
    "background: #f1f4f9;",
    "background: transparent;",
    "background: #ffffff;",
    "background:",
    "radial-gradient(circle at 18% 0%, rgba(92, 63, 214, 0.035), transparent 21rem),",
    "linear-gradient(180deg, #fafbfe 0%, #f3f6fb 100%);",
    "padding: 0.7rem clamp(0.95rem, 1.45vw, 1.15rem) 0 1rem;",
    "padding: 0.9rem clamp(0.95rem, 1.45vw, 1.15rem) 0;",
    "grid-column: 3;",
    "grid-row: 1;",
    "order: 0;",
    "order: 1;",
    "order: -1;",
    "position: sticky;",
    "position: static;",
    "position: relative;",
    "top: clamp(0.75rem, 2vw, 1.2rem);",
    "align-self: start;",
    "justify-self: start;",
    "justify-self: end;",
    "width: var(--income-impact-rail-collapsed-width);",
    "max-width: var(--income-impact-rail-expanded-width);",
    "overflow-x: hidden;",
    "transition: width 0.18s ease, box-shadow 0.18s ease;",
    "z-index: 2;",
    "z-index: 8;",
    "width: var(--income-impact-rail-expanded-width);",
    "isolation: isolate;",
    "min-width: var(--income-impact-rail-expanded-width);",
    "min-width: 0;"
  ]);
  const allowedSelectors = new Set([
    "body[data-step=\"income-impact\"] .income-impact-workspace-shell {",
    "body[data-step=\"income-impact\"] .income-impact-controls-panel {",
    "body[data-step=\"income-impact\"] .income-impact-content-stack {",
    "body[data-step=\"income-impact\"] .income-impact-insights-panel {",
    "body[data-step=\"income-impact\"] .income-impact-controls-panel:hover,",
    "body[data-step=\"income-impact\"] .income-impact-controls-panel:focus-within,",
    "body[data-step=\"income-impact\"] .income-impact-insights-panel:hover,",
    "body[data-step=\"income-impact\"] .income-impact-insights-panel:focus-within {",
    "body[data-step=\"income-impact\"] .income-impact-controls-panel > *,",
    "body[data-step=\"income-impact\"] .income-impact-insights-panel > * {",
    "/* Mobile keeps scenario controls inline so they do not cover the chart or route actions. */",
    "/* Mobile stacks scenario controls above the chart so they do not cover route actions. */"
  ]);
  return changedLines.every(function (line) {
    const text = line.slice(1).trim();
    return allowedDeclarations.has(text) || allowedSelectors.has(text);
  });
}

function isAllowedAssumptionControlsLayoutContractChange() {
  const diff = getGitDiff("layout.css");
  const hunks = diff.split(/^@@/m).slice(1);
  return hunks.length > 0
    && hunks.every(function (hunk) {
      return hunk.includes("analysis-setup")
        && hunk.includes("data-analysis-setup-current-view");
    });
}

function isAllowedLensModelBuilderContractExposure() {
  const diff = getGitDiff("app/features/lens-analysis/lens-model-builder.js");
  const changedLines = diff
    .split(/\r?\n/)
    .filter(function (line) {
      return (/^[+-]/).test(line) && !line.startsWith("+++") && !line.startsWith("---");
    });
  const hasRemovedLines = changedLines.some(function (line) {
    return line.startsWith("-");
  });
  const isMortgagePaymentPlanExposure = diff.includes("treatedMortgagePaymentPlan")
    && diff.includes("createPreparedTreatedMortgagePaymentPlan")
    && diff.includes("calculateTreatedMortgagePaymentPlan")
    && diff.includes("consumedByMethods: false")
    && diff.includes("formulaActive: false");
  const isTreatedOngoingSupportExposure = diff.includes("treatedOngoingSupport")
    && diff.includes("createPreparedTreatedOngoingSupport")
    && diff.includes("treatedMortgagePaymentPlan.finalMonthlyMortgagePayment")
    && diff.includes("mortgageTreatmentRecalculated: false")
    && diff.includes("consumedByMethods: false")
    && diff.includes("mortgageTreatmentConsumed: false")
    && diff.includes("associatedHousingCostsPreserved: true");
  const isSurvivorIncomeSourceFix = diff.includes("resolveSurvivorSupportSettingsContext")
    && diff.includes("getSurvivorSupportAssumptionContext(input, profileRecord)")
    && diff.includes("survivorSupportSettingsSource")
    && diff.includes("survivorSupportAssumptionsSourcePath")
    && diff.includes("input.analysisSettings")
    && diff.includes("profileRecord.analysisSettings");
  const isSurvivorGrossToNetDerivationFix = diff.includes("getSurvivorNetIncomeFailureReason")
    && diff.includes("baseSurvivorNetIncomeSource")
    && diff.includes("protectionModeling.data.spouseNetAnnualIncome")
    && diff.includes("calculated-tax-net-from-spouse-income")
    && diff.includes("conservative-gross-income-fallback")
    && diff.includes("survivorNetIncomeWorkReductionAppliedAfterTax")
    && diff.includes("missing-tax-config")
    && diff.includes("conservativeGrossIncomeFallbackUsed");

  return changedLines.length > 0
    && (!hasRemovedLines || isSurvivorIncomeSourceFix || isSurvivorGrossToNetDerivationFix)
    && (
      isMortgagePaymentPlanExposure
      || isTreatedOngoingSupportExposure
      || isSurvivorIncomeSourceFix
      || isSurvivorGrossToNetDerivationFix
    );
}

function isAllowedTreatedOngoingSupportMethodConsumption() {
  const diff = getGitDiff("./app/features/lens-analysis/analysis-methods.js");
  return diff.includes("resolveMethodReadyOngoingSupport")
    && diff.includes("treatedOngoingSupport.mortgageAdjusted.annualTotalEssentialSupportCost")
    && diff.includes("treated-ongoing-support-unavailable-for-method")
    && diff.includes("supportBasis: \"treatedOngoingSupport\"")
    && diff.includes("methodLabel: \"LENS Needs\"")
    && diff.includes("createSimpleNeedsEssentialSupportComponent");
}

function isAllowedIncomeImpactTreatedSupportConsumption(filePath) {
  const diff = getGitDiff(filePath.replace(/^life-insurance-planner\//, "./"));
  if (filePath === "life-insurance-planner/app/features/lens-analysis/income-impact-scenario-composer-calculations.js") {
    return diff.includes("resolveIncomeImpactOngoingSupportBasis")
      && diff.includes("treatedOngoingSupport.mortgageAdjusted.annualTotalEssentialSupportCost")
      && diff.includes("treatedMortgagePaymentPlan.finalMonthlyMortgagePayment")
      && diff.includes("cashFlowIncluded: false");
  }
  if (filePath === "life-insurance-planner/app/features/lens-analysis/income-impact-base-household-expense-stream.js") {
    return diff.includes("resolveIncomeImpactOngoingSupportBasis")
      && diff.includes("raw-housing-support-replaced-by-treated-ongoing-support")
      && diff.includes("lensModel.treatedOngoingSupport.mortgageAdjusted.monthlyHousingSupportCost");
  }
  if (filePath === "life-insurance-planner/app/features/lens-analysis/income-impact-lifestyle-scenario-calculations.js") {
    return diff.includes("resolveOngoingSupportMonthlyTotalForStream")
      && diff.includes("treatedOngoingSupport.mortgageAdjusted.monthlyTotalEssentialSupportCost");
  }
  return false;
}

function isAllowedStepThreeTreatedSupportDisplay(filePath) {
  if (filePath !== "life-insurance-planner/app/features/lens-analysis/step-three-analysis-display.js") {
    return false;
  }
  const diff = getGitDiff("./app/features/lens-analysis/step-three-analysis-display.js");
  return diff.includes("renderNeedsTreatedOngoingSupportDetails")
    && diff.includes("Mortgage treatment applied to support need")
    && diff.includes("treatedOngoingSupport.mortgageAdjusted.annualTotalEssentialSupportCost")
    && diff.includes("Treated support unavailable; raw ongoing support was used");
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
      const existing = listeners[eventName];
      if (!existing) {
        listeners[eventName] = callback;
        return;
      }
      const callbacks = Array.isArray(existing.__callbacks)
        ? existing.__callbacks
        : [existing];
      callbacks.push(callback);
      const dispatcher = function (event) {
        callbacks.forEach(function (listener) {
          listener(event);
        });
      };
      dispatcher.__callbacks = callbacks;
      listeners[eventName] = dispatcher;
    },
    matches(selector) {
      if (selector === "[data-income-impact-scenario-select]") {
        return this.getAttribute("data-income-impact-scenario-select") != null;
      }
      if (selector === "[data-income-impact-graph-view-toggle]") {
        return this.getAttribute("data-income-impact-graph-view-toggle") != null;
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

function createHarness() {
  const displaySource = readRepoFile("app/features/lens-analysis/income-loss-impact-display.js");
  const composerCalls = [];
  const riskEvaluatorCalls = [];
  const graphModelCalls = [];
  const storageWrites = [];
  const reevaluateTimers = [];
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
    },
    survivorScenario: {
      survivorContinuesWorking: true,
      survivorNetAnnualIncome: 30000,
      survivorIncomeStartDelayMonths: 0,
      survivorIncomeDerivation: {
        survivorIncomeSource: "derived-from-spouse-income",
        includeSurvivorIncomeOffset: true,
        survivorContinuesWorking: true,
        survivorNetAnnualIncomePrepared: 30000
      }
    }
  };
  const host = createElement();
  const slider = createElement({ disabled: true, value: "0" });
  const sliderRow = createElement({ hidden: true });
  const deathAgeSliderLabels = [
    createElement({ attributes: { "data-income-impact-death-age-slider-label": "min" } }),
    createElement({ attributes: { "data-income-impact-death-age-slider-label": "quarter" } }),
    createElement({ attributes: { "data-income-impact-death-age-slider-label": "mid" } }),
    createElement({ attributes: { "data-income-impact-death-age-slider-label": "three-quarter" } }),
    createElement({ attributes: { "data-income-impact-death-age-slider-label": "max" } })
  ];
  const ageValue = createElement({ textContent: "Not available" });
  const dateValue = createElement({ textContent: "Not available" });
  const warning = createElement({ hidden: true });
  const control = createElement({
    hidden: true,
    children: {
      "[data-income-impact-death-age-slider-row]": sliderRow,
      "[data-income-impact-death-age-slider]": slider,
      "[data-income-impact-death-age-warning]": warning
    },
    selectorResults: {
      "[data-income-impact-death-age-slider-label]": deathAgeSliderLabels
    }
  });
  const toggle = createElement({ attributes: { "aria-expanded": "true" }, textContent: "Hide controls" });
  const content = createElement({ hidden: false });
  const mortgageTreatment = createElement({ value: "followAssumptions" });
  const mortgageTreatmentValue = createElement({ textContent: "Follow Assumption Controls" });
  const survivorIncome = createElement({ checked: true });
  const survivorIncomeValue = createElement({ textContent: "Included" });
  const lifestyleSlider = createElement({ value: "0" });
  const lifestyleValue = createElement({ textContent: "Current" });
  const reevaluateButton = createElement({ disabled: true, textContent: "Reevaluate" });
  const reevaluateControl = createElement();
  const reevaluateAction = createElement({ textContent: "No pending changes" });
  const draftStatus = createElement({ textContent: "Applied" });
  const selectedScenarioChip = createElement();
  const selectedScenarioLabel = createElement({ textContent: "Not selected" });
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
      setTimeout(callback, delay) {
        reevaluateTimers.push({ callback, delay });
        return reevaluateTimers.length;
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
          incomeImpactLifestyleScenarioCalculations: {
            calculateIncomeImpactLifestyleScenario(input) {
              const sliderValue = Number(input?.sliderValue) || 0;
              const monthlyDelta = sliderValue < 0 ? -500 : (sliderValue > 0 ? 400 : 0);
              return {
                status: "complete",
                sliderValue,
                monthlyDelta,
                comparisonScenario: monthlyDelta === 0 ? null : {
                  trace: {
                    sliderValue,
                    monthlyDelta,
                    graphMonthlyDelta: monthlyDelta
                  }
                }
              };
            }
          },
          buildIncomeImpactTimelineGraphModel(input) {
            graphModelCalls.push(cloneJson(input));
            const selectedScenarioId = input.selectedScenarioId;
            const appliedScenarios = Array.isArray(input.appliedScenarios) ? input.appliedScenarios : [];
            const selectedScenario = appliedScenarios.find(function (scenario) {
              return scenario?.scenarioId === selectedScenarioId;
            }) || appliedScenarios[0];
            const visibleScenarios = (selectedScenario
              ? [selectedScenario].concat(appliedScenarios.filter(function (scenario) {
                return scenario !== selectedScenario;
              }))
              : appliedScenarios).slice(0, 2);
            const postDeathResources = [
              { xRatio: 0.1, yRatio: 0.42, value: input.scenario?.timelineFacts?.resourcesAfterObligations },
              { xRatio: 0.8, yRatio: 0.8, value: 0 }
            ];
            const series = {
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
              postDeathResources,
              appliedRunwayScenarios: visibleScenarios.map(function (scenario, index) {
                const selected = scenario.scenarioId === selectedScenarioId;
                return {
                  scenarioId: scenario.scenarioId,
                  label: scenario.label,
                  pathId: index === 0 ? "postDeathResources" : `postDeathResources--scenario-${index + 1}`,
                  selected,
                  fundedRunwayPoints: selected ? postDeathResources : [
                    { xRatio: 0.1, yRatio: 0.52, value: scenario.scenario?.timelineFacts?.resourcesAfterObligations },
                    { xRatio: 0.8, yRatio: 0.72, value: 0 }
                  ],
                  trace: {
                    renderSource: "fundedRunwayPoints",
                    comparisonHarness: !selected
                  }
                };
              }),
              appliedScenarioKeyItems: appliedScenarios.map(function (scenario) {
                return {
                  scenarioId: scenario.scenarioId,
                  label: scenario.label,
                  selected: scenario.scenarioId === selectedScenarioId
                };
              })
            };
            return {
              status: "complete",
              phases: {
                preDeath: { available: false },
                deathEvent: { xRatio: 0, date: input.scenario?.scenario?.selectedDeathDate },
                postDeath: { available: true }
              },
              series,
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
    reevaluateTimers,
    host,
    banner,
    toggle,
    content,
    control,
    slider,
    sliderRow,
    deathAgeSliderLabels,
    ageValue,
    dateValue,
    warning,
    mortgageTreatment,
    mortgageTreatmentValue,
    survivorIncome,
    survivorIncomeValue,
    lifestyleSlider,
    lifestyleValue,
    reevaluateButton,
    reevaluateControl,
    reevaluateAction,
    draftStatus,
    selectedScenarioChip,
    selectedScenarioLabel,
    scenarioSummary,
    flushReevaluateTimers() {
      const pendingTimers = reevaluateTimers.splice(0);
      pendingTimers.forEach(function (timer) {
        timer.callback();
      });
    },
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
const stylesSource = readRepoFile("styles.css");
const scenarioLayoutBlock = layoutSource.match(
  /body\[data-step="income-impact"\] \.income-impact-scenario-banner\s*\{[\s\S]*?\n  \}/
)?.[0] || "";

[
  "data-income-impact-scenario-banner",
  "data-income-impact-scenario-toggle",
  "data-income-impact-scenario-content",
  "data-income-impact-mortgage-treatment",
  "data-income-impact-survivor-income",
  "data-income-impact-survivor-income-value",
  "data-income-impact-lifestyle-slider",
  "data-income-impact-lifestyle-value",
  "data-income-impact-reevaluate",
  "data-income-impact-reevaluate-action",
  "data-income-impact-draft-status",
  "data-income-impact-selected-scenario-chip",
  "data-income-impact-selected-scenario-label",
    "data-income-impact-death-age-control",
    "data-income-impact-death-age-slider",
    "data-income-impact-death-age-slider-label",
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
  0,
  "projection horizon control should be removed from the user-facing scenario banner."
);
assert.equal(
  (pageSource.match(/data-income-impact-mortgage-treatment(?:\s|>)/g) || []).length,
  1,
  "mortgage treatment control should exist exactly once."
);
assert.match(pageSource, /Scenario Controls/);
assert.match(pageSource, /data-income-impact-controls-layout/);
assert.match(pageSource, /data-income-impact-controls-panel/);
assert.match(
  pageSource,
  /data-income-impact-display[\s\S]*data-income-impact-controls-panel[\s\S]*data-income-impact-scenario-banner/,
  "Income Impact workspace should include the main display and scenario controls panel."
);
assert.match(
  pageSource,
  /Preview only &mdash; LENS recommendation unchanged\./,
  "Income Impact page title should use the shortened preview disclaimer."
);
assert.doesNotMatch(pageSource, /Adjust Scenario/);
assert.doesNotMatch(pageSource, /Modify the selected scenario\. Assumption Controls stay unchanged\./);
assert.match(pageSource, /Lifestyle change[\s\S]*data-income-impact-lifestyle-value>\$0\/mo/);
assert.doesNotMatch(
  pageSource,
  /Preview only\. These controls do not change the LENS recommendation\./,
  "scenario banner should not restore the old longer preview disclaimer."
);
assert.doesNotMatch(pageSource, /Death Age Scenario/);
assert.doesNotMatch(pageSource, /Projection horizon/);
assert.doesNotMatch(pageSource, /Horizon <strong data-income-impact-projection-horizon-value>/);
assert.match(pageSource, /value="followAssumptions"[\s\S]*Follow Assumption Controls/);
assert.match(pageSource, /value="payOffMortgage"[\s\S]*Pay off mortgage/);
assert.match(pageSource, /value="continueMortgagePayments"[\s\S]*Continue mortgage payments/);
assert.match(displaySource, /projectionHorizonYears/);
assert.match(displaySource, /projectionHorizonMonths/);
assert.match(displaySource, /mortgageTreatmentOverride/);
assert.match(displaySource, /includeSurvivorIncome/);
assert.match(displaySource, /scenarioOptions[\s\S]*includeSurvivorIncome/);
assert.match(displaySource, /draftScenarioControls/);
assert.match(displaySource, /appliedScenarios/);
assert.match(displaySource, /selectedScenarioId/);
assert.match(displaySource, /autoCompressBaselineEnabled/);
assert.match(displaySource, /cloneVisibleScenarioControlSnapshot/);
assert.doesNotMatch(
  displaySource,
  /stripFoundationOnlyScenarioControls/,
  "Visible scenario-control snapshots should not use the stale foundation-only strip helper."
);
assert.match(displaySource, /getSelectedScenarioDisplayLabel/);
assert.match(displaySource, /getReevaluateActionLabel/);
assert.match(displaySource, /data-income-impact-scenario-select/);
assert.match(displaySource, /selectAppliedScenario/);
assert.match(displaySource, /applyDraftScenarioControlsToRuntimeState/);
assert.match(displaySource, /hasDraftScenarioChanges/);
assert.match(displaySource, /composeIncomeImpactScenario/);
assert.match(displaySource, /evaluateIncomeImpactRiskEvents/);
assert.match(displaySource, /includeDiscretionaryNeeds:\s*true/);
assert.match(pageSource, /data-income-impact-reevaluate[\s\S]*disabled[\s\S]*Reevaluate|disabled[\s\S]*data-income-impact-reevaluate[\s\S]*Reevaluate/);
assert.match(pageSource, /data-income-impact-reevaluate[\s\S]*Reevaluate[\s\S]*<img src="\.\.\/Images\/sync\.svg" alt="" aria-hidden="true">/);
assert.match(pageSource, /data-income-impact-draft-status[\s\S]*Applied/);
assert.match(pageSource, /data-income-impact-reevaluate-action[\s\S]*No pending changes/);
assert.match(pageSource, /data-income-impact-selected-scenario-label[\s\S]*Not selected/);
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
  "Scenario controls should remain statically placed inside the side panel, not fixed over the chart."
);
assert.match(
  layoutSource,
  /body\[data-step="income-impact"\] \.income-impact-workspace-shell\s*\{[^}]*--income-impact-rail-collapsed-width:\s*clamp\(4\.5rem,\s*5vw,\s*5\.5rem\);[^}]*--income-impact-rail-expanded-width:\s*12rem;[^}]*display:\s*grid;[^}]*grid-template-columns:\s*var\(--income-impact-rail-collapsed-width\) minmax\(0,\s*1fr\) var\(--income-impact-rail-collapsed-width\);[^}]*isolation:\s*isolate;/,
  "Desktop/tablet Income Impact layout should reserve miniature side rails while keeping the full rail width available for overlay expansion."
);
assert.match(
  layoutSource,
  /body\[data-step="income-impact"\] \.income-impact-controls-panel\s*\{[^}]*grid-column:\s*1;[^}]*grid-row:\s*1;[^}]*position:\s*relative;[^}]*justify-self:\s*start;[^}]*width:\s*var\(--income-impact-rail-collapsed-width\);[^}]*max-width:\s*var\(--income-impact-rail-expanded-width\);[^}]*overflow-x:\s*hidden;[^}]*transition:\s*width 0\.18s ease, box-shadow 0\.18s ease;[^}]*\}/,
  "Income Impact controls panel should occupy a miniature left rail and expand over the main content without shifting the grid."
);
assert.match(
  layoutSource,
  /body\[data-step="income-impact"\] \.income-impact-content-stack\s*\{[^}]*grid-column:\s*2;[^}]*grid-row:\s*1;[^}]*height:\s*100%;[^}]*overflow-y:\s*auto;[^}]*overflow-x:\s*hidden;[^}]*\}/,
  "Income Impact main display should occupy the scrollable right content column."
);
assert.match(
  layoutSource,
  /body\[data-step="income-impact"\] \.income-impact-content-stack\s*\{[^}]*background:\s*radial-gradient\(circle at 18% 0%, rgba\(92,\s*63,\s*214,\s*0\.035\), transparent 21rem\),\s*linear-gradient\(180deg,\s*#fafbfe 0%,\s*#f3f6fb 100%\);[^}]*\}/,
  "Income Impact main content surface should match the Client Directory main content background."
);
assert.match(
  layoutSource,
  /body\[data-step="income-impact"\] \.income-impact-insights-panel\s*\{[^}]*grid-column:\s*3;[^}]*grid-row:\s*1;[^}]*position:\s*relative;[^}]*justify-self:\s*end;[^}]*width:\s*var\(--income-impact-rail-collapsed-width\);[^}]*max-width:\s*var\(--income-impact-rail-expanded-width\);[^}]*height:\s*100%;[^}]*overflow-y:\s*auto;[^}]*overflow-x:\s*hidden;[^}]*transition:\s*width 0\.18s ease, box-shadow 0\.18s ease;[^}]*\}/,
  "Income Impact resource outlook should occupy a miniature right rail and expand left over the main content without shifting the grid."
);
assert.match(
  layoutSource,
  /body\[data-step="income-impact"\] \.income-impact-controls-panel:hover,[\s\S]*body\[data-step="income-impact"\] \.income-impact-insights-panel:focus-within\s*\{[^}]*z-index:\s*8;[^}]*width:\s*var\(--income-impact-rail-expanded-width\);[^}]*\}/,
  "Income Impact side rails should expand to their full width on hover or keyboard focus."
);
assert.match(
  layoutSource,
  /body\[data-step="income-impact"\] \.income-impact-controls-panel > \*,[\s\S]*body\[data-step="income-impact"\] \.income-impact-insights-panel > \*\s*\{[^}]*min-width:\s*var\(--income-impact-rail-expanded-width\);[^}]*\}/,
  "Income Impact side rail contents should keep the full-width layout while the rail viewport is collapsed."
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
  /Mobile stacks scenario controls above the chart[\s\S]*body\[data-step="income-impact"\] \.income-impact-workspace-shell[\s\S]*grid-template-columns:\s*1fr;[\s\S]*body\[data-step="income-impact"\] \.income-impact-controls-panel[\s\S]*order:\s*-1;[\s\S]*position:\s*static;[\s\S]*body\[data-step="income-impact"\] \.income-impact-scenario-banner[\s\S]*position: static;[\s\S]*left: auto;[\s\S]*right: auto;[\s\S]*max-height: none;[\s\S]*overflow: visible;/,
  "Mobile scenario controls should stack above the chart instead of using the desktop sticky side panel."
);
assert.match(componentsSource, /\.income-impact-scenario-banner/);
assert.match(
  componentsSource,
  /\.income-impact-controls-panel\s*\{[^}]*padding:\s*0;[^}]*background:\s*#ffffff;[^}]*border-left:\s*1px solid rgba\(213,\s*221,\s*232,\s*0\.78\);[^}]*border-top:\s*1px solid rgba\(213,\s*221,\s*232,\s*0\.78\);[^}]*border-right:\s*1px solid rgba\(213,\s*221,\s*232,\s*0\.78\);[^}]*border-bottom:\s*1px solid rgba\(213,\s*221,\s*232,\s*0\.78\);[^}]*border-radius:\s*0\.65rem 0 0 0\.65rem;[^}]*box-shadow:\s*inset -1px 0 0 rgba\(213,\s*221,\s*232,\s*0\.78\);[^}]*\}/,
  "Scenario controls rail should use the same side-column frame as the Client Directory views and filters column."
);
assert.match(
  componentsSource,
  /\.income-impact-scenario-banner\s*\{[^}]*width:\s*100%;[^}]*min-height:\s*100%;[^}]*margin:\s*0;[^}]*border:\s*0;[^}]*border-radius:\s*0\.65rem 0 0 0\.65rem;[^}]*background:\s*#ffffff;[^}]*box-shadow:\s*none;[^}]*\}/,
  "Scenario controls content should sit flush inside the framed side rail instead of rendering as a separate card."
);
assert.doesNotMatch(
  componentsSource,
  /\.income-impact-scenario-banner\s*\{[^}]*box-shadow:\s*0 2px 12px/,
  "Scenario controls should not keep the separate compact-card shadow inside the side rail."
);
assert.match(componentsSource, /\.income-impact-controls-panel\s*\{[^}]*background:\s*#ffffff;/);
assert.doesNotMatch(componentsSource, /\.income-impact-controls-panel \.income-impact-scenario-field:hover/);
assert.doesNotMatch(componentsSource, /\.income-impact-controls-panel \.income-impact-scenario-field:focus-within/);
assert.match(componentsSource, /\.income-impact-death-age-slider-row input\[type="range"\]\s*\{[^}]*padding:\s*0;[^}]*border:\s*0;[^}]*border-radius:\s*0;[^}]*-webkit-appearance:\s*none;[^}]*outline:\s*0;[^}]*background:\s*transparent;[^}]*box-shadow:\s*none;[^}]*\}/);
assert.match(componentsSource, /\.income-impact-scenario-field--lifestyle > input\[type="range"\]\s*\{[^}]*padding:\s*0;[^}]*border:\s*0;[^}]*border-radius:\s*0;[^}]*-webkit-appearance:\s*none;[^}]*outline:\s*0;[^}]*background:\s*transparent;[^}]*box-shadow:\s*none;[^}]*\}/);
assert.match(stylesSource, /body\[data-step="income-impact"\] input\[data-income-impact-death-age-slider\],[\s\S]*body\[data-step="income-impact"\] input\[data-income-impact-lifestyle-slider\]\s*\{[^}]*height:\s*1\.2rem;[^}]*min-height:\s*1\.2rem;[^}]*padding:\s*0;[^}]*border:\s*0;[^}]*border-radius:\s*0;[^}]*-webkit-appearance:\s*none;[^}]*background:\s*transparent;[^}]*box-shadow:\s*none;[^}]*\}/);
assert.match(componentsSource, /\.income-impact-death-age-slider-row input\[type="range"\]::-webkit-slider-runnable-track\s*\{[^}]*border:\s*0;[^}]*box-shadow:\s*none;[^}]*\}/);
assert.match(componentsSource, /\.income-impact-scenario-field--lifestyle > input\[type="range"\]::-webkit-slider-runnable-track\s*\{[^}]*border:\s*0;[^}]*box-shadow:\s*none;[^}]*\}/);
assert.match(componentsSource, /\.income-impact-death-age-slider-row input\[type="range"\]::-webkit-slider-thumb\s*\{[^}]*border:\s*0;[^}]*background:\s*var\(--income-impact-scenario-blue\);[^}]*box-shadow:\s*none;[^}]*\}/);
assert.match(componentsSource, /\.income-impact-scenario-field--lifestyle > input\[type="range"\]::-webkit-slider-thumb\s*\{[^}]*border:\s*0;[^}]*background:\s*var\(--income-impact-scenario-blue\);[^}]*box-shadow:\s*none;[^}]*\}/);
assert.match(componentsSource, /\.income-impact-controls-panel \.income-impact-scenario-field\[data-income-impact-death-age-control\],[\s\S]*\.income-impact-controls-panel \.income-impact-scenario-field--lifestyle\s*\{[^}]*border:\s*0;[^}]*background:\s*transparent;[^}]*box-shadow:\s*none;/);
assert.match(componentsSource, /\.income-impact-scenario-field\[data-income-impact-death-age-control\] \.income-impact-scenario-section-label span,[\s\S]*\.income-impact-scenario-field--lifestyle \.income-impact-scenario-section-label span\s*\{[^}]*display:\s*none;/);
assert.doesNotMatch(
  componentsSource,
  /\.income-impact-scenario-header::before/,
  "Scenario controls should not render a blue top accent strip."
);
assert.match(
  componentsSource,
  /\.income-impact-option-item\[aria-pressed="true"\]\s*\{[^}]*background:\s*var\(--income-impact-scenario-blue-light\);[^}]*color:\s*var\(--income-impact-scenario-blue\);[^}]*\}/,
  "Scenario controls should use reference-style selected option rows."
);
assert.match(pageSource, /data-income-impact-death-age-control[\s\S]*income-impact-scenario-field--lifestyle[\s\S]*data-income-impact-mortgage-treatment/);
assert.doesNotMatch(pageSource, /data-income-impact-lifestyle-option/);
assert.match(componentsSource, /\.income-impact-scenario-field--lifestyle > input\[type="range"\]\s*\{[^}]*appearance:\s*none;[^}]*\}/);
assert.match(componentsSource, /\.income-impact-lifestyle-slider-labels/);
assert.match(componentsSource, /\.income-impact-toggle input:checked \+ span::after/);
assert.match(componentsSource, /\.income-impact-reevaluate-button\s*\{[^}]*font-size:\s*0\.92rem;[^}]*\}/);
assert.match(componentsSource, /\.income-impact-reevaluate-button img\s*\{[^}]*order:\s*2;[^}]*width:\s*1\.08rem;[^}]*height:\s*1\.08rem;[^}]*filter:\s*brightness\(0\) invert\(1\);[^}]*\}/);
assert.match(componentsSource, /data-income-impact-reevaluate-state="reevaluating"[\s\S]*animation:\s*income-impact-reevaluate-spin 0\.85s linear infinite;/);
assert.match(displaySource, /REEVALUATE_GRAPH_UPDATE_DELAY_MS\s*=\s*1500/);
assert.match(displaySource, /scheduleReevaluate\(applyReevaluate,\s*REEVALUATE_GRAPH_UPDATE_DELAY_MS\)/);
assert.match(displaySource, /getDraftLifestyleMonthlyDeltaLabel/);
assert.match(displaySource, /formatSignedMonthlyAmount\(monthlyDelta\)/);
assert.match(componentsSource, /\.income-impact-scenario-content/);
assert.match(componentsSource, /data-income-impact-selected-scenario-chip/);
assert.match(componentsSource, /data-income-impact-reevaluate-state="active"/);
assert.match(componentsSource, /data-income-impact-draft-state="dirty"[\s\S]*data-income-impact-reevaluate/);
assert.match(componentsSource, /data-income-impact-scenario-select/);
assert.match(componentsSource, /data-income-impact-applied-scenario-selected="true"/);
assert.doesNotMatch(
  componentsSource,
  /\.income-impact-graph-path\[data-income-impact-scenario-select\]/,
  "Scenario graph paths should not restore retired path-click affordances."
);
assert.match(
  componentsSource,
  /@media \(max-width: 720px\)[\s\S]*\.income-impact-scenario-banner[\s\S]*width:\s*100%;/,
  "Mobile scenario controls should keep the reference panel within the stacked rail."
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
assert.equal(harness.composerCalls[0].scenarioOptions.includeSurvivorIncome, true);
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
    includeSurvivorIncome: true,
    lifestyleSliderValue: 0,
    autoCompressBaselineEnabled: true
  },
  "initial draft scenario controls should mirror the currently evaluated control defaults."
);
assert.equal(initialScenarioComparisonState.appliedScenarios.length, 1, "initial evaluated scenario should be stored as appliedScenarios[0].");
assert.equal(initialScenarioComparisonState.appliedScenarios[0].scenarioId, "income-impact-current-scenario");
assert.equal(initialScenarioComparisonState.selectedScenarioId, initialScenarioComparisonState.appliedScenarios[0].scenarioId);
assert.equal(initialScenarioComparisonState.appliedScenarios[0].label, "Death tomorrow");
assert.deepEqual(initialScenarioComparisonState.appliedScenarios[0].settings, initialScenarioComparisonState.draftScenarioControls);
assert.equal(
  initialScenarioComparisonState.draftScenarioControls.autoCompressBaselineEnabled,
  true,
  "visible auto-compression control should appear in the public scenario-control snapshot."
);
assert.equal(
  initialScenarioComparisonState.draftScenarioControls.includeSurvivorIncome,
  true,
  "visible survivor-income control should appear in the public scenario-control snapshot."
);
assert.equal(
  Object.prototype.hasOwnProperty.call(initialScenarioComparisonState.draftScenarioControls, "bannerCollapsed"),
  false,
  "internal banner-collapse state should stay out of visible scenario-control snapshots."
);
assert.equal(initialScenarioComparisonState.appliedScenarios[0].scenario.scenario.selectedDeathAge, 45);
assert.equal(initialScenarioComparisonState.appliedScenarios[0].riskEvaluation.events[0].ruleId, "survivor-resources-depleted");
assert.equal(initialScenarioComparisonState.appliedScenarios[0].lifestyleAdjustment.sliderValue, 0);
assert.equal(initialScenarioComparisonState.appliedScenarios[0].lifestyleAdjustment.label, "Current");
assert.equal(initialScenarioComparisonState.hasDraftChanges, false);
assert.equal(harness.control.hidden, false);
assert.equal(harness.sliderRow.hidden, false);
assert.equal(harness.slider.disabled, false);
assert.equal(harness.slider.min, "0");
assert.equal(harness.slider.max, "100");
assert.equal(harness.slider.value, "45");
assert.deepEqual(
  harness.deathAgeSliderLabels.map(function (labelNode) { return labelNode.textContent; }),
  ["0", "25", "50", "75", "100"],
  "death age slider legend should use the full 0 to 100 visual scale."
);
assert.equal(harness.ageValue.textContent, "45");
assert.equal(harness.dateValue.textContent, "2026-01-01");
assert.equal(harness.mortgageTreatment.value, "followAssumptions");
assert.equal(harness.mortgageTreatmentValue.textContent, "Follow Assumption Controls");
assert.equal(harness.survivorIncome.checked, true);
assert.equal(harness.survivorIncome.getAttribute("aria-checked"), "true");
assert.equal(harness.survivorIncomeValue.textContent, "Included");
assert.equal(harness.lifestyleSlider.value, "0");
assert.equal(harness.lifestyleValue.textContent, "$0/mo");
assert.equal(harness.reevaluateButton.disabled, true);
assert.equal(harness.reevaluateButton.getAttribute("aria-disabled"), "true");
assert.equal(harness.reevaluateButton.getAttribute("data-income-impact-reevaluate-state"), "idle");
assert.equal(harness.reevaluateControl.getAttribute("data-income-impact-reevaluate-state"), "idle");
assert.equal(harness.reevaluateAction.textContent, "No pending changes");
assert.equal(harness.reevaluateAction.getAttribute("data-income-impact-reevaluate-action-state"), "idle");
assert.equal(harness.draftStatus.textContent, "Applied");
assert.equal(harness.draftStatus.getAttribute("data-income-impact-draft-status-state"), "applied");
assert.equal(harness.selectedScenarioLabel.textContent, "Death tomorrow");
assert.equal(harness.selectedScenarioChip.getAttribute("data-income-impact-applied-scenario-id"), "income-impact-current-scenario");
assert.equal(harness.selectedScenarioChip.getAttribute("data-income-impact-applied-scenario-selected"), "true");
assert.equal(harness.scenarioSummary.getAttribute("data-income-impact-selected-scenario-summary-label"), "Death tomorrow");
assert.equal(harness.scenarioSummary.getAttribute("data-income-impact-survivor-income-label"), "Survivor income included");
assert.equal(harness.toggle.getAttribute("aria-expanded"), "true");
assert.equal(harness.toggle.textContent, "Hide controls");
assert.equal(harness.content.hidden, false);
assert.equal(harness.banner.getAttribute("data-income-impact-scenario-state"), "expanded");
assert.equal(harness.banner.getAttribute("data-income-impact-draft-state"), "applied");
assert.equal(harness.banner.getAttribute("data-income-impact-selected-scenario-id"), "income-impact-current-scenario");
assert.equal(harness.banner.getAttribute("data-income-impact-reevaluate-action-label"), "No pending changes");
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
harness.slider.value = "20";
harness.slider.listeners.input({ target: harness.slider });
assert.equal(harness.slider.value, "45", "death age slider should not allow selecting below current age.");
harness.slider.value = "50";
harness.slider.listeners.input({ target: harness.slider });
let draftState = harness.getScenarioComparisonStateSnapshot();
assert.equal(draftState.draftScenarioControls.selectedDeathAge, 50);
assert.equal(draftState.appliedScenarios[0].settings.selectedDeathAge, 45);
assert.equal(draftState.hasDraftChanges, true);
assert.equal(harness.reevaluateButton.disabled, false);
assert.equal(harness.reevaluateButton.getAttribute("aria-disabled"), "false");
assert.equal(harness.reevaluateButton.getAttribute("data-income-impact-reevaluate-state"), "active");
assert.equal(harness.reevaluateControl.getAttribute("data-income-impact-reevaluate-state"), "active");
assert.equal(harness.reevaluateAction.textContent, "Adds scenario to key");
assert.equal(harness.reevaluateAction.getAttribute("data-income-impact-reevaluate-action-state"), "active");
assert.equal(harness.draftStatus.textContent, "Pending");
assert.equal(harness.banner.getAttribute("data-income-impact-draft-state"), "dirty");
assert.equal(harness.banner.getAttribute("data-income-impact-reevaluate-action-label"), "Adds scenario to key");

harness.reevaluateButton.listeners.click();
assert.equal(harness.composerCalls.length, 1, "Reevaluate should delay graph recomposition before applying draft death age.");
assert.equal(harness.reevaluateTimers.at(-1).delay, 1500, "Reevaluate should wait 1.5 seconds before updating the graph.");
assert.equal(harness.reevaluateButton.disabled, true);
assert.equal(harness.reevaluateButton.getAttribute("data-income-impact-reevaluate-state"), "reevaluating");
assert.equal(harness.reevaluateControl.getAttribute("data-income-impact-reevaluate-state"), "reevaluating");
assert.equal(harness.reevaluateAction.textContent, "Updating graph");
assert.equal(harness.draftStatus.textContent, "Updating");
harness.flushReevaluateTimers();
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
assert.match(harness.host.innerHTML, /data-income-impact-graph-path="postDeathResources"/);
assert.match(harness.host.innerHTML, /data-income-impact-graph-path="postDeathResources--scenario-2"/);
assert.equal(
  (harness.host.innerHTML.match(/data-income-impact-graph-path="postDeathResources(?:--scenario-2)?"/g) || []).length,
  2,
  "Reevaluate with a second applied scenario should render the selected resource path plus one comparison path."
);
assert.match(harness.host.innerHTML, /data-income-impact-scenario-select="income-impact-current-scenario"/);
assert.match(harness.host.innerHTML, new RegExp(`data-income-impact-scenario-select="${selectedSecondScenario.scenarioId}"`));
assert.match(harness.host.innerHTML, /data-income-impact-applied-scenario-selected="true"/);
assert.match(harness.host.innerHTML, /Death in 5 years/);
assert.match(harness.host.innerHTML, /Death tomorrow/);
assert.equal(draftState.hasDraftChanges, false);
assert.equal(harness.reevaluateButton.disabled, true);
assert.equal(harness.draftStatus.textContent, "Applied");
assert.equal(harness.reevaluateAction.textContent, "No pending changes");
assert.equal(harness.selectedScenarioLabel.textContent, "Death in 5 years");
assert.equal(harness.banner.getAttribute("data-income-impact-selected-scenario-id"), selectedSecondScenario.scenarioId);

assert.equal(typeof harness.host.listeners.click, "function", "scenario selection should be delegated from the graph host.");
assert.equal(typeof harness.host.listeners.keydown, "function", "scenario selection should support keyboard activation.");
const originalScenarioSelectionTarget = createElement({
  attributes: {
    "data-income-impact-scenario-select": "income-impact-current-scenario",
    "data-income-impact-applied-scenario-id": "income-impact-current-scenario",
    "data-income-impact-applied-scenario-selected": "false",
    "aria-pressed": "false"
  }
});
const secondScenarioSelectionTarget = createElement({
  attributes: {
    "data-income-impact-scenario-select": selectedSecondScenario.scenarioId,
    "data-income-impact-applied-scenario-id": selectedSecondScenario.scenarioId,
    "data-income-impact-applied-scenario-selected": "true",
    "aria-pressed": "true"
  }
});
harness.host.selectorResults["[data-income-impact-applied-scenario-id]"] = [
  originalScenarioSelectionTarget,
  secondScenarioSelectionTarget
];
const countsBeforeScenarioSelection = {
  composer: harness.composerCalls.length,
  risk: harness.riskEvaluatorCalls.length,
  graph: harness.graphModelCalls.length
};
let scenarioSelectionDefaultPrevented = false;
harness.host.listeners.click({
  target: originalScenarioSelectionTarget,
  preventDefault() {
    scenarioSelectionDefaultPrevented = true;
  }
});
assert.equal(scenarioSelectionDefaultPrevented, true, "valid scenario selection should prevent default path interaction.");
assert.equal(harness.composerCalls.length, countsBeforeScenarioSelection.composer, "selecting a scenario should not rerun composer.");
assert.equal(harness.riskEvaluatorCalls.length, countsBeforeScenarioSelection.risk, "selecting a scenario should not rerun risk evaluator.");
assert.equal(harness.graphModelCalls.length, countsBeforeScenarioSelection.graph + 1, "selecting a scenario should rebuild the graph model for the selected visible scenario.");
assert.equal(harness.graphModelCalls.at(-1).selectedScenarioId, "income-impact-current-scenario");
assert.equal(harness.graphModelCalls.at(-1).appliedScenarios.length, 2);
let selectedOriginalState = harness.getScenarioComparisonStateSnapshot();
assert.equal(selectedOriginalState.selectedScenarioId, "income-impact-current-scenario");
assert.equal(selectedOriginalState.draftScenarioControls.selectedDeathAge, 45);
assert.equal(selectedOriginalState.draftScenarioControls.lifestyleSliderValue, 0);
assert.equal(selectedOriginalState.hasDraftChanges, false);
assert.equal(harness.slider.value, "45");
assert.equal(harness.ageValue.textContent, "45");
assert.equal(harness.lifestyleSlider.value, "0");
assert.equal(harness.lifestyleValue.textContent, "$0/mo");
assert.equal(harness.selectedScenarioLabel.textContent, "Death tomorrow");
assert.equal(harness.banner.getAttribute("data-income-impact-selected-scenario-id"), "income-impact-current-scenario");
assert.equal(harness.reevaluateAction.textContent, "No pending changes");
assert.equal(originalScenarioSelectionTarget.getAttribute("data-income-impact-applied-scenario-selected"), "true");
assert.equal(originalScenarioSelectionTarget.getAttribute("aria-pressed"), "true");
assert.equal(secondScenarioSelectionTarget.getAttribute("data-income-impact-applied-scenario-selected"), "false");
assert.equal(secondScenarioSelectionTarget.getAttribute("aria-pressed"), "false");

harness.host.listeners.keydown({
  key: "Enter",
  target: secondScenarioSelectionTarget,
  preventDefault() {}
});
draftState = harness.getScenarioComparisonStateSnapshot();
assert.equal(draftState.selectedScenarioId, selectedSecondScenario.scenarioId);
assert.equal(draftState.draftScenarioControls.selectedDeathAge, 50);
assert.equal(draftState.draftScenarioControls.lifestyleSliderValue, 0);
assert.equal(draftState.hasDraftChanges, false);
assert.equal(harness.slider.value, "50");
assert.equal(harness.ageValue.textContent, "50");
assert.equal(harness.selectedScenarioLabel.textContent, "Death in 5 years");
assert.equal(harness.banner.getAttribute("data-income-impact-selected-scenario-id"), selectedSecondScenario.scenarioId);
assert.equal(secondScenarioSelectionTarget.getAttribute("data-income-impact-applied-scenario-selected"), "true");
assert.equal(originalScenarioSelectionTarget.getAttribute("data-income-impact-applied-scenario-selected"), "false");
assert.equal(harness.composerCalls.length, countsBeforeScenarioSelection.composer, "keyboard scenario selection should not rerun composer.");
assert.equal(harness.riskEvaluatorCalls.length, countsBeforeScenarioSelection.risk);
assert.equal(harness.graphModelCalls.length, countsBeforeScenarioSelection.graph + 2, "keyboard scenario selection should rebuild the graph for the selected visible scenario.");

const graphViewToggleTarget = createElement({
  attributes: {
    "data-income-impact-graph-view-toggle": "",
    "data-income-impact-graph-view-mode": "postDeathFocus",
    "data-income-impact-next-graph-view-mode": "deathLeadUp"
  }
});
const graphViewCountsBeforeToggle = {
  composer: harness.composerCalls.length,
  risk: harness.riskEvaluatorCalls.length,
  graph: harness.graphModelCalls.length
};
let graphViewToggleDefaultPrevented = false;
harness.host.listeners.click({
  target: graphViewToggleTarget,
  preventDefault() {
    graphViewToggleDefaultPrevented = true;
  }
});
assert.equal(graphViewToggleDefaultPrevented, true, "graph view toggle should prevent default button interaction.");
assert.equal(harness.composerCalls.length, graphViewCountsBeforeToggle.composer, "graph view toggle should not rerun composer.");
assert.equal(harness.riskEvaluatorCalls.length, graphViewCountsBeforeToggle.risk, "graph view toggle should not rerun risk evaluator.");
assert.equal(harness.graphModelCalls.length, graphViewCountsBeforeToggle.graph, "graph view toggle should not rebuild graph model math.");
assert.match(harness.host.innerHTML, /data-income-impact-graph-view-mode="deathLeadUp"/);

const graphCallCountBeforeDuplicateReevaluate = harness.graphModelCalls.length;
harness.reevaluateButton.listeners.click();
assert.equal(harness.composerCalls.length, 2, "Reevaluate without draft changes should not rerun composer.");
assert.equal(harness.riskEvaluatorCalls.length, 2, "Reevaluate without draft changes should not rerun risk evaluator.");
assert.equal(harness.graphModelCalls.length, graphCallCountBeforeDuplicateReevaluate, "Reevaluate without draft changes should not rebuild the graph.");
assert.equal(harness.getScenarioComparisonStateSnapshot().appliedScenarios.length, 2, "Reevaluate without draft changes should not add duplicate scenarios.");

harness.mortgageTreatment.value = "payOffMortgage";
harness.mortgageTreatment.listeners.change({ target: harness.mortgageTreatment });
assert.equal(harness.composerCalls.length, 2, "draft mortgage treatment should not rerun composer before Reevaluate.");
assert.equal(harness.riskEvaluatorCalls.length, 2);
assert.equal(harness.graphModelCalls.length, graphCallCountBeforeDuplicateReevaluate);
assert.equal(harness.mortgageTreatment.value, "payOffMortgage");
assert.equal(harness.mortgageTreatmentValue.textContent, "Pay off mortgage");
assert.equal(harness.scenarioSummary.getAttribute("data-income-impact-mortgage-treatment-label"), "Pay off mortgage");
const mortgageScenarioComparisonState = harness.getScenarioComparisonStateSnapshot();
assert.equal(mortgageScenarioComparisonState.draftScenarioControls.mortgageTreatmentOverride, "payOffMortgage");
assert.equal(getSelectedAppliedScenario(mortgageScenarioComparisonState).settings.mortgageTreatmentOverride, "followAssumptions");
assert.equal(mortgageScenarioComparisonState.appliedScenarios.length, 2);

harness.reevaluateButton.listeners.click();
harness.flushReevaluateTimers();
assert.equal(harness.composerCalls.length, 3, "Reevaluate should apply draft mortgage treatment.");
assert.equal(harness.riskEvaluatorCalls.length, 3);
assert.equal(harness.graphModelCalls.length, graphCallCountBeforeDuplicateReevaluate + 1);
assert.equal(harness.composerCalls[2].scenarioOptions.mortgageTreatmentOverride, "payOffMortgage");
assert.notEqual(harness.graphModelCalls.at(-1).selectedScenarioId, "income-impact-current-scenario");
assert.equal(harness.graphModelCalls.at(-1).appliedScenarios.length, 2);
assert.equal(getSelectedAppliedScenario({ appliedScenarios: harness.graphModelCalls.at(-1).appliedScenarios, selectedScenarioId: harness.graphModelCalls.at(-1).selectedScenarioId }).settings.mortgageTreatmentOverride, "payOffMortgage");
assert.equal(harness.getScenarioComparisonStateSnapshot().hasDraftChanges, false);

harness.lifestyleSlider.value = "-100";
harness.lifestyleSlider.listeners.input({ target: harness.lifestyleSlider });
assert.equal(harness.composerCalls.length, 3, "draft lifestyle slider should not rerun composer before Reevaluate.");
assert.equal(harness.riskEvaluatorCalls.length, 3);
assert.equal(harness.graphModelCalls.length, graphCallCountBeforeDuplicateReevaluate + 1);
assert.equal(harness.lifestyleSlider.value, "-100");
assert.equal(harness.lifestyleValue.textContent, "-$500/mo");
assert.equal(harness.scenarioSummary.getAttribute("data-income-impact-lifestyle-label"), "Conservative");
const lifestyleDraftScenarioComparisonState = harness.getScenarioComparisonStateSnapshot();
assert.equal(lifestyleDraftScenarioComparisonState.draftScenarioControls.lifestyleSliderValue, -100);
assert.equal(getSelectedAppliedScenario(lifestyleDraftScenarioComparisonState).settings.lifestyleSliderValue, 0);
assert.equal(getInitialAppliedScenario(lifestyleDraftScenarioComparisonState).settings.lifestyleSliderValue, 0);
assert.equal(lifestyleDraftScenarioComparisonState.hasDraftChanges, true);

harness.reevaluateButton.listeners.click();
harness.flushReevaluateTimers();
assert.equal(harness.composerCalls.length, 4, "Reevaluate should apply draft lifestyle slider.");
assert.equal(harness.riskEvaluatorCalls.length, 4);
assert.equal(harness.graphModelCalls.length, graphCallCountBeforeDuplicateReevaluate + 2);
const lifestyleAppliedScenarioComparisonState = harness.getScenarioComparisonStateSnapshot();
const selectedLifestyleScenario = getSelectedAppliedScenario(lifestyleAppliedScenarioComparisonState);
const nonSelectedLifestyleScenario = getInitialAppliedScenario(lifestyleAppliedScenarioComparisonState);
assert.equal(selectedLifestyleScenario.settings.lifestyleSliderValue, -100);
assert.equal(selectedLifestyleScenario.lifestyleAdjustment.sliderValue, -100);
assert.equal(selectedLifestyleScenario.lifestyleAdjustment.label, "Conservative");
assert.equal(nonSelectedLifestyleScenario.settings.lifestyleSliderValue, 0, "non-selected scenario lifestyle setting should remain unchanged.");
assert.equal(nonSelectedLifestyleScenario.lifestyleAdjustment.sliderValue, 0, "non-selected scenario lifestyle adjustment should remain unchanged.");
assert.equal(lifestyleAppliedScenarioComparisonState.appliedScenarios.length, 2, "Reevaluate should keep V1 capped at two applied scenarios.");
assert.equal(lifestyleAppliedScenarioComparisonState.hasDraftChanges, false);

harness.survivorIncome.checked = false;
harness.survivorIncome.listeners.change({ target: harness.survivorIncome });
assert.equal(harness.composerCalls.length, 4, "draft survivor-income toggle should not rerun composer before Reevaluate.");
assert.equal(harness.riskEvaluatorCalls.length, 4);
assert.equal(harness.graphModelCalls.length, graphCallCountBeforeDuplicateReevaluate + 2);
assert.equal(harness.survivorIncome.checked, false);
assert.equal(harness.survivorIncome.getAttribute("aria-checked"), "false");
assert.equal(harness.survivorIncomeValue.textContent, "Excluded");
assert.equal(harness.scenarioSummary.getAttribute("data-income-impact-survivor-income-label"), "Survivor income excluded");
const survivorIncomeDraftState = harness.getScenarioComparisonStateSnapshot();
assert.equal(survivorIncomeDraftState.draftScenarioControls.includeSurvivorIncome, false);
assert.equal(getSelectedAppliedScenario(survivorIncomeDraftState).settings.includeSurvivorIncome, true);
assert.equal(survivorIncomeDraftState.hasDraftChanges, true);

harness.reevaluateButton.listeners.click();
harness.flushReevaluateTimers();
assert.equal(harness.composerCalls.length, 5, "Reevaluate should apply draft survivor-income toggle.");
assert.equal(harness.riskEvaluatorCalls.length, 5);
assert.equal(harness.graphModelCalls.length, graphCallCountBeforeDuplicateReevaluate + 3);
assert.equal(harness.composerCalls[4].scenarioOptions.includeSurvivorIncome, false);
const survivorIncomeAppliedState = harness.getScenarioComparisonStateSnapshot();
const selectedSurvivorIncomeScenario = getSelectedAppliedScenario(survivorIncomeAppliedState);
assert.equal(selectedSurvivorIncomeScenario.settings.includeSurvivorIncome, false);
assert.match(selectedSurvivorIncomeScenario.label, /no survivor income/);
assert.equal(survivorIncomeAppliedState.appliedScenarios.length, 2, "survivor-income override should add or replace one comparison scenario within the cap.");
assert.equal(survivorIncomeAppliedState.hasDraftChanges, false);
assert.equal(harness.reevaluateButton.disabled, true);

harness.toggle.listeners.click();
assert.equal(harness.composerCalls.length, 5, "collapsing should not rerun composer.");
assert.equal(harness.riskEvaluatorCalls.length, 5, "collapsing should not rerun risk evaluator.");
assert.equal(harness.graphModelCalls.length, graphCallCountBeforeDuplicateReevaluate + 3, "collapsing should not rebuild the graph model.");
assert.equal(harness.toggle.getAttribute("aria-expanded"), "false");
assert.equal(harness.toggle.textContent, "Show controls");
assert.equal(harness.content.hidden, true);
assert.equal(harness.banner.getAttribute("data-income-impact-scenario-state"), "collapsed");
assert.equal(harness.banner.classList.contains("is-collapsed"), true);

harness.toggle.listeners.click();
assert.equal(harness.composerCalls.length, 5, "expanding should not rerun composer.");
assert.equal(harness.riskEvaluatorCalls.length, 5, "expanding should not rerun risk evaluator.");
assert.equal(harness.graphModelCalls.length, graphCallCountBeforeDuplicateReevaluate + 3, "expanding should not rebuild the graph model.");
assert.equal(harness.toggle.getAttribute("aria-expanded"), "true");
assert.equal(harness.toggle.textContent, "Hide controls");
assert.equal(harness.content.hidden, false);
assert.equal(harness.banner.getAttribute("data-income-impact-scenario-state"), "expanded");
assert.equal(harness.banner.classList.contains("is-collapsed"), false);
assert.deepEqual(harness.storageWrites, [], "scenario controls should not write browser storage.");

const protectedChanges = getChangedFiles([
  "styles.css",
  "layout.css",
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
]).filter(function (file) {
  return file !== "life-insurance-planner/styles.css"
    || !(isAllowedIncomeImpactTitleStyleOverride() || isAllowedAnalysisSetupStyleFoundationDiff(repoRoot, file));
}).filter(function (file) {
  return file !== "life-insurance-planner/pages/analysis-setup.html"
    || !isAllowedAnalysisSetupEducationDescriptionRemovalDiff(repoRoot, file);
}).filter(function (file) {
  return file !== "life-insurance-planner/layout.css" || !isAllowedIncomeImpactSidePanelLayoutChange();
}).filter(function (file) {
  return file !== "life-insurance-planner/layout.css" || !isAllowedAssumptionControlsLayoutContractChange();
}).filter(function (file) {
  return file !== "life-insurance-planner/app/features/lens-analysis/lens-model-builder.js"
    || !isAllowedLensModelBuilderContractExposure();
}).filter(function (file) {
  return file !== "life-insurance-planner/app/features/lens-analysis/analysis-methods.js"
    || !isAllowedTreatedOngoingSupportMethodConsumption();
}).filter(function (file) {
  return !isAllowedIncomeImpactTreatedSupportConsumption(file);
}).filter(function (file) {
  return !isAllowedStepThreeTreatedSupportDisplay(file);
});
assert.deepEqual(
  protectedChanges,
  [],
  "Scenario banner check should not see unrelated shell/legacy CSS, app, storage, admin-adjacent, calculation, normalization, Step 3, result-page, or quick-flow changes."
);

console.log("income-loss-impact-scenario-banner-check passed");
