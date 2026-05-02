#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const repoRoot = path.resolve(__dirname, "..", "..");

function readRepoFile(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

function loadScript(context, relativePath) {
  vm.runInContext(readRepoFile(relativePath), context, { filename: relativePath });
}

function decodeHtml(value) {
  return String(value == null ? "" : value)
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/&gt;/g, ">")
    .replace(/&lt;/g, "<")
    .replace(/&amp;/g, "&");
}

function parseAttribute(markup, attributeName) {
  const pattern = new RegExp(attributeName + '="([^"]*)"', "i");
  const match = String(markup || "").match(pattern);
  return match ? decodeHtml(match[1]) : "";
}

function parseSelectedOption(markup) {
  const selectedMatch = String(markup || "").match(/<option[^>]*value="([^"]*)"[^>]*selected[^>]*>/i);
  if (selectedMatch) {
    return decodeHtml(selectedMatch[1]);
  }

  const firstMatch = String(markup || "").match(/<option[^>]*value="([^"]*)"[^>]*>/i);
  return firstMatch ? decodeHtml(firstMatch[1]) : "";
}

function parseRowsFromMarkup(markup) {
  const source = String(markup || "");
  const rowPattern = /<div class="field-group full-width pmi-expense-record-field" data-pmi-expense-record-entry data-pmi-expense-id="([^"]+)">([\s\S]*?)(?=\s*<div class="field-group full-width pmi-expense-record-field"|$)/g;
  const rows = [];
  let match;

  while ((match = rowPattern.exec(source)) !== null) {
    const expenseId = decodeHtml(match[1]);
    const rowMarkup = match[2];
    rows.push({
      getAttribute(name) {
        return name === "data-pmi-expense-id" ? expenseId : null;
      },
      querySelector(selector) {
        const inputSelectors = {
          "[data-pmi-expense-record-label]": "data-pmi-expense-record-label",
          "[data-pmi-expense-record-amount]": "data-pmi-expense-record-amount",
          "[data-pmi-expense-record-term-years]": "data-pmi-expense-record-term-years",
          "[data-pmi-expense-record-end-age]": "data-pmi-expense-record-end-age",
          "[data-pmi-expense-record-end-date]": "data-pmi-expense-record-end-date"
        };
        const selectSelectors = {
          "[data-pmi-expense-record-frequency]": "data-pmi-expense-record-frequency",
          "[data-pmi-expense-record-term-type]": "data-pmi-expense-record-term-type"
        };
        const inputAttribute = inputSelectors[selector];
        if (inputAttribute) {
          const inputPattern = new RegExp("<input[^>]*" + inputAttribute + "[^>]*>", "i");
          const inputMatch = rowMarkup.match(inputPattern);
          return inputMatch ? { value: parseAttribute(inputMatch[0], "value") } : null;
        }

        const selectAttribute = selectSelectors[selector];
        if (selectAttribute) {
          const selectPattern = new RegExp("<select[^>]*" + selectAttribute + "[^>]*>([\\s\\S]*?)<\\/select>", "i");
          const selectMatch = rowMarkup.match(selectPattern);
          return selectMatch ? { value: parseSelectedOption(selectMatch[0]) } : null;
        }

        return null;
      }
    });
  }

  return rows;
}

function createFakeElement() {
  return {
    dataset: {},
    innerHTML: "",
    hidden: false,
    className: "",
    setAttribute() {},
    appendChild() {},
    addEventListener() {},
    querySelector() {
      return null;
    },
    querySelectorAll() {
      return [];
    }
  };
}

function createFakeRoot() {
  const list = createFakeElement();
  const addButton = createFakeElement();
  const documentRef = {
    body: createFakeElement(),
    createElement() {
      return createFakeElement();
    },
    querySelector() {
      return null;
    }
  };
  list.querySelectorAll = function (selector) {
    return selector === "[data-pmi-expense-record-entry]"
      ? parseRowsFromMarkup(list.innerHTML)
      : [];
  };

  return {
    root: {
      dataset: {},
      innerHTML: "",
      ownerDocument: documentRef,
      querySelector(selector) {
        if (selector === "[data-pmi-expense-records-list]") {
          return list;
        }
        if (selector === "[data-pmi-expense-records-add]") {
          return addButton;
        }
        return null;
      }
    },
    list
  };
}

