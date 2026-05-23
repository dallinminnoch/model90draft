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
  const rowPattern = /<div class="pmi-expense-record-row" role="row" data-pmi-expense-record-entry data-pmi-expense-id="([^"]+)">/g;
  const rows = [];
  const matches = Array.from(source.matchAll(rowPattern));

  matches.forEach(function (match, index) {
    const expenseId = decodeHtml(match[1]);
    const rowStart = match.index;
    const nextRowStart = matches[index + 1] ? matches[index + 1].index : source.length;
    const rowMarkup = source.slice(rowStart, nextRowStart);
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
          "[data-pmi-expense-record-term-type]": "data-pmi-expense-record-term-type",
          "[data-pmi-expense-record-continuation-status]": "data-pmi-expense-record-continuation-status"
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
  });

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

function assertImageFileExists(iconSrcOrFile, message) {
  const iconFile = path.basename(String(iconSrcOrFile || ""));
  assert.ok(iconFile, message || "icon file should be present");
  assert.equal(
    fs.existsSync(path.join(repoRoot, "Images", iconFile)),
    true,
    message || `expected Images/${iconFile} to exist`
  );
}

function getInitialAddableExpenseEntries(expenseLibrary) {
  return expenseLibrary.getExpenseLibraryEntries().filter(function (entry) {
    return Boolean(
      entry
      && entry.isAddable === true
      && entry.isProtected !== true
      && entry.isScalarFieldOwned !== true
      && entry.uiAvailability === "initial"
    );
  });
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
  assert.match(source, /data-pmi-expense-cashflow-root/);
  assert.match(source, /data-pmi-expense-records-root/);
  assert.match(source, /initPmiExpenseRecords\(\{/);
  assert.match(source, /root: form\.querySelector\("\[data-pmi-expense-records-root\]"\)/);
  if (relativePath === "pages/next-step.html") {
    assert.match(source, /cashFlowRoot: document\.querySelector\("\[data-pmi-expense-cashflow-root\]"\)/);
  } else {
    assert.match(source, /cashFlowRoot: form\.querySelector\("\[data-pmi-expense-cashflow-root\]"\)/);
  }
  assert.match(source, /pageRoot: form/);
  assert.match(source, /function refreshPmiExpenseCashFlowBar\(\)/);
  assert.match(source, /refreshPmiExpenseCashFlowBar\(\);/);
  assert.match(source, /hydrateExpenseRecords\(saved\.expenseRecords\)/);
  assert.match(source, /draft\.expenseRecords = pmiExpenseRecordsController\.serializeExpenseRecords\(\)/);

  const cashFlowRootIndex = source.indexOf("data-pmi-expense-cashflow-root");
  const scalarNotebookIndex = source.indexOf("data-pmi-scalar-expenses-notebook");
  const expenseRootIndex = source.indexOf("data-pmi-expense-records-root");
  if (relativePath === "pages/next-step.html") {
    const formStartIndex = source.indexOf('id="protection-modeling-form"');
    const formEndIndex = source.indexOf("</form>", formStartIndex);
    assert.ok(formStartIndex !== -1 && formEndIndex !== -1, `${relativePath} should retain the PMI form`);
    assert.ok(cashFlowRootIndex > formEndIndex, `${relativePath} should place the cash-flow bar in the right-side rail outside the form`);
    assert.equal(scalarNotebookIndex, -1, `${relativePath} should not render the scalar spending notebook after record-first Phase 2`);
    assert.ok(expenseRootIndex !== -1, `${relativePath} should keep expense records as the visible expense-entry surface`);
  } else {
    assert.ok(cashFlowRootIndex < scalarNotebookIndex, `${relativePath} should place the cash-flow bar before the scalar spending notebook`);
    assert.ok(cashFlowRootIndex < expenseRootIndex, `${relativePath} should place the cash-flow bar before Additional Expenses`);
    assert.ok(source.indexOf("subscriptions-cost") < expenseRootIndex, `${relativePath} should place expense records after scalar spending inputs`);
  }
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
const componentsCss = readRepoFile("components.css");
const nextStepSource = readRepoFile("pages/next-step.html");
const EXPECTED_STARTER_EXPENSE_KEYS = Object.freeze([
  "householdInsurancePremiums",
  "medicalOutOfPocket",
  "groceries",
  "householdTransportation",
  "childcareExpense",
  "internetPhone",
  "householdConsumablesSupplies",
  "entertainmentRecreation",
  "recurringPersonalSpendingDefault"
]);
const EXPECTED_STARTER_EXPENSE_LABELS = Object.freeze([
  "Non-Housing Monthly Insurance",
  "Healthcare / Out-of-Pocket Medical",
  "Monthly Food / Grocery Cost",
  "Monthly Transportation Cost",
  "Childcare / Dependent Care",
  "Phone / Internet",
  "Household Essentials / Supplies",
  "Entertainment / Travel",
  "Recurring Personal Spending"
]);

assertNoFormulaOwnerReferences(widgetSource);
assert.match(widgetSource, /Additional Expenses records from PMI/);
assert.match(widgetSource, /Healthcare bucket rows can affect Needs healthcareExpenses automatically/);
assert.match(widgetSource, /non-healthcare rows remain raw-only for current output/);
assert.match(widgetSource, /continuationStatus is future support-treatment metadata/);
assert.match(widgetSource, /Healthcare bucket rows remain saved as healthcare-sensitive facts/);
assert.match(widgetSource, /non-healthcare rows remain saved raw facts unless another LENS component explicitly owns them/);
assert.match(widgetSource, /Review overlap with starter expense rows to avoid duplicate entry/);
assert.doesNotMatch(widgetSource, /Use this for expenses not already captured in Household Spending/, "Additional Expenses widget should not render the deleted helper paragraph");
assert.doesNotMatch(widgetSource, /collect repeatable raw-only expenseRecords\[\] rows from PMI/);
assert.doesNotMatch(widgetSource, /Search or browse initial expense types to add as raw PMI facts/);
assert.equal(typeof pmiExpenseRecords?.initPmiExpenseRecords, "function");
assert.equal(typeof pmiExpenseRecords?.hydrateExpenseRecords, "function");
assert.equal(typeof pmiExpenseRecords?.hydrateGeneratedExpenseFacts, "function");
assert.equal(typeof pmiExpenseRecords?.refreshGeneratedExpenseFactsFromDebtRecords, "function");
assert.equal(typeof pmiExpenseRecords?.serializeExpenseRecords, "function");
assert.equal(typeof pmiExpenseRecords?.createExpenseRecordFromLibraryEntry, "function");
assert.equal(typeof pmiExpenseRecords?.createCommonExpenseSourceDataFromExpenseRecords, "function");
assert.equal(typeof pmiExpenseRecords?.getExpenseTypeIconFile, "function");
assert.equal(typeof pmiExpenseRecords?.getExpenseTypeIconModel, "function");
assert.equal(typeof pmiExpenseRecords?.calculateMonthlyCashFlow, "function");
assert.equal(typeof pmiExpenseRecords?.toMonthlyCashFlowAmount, "function");
assert.match(widgetSource, /business1\.svg/, "business expense categories should use the user-provided business1.svg icon");
assert.match(widgetSource, /custom1\.svg/, "custom expense categories should use the user-provided custom1.svg icon");
assert.match(widgetSource, /taxes\.svg/, "tax expense categories should use taxes.svg");
assert.match(widgetSource, /debt-payment\.svg/, "generated debt-payment rows should use the shared debt-payment icon fallback");
assert.match(widgetSource, /pmi-expense-record-type-chip/, "expense rows should render type icons next to visible titles");
assert.match(widgetSource, /pmi-expense-record-type-visible-label/, "expense rows should keep visible type titles next to icons on the PMI form");
assert.match(widgetSource, /pmi-expense-record-type-visually-hidden/, "expense type icon chips should preserve hidden accessible labels");
assert.match(widgetSource, /aria-label="\$\{escapeHtml\(safeIconModel\.accessibleLabel\)\}"/, "expense type icon chips should expose aria-label text");
assert.match(widgetSource, /title="\$\{escapeHtml\(safeIconModel\.label\)\}"/, "expense type icon chips should expose tooltip title text");
assert.match(widgetSource, /<strong>\$\{escapeHtml\(entry\.label\)\}<\/strong>/, "Add Expense menu should remain text-first");
assert.doesNotMatch(nextStepSource, /<label for="insurance-cost">Non-Housing Monthly Insurance<\/label>/, "canonical PMI should not render scalar expense rows after record-first Phase 2");
assert.doesNotMatch(nextStepSource, /<label for="subscriptions-cost">Recurring Personal Spending<\/label>/, "canonical PMI should not render personal scalar expense rows after record-first Phase 2");
assert.doesNotMatch(nextStepSource, /data-pmi-scalar-expenses-notebook/, "canonical PMI should not render the scalar expense notebook after record-first Phase 2");
assert.match(widgetSource, /data-pmi-expense-cashflow-bar/, "expense records should render the monthly cash-flow readout");
assert.match(widgetSource, /cashFlowRoot/, "expense records should support a dedicated top-level cash-flow mount");
assert.match(widgetSource, /Take-home pay/, "expense cash-flow readout should label the monthly net-income base");
assert.match(widgetSource, /Housing burden/, "expense cash-flow readout should label the housing segment clearly");
assert.match(widgetSource, /Required debt/, "expense cash-flow readout should label the required debt segment clearly");
assert.match(widgetSource, /Lifestyle expenses/, "expense cash-flow readout should label recurring expenses clearly");
assert.match(widgetSource, /Available before savings/, "expense cash-flow readout should label positive remaining cash flow clearly");
assert.match(widgetSource, /Before savings allocations/, "expense cash-flow readout should match the reference sidebar status");
assert.match(widgetSource, /Shortfall before savings/, "expense cash-flow readout should label negative remaining cash flow clearly");
assert.match(widgetSource, /Savings allocations not yet included\./, "expense cash-flow readout should explain the pre-savings scope");
assert.match(widgetSource, /data-pmi-expense-generated-entry/, "expense records should render generated read-only rows when provided");
assert.match(widgetSource, /From Debt Records/, "generated debt-payment rows should identify Debt Records as the source");
assert.match(widgetSource, /Edit in Debt Records/, "generated debt-payment rows should show a source edit hint");
assert.match(widgetSource, /data-pmi-expense-records-table/, "expense records should render a notebook table shell");
assert.match(widgetSource, /class="pmi-expense-record-row"/, "expense records should render compact row shells");
assert.match(widgetSource, /data-pmi-expense-record-type-label/, "expense rows should retain the type-cell test hook");
assert.doesNotMatch(widgetSource, /class="pmi-expense-record-type-label" data-pmi-expense-record-type-label title="\$\{escapeHtml\(expenseTypeLabel\)\}"/, "expense rows should not render the old visible text-only type pill");
assert.match(widgetSource, /aria-label="Label \/ Vendor"/, "desktop rows should use aria labels instead of repeated visible labels");
assert.doesNotMatch(widgetSource, /class="field-group full-width pmi-expense-record-field"/, "old stacked expense card shell should not be used");
assert.doesNotMatch(widgetSource, /class="form-grid pmi-expense-record-grid"/, "old nested expense field grid should not be used");
assert.match(componentsCss, /\.pmi-expense-records-table\s*{[\s\S]*?overflow:\s*hidden;/, "expense notebook shell should own the table frame");
assert.match(componentsCss, /\.pmi-expense-cashflow\s*{[\s\S]*?grid-column:\s*1 \/ -1;/, "expense cash-flow readout should own a full-width card row");
assert.match(componentsCss, /\.pmi-expense-cashflow-track\s*{[\s\S]*?display:\s*flex;/, "expense cash-flow readout should render a compact segmented bar");
assert.match(componentsCss, /\.pmi-expense-cashflow-legend\s*{[\s\S]*?display:\s*flex;/, "expense cash-flow readout should render a compact text legend");
assert.match(componentsCss, /\.pmi-expense-cashflow-legend-swatch--remaining\s*{[\s\S]*?background:\s*#10b981;/, "expense cash-flow legend should map text labels to segment colors");
assert.match(componentsCss, /\.pmi-expense-records-header,\s*\.pmi-expense-record-row\s*{[\s\S]*?display:\s*grid;/, "expense notebook rows should use grid layout");
assert.match(componentsCss, /\.pmi-expense-records-header,\s*\.pmi-expense-record-row\s*{[\s\S]*?minmax\(0,\s*1\.12fr\)/, "expense notebook grid should keep a bounded icon-plus-title type column");
assert.match(componentsCss, /\.pmi-expense-record-type-chip\s*{[\s\S]*?gap:\s*0\.34rem;/, "expense type icons should sit just left of visible titles with a compact gap");
assert.match(componentsCss, /\.pmi-expense-record-type-visible-label\s*{[\s\S]*?text-overflow:\s*ellipsis;/, "expense type titles should truncate cleanly next to icons");
assert.match(componentsCss, /\.pmi-expense-record-type-icon\s*{[\s\S]*?filter:\s*brightness\(0\) saturate\(100%\);/, "expense type icons should render as black monochrome assets");
assert.match(componentsCss, /\.pmi-expense-records-list\s*{[\s\S]*?overflow-x:\s*visible;/, "expense notebook should not use horizontal scrolling as the desktop layout");
assert.match(componentsCss, /\.pmi-expense-record-row input,\s*\.pmi-expense-record-row select\s*{[\s\S]*?min-height:\s*1\.72rem;/, "expense notebook controls should be compact");
assert.match(componentsCss, /\.pmi-expense-record-row input,\s*\.pmi-expense-record-row select\s*{[\s\S]*?border-radius:\s*0\.18rem;/, "expense notebook controls should use sharper corners");
assert.match(componentsCss, /\.pmi-expense-record-row-generated\s*{[\s\S]*?background:/, "generated debt-payment rows should have a read-only visual treatment");
assert.match(componentsCss, /\.pmi-expense-record-source-chip,\s*\.pmi-expense-record-source-hint\s*{[\s\S]*?text-transform:\s*uppercase;/, "generated debt-payment rows should expose compact source cues");
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
assert.equal(medicalOutOfPocketRecord.continuationStatus, "review");
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

const propertyTaxesRecord = pmiExpenseRecords.createExpenseRecordFromLibraryEntry(
  expenseLibrary.findExpenseLibraryEntry("propertyTaxes")
);
assert.equal(propertyTaxesRecord.continuationStatus, "continues", "new household expense records should default continuationStatus from the library");

const customExpenseRecord = pmiExpenseRecords.createExpenseRecordFromLibraryEntry(
  expenseLibrary.findExpenseLibraryEntry("customExpenseRecord")
);
assert.equal(customExpenseRecord.categoryKey, "customExpense");
assert.equal(customExpenseRecord.typeKey, "customExpenseRecord");
assert.equal(customExpenseRecord.isCustomExpense, true);
assert.equal(customExpenseRecord.continuationStatus, "review");

const expectedExpenseIconFiles = [
  "healthcare.svg",
  "dental.svg",
  "vision.svg",
  "final.svg",
  "home.svg",
  "utilities.svg",
  "groceries.svg",
  "vehicle.svg",
  "insurance.svg",
  "family-support.svg",
  "education.svg",
  "personal-living.svg",
  "entertainment.svg",
  "travel.svg",
  "pet.svg",
  "giving.svg",
  "taxes.svg",
  "legal.svg",
  "business1.svg",
  "banking.svg",
  "savings.svg",
  "calendar-reserve.svg",
  "debt-payment.svg",
  "custom1.svg"
];
expectedExpenseIconFiles.forEach(function (iconFile) {
  assertImageFileExists(iconFile, `expected expense icon asset Images/${iconFile} to exist`);
});

const initialAddableEntries = getInitialAddableExpenseEntries(expenseLibrary);
assert.equal(initialAddableEntries.length, 301, "current Add Expense menu should expose the expected initial addable library count");
initialAddableEntries.forEach(function (entry) {
  const iconModel = pmiExpenseRecords.getExpenseTypeIconModel({
    typeKey: entry.typeKey,
    categoryKey: entry.categoryKey
  });
  assert.ok(iconModel.iconFile, `${entry.typeKey} should resolve to an expense icon file`);
  assert.match(iconModel.src, /^\.\.\/Images\//, `${entry.typeKey} icon should load from Images`);
  assertImageFileExists(iconModel.src, `${entry.typeKey} icon src should point to an existing file`);
  assert.equal(iconModel.accessibleLabel, `Expense type: ${entry.label}`, `${entry.typeKey} should preserve full accessible label`);
});
assert.equal(
  pmiExpenseRecords.getExpenseTypeIconFile(expenseLibrary.findExpenseLibraryEntry("officeRentCoworking")),
  "business1.svg",
  "business/self-employment rows should use business1.svg"
);
assert.equal(
  pmiExpenseRecords.getExpenseTypeIconFile(expenseLibrary.findExpenseLibraryEntry("otherCustomExpense")),
  "custom1.svg",
  "custom expense rows should use custom1.svg"
);
assert.equal(
  pmiExpenseRecords.getExpenseTypeIconFile(expenseLibrary.findExpenseLibraryEntry("selfEmploymentTax")),
  "taxes.svg",
  "tax rows should use taxes.svg"
);
assert.equal(
  pmiExpenseRecords.getExpenseTypeIconFile(expenseLibrary.findExpenseLibraryEntry("medicalOutOfPocket")),
  "healthcare.svg",
  "healthcare rows should use healthcare.svg"
);
assert.equal(
  pmiExpenseRecords.getExpenseTypeIconFile(expenseLibrary.findExpenseLibraryEntry("visionOutOfPocket")),
  "vision.svg",
  "vision rows should use vision.svg"
);
assert.equal(
  pmiExpenseRecords.getExpenseTypeIconFile(expenseLibrary.findExpenseLibraryEntry("dentalOutOfPocket")),
  "dental.svg",
  "dental rows should use dental.svg"
);
expenseLibrary.getExpenseLibraryEntries()
  .filter(function (entry) {
    return entry.generatedOnly === true
      || entry.sourceOwnedBy === "debtRecords"
      || entry.categoryKey === "debtObligations";
  })
  .forEach(function (entry) {
    assert.equal(
      pmiExpenseRecords.getExpenseTypeIconFile({
        typeKey: entry.typeKey,
        categoryKey: entry.categoryKey,
        isGeneratedExpense: true,
        isDebtPaymentExpense: true
      }),
      "debt-payment.svg",
      `${entry.typeKey} generated/system row should use debt-payment.svg`
    );
  });

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
assert.match(fakeDom.root.innerHTML, /Additional Expenses/, "widget should render the Additional Expenses heading");
assert.doesNotMatch(fakeDom.root.innerHTML, /Use this for expenses not already captured in Household Spending/, "widget should not render the deleted Additional Expenses helper paragraph");
assert.doesNotMatch(fakeDom.root.innerHTML, /Healthcare bucket rows are included in LENS healthcare expenses automatically/, "widget should not render the deleted healthcare behavior helper paragraph");
assert.doesNotMatch(fakeDom.root.innerHTML, /Non-healthcare rows remain raw facts unless another LENS component explicitly owns them/, "widget should not render the deleted non-healthcare raw-fact helper paragraph");
assert.match(fakeDom.root.innerHTML, /"Continues after death\?" is saved for future support-treatment review/, "widget should describe continuationStatus as future support-treatment metadata");
assert.equal(controller.records.length, 9, "missing expenseRecords should create starter rows by default");
assert.deepEqual(
  Array.from(controller.records, (record) => record.typeKey),
  EXPECTED_STARTER_EXPENSE_KEYS,
  "starter expense row keys should match the common expense starter set"
);
assert.deepEqual(
  Array.from(controller.records, (record) => record.label),
  EXPECTED_STARTER_EXPENSE_LABELS,
  "starter expense row labels should match the common expense starter labels"
);
assert.ok(controller.records.every((record) => record.isDefaultExpense === true), "starter rows should be marked as default expenses");
assert.match(fakeDom.list.innerHTML, /Non-Housing Monthly Insurance/, "starter rows should render in the expense notebook");
assert.match(fakeDom.list.innerHTML, /Healthcare \/ Out-of-Pocket Medical/, "starter healthcare row should render in the expense notebook");
assert.match(fakeDom.list.innerHTML, /data-pmi-expense-record-icon-file="insurance\.svg"/, "starter insurance row should use the insurance icon");
assert.match(fakeDom.list.innerHTML, /data-pmi-expense-record-icon-file="healthcare\.svg"/, "starter healthcare row should use the healthcare icon");
assert.match(fakeDom.list.innerHTML, /data-pmi-expense-record-icon-file="personal-living\.svg"/, "starter personal spending row should use the personal-living icon");
const starterSerialized = controller.serializeExpenseRecords();
assert.equal(starterSerialized.length, 9, "blank starter rows should serialize so removed rows can remain removed after save/load");
assert.deepEqual(
  Array.from(starterSerialized, (record) => record.typeKey),
  EXPECTED_STARTER_EXPENSE_KEYS,
  "serialized starter rows should preserve the starter key order"
);
assert.ok(starterSerialized.every((record) => record.amount === null), "blank starter rows should serialize with null amounts");
assert.ok(starterSerialized.every((record) => record.isDefaultExpense === true), "serialized starter rows should preserve default expense flags");
assert.equal(controller.removeExpenseRecordById(starterSerialized[0].expenseId), true, "starter rows should remain removable");
assert.equal(controller.records.length, 8, "removing a starter row should leave the remaining starter rows");
assert.equal(
  controller.records.some((record) => record.typeKey === "householdInsurancePremiums"),
  false,
  "removed starter row should stay removed in controller state"
);
controller.hydrateExpenseRecords([]);
assert.equal(controller.records.length, 0, "explicit saved [] should remain empty");
assert.equal(fakeDom.list.innerHTML, "", "explicit saved [] should not render starter rows");

const recordFirstSourceData = pmiExpenseRecords.createCommonExpenseSourceDataFromExpenseRecords(
  [
    {
      expenseId: "starter_expense_groceries",
      typeKey: "groceries",
      amount: 500,
      frequency: "monthly",
      termType: "ongoing",
      isDefaultExpense: true
    },
    {
      expenseId: "starter_expense_healthcare",
      typeKey: "medicalOutOfPocket",
      amount: 125,
      frequency: "monthly",
      termType: "ongoing",
      isDefaultExpense: true
    }
  ]
);
assert.equal(recordFirstSourceData.monthlyFoodCost, 500, "common expense records should derive ongoing support source data");
assert.equal(recordFirstSourceData.monthlyHealthcareOutOfPocketCost, 125, "healthcare starter rows should map to the ongoing-support healthcare output");
assert.equal(recordFirstSourceData.monthlyOtherInsuranceCost, undefined, "missing common records should not preserve scalar fallback values");

assert.equal(typeof controller.addExpenseRecordFromLibraryEntry, "function", "controller should expose testable add-from-library behavior");
assert.equal(typeof controller.removeExpenseRecordById, "function", "controller should expose testable remove behavior");
assert.equal(typeof controller.hydrateGeneratedExpenseFacts, "function", "controller should expose generated fact hydration");
assert.equal(typeof controller.refreshGeneratedExpenseFactsFromDebtRecords, "function", "controller should expose debt-record generated row refresh");
const addedFromLibrary = controller.addExpenseRecordFromLibraryEntry(expenseLibrary.findExpenseLibraryEntry("propertyTaxes"));
assert.ok(addedFromLibrary, "add-from-library should create an expense record");
assert.equal(controller.records.length, 1, "add-from-library should add one row");
assert.match(fakeDom.list.innerHTML, /Property Taxes/, "added library record should render");
assert.match(fakeDom.list.innerHTML, /pmi-expense-record-type-chip/, "added library record should render a type icon next to its title");
assert.match(fakeDom.list.innerHTML, /pmi-expense-record-type-visible-label">Property Taxes<\/span>/, "added library record should keep the type title visible beside the icon");
assert.match(fakeDom.list.innerHTML, /data-pmi-expense-record-icon-file="home\.svg"/, "property tax rows should use the housing/home icon");
assert.match(fakeDom.list.innerHTML, /src="\.\.\/Images\/home\.svg"/, "property tax icon src should point to the home icon asset");
assert.match(fakeDom.list.innerHTML, /title="Property Taxes"/, "type icon chip should expose a tooltip label");
assert.match(fakeDom.list.innerHTML, /aria-label="Expense type: Property Taxes"/, "type icon chip should expose an accessible label");
assert.match(fakeDom.list.innerHTML, /pmi-expense-record-type-visually-hidden/, "type icon chip should include hidden full label text");
assert.doesNotMatch(fakeDom.list.innerHTML, /class="pmi-expense-record-type-label"/, "added library record should not render the old visible text-only type pill class");
assert.equal(controller.removeExpenseRecordById(addedFromLibrary.expenseId), true, "remove should remove a rendered expense row");
assert.equal(controller.records.length, 0, "remove should leave the notebook empty");
assert.equal(fakeDom.list.innerHTML, "", "removing the only expense record should restore empty state");

const generatedDebtPaymentFact = Object.freeze({
  expenseFactId: "generated_debt_payment_expense_auto_loan",
  typeKey: "autoLoanPayment",
  categoryKey: "debtPayment",
  label: "Auto Loan Payment",
  amount: 425,
  frequency: "monthly",
  paymentFrequency: "monthly",
  termType: "ongoing",
  remainingTermMonths: 42,
  sourceDebtRecordId: "debt_auto_loan",
  sourceDebtTypeKey: "autoLoan",
  sourcePath: "protectionModeling.data.debtRecords[0]",
  duplicateProtectionKey: "debt-payment:debt_auto_loan:autoLoan:required-payment",
  isGeneratedExpense: true,
  isDebtPaymentExpense: true,
  isReadOnly: true,
  isFormulaEligible: false
});
controller.hydrateGeneratedExpenseFacts({ expenses: [generatedDebtPaymentFact] });
assert.match(fakeDom.list.innerHTML, /Auto Loan Payment/, "generated debt-payment fact should display in the expense notebook");
assert.match(fakeDom.list.innerHTML, /From Debt Records/, "generated debt-payment row should identify its source");
assert.match(fakeDom.list.innerHTML, /Edit in Debt Records/, "generated debt-payment row should show a source edit hint");
assert.match(fakeDom.list.innerHTML, /data-pmi-expense-generated-entry/, "generated debt-payment row should use generated row markup");
assert.match(fakeDom.list.innerHTML, /data-pmi-expense-record-icon-file="debt-payment\.svg"/, "generated debt-payment row should use the debt-payment icon");
assert.match(fakeDom.list.innerHTML, /aria-label="Expense type: Auto Loan Payment"/, "generated debt-payment row should preserve the generated label for accessibility");
assert.match(fakeDom.list.innerHTML, /pmi-expense-record-type-visible-label">Auto Loan Payment<\/span>/, "generated debt-payment row should keep the generated type title visible beside the icon");
assert.doesNotMatch(fakeDom.list.innerHTML, /data-pmi-expense-generated-entry[\s\S]*data-pmi-expense-record-remove/, "generated rows should not render remove buttons");
assert.equal(JSON.stringify(controller.serializeExpenseRecords()), "[]", "generated debt-payment rows should not serialize into expenseRecords[]");
controller.hydrateGeneratedExpenseFacts([]);
assert.equal(fakeDom.list.innerHTML, "", "clearing generated rows should restore empty state when there are no manual rows");

lensAnalysis.createExpenseFactsFromSourceData = function (sourceData) {
  return {
    expenses: (sourceData.debtRecords || []).map((debtRecord, index) => ({
      expenseFactId: `generated_debt_payment_expense_${debtRecord.debtId || index}`,
      typeKey: `${debtRecord.typeKey}Payment`,
      categoryKey: "debtPayment",
      label: `${debtRecord.label} Payment`,
      amount: debtRecord.paymentAmount,
      frequency: debtRecord.paymentFrequency,
      paymentFrequency: debtRecord.paymentFrequency,
      termType: debtRecord.paymentFrequency === "oneTime" ? "oneTime" : "ongoing",
      remainingTermMonths: debtRecord.remainingTermMonths,
      sourceDebtRecordId: debtRecord.debtId,
      sourceDebtTypeKey: debtRecord.typeKey,
      sourcePath: `protectionModeling.data.debtRecords[${index}]`,
      duplicateProtectionKey: `debt-payment:${debtRecord.debtId}:${debtRecord.typeKey}:required-payment`,
      isGeneratedExpense: true,
      isDebtPaymentExpense: true,
      isReadOnly: true,
      isFormulaEligible: false
    }))
  };
};
const providerFakeDom = createFakeRoot();
const providerController = pmiExpenseRecords.initPmiExpenseRecords({
  root: providerFakeDom.root,
  debtRecordsProvider: () => [{
    debtId: "debt_auto_lease",
    typeKey: "autoLease",
    label: "Auto Lease",
    paymentFrequency: "biweekly",
    paymentAmount: 200,
    remainingTermMonths: 24
  }]
});
assert.match(providerFakeDom.list.innerHTML, /Auto Lease Payment/, "expense notebook should render generated rows from Debt Records provider");
const providerSerializedRecords = providerController.serializeExpenseRecords();
assert.equal(providerSerializedRecords.length, 9, "provider-generated rows should not replace starter expense rows");
assert.deepEqual(
  Array.from(providerSerializedRecords, (record) => record.typeKey),
  EXPECTED_STARTER_EXPENSE_KEYS,
  "provider-generated rows should leave serialized starter rows intact"
);
assert.equal(
  providerSerializedRecords.some((record) => record.typeKey === "autoLeasePayment"),
  false,
  "provider-generated debt-payment rows should not serialize into expenseRecords[]"
);

const inputRecords = Object.freeze([
  Object.freeze({
    expenseId: "expense_valid",
    categoryKey: "ongoingHealthcare",
    typeKey: "medicalOutOfPocket",
    label: "Medical Out-of-Pocket",
    amount: "250.50",
    frequency: "monthly",
    termType: "ongoing",
    continuationStatus: "continues",
    sourceKey: null,
    isCustomExpense: false,
    notes: "Preserve silently",
    metadata: Object.freeze({ sourceType: "user-input", source: "expense-library", libraryEntryKey: "medicalOutOfPocket" })
  }),
  Object.freeze({
    expenseId: "expense_zero",
    categoryKey: "visionCare",
    typeKey: "visionOutOfPocket",
    label: "Vision",
    amount: "0",
    frequency: "annual",
    termType: "ongoing",
    continuationStatus: "not-a-status"
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
    continuationStatus: "review",
    isCustomExpense: true
  })
]);

controller.hydrateExpenseRecords(inputRecords);
assert.match(fakeDom.list.innerHTML, /Medical Out-of-Pocket/, "hydrate should render saved valid record labels");
assert.match(fakeDom.list.innerHTML, /data-pmi-expense-records-table/, "hydrate should render the notebook table shell");
assert.match(fakeDom.list.innerHTML, /data-pmi-expense-records-header/, "hydrate should render notebook column headers");
[
  "Expense Type",
  "Label / Vendor",
  "Amount",
  "Frequency",
  "Duration",
  "Term Detail",
  "Continues?",
  "Category",
  "Remove"
].forEach((header) => {
  assert.match(fakeDom.list.innerHTML, new RegExp(">" + header.replace("?", "\\?") + "<"), `expense notebook should render ${header} header`);
});
assert.match(fakeDom.list.innerHTML, /class="pmi-expense-record-row"/, "hydrate should render compact rows");
assert.doesNotMatch(fakeDom.list.innerHTML, /pmi-expense-record-field/, "hydrate should not render stacked expense cards");
assert.doesNotMatch(fakeDom.list.innerHTML, /pmi-expense-record-grid/, "hydrate should not render the old nested field grid");
assert.doesNotMatch(fakeDom.list.innerHTML, /pmi-expense-record-label-row/, "hydrate should not render per-row label rows");
assert.doesNotMatch(fakeDom.list.innerHTML, /<label\b/, "desktop notebook rows should rely on headers instead of repeated visible field labels");
assert.doesNotMatch(fakeDom.list.innerHTML, /Preserve silently/, "saved notes should not render visibly in notebook rows");
assert.match(fakeDom.list.innerHTML, /aria-label="Continues after death\?"/, "expense record continuationStatus selector should keep accessible copy");
assert.match(fakeDom.list.innerHTML, /Continues after death/, "expense record continuationStatus continues option should render");
assert.match(fakeDom.list.innerHTML, /Stops\/reduces after death/, "expense record continuationStatus stops option should render");
assert.match(fakeDom.list.innerHTML, /Review case-by-case/, "expense record continuationStatus review option should render");
assert.doesNotMatch(fakeDom.list.innerHTML, />Term Type</, "expense record duration selector should not use the stale Term Type label");
assert.doesNotMatch(fakeDom.list.innerHTML, /Duration \/ term/, "expense record notebook should use the compact Duration column header");
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
assert.equal(valid.continuationStatus, "continues", "valid advisor continuationStatus override should serialize");
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
assert.equal(valid.notes, "Preserve silently", "saved notes should serialize unchanged even though they are not rendered");
assert.equal(valid.metadata.source, "expense-library");
assert.equal(valid.metadata.libraryEntryKey, "medicalOutOfPocket");

const zero = serialized.find((record) => record.expenseId === "expense_zero");
assert.ok(zero, "zero amounts should serialize as non-negative raw facts");
assert.equal(zero.amount, 0);
assert.equal(zero.continuationStatus, "review", "invalid continuationStatus should default safely through the library default");

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
assert.equal(untilDateBadDetail.continuationStatus, "continues", "missing continuationStatus should default from the library entry");

const custom = serialized.find((record) => record.expenseId === "expense_custom");
assert.ok(custom, "custom expense records should serialize");
assert.equal(custom.categoryKey, "customExpense");
assert.equal(custom.typeKey, "customExpenseRecord");
assert.equal(custom.isCustomExpense, true);
assert.equal(custom.continuationStatus, "review");

assert.deepEqual(inputRecords[0], {
  expenseId: "expense_valid",
  categoryKey: "ongoingHealthcare",
  typeKey: "medicalOutOfPocket",
  label: "Medical Out-of-Pocket",
  amount: "250.50",
  frequency: "monthly",
  termType: "ongoing",
  continuationStatus: "continues",
  sourceKey: null,
  isCustomExpense: false,
  notes: "Preserve silently",
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