function assertNoProtectedDiffs() {
  const protectedFiles = [
    "pages/analysis-setup.html",
    "pages/analysis-estimate.html",
    "pages/income-loss-impact.html",
    "app/features/lens-analysis/normalize-lens-model.js",
    "app/features/lens-analysis/schema.js",
    "app/features/lens-analysis/analysis-methods.js",
    "app/features/lens-analysis/analysis-settings-adapter.js",
    "app/features/lens-analysis/step-three-analysis-display.js",
    "app/features/lens-analysis/analysis-setup.js",
    "app/features/lens-analysis/final-expense-inflation-calculations.js",
    "app/features/lens-analysis/final-expenses.js"
  ];
  const status = execFileSync("git", ["status", "--short", "--"].concat(protectedFiles), {
    cwd: repoRoot,
    encoding: "utf8"
  }).trim();

  assert.equal(status, "", "formula/display/normalization/Analysis Setup files should not have diffs");
}

function assertStrictProtectedDiffGuardIfRequested() {
  if (process.env.PMI_EXPENSE_RECORDS_STRICT_DIFF_GUARD !== "1") {
    return;
  }

  assertNoProtectedDiffs();
}

function stripJavaScriptComments(source) {
  return String(source || "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

function assertNoFormulaOwnerReferences(widgetSource) {
  const executableSource = stripJavaScriptComments(widgetSource);
  [
    {
      pattern: /analysis-methods|analysisMethods/,
      message: "PMI expense records widget should not reference analysis methods."
    },
    {
      pattern: /step-three-analysis-display/,
      message: "PMI expense records widget should not reference Step 3 display."
    },
    {
      pattern: /analysis-setup/,
      message: "PMI expense records widget should not reference Analysis Setup."
    },
    {
      pattern: /normalize-lens-model/,
      message: "PMI expense records widget should not reference Lens normalization."
    },
    {
      pattern: /final-expense-inflation-calculations/,
      message: "PMI expense records widget should not reference final expense inflation helpers."
    },
    {
      pattern: /inflationAssumptions|inflation-assumptions|healthcareInflation|finalExpenseInflation/,
      message: "PMI expense records widget should not reference inflation assumption or formula owners."
    },
    {
      pattern: /runNeedsAnalysis|runDimeAnalysis|runHlvAnalysis|runHumanLifeValueAnalysis/,
      message: "PMI expense records widget should not call analysis methods."
    }
  ].forEach(function (entry) {
    assert.equal(entry.pattern.test(executableSource), false, entry.message);
  });
}

function assertScriptOrder(source, relativePath) {
  const taxonomyIndex = source.indexOf("expense-taxonomy.js");
  const libraryIndex = source.indexOf("expense-library.js");
  const widgetIndex = source.indexOf("pmi-expense-records.js");
  assert.ok(taxonomyIndex !== -1, `${relativePath} should load expense taxonomy`);
  assert.ok(libraryIndex !== -1, `${relativePath} should load expense library`);
  assert.ok(widgetIndex !== -1, `${relativePath} should load pmi expense records`);
  assert.ok(taxonomyIndex < libraryIndex, `${relativePath} should load taxonomy before library`);
  assert.ok(libraryIndex < widgetIndex, `${relativePath} should load library before widget`);
}

function assertPageWiring(relativePath) {
  const source = readRepoFile(relativePath);
  assertScriptOrder(source, relativePath);
  assert.match(source, /data-pmi-expense-records-root/);
  assert.match(source, /initPmiExpenseRecords\(\{/);
  assert.match(source, /root: form\.querySelector\("\[data-pmi-expense-records-root\]"\)/);
  assert.match(source, /hydrateExpenseRecords\(saved\.expenseRecords\)/);
  assert.match(source, /draft\.expenseRecords = pmiExpenseRecordsController\.serializeExpenseRecords\(\)/);

  const expenseRootIndex = source.indexOf("data-pmi-expense-records-root");
  assert.ok(source.indexOf("subscriptions-cost") < expenseRootIndex, `${relativePath} should place expense records after scalar spending inputs`);
  assert.ok(expenseRootIndex < source.indexOf("Assets and Offset Planning"), `${relativePath} should place expense records before assets`);
}

const context = {
  console,
  window: null,
  document: null
};
context.window = context;
context.globalThis = context;
context.LensApp = { lensAnalysis: {} };
context.window.LensApp = context.LensApp;

vm.createContext(context);
loadScript(context, "app/features/lens-analysis/expense-taxonomy.js");
loadScript(context, "app/features/lens-analysis/expense-library.js");
loadScript(context, "app/features/lens-analysis/pmi-expense-records.js");

const lensAnalysis = context.LensApp.lensAnalysis;
const expenseLibrary = lensAnalysis.expenseLibrary;
const expenseTaxonomy = lensAnalysis.expenseTaxonomy;
const pmiExpenseRecords = lensAnalysis.pmiExpenseRecords;
const widgetSource = readRepoFile("app/features/lens-analysis/pmi-expense-records.js");

assertNoFormulaOwnerReferences(widgetSource);
assert.equal(typeof pmiExpenseRecords?.initPmiExpenseRecords, "function");
assert.equal(typeof pmiExpenseRecords?.hydrateExpenseRecords, "function");
assert.equal(typeof pmiExpenseRecords?.serializeExpenseRecords, "function");
assert.equal(typeof pmiExpenseRecords?.createExpenseRecordFromLibraryEntry, "function");
assert.match(widgetSource, /entry\.isAddable === true/);
assert.match(widgetSource, /entry\.uiAvailability === "initial"/);
assert.match(widgetSource, /entry\.isProtected !== true/);
assert.match(widgetSource, /entry\.isScalarFieldOwned !== true/);
assert.match(widgetSource, /const allEntries = getInitialAddableLibraryEntries\(\);/);

const medicalOutOfPocketEntry = expenseLibrary.findExpenseLibraryEntry("medicalOutOfPocket");
const medicalOutOfPocketRecord = pmiExpenseRecords.createExpenseRecordFromLibraryEntry(medicalOutOfPocketEntry);
assert.ok(medicalOutOfPocketRecord.expenseId.startsWith("expense_"));
assert.equal(medicalOutOfPocketRecord.categoryKey, "ongoingHealthcare");
assert.equal(medicalOutOfPocketRecord.typeKey, "medicalOutOfPocket");
assert.equal(medicalOutOfPocketRecord.amount, null);
assert.equal(medicalOutOfPocketRecord.frequency, "monthly");
assert.equal(medicalOutOfPocketRecord.termType, "ongoing");
assert.equal(medicalOutOfPocketRecord.termYears, null);
assert.equal(medicalOutOfPocketRecord.endAge, null);
assert.equal(medicalOutOfPocketRecord.endDate, null);
assert.equal(medicalOutOfPocketRecord.sourceKey, null);
assert.equal(medicalOutOfPocketRecord.isDefaultExpense, false);
assert.equal(medicalOutOfPocketRecord.isScalarFieldOwned, false);
assert.equal(medicalOutOfPocketRecord.isProtected, false);
assert.equal(medicalOutOfPocketRecord.isRepeatableExpenseRecord, true);
assert.equal(medicalOutOfPocketRecord.isCustomExpense, false);
assert.equal(medicalOutOfPocketRecord.notes, null);
assert.equal(medicalOutOfPocketRecord.metadata.sourceType, "user-input");
assert.equal(medicalOutOfPocketRecord.metadata.source, "expense-library");
assert.equal(medicalOutOfPocketRecord.metadata.libraryEntryKey, "medicalOutOfPocket");

const customExpenseRecord = pmiExpenseRecords.createExpenseRecordFromLibraryEntry(
  expenseLibrary.findExpenseLibraryEntry("customExpenseRecord")
);
assert.equal(customExpenseRecord.categoryKey, "customExpense");
assert.equal(customExpenseRecord.typeKey, "customExpenseRecord");
assert.equal(customExpenseRecord.isCustomExpense, true);

assert.equal(
  pmiExpenseRecords.createExpenseRecordFromLibraryEntry(expenseLibrary.findExpenseLibraryEntry("nursingCare")),
  null,
  "advanced expense entries should not be addable in the first UI"
);
assert.equal(
  pmiExpenseRecords.createExpenseRecordFromLibraryEntry(expenseLibrary.findExpenseLibraryEntry("hospiceCare")),
  null,
  "future expense entries should not be addable in the first UI"
);
assert.equal(
  pmiExpenseRecords.createExpenseRecordFromLibraryEntry(expenseLibrary.findExpenseLibraryEntry("medicalEndOfLifeCosts")),
  null,
  "protected scalar-owned expense entries should not be addable"
);
assert.equal(
  pmiExpenseRecords.createExpenseRecordFromLibraryEntry({
    typeKey: "fakeNoAddableFlag",
    categoryKey: "ongoingHealthcare",
    label: "Fake",
    uiAvailability: "initial"
  }),
  null,
  "expense entries must be explicitly addable"
);

const fakeDom = createFakeRoot();
const controller = pmiExpenseRecords.initPmiExpenseRecords({ root: fakeDom.root });
assert.ok(controller);
assert.equal(fakeDom.root.dataset.pmiExpenseRecordsInitialized, "true");

const inputRecords = Object.freeze([
  Object.freeze({
    expenseId: "expense_valid",
    categoryKey: "ongoingHealthcare",
    typeKey: "medicalOutOfPocket",
    label: "Medical Out-of-Pocket",
    amount: "250.50",
    frequency: "monthly",
    termType: "ongoing",
    sourceKey: null,
    isCustomExpense: false,
    metadata: Object.freeze({ sourceType: "user-input", source: "expense-library", libraryEntryKey: "medicalOutOfPocket" })
  }),
  Object.freeze({
    expenseId: "expense_zero",
    categoryKey: "visionCare",
    typeKey: "visionOutOfPocket",
    label: "Vision",
    amount: "0",
    frequency: "annual",
    termType: "ongoing"
  }),
  Object.freeze({
    expenseId: "expense_bad_frequency",
    categoryKey: "ongoingHealthcare",
    typeKey: "prescriptionMedications",
    label: "Prescriptions",
    amount: "100",
    frequency: "bad",
    termType: "bad"
  }),
  Object.freeze({
    expenseId: "expense_fixed_bad_detail",
    categoryKey: "educationExpense",
    typeKey: "tutoring",
    label: "Tutoring",
    amount: "120",
    frequency: "monthly",
    termType: "fixedYears",
    termYears: "not-a-number"
  }),
  Object.freeze({
    expenseId: "expense_until_age_bad_detail",
    categoryKey: "childcare",
    typeKey: "childcareExpense",
    label: "Childcare",
    amount: "800",
    frequency: "monthly",
    termType: "untilAge",
    endAge: "-3"
  }),
  Object.freeze({
    expenseId: "expense_until_date_bad_detail",
    categoryKey: "housingExpense",
    typeKey: "propertyTaxes",
    label: "Property Taxes",
    amount: "4500",
    frequency: "annual",
    termType: "untilDate",
    endDate: "2026-99-99"
  }),
  Object.freeze({
    expenseId: "expense_invalid_amount",
    categoryKey: "dentalCare",
    typeKey: "dentalOutOfPocket",
    label: "Dental",
    amount: "abc",
    frequency: "annual",
    termType: "ongoing"
  }),
  Object.freeze({
    expenseId: "expense_negative_amount",
    categoryKey: "transportation",
    typeKey: "vehicleInsurance",
    label: "Vehicle Insurance",
    amount: "-50",
    frequency: "monthly",
    termType: "ongoing"
  }),
  Object.freeze({
    expenseId: "expense_protected_scalar",
    categoryKey: "medicalFinalExpense",
    typeKey: "medicalEndOfLifeCosts",
    label: "Should Be Ignored",
    amount: "999999",
    frequency: "oneTime",
    termType: "oneTime"
  }),
  Object.freeze({
    expenseId: "expense_future",
    categoryKey: "medicalFinalExpense",
    typeKey: "hospiceCare",
    label: "Future Entry Should Be Ignored",
    amount: "6000",
    frequency: "oneTime",
    termType: "oneTime"
  }),
  Object.freeze({
    expenseId: "expense_advanced",
    categoryKey: "longTermCare",
    typeKey: "nursingCare",
    label: "Advanced Entry Should Be Ignored",
    amount: "9000",
    frequency: "monthly",
    termType: "fixedYears"
  }),
  Object.freeze({
    expenseId: "expense_custom",
    categoryKey: "customExpense",
    typeKey: "customExpenseRecord",
    label: "Custom Advisor Expense",
    amount: "75",
    frequency: "weekly",
    termType: "ongoing",
    isCustomExpense: true
  })
]);

controller.hydrateExpenseRecords(inputRecords);
assert.match(fakeDom.list.innerHTML, /Medical Out-of-Pocket/, "hydrate should render saved valid record labels");
assert.match(fakeDom.list.innerHTML, /Duration \/ term/, "expense record duration selector should use advisor-facing copy");
assert.doesNotMatch(fakeDom.list.innerHTML, />Term Type</, "expense record duration selector should not use the stale Term Type label");
assert.doesNotMatch(fakeDom.list.innerHTML, /Should Be Ignored/, "hydrate should reject protected scalar expense records");
assert.doesNotMatch(fakeDom.list.innerHTML, /Future Entry Should Be Ignored/, "hydrate should reject future expense records");
assert.doesNotMatch(fakeDom.list.innerHTML, /Advanced Entry Should Be Ignored/, "hydrate should reject advanced expense records");

const serialized = controller.serializeExpenseRecords();
assert.equal(serialized.length, 7);

const valid = serialized.find((record) => record.expenseId === "expense_valid");
assert.ok(valid, "valid expense record should serialize");
assert.equal(valid.label, "Medical Out-of-Pocket");
assert.equal(valid.amount, 250.5);
assert.equal(valid.frequency, "monthly");
assert.equal(valid.termType, "ongoing");
assert.equal(valid.termYears, null);
assert.equal(valid.endAge, null);
assert.equal(valid.endDate, null);
assert.equal(valid.categoryKey, "ongoingHealthcare");
assert.equal(valid.typeKey, "medicalOutOfPocket");
assert.equal(valid.sourceKey, null);
assert.equal(valid.isDefaultExpense, false);
assert.equal(valid.isScalarFieldOwned, false);
assert.equal(valid.isProtected, false);
assert.equal(valid.isRepeatableExpenseRecord, true);
assert.equal(valid.isCustomExpense, false);
assert.equal(valid.notes, null);
assert.equal(valid.metadata.source, "expense-library");
assert.equal(valid.metadata.libraryEntryKey, "medicalOutOfPocket");

const zero = serialized.find((record) => record.expenseId === "expense_zero");
assert.ok(zero, "zero amounts should serialize as non-negative raw facts");
assert.equal(zero.amount, 0);

const badFrequency = serialized.find((record) => record.expenseId === "expense_bad_frequency");
assert.ok(badFrequency, "invalid frequency and term type should normalize through taxonomy helpers");
assert.equal(badFrequency.frequency, "monthly");
assert.equal(badFrequency.termType, "ongoing");
assert.equal(expenseTaxonomy.isValidExpenseFrequency(badFrequency.frequency), true);
assert.equal(expenseTaxonomy.isValidExpenseTermType(badFrequency.termType), true);

const fixedBadDetail = serialized.find((record) => record.expenseId === "expense_fixed_bad_detail");
assert.ok(fixedBadDetail, "invalid fixedYears detail should not block raw record serialization");
assert.equal(fixedBadDetail.termType, "fixedYears");
assert.equal(fixedBadDetail.termYears, null);

const untilAgeBadDetail = serialized.find((record) => record.expenseId === "expense_until_age_bad_detail");
assert.ok(untilAgeBadDetail, "invalid untilAge detail should not block raw record serialization");
assert.equal(untilAgeBadDetail.termType, "untilAge");
assert.equal(untilAgeBadDetail.endAge, null);

const untilDateBadDetail = serialized.find((record) => record.expenseId === "expense_until_date_bad_detail");
assert.ok(untilDateBadDetail, "invalid untilDate detail should not block raw record serialization");
assert.equal(untilDateBadDetail.termType, "untilDate");
assert.equal(untilDateBadDetail.endDate, null);

const custom = serialized.find((record) => record.expenseId === "expense_custom");
assert.ok(custom, "custom expense records should serialize");
assert.equal(custom.categoryKey, "customExpense");
assert.equal(custom.typeKey, "customExpenseRecord");
assert.equal(custom.isCustomExpense, true);

assert.deepEqual(inputRecords[0], {
  expenseId: "expense_valid",
  categoryKey: "ongoingHealthcare",
  typeKey: "medicalOutOfPocket",
  label: "Medical Out-of-Pocket",
  amount: "250.50",
  frequency: "monthly",
  termType: "ongoing",
  sourceKey: null,
  isCustomExpense: false,
  metadata: { sourceType: "user-input", source: "expense-library", libraryEntryKey: "medicalOutOfPocket" }
});

[
  "pages/next-step.html",
  "pages/confidential-inputs.html"
].forEach(assertPageWiring);

[
  "pages/analysis-estimate.html",
  "pages/income-loss-impact.html"
].forEach((relativePath) => {
  const source = readRepoFile(relativePath);
  assert.equal(source.includes("pmi-expense-records.js"), false, `${relativePath} should not load the PMI expense widget`);
  assert.equal(source.includes("data-pmi-expense-records-root"), false, `${relativePath} should not mount the PMI expense widget`);
});

assertStrictProtectedDiffGuardIfRequested();

console.log("pmi-expense-records-check passed");
