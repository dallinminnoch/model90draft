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

function parseRowsFromMarkup(markup) {
  const source = String(markup || "");
  const rowPattern = /<div class="pmi-debt-record-row" role="row" data-pmi-debt-record-entry data-pmi-debt-id="([^"]+)">/g;
  const matches = Array.from(source.matchAll(rowPattern));

  return matches.map((match, index) => {
    const debtId = decodeHtml(match[1]);
    const rowStart = match.index;
    const nextRowStart = matches[index + 1] ? matches[index + 1].index : source.length;
    const rowMarkup = source.slice(rowStart, nextRowStart);

    return {
      markup: rowMarkup,
      getAttribute(name) {
        return name === "data-pmi-debt-id" ? debtId : null;
      },
      querySelector(selector) {
        const selectorToAttribute = {
          "[data-pmi-debt-record-label]": "data-pmi-debt-record-label",
          "[data-pmi-debt-record-balance]": "data-pmi-debt-record-balance",
          "[data-pmi-debt-record-payment-frequency]": "data-pmi-debt-record-payment-frequency",
          "[data-pmi-debt-record-payment-amount]": "data-pmi-debt-record-payment-amount",
          "[data-pmi-debt-record-payment]": "data-pmi-debt-record-payment",
          "[data-pmi-debt-record-extra-payoff]": "data-pmi-debt-record-extra-payoff",
          "[data-pmi-debt-record-rate]": "data-pmi-debt-record-rate",
          "[data-pmi-debt-record-term]": "data-pmi-debt-record-term"
        };
        const attribute = selectorToAttribute[selector];
        if (!attribute) {
          return null;
        }
        if (selector === "[data-pmi-debt-record-payment-frequency]") {
          const selectPattern = new RegExp("<select[^>]*" + attribute + "[^>]*>([\\s\\S]*?)<\\/select>", "i");
          const selectMatch = rowMarkup.match(selectPattern);
          const selectedOptionMatch = selectMatch
            ? selectMatch[1].match(/<option[^>]*value="([^"]*)"[^>]*selected[^>]*>/i)
            : null;
          return selectedOptionMatch ? { value: decodeHtml(selectedOptionMatch[1]) } : null;
        }
        const inputPattern = new RegExp("<input[^>]*" + attribute + "[^>]*>", "i");
        const inputMatch = rowMarkup.match(inputPattern);
        return inputMatch ? { value: parseAttribute(inputMatch[0], "value") } : null;
      }
    };
  });
}

function getRowMarkupByLabel(markup, label) {
  const rows = parseRowsFromMarkup(markup);
  const escapedLabel = String(label || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(escapedLabel);
  const row = rows.find((candidate) => pattern.test(candidate.markup));
  assert.ok(row, `${label} row should render`);
  return row.markup;
}

function assertFieldNotApplicable(rowMarkup, fieldAttribute, label) {
  const fieldPattern = new RegExp(fieldAttribute + '[^>]*value="N/A"[^>]*disabled[^>]*data-pmi-debt-applicability-state="notApplicable"', "i");
  assert.match(rowMarkup, /pmi-debt-record-cell--notApplicable/, `${label} cell should use the not-applicable class`);
  assert.match(rowMarkup, fieldPattern, `${label} should render as disabled N/A`);
}

function assertFieldActive(rowMarkup, fieldAttribute, label) {
  const activePattern = new RegExp(fieldAttribute + '[^>]*data-pmi-debt-applicability-state="active"', "i");
  assert.match(rowMarkup, activePattern, `${label} should remain active`);
  assert.doesNotMatch(rowMarkup, new RegExp(fieldAttribute + '[^>]*value="N/A"', "i"), `${label} should not render as N/A`);
}

function assertFieldOptional(rowMarkup, fieldAttribute, label) {
  const optionalPattern = new RegExp(fieldAttribute + '[^>]*data-pmi-debt-applicability-state="optional"', "i");
  assert.match(rowMarkup, optionalPattern, `${label} should render as optional`);
  assert.doesNotMatch(rowMarkup, new RegExp(fieldAttribute + '[^>]*value="N/A"', "i"), `${label} should not render as N/A`);
  assert.doesNotMatch(rowMarkup, new RegExp(fieldAttribute + '[^>]*disabled', "i"), `${label} should remain editable`);
}

function assertIconPathExists(src, label) {
  const normalizedSrc = String(src || "").replace(/^\.\.\//, "");
  assert.ok(normalizedSrc, `${label} icon source should be present`);
  assert.ok(fs.existsSync(path.join(repoRoot, normalizedSrc)), `${label} icon source should exist: ${src}`);
}

function getDebtTypeChipMarkup(rowMarkup, label) {
  const chipMatch = String(rowMarkup || "").match(/<span class="pmi-debt-record-type-chip"[\s\S]*?<\/span>\s*<\/span>/i);
  assert.ok(chipMatch, `${label} should render a compact debt type icon chip`);
  return chipMatch[0];
}

function assertDebtTypeIconChip(rowMarkup, expected) {
  const chipMarkup = getDebtTypeChipMarkup(rowMarkup, expected.label);
  assert.match(chipMarkup, /data-pmi-debt-record-type-label/, `${expected.label} type chip should preserve the type-cell hook`);
  assert.match(
    chipMarkup,
    new RegExp(`data-pmi-debt-record-type-key="${expected.typeKey}"`),
    `${expected.label} type chip should expose its debt type key`
  );
  assert.match(
    chipMarkup,
    new RegExp(`data-pmi-debt-record-icon-src="${expected.src.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"`),
    `${expected.label} type chip should expose its icon source`
  );
  assert.match(
    chipMarkup,
    new RegExp(`title="Debt type: ${expected.tooltip.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"`),
    `${expected.label} type chip should include a tooltip label`
  );
  assert.match(
    chipMarkup,
    new RegExp(`aria-label="Debt type: ${expected.tooltip.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"`),
    `${expected.label} type chip should include an accessible label`
  );
  assert.match(chipMarkup, /tabindex="0"/, `${expected.label} type chip should be keyboard focusable`);
  assert.match(chipMarkup, /data-pmi-debt-record-type-icon/, `${expected.label} type chip should render an icon image`);
  assert.match(chipMarkup, /alt=""/, `${expected.label} type icon should be decorative because the chip is labelled`);
  assert.match(chipMarkup, /aria-hidden="true"/, `${expected.label} type icon should be hidden from assistive tech`);
  assert.match(
    chipMarkup,
    new RegExp(`<span class="pmi-debt-record-type-visually-hidden">Debt type: ${expected.tooltip.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}<\\/span>`),
    `${expected.label} type chip should keep hidden full text in the DOM`
  );
  assertIconPathExists(expected.src, expected.label);
}

function extractCssRule(source, selector) {
  const normalizedSource = String(source || "").replace(/\r\n/g, "\n");
  const normalizedSelector = String(selector || "").replace(/\r\n/g, "\n");
  const escapedSelector = normalizedSelector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(escapedSelector + "\\s*{([\\s\\S]*?)\\n}", "m");
  const match = normalizedSource.match(pattern);
  return match ? match[1] : "";
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
    return selector === "[data-pmi-debt-record-entry]"
      ? parseRowsFromMarkup(list.innerHTML)
      : [];
  };

  return {
    root: {
      dataset: {},
      innerHTML: "",
      ownerDocument: documentRef,
      querySelector(selector) {
        if (selector === "[data-pmi-debt-records-list]") {
          return list;
        }
        if (selector === "[data-pmi-debt-records-add]") {
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
    "app/features/lens-analysis/analysis-methods.js",
    "app/features/lens-analysis/analysis-settings-adapter.js",
    "app/features/lens-analysis/step-three-analysis-display.js",
    "app/features/lens-analysis/asset-treatment-calculations.js"
  ];
  const status = execFileSync("git", ["status", "--short", "--"].concat(protectedFiles), {
    cwd: repoRoot,
    encoding: "utf8"
  }).trim();

  assert.equal(status, "", "protected formula/display/adapter/manual files should not have diffs");
}

function getDebtRecordsHydrationSourceLikeLinkedPage(saved) {
  const savedDraft = saved && typeof saved === "object" ? saved : {};
  if (Array.isArray(savedDraft.debtRecords)) {
    return savedDraft.debtRecords;
  }

  const migratedDebtRecords = pmiDebtRecords.createDebtRecordsFromLegacyScalarFields(savedDraft);
  if (migratedDebtRecords.length) {
    return migratedDebtRecords;
  }

  return savedDraft.debtRecords;
}

function countOccurrences(source, pattern) {
  return (String(source || "").match(pattern) || []).length;
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
loadScript(context, "app/features/lens-analysis/debt-taxonomy.js");
loadScript(context, "app/features/lens-analysis/debt-library.js");
loadScript(context, "app/features/lens-analysis/pmi-debt-records.js");

const lensAnalysis = context.LensApp.lensAnalysis;
const debtLibrary = lensAnalysis.debtLibrary;
const pmiDebtRecords = lensAnalysis.pmiDebtRecords;

assert.equal(typeof pmiDebtRecords?.initPmiDebtRecords, "function");
assert.equal(typeof pmiDebtRecords?.hydrateDebtRecords, "function");
assert.equal(typeof pmiDebtRecords?.serializeDebtRecords, "function");
assert.equal(typeof pmiDebtRecords?.createDebtRecordFromLibraryEntry, "function");
assert.equal(typeof pmiDebtRecords?.createDebtRecordsFromLegacyScalarFields, "function");
assert.equal(typeof pmiDebtRecords?.createLegacyScalarDebtCompatibilityFromRecords, "function");
assert.equal(typeof pmiDebtRecords?.getDebtRecordFieldApplicability, "function");
assert.equal(typeof pmiDebtRecords?.getDebtTypeIconDescriptor, "function");

const autoLoanEntry = debtLibrary.findDebtLibraryEntry("autoLoan");
const autoLoanRecord = pmiDebtRecords.createDebtRecordFromLibraryEntry(autoLoanEntry);
assert.ok(autoLoanRecord.debtId.startsWith("debt_"));
assert.equal(autoLoanRecord.categoryKey, "securedConsumerDebt");
assert.equal(autoLoanRecord.typeKey, "autoLoan");
assert.equal(autoLoanRecord.currentBalance, null);
assert.equal(autoLoanRecord.paymentType, "minimumPayment");
assert.equal(autoLoanRecord.paymentFrequency, "monthly");
assert.equal(autoLoanRecord.paymentAmount, null);
assert.equal(autoLoanRecord.minimumMonthlyPayment, null);
assert.equal(autoLoanRecord.extraPayoffAmount, null);
assert.equal(autoLoanRecord.interestRatePercent, null);
assert.equal(autoLoanRecord.remainingTermMonths, null);
assert.equal(autoLoanRecord.sourceKey, null);
assert.equal(autoLoanRecord.isDefaultDebt, false);
assert.equal(autoLoanRecord.isCustomDebt, false);
assert.equal(autoLoanRecord.metadata.sourceType, "user-input");
assert.equal(autoLoanRecord.metadata.source, "debt-library");
assert.equal(autoLoanRecord.metadata.libraryEntryKey, "autoLoan");

const autoLeaseRecord = pmiDebtRecords.createDebtRecordFromLibraryEntry(
  debtLibrary.findDebtLibraryEntry("autoLease")
);
assert.equal(autoLeaseRecord.categoryKey, "securedConsumerDebt");
assert.equal(autoLeaseRecord.typeKey, "autoLease");
assert.equal(autoLeaseRecord.paymentType, "leasePayment");
assert.equal(autoLeaseRecord.paymentFrequency, "monthly");

assert.equal(
  pmiDebtRecords.createDebtRecordFromLibraryEntry(debtLibrary.findDebtLibraryEntry("secondVehicleLoan")),
  null,
  "second vehicle loan should not be addable; add another Auto Loan row instead"
);
assert.equal(
  pmiDebtRecords.createDebtRecordFromLibraryEntry(debtLibrary.findDebtLibraryEntry("secondVehicleLease")),
  null,
  "second vehicle lease should not be addable; add another Auto Lease row instead"
);

const customDebtRecord = pmiDebtRecords.createDebtRecordFromLibraryEntry(
  debtLibrary.findDebtLibraryEntry("customDebt")
);
assert.equal(customDebtRecord.categoryKey, "otherDebt");
assert.equal(customDebtRecord.typeKey, "customDebt");
assert.equal(customDebtRecord.isCustomDebt, true);

const primaryMortgageRecord = pmiDebtRecords.createDebtRecordFromLibraryEntry(
  debtLibrary.findDebtLibraryEntry("primaryResidenceMortgage")
);
assert.equal(primaryMortgageRecord, null, "primary residence mortgage should not be addable as a debt record");

[
  "otherDebt",
  "autoLease",
  "irsTaxDebt",
  "medicalBill",
  "businessLoan",
  "heloc",
  "secondMortgage",
  "privateStudentLoan",
  "legalJudgment",
  "businessLineOfCredit",
  "buyNowPayLater",
  "customDebt"
].forEach((typeKey) => {
  const entry = debtLibrary.findDebtLibraryEntry(typeKey);
  assert.ok(entry, `${typeKey} should remain in the Add Debt library`);
  assert.notEqual(entry.isAddable, false, `${typeKey} should remain addable from the Add Debt menu`);
  assert.ok(
    pmiDebtRecords.createDebtRecordFromLibraryEntry(entry),
    `${typeKey} should still create a debt record from the Add Debt menu`
  );
});

const migratedLegacyScalarRecords = pmiDebtRecords.createDebtRecordsFromLegacyScalarFields({
  mortgageBalance: 250000,
  otherRealEstateLoans: 20000,
  autoLoans: 15000,
  creditCardDebt: 7000,
  studentLoans: 11000,
  personalLoans: 5000,
  taxLiabilities: 3000,
  businessDebt: 9000,
  otherLoanObligations: 4000,
  totalDebtPayoffNeed: 99999
});
assert.equal(migratedLegacyScalarRecords.length, 8, "legacy scalar non-mortgage balances should migrate to debtRecords rows");
assert.deepEqual(
  Array.from(migratedLegacyScalarRecords, (record) => record.typeKey),
  [
    "otherPropertyLoan",
    "autoLoan",
    "creditCard",
    "federalStudentLoan",
    "personalLoan",
    "irsTaxDebt",
    "businessLoan",
    "otherDebt"
  ],
  "legacy scalar fields should map to the expected Debt Records library types"
);
assert.equal(
  migratedLegacyScalarRecords.some((record) => record.typeKey === "primaryResidenceMortgage"),
  false,
  "legacy scalar migration should not seed mortgageBalance"
);
assert.equal(
  migratedLegacyScalarRecords.some((record) => record.sourceKey === "totalDebtPayoffNeed"),
  false,
  "legacy scalar migration should not seed totalDebtPayoffNeed as its own debt"
);
assert.equal(
  migratedLegacyScalarRecords.find((record) => record.typeKey === "creditCard").currentBalance,
  7000
);
assert.equal(
  migratedLegacyScalarRecords.find((record) => record.typeKey === "creditCard").metadata.source,
  "legacy-scalar-migration"
);

const scalarCompatibility = pmiDebtRecords.createLegacyScalarDebtCompatibilityFromRecords([
  {
    categoryKey: "unsecuredConsumerDebt",
    typeKey: "creditCard",
    currentBalance: 1200
  },
  {
    categoryKey: "medicalDebt",
    typeKey: "medicalBill",
    currentBalance: 300
  },
  {
    categoryKey: "securedConsumerDebt",
    typeKey: "secondVehicleLease",
    currentBalance: 2500
  },
  {
    categoryKey: "realEstateSecuredDebt",
    typeKey: "primaryResidenceMortgage",
    currentBalance: 999999
  }
]);
assert.equal(scalarCompatibility.creditCardDebt, 1200);
assert.equal(scalarCompatibility.otherLoanObligations, 300);
assert.equal(scalarCompatibility.autoLoans, 2500);
assert.equal(
  scalarCompatibility.otherRealEstateLoans,
  null,
  "Debt Records compatibility should not migrate primary residence mortgage into non-mortgage scalar outputs"
);

const fakeDom = createFakeRoot();
const controller = pmiDebtRecords.initPmiDebtRecords({ root: fakeDom.root });
const debtRecordsWidgetSource = readRepoFile("app/features/lens-analysis/pmi-debt-records.js");
const componentsCss = readRepoFile("components.css");
const debtRecordsListRule = extractCssRule(componentsCss, ".pmi-debt-records-list");
const debtRecordsTableRule = extractCssRule(componentsCss, ".pmi-debt-records-table");
const debtRecordControlRule = extractCssRule(
  componentsCss,
  ".pmi-debt-record-row input,\n.pmi-debt-record-row select"
);
const debtRecordCurrencyRule = extractCssRule(componentsCss, ".pmi-debt-record-compact-currency");
const debtRecordCurrencySuffixRule = extractCssRule(componentsCss, ".pmi-debt-record-compact-currency .profile-currency-suffix");
const debtRecordRemoveRule = extractCssRule(componentsCss, ".pmi-asset-record-remove.pmi-debt-record-remove");
const debtRecordRemoveIconRule = extractCssRule(componentsCss, ".pmi-asset-record-remove.pmi-debt-record-remove::before");
const debtPayoffTotalRule = extractCssRule(
  componentsCss,
  'body[data-page="next-step"] #pmi-debts .debt-payoff-total-group'
);
const debtPayoffTotalLabelRule = extractCssRule(
  componentsCss,
  'body[data-page="next-step"] #pmi-debts .debt-payoff-total-group > label'
);
const debtPayoffTotalCurrencyRule = extractCssRule(
  componentsCss,
  'body[data-page="next-step"] #pmi-debts .debt-payoff-total-group .profile-currency-field'
);
assert.ok(controller);
assert.equal(fakeDom.root.dataset.pmiDebtRecordsInitialized, "true");
assert.equal(controller.records.length, 4, "lean default starter notebook rows should appear on init");
assert.deepEqual(
  Array.from(controller.records, (record) => record.typeKey),
  ["creditCard", "autoLoan", "federalStudentLoan", "personalLoan"],
  "starter rows should use the lean normal needs-analysis set"
);
assert.equal(fakeDom.root.innerHTML.includes(">Add another debt<"), true, "Add Debt entry point should make the menu path clear");
assert.match(fakeDom.list.innerHTML, /data-pmi-debt-records-table/, "compact debt records table shell should render");
assert.match(fakeDom.list.innerHTML, /data-pmi-debt-records-header/, "compact debt records table should render column headers");
assert.match(
  debtRecordsWidgetSource,
  /<strong>\$\{escapeHtml\(entry\.label\)\}<\/strong>/,
  "Add Debt menu results should keep full text debt labels"
);
[
  "Label / Creditor",
  "Balance",
  "Frequency",
  "Amount",
  "Payoff",
  "Term",
  "Interest Rate"
].forEach((header) => {
  assert.match(fakeDom.list.innerHTML, new RegExp(`>${header}<`), `${header} column header should render`);
});
assert.match(
  fakeDom.list.innerHTML,
  /<span class="pmi-debt-record-type-header" role="columnheader" aria-label="Debt Type"><\/span>/,
  "debt type column should keep an accessible header without visible title text"
);
assert.doesNotMatch(fakeDom.list.innerHTML, />Debt Type<\/span>/, "debt type column should not render a visible title");
assert.match(
  fakeDom.list.innerHTML,
  /<span class="pmi-debt-record-interest-rate-header" role="columnheader">Interest Rate<\/span>/,
  "Interest Rate header should have the no-wrap debt header class"
);
[
  ["Payment Frequency", "Frequency"],
  ["Payment Amount", "Amount"],
  ["Extra Payoff", "Payoff"],
  ["Remaining Term", "Term"]
].forEach(([ariaLabel, visibleLabel]) => {
  assert.match(
    fakeDom.list.innerHTML,
    new RegExp(`<span role="columnheader" aria-label="${ariaLabel}">${visibleLabel}<\\/span>`),
    `${visibleLabel} column header should keep the full ${ariaLabel} accessible label`
  );
  assert.doesNotMatch(
    fakeDom.list.innerHTML,
    new RegExp(`>${ariaLabel}<`),
    `${ariaLabel} should not render as the visible debt column header`
  );
});
assert.match(
  fakeDom.list.innerHTML,
  /<span class="pmi-debt-record-remove-header" role="columnheader" aria-label="Remove"><\/span>/,
  "remove column should keep an accessible header without visible title text"
);
assert.doesNotMatch(fakeDom.list.innerHTML, />Remove<\/span>/, "remove column should not render a visible title");
assert.doesNotMatch(fakeDom.list.innerHTML, />Payment Type</, "Payment Type column should not render");
assert.doesNotMatch(fakeDom.list.innerHTML, />Notes</, "Notes column should not render");
assert.doesNotMatch(fakeDom.list.innerHTML, /data-pmi-debt-record-payment-type/, "Payment Type select should not render");
assert.doesNotMatch(fakeDom.list.innerHTML, /data-pmi-debt-record-notes/, "Notes input should not render");
assert.match(fakeDom.list.innerHTML, /data-pmi-debt-record-payment-frequency/, "Payment Frequency select should render");
assert.doesNotMatch(debtRecordsWidgetSource, /"secondVehicleLoan",\s*"secondVehicleLease"/, "deprecated second vehicle types should not be suggested user-facing debt choices");
assert.doesNotMatch(debtRecordsWidgetSource, /custom\.svg/, "Debt Records should not use the custom asset icon as a normal debt fallback");
[
  ["personalLoan", "../Images/loan.svg", "Personal Loan"],
  ["irsTaxDebt", "../Images/taxes.svg", "IRS Tax Debt"],
  ["heloc", "../Images/HELOC.svg", "HELOC"],
  ["creditCard", "../Images/creditcard.svg", "Credit Card"],
  ["autoLoan", "../Images/vehicle.svg", "Auto Loan"],
  ["federalStudentLoan", "../Images/education.svg", "Federal Student Loan"],
  ["medicalBill", "../Images/home/medical.svg", "Medical Bill"],
  ["businessLoan", "../Images/business1.svg", "Business Loan"],
  ["otherDebt", "../Images/loan.svg", "Other Debt"],
  ["customDebt", "../Images/loan.svg", "Custom Debt"]
].forEach(([typeKey, src, label]) => {
  const descriptor = pmiDebtRecords.getDebtTypeIconDescriptor({ typeKey });
  assert.equal(descriptor.typeKey, typeKey, `${label} icon descriptor should preserve the type key`);
  assert.equal(descriptor.src, src, `${label} should resolve to the expected existing icon asset`);
  assert.equal(descriptor.accessibleLabel, `Debt type: ${label}`, `${label} icon descriptor should expose accessible text`);
  assertIconPathExists(descriptor.src, label);
});
debtLibrary.getDebtLibraryEntries().forEach((entry) => {
  const descriptor = pmiDebtRecords.getDebtTypeIconDescriptor(entry);
  assert.ok(descriptor.src, `${entry.typeKey} should resolve to an icon source`);
  assert.equal(descriptor.label, entry.label, `${entry.typeKey} should preserve the full visible library label for accessibility`);
  assertIconPathExists(descriptor.src, entry.typeKey);
});
assert.match(debtRecordsListRule, /overflow-x:\s*visible;/, "desktop debt records list should not use horizontal scrolling");
assert.doesNotMatch(debtRecordsListRule, /overflow-x:\s*auto;/, "desktop debt records list should not declare overflow-x auto");
assert.match(debtRecordsTableRule, /width:\s*100%;[\s\S]*min-width:\s*0;/, "debt records table should fit the card width");
assert.match(debtRecordsTableRule, /border-radius:\s*0\.25rem;/, "debt records table should use the sharper compact shell radius");
assert.match(
  componentsCss,
  /grid-template-columns:[\s\S]*minmax\(2\.5rem,\s*0\.34fr\)[\s\S]*minmax\(0,\s*1\.35fr\)[\s\S]*minmax\(1\.55rem,\s*0\.16fr\)/,
  "debt records grid should use a compact icon type column and keep the remove column compact"
);
assert.match(componentsCss, /\.pmi-debt-record-type-cell\s*{[\s\S]*justify-content:\s*center;/, "debt type cells should center the compact icon chip");
assert.match(
  componentsCss,
  /\.pmi-debt-record-type-chip\s*{[\s\S]*position:\s*relative;[\s\S]*width:\s*1\.65rem;[\s\S]*height:\s*1\.65rem;[\s\S]*overflow:\s*hidden;[\s\S]*border:\s*0;[\s\S]*background:\s*transparent;/,
  "debt type icon chip should stay compact, contain hidden label overflow, and avoid a visible outline container"
);
assert.match(
  componentsCss,
  /\.pmi-debt-record-type-chip:hover,[\s\S]*\.pmi-debt-record-type-chip:focus-visible\s*{[\s\S]*box-shadow:\s*none;/,
  "debt type icon chip should not draw an outline or ring on hover/focus"
);
assert.match(componentsCss, /\.pmi-debt-record-type-icon\s*{[\s\S]*filter:\s*brightness\(0\)\s+saturate\(100%\);/, "debt type icons should render black");
assert.match(componentsCss, /\.pmi-debt-record-type-visually-hidden\s*{[\s\S]*clip-path:\s*inset\(50%\);/, "debt type full label should use a visually hidden text helper");
assert.match(
  componentsCss,
  /\.pmi-debt-record-interest-rate-header\s*{[\s\S]*width:\s*max-content;[\s\S]*overflow:\s*visible;[\s\S]*white-space:\s*nowrap;/,
  "Interest Rate header should stay on one line and be allowed to overflow into the blank remove header space"
);
assert.match(componentsCss, /\.pmi-debt-record-row\s*{\s*padding:\s*0\.32rem\s+0\.36rem;/, "debt rows should use tighter notebook padding");
assert.match(debtRecordControlRule, /min-width:\s*0;[\s\S]*box-sizing:\s*border-box;/, "debt row controls should shrink within cells");
assert.match(debtRecordControlRule, /min-height:\s*1\.72rem;/, "debt row controls should use compact control height");
assert.match(debtRecordControlRule, /padding:\s*0\.22rem\s+0\.32rem;/, "debt row controls should use compact vertical padding");
assert.match(debtRecordControlRule, /border-radius:\s*0\.18rem;/, "debt row controls should use sharper control corners");
assert.match(debtRecordControlRule, /font-size:\s*0\.78rem;/, "debt row controls should preserve the existing text size");
assert.match(debtRecordCurrencyRule, /width:\s*100%;[\s\S]*min-width:\s*0;/, "compact currency wrappers should not widen debt row cells");
assert.match(debtRecordCurrencySuffixRule, /position:\s*absolute;[\s\S]*right:\s*0\.3rem;/, "compact currency suffixes should sit inside debt row controls");
assert.match(componentsCss, /\.pmi-debt-record-cell--notApplicable\s*{[\s\S]*opacity:\s*0\.72;/, "not-applicable cells should render with muted debt-specific styling");
assert.match(componentsCss, /\.pmi-debt-record-na-control\s*{[\s\S]*width:\s*100%;[\s\S]*min-width:\s*0;/, "not-applicable controls should preserve the compact table width contract");
assert.match(componentsCss, /\.pmi-debt-record-row input:disabled,[\s\S]*\.pmi-debt-record-na-control input\s*{[\s\S]*background:\s*#f3f5f8;[\s\S]*color:\s*#8a92a1;/, "disabled N/A controls should be visibly greyed out");
assert.match(
  debtRecordRemoveRule,
  /display:\s*inline-flex;[\s\S]*width:\s*1\.12rem;[\s\S]*height:\s*1\.12rem;[\s\S]*align-items:\s*center;[\s\S]*justify-content:\s*center;[\s\S]*font-size:\s*0;/,
  "remove control should be tighter, centered, and override the shared asset remove rule"
);
assert.match(
  debtRecordRemoveIconRule,
  /content:\s*"";[\s\S]*-webkit-mask:\s*url\("Images\/close\.svg"\)\s+center\s+\/\s+contain\s+no-repeat;[\s\S]*mask:\s*url\("Images\/close\.svg"\)\s+center\s+\/\s+contain\s+no-repeat;/,
  "debt remove control should use the close.svg asset instead of a text x"
);
assert.doesNotMatch(
  debtRecordRemoveIconRule,
  /content:\s*"x";/,
  "debt remove control should not render the old text x pseudo-icon"
);
assert.match(
  componentsCss,
  /body\[data-page="next-step"\]\s+\.pmi-asset-record-remove\.pmi-debt-record-remove\s*{[\s\S]*border:\s*0;[\s\S]*background:\s*transparent;[\s\S]*box-shadow:\s*none;[\s\S]*color:\s*#9ca3af;/,
  "next-step debt remove icon should not draw an outline container"
);
assert.match(
  componentsCss,
  /body\[data-page="next-step"\]\s+\.pmi-asset-record-remove\.pmi-debt-record-remove:hover,[\s\S]*body\[data-page="next-step"\]\s+\.pmi-asset-record-remove\.pmi-debt-record-remove:focus-visible\s*{[\s\S]*color:\s*#111827;[\s\S]*box-shadow:\s*none;/,
  "next-step debt remove icon should turn black on hover/focus without an outline"
);
assert.match(
  debtPayoffTotalRule,
  /justify-self:\s*stretch\s*!important;[\s\S]*width:\s*100%\s*!important;[\s\S]*margin-top:\s*0\s*!important;[\s\S]*padding-top:\s*0\s*!important;[\s\S]*border-top:\s*0\s*!important;/,
  "Total Debt Payoff Need should match the centered result field styling without the legacy divider"
);
assert.match(
  debtPayoffTotalLabelRule,
  /width:\s*100%\s*!important;[\s\S]*justify-content:\s*center\s*!important;[\s\S]*text-align:\s*center\s*!important;/,
  "Total Debt Payoff Need label should keep the centered result label treatment"
);
assert.match(
  debtPayoffTotalCurrencyRule,
  /justify-self:\s*auto\s*!important;[\s\S]*width:\s*min\(100%,\s*24rem\)\s*!important;/,
  "Total Debt Payoff Need currency field should span the result field like Calculated Monthly Burden"
);
assert.doesNotMatch(fakeDom.list.innerHTML, /pmi-debt-record-field/, "debt rows should not render as stacked card fields");
assert.doesNotMatch(fakeDom.list.innerHTML, /pmi-debt-record-grid/, "debt rows should not render the old stacked field grid");
assert.doesNotMatch(fakeDom.list.innerHTML, /pmi-debt-record-label-row/, "row labels should come from column headers");
assert.equal(parseRowsFromMarkup(fakeDom.list.innerHTML).length, 4, "lean starter debts should render as compact rows");
[
  "Credit Card Debt",
  "Auto Loan",
  "Student Loan",
  "Personal Loan"
].forEach((label) => {
  assert.match(fakeDom.list.innerHTML, new RegExp(label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), `${label} starter row should render`);
});
[
  ["Credit Card Debt", "creditCard", "Credit Card", "../Images/creditcard.svg"],
  ["Auto Loan", "autoLoan", "Auto Loan", "../Images/vehicle.svg"],
  ["Student Loan", "federalStudentLoan", "Federal Student Loan", "../Images/education.svg"],
  ["Personal Loan", "personalLoan", "Personal Loan", "../Images/loan.svg"]
].forEach(([rowLabel, typeKey, tooltip, src]) => {
  const rowMarkup = getRowMarkupByLabel(fakeDom.list.innerHTML, rowLabel);
  assertDebtTypeIconChip(rowMarkup, { label: rowLabel, typeKey, tooltip, src });
  assert.doesNotMatch(
    rowMarkup,
    new RegExp(`<span class="pmi-debt-record-type-label"[^>]*>${tooltip}<\\/span>`),
    `${rowLabel} should not render the old visible long debt type pill`
  );
});
[
  "Auto Lease",
  "Tax Debt / IRS Payment Plan",
  "Medical Debt",
  "Business Debt",
  "Other Debt"
].forEach((label) => {
  assert.doesNotMatch(fakeDom.list.innerHTML, new RegExp(label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), `${label} should remain Add Debt only, not a starter row`);
});

const autoLeaseApplicability = pmiDebtRecords.getDebtRecordFieldApplicability({ typeKey: "autoLease" });
assert.equal(autoLeaseApplicability.currentBalance, "notApplicable");
assert.equal(autoLeaseApplicability.paymentFrequency, "active");
assert.equal(autoLeaseApplicability.paymentAmount, "active");
assert.equal(autoLeaseApplicability.extraPayoffAmount, "notApplicable");
assert.equal(autoLeaseApplicability.remainingTermMonths, "active");
assert.equal(autoLeaseApplicability.interestRatePercent, "notApplicable");

const creditCardApplicability = pmiDebtRecords.getDebtRecordFieldApplicability({ typeKey: "creditCard" });
assert.equal(creditCardApplicability.currentBalance, "active");
assert.equal(creditCardApplicability.paymentFrequency, "active");
assert.equal(creditCardApplicability.paymentAmount, "active");
assert.equal(creditCardApplicability.extraPayoffAmount, "active");
assert.equal(creditCardApplicability.remainingTermMonths, "notApplicable");
assert.equal(creditCardApplicability.interestRatePercent, "optional");

const medicalBillApplicability = pmiDebtRecords.getDebtRecordFieldApplicability({ typeKey: "medicalBill" });
assert.equal(medicalBillApplicability.remainingTermMonths, "optional");
assert.equal(medicalBillApplicability.interestRatePercent, "optional");

const dentalBillApplicability = pmiDebtRecords.getDebtRecordFieldApplicability({ typeKey: "dentalBill" });
assert.equal(dentalBillApplicability.remainingTermMonths, "optional");
assert.equal(dentalBillApplicability.interestRatePercent, "optional");

const medicalPaymentPlanApplicability = pmiDebtRecords.getDebtRecordFieldApplicability({ typeKey: "medicalPaymentPlan" });
assert.equal(medicalPaymentPlanApplicability.interestRatePercent, "optional");

const longTermCareDebtApplicability = pmiDebtRecords.getDebtRecordFieldApplicability({ typeKey: "longTermCareDebt" });
assert.equal(longTermCareDebtApplicability.interestRatePercent, "optional");

const legalJudgmentApplicability = pmiDebtRecords.getDebtRecordFieldApplicability({ typeKey: "legalJudgment" });
assert.equal(legalJudgmentApplicability.extraPayoffAmount, "optional");
assert.equal(legalJudgmentApplicability.interestRatePercent, "optional");

const courtOrderedDebtApplicability = pmiDebtRecords.getDebtRecordFieldApplicability({ typeKey: "courtOrderedDebt" });
assert.equal(courtOrderedDebtApplicability.extraPayoffAmount, "optional");
assert.equal(courtOrderedDebtApplicability.interestRatePercent, "optional");

const familyLoanApplicability = pmiDebtRecords.getDebtRecordFieldApplicability({ typeKey: "familyLoan" });
assert.equal(familyLoanApplicability.remainingTermMonths, "optional");
assert.equal(familyLoanApplicability.interestRatePercent, "optional");

const loanFromFriendApplicability = pmiDebtRecords.getDebtRecordFieldApplicability({ typeKey: "loanFromFriend" });
assert.equal(loanFromFriendApplicability.remainingTermMonths, "optional");
assert.equal(loanFromFriendApplicability.interestRatePercent, "optional");

const informalPersonalObligationApplicability = pmiDebtRecords.getDebtRecordFieldApplicability({ typeKey: "informalPersonalObligation" });
assert.equal(informalPersonalObligationApplicability.remainingTermMonths, "optional");
assert.equal(informalPersonalObligationApplicability.interestRatePercent, "optional");

const businessLineOfCreditApplicability = pmiDebtRecords.getDebtRecordFieldApplicability({ typeKey: "businessLineOfCredit" });
assert.equal(businessLineOfCreditApplicability.remainingTermMonths, "optional");

const autoLoanApplicability = pmiDebtRecords.getDebtRecordFieldApplicability({ typeKey: "autoLoan" });
assert.equal(autoLoanApplicability.currentBalance, "active");
assert.equal(autoLoanApplicability.paymentFrequency, "active");
assert.equal(autoLoanApplicability.paymentAmount, "active");
assert.equal(autoLoanApplicability.extraPayoffAmount, "active");
assert.equal(autoLoanApplicability.remainingTermMonths, "active");
assert.equal(autoLoanApplicability.interestRatePercent, "active");

const starterCreditCardMarkup = getRowMarkupByLabel(fakeDom.list.innerHTML, "Credit Card Debt");
assertFieldNotApplicable(starterCreditCardMarkup, "data-pmi-debt-record-term", "Credit Card Remaining Term");
assertFieldActive(starterCreditCardMarkup, "data-pmi-debt-record-balance", "Credit Card Balance");
assertFieldActive(starterCreditCardMarkup, "data-pmi-debt-record-payment-frequency", "Credit Card Payment Frequency");
assertFieldActive(starterCreditCardMarkup, "data-pmi-debt-record-payment-amount", "Credit Card Payment Amount");
assertFieldActive(starterCreditCardMarkup, "data-pmi-debt-record-extra-payoff", "Credit Card Extra Payoff");

const starterAutoLoanMarkup = getRowMarkupByLabel(fakeDom.list.innerHTML, "Auto Loan");
assertFieldActive(starterAutoLoanMarkup, "data-pmi-debt-record-balance", "Auto Loan Balance");
assertFieldActive(starterAutoLoanMarkup, "data-pmi-debt-record-payment-frequency", "Auto Loan Payment Frequency");
assertFieldActive(starterAutoLoanMarkup, "data-pmi-debt-record-payment-amount", "Auto Loan Payment Amount");
assertFieldActive(starterAutoLoanMarkup, "data-pmi-debt-record-extra-payoff", "Auto Loan Extra Payoff");
assertFieldActive(starterAutoLoanMarkup, "data-pmi-debt-record-term", "Auto Loan Remaining Term");
assertFieldActive(starterAutoLoanMarkup, "data-pmi-debt-record-rate", "Auto Loan Interest Rate");

const starterSerialized = controller.serializeDebtRecords();
assert.equal(starterSerialized.length, 4, "lean starter rows should serialize as debtRecords[]");
assert.deepEqual(
  Array.from(starterSerialized, (record) => record.typeKey),
  ["creditCard", "autoLoan", "federalStudentLoan", "personalLoan"],
  "starter rows should serialize only the lean normal needs-analysis set"
);
assert.ok(starterSerialized.every((record) => record.isDefaultDebt === true));
assert.ok(starterSerialized.every((record) => record.currentBalance == null));
assert.equal(starterSerialized.some((record) => record.typeKey === "autoLease"), false, "Auto Lease should remain Add Debt only");
assert.equal(starterSerialized.some((record) => record.typeKey === "medicalBill"), false, "Medical Debt should remain Add Debt only");
assert.equal(starterSerialized.some((record) => record.typeKey === "irsTaxDebt"), false, "Tax Debt should remain Add Debt only");
assert.equal(starterSerialized.some((record) => record.typeKey === "businessLoan"), false, "Business Debt should remain Add Debt only");
assert.equal(starterSerialized.some((record) => record.typeKey === "otherDebt"), false, "Other Debt should remain Add Debt only");
assert.equal(starterSerialized.find((record) => record.typeKey === "creditCard").remainingTermMonths, null);
assert.equal(starterSerialized.find((record) => record.typeKey === "creditCard").metadata.source, "starter-notebook");

assert.equal(controller.removeDebtRecordById("starter_debt_creditCard"), true);
assert.doesNotMatch(fakeDom.list.innerHTML, /Credit Card Debt/, "starter rows should be removable");
assert.equal(controller.serializeDebtRecords().some((record) => record.typeKey === "creditCard"), false);

const addedAutoLoan = controller.addDebtRecordFromLibraryEntry(
  debtLibrary.findDebtLibraryEntry("autoLoan")
);
const addedAutoLease = controller.addDebtRecordFromLibraryEntry(
  debtLibrary.findDebtLibraryEntry("autoLease")
);
assert.ok(addedAutoLoan, "users should be able to add repeatable Auto Loan rows from the library/menu path");
assert.ok(addedAutoLease, "users should be able to add repeatable Auto Lease rows from the library/menu path");
assert.equal(addedAutoLoan.typeKey, "autoLoan");
assert.equal(addedAutoLease.typeKey, "autoLease");
assert.equal(
  controller.records.filter((record) => record.typeKey === "autoLoan").length,
  2,
  "repeatable debtRecords[] should allow multiple Auto Loan rows"
);
assert.equal(
  controller.records.filter((record) => record.typeKey === "autoLease").length,
  1,
  "Auto Lease should remain addable from the library/menu path without being a starter row"
);
assert.equal(
  controller.addDebtRecordFromLibraryEntry(debtLibrary.findDebtLibraryEntry("secondVehicleLease")),
  null,
  "deprecated second vehicle lease should not be addable from the library/menu path"
);
assert.doesNotMatch(fakeDom.list.innerHTML, /Second Vehicle Lease/);

controller.hydrateDebtRecords([
  {
    debtId: "legacy_second_vehicle_loan",
    categoryKey: "securedConsumerDebt",
    typeKey: "secondVehicleLoan",
    label: "Honda Accord",
    currentBalance: 9000,
    paymentFrequency: "monthly",
    paymentAmount: 275
  },
  {
    debtId: "legacy_second_vehicle_lease",
    categoryKey: "securedConsumerDebt",
    typeKey: "secondVehicleLease",
    label: "Model Y",
    currentBalance: null,
    paymentType: "leasePayment",
    paymentFrequency: "monthly",
    paymentAmount: 425
  }
]);
const legacySecondVehicleSerialized = controller.serializeDebtRecords();
assert.deepEqual(
  Array.from(legacySecondVehicleSerialized, (record) => record.typeKey),
  ["autoLoan", "autoLease"],
  "saved secondVehicle records should hydrate through canonical Auto Loan / Auto Lease records"
);
assert.equal(legacySecondVehicleSerialized[0].metadata.deprecatedOriginalTypeKey, "secondVehicleLoan");
assert.equal(legacySecondVehicleSerialized[1].metadata.deprecatedOriginalTypeKey, "secondVehicleLease");
assert.match(fakeDom.list.innerHTML, /Honda Accord/);
assert.match(fakeDom.list.innerHTML, /Model Y/);
const legacySecondVehicleLeaseMarkup = getRowMarkupByLabel(fakeDom.list.innerHTML, "Model Y");
assertFieldNotApplicable(legacySecondVehicleLeaseMarkup, "data-pmi-debt-record-balance", "Legacy Second Vehicle Lease Balance");
assertFieldNotApplicable(legacySecondVehicleLeaseMarkup, "data-pmi-debt-record-extra-payoff", "Legacy Second Vehicle Lease Extra Payoff");
assertFieldNotApplicable(legacySecondVehicleLeaseMarkup, "data-pmi-debt-record-rate", "Legacy Second Vehicle Lease Interest Rate");
assertFieldActive(legacySecondVehicleLeaseMarkup, "data-pmi-debt-record-payment-frequency", "Legacy Second Vehicle Lease Payment Frequency");
assertFieldActive(legacySecondVehicleLeaseMarkup, "data-pmi-debt-record-payment-amount", "Legacy Second Vehicle Lease Payment Amount");
assertFieldActive(legacySecondVehicleLeaseMarkup, "data-pmi-debt-record-term", "Legacy Second Vehicle Lease Remaining Term");

controller.hydrateDebtRecords([
  {
    debtId: "lease_with_legacy_values",
    categoryKey: "securedConsumerDebt",
    typeKey: "autoLease",
    label: "Legacy Lease Values",
    currentBalance: 8888,
    paymentFrequency: "monthly",
    paymentAmount: 500,
    extraPayoffAmount: 300,
    remainingTermMonths: 18,
    interestRatePercent: 7.5
  }
]);
const legacyLeaseMarkup = getRowMarkupByLabel(fakeDom.list.innerHTML, "Legacy Lease Values");
assertFieldNotApplicable(legacyLeaseMarkup, "data-pmi-debt-record-balance", "Saved Auto Lease Balance");
assertFieldNotApplicable(legacyLeaseMarkup, "data-pmi-debt-record-extra-payoff", "Saved Auto Lease Extra Payoff");
assertFieldNotApplicable(legacyLeaseMarkup, "data-pmi-debt-record-rate", "Saved Auto Lease Interest Rate");
assert.doesNotMatch(legacyLeaseMarkup, /8888|300|7\.5/, "not-applicable saved values should not surface as active row inputs");
const legacyLeaseSerialized = controller.serializeDebtRecords()[0];
assert.equal(legacyLeaseSerialized.currentBalance, 8888, "saved N/A balance should hydrate safely without being overwritten by the N/A control");
assert.equal(legacyLeaseSerialized.extraPayoffAmount, 300, "saved N/A extra payoff should hydrate safely without being overwritten by the N/A control");
assert.equal(legacyLeaseSerialized.interestRatePercent, 7.5, "saved N/A rate should hydrate safely without being overwritten by the N/A control");
assert.equal(legacyLeaseSerialized.paymentAmount, 500);
assert.equal(legacyLeaseSerialized.remainingTermMonths, 18);

controller.hydrateDebtRecords([
  {
    debtId: "dental_optional",
    categoryKey: "medicalDebt",
    typeKey: "dentalBill",
    label: "Dental Optional"
  },
  {
    debtId: "medical_plan_optional",
    categoryKey: "medicalDebt",
    typeKey: "medicalPaymentPlan",
    label: "Medical Plan Optional"
  },
  {
    debtId: "ltc_optional",
    categoryKey: "medicalDebt",
    typeKey: "longTermCareDebt",
    label: "LTC Optional"
  },
  {
    debtId: "legal_optional",
    categoryKey: "taxLegalDebt",
    typeKey: "legalJudgment",
    label: "Legal Optional"
  },
  {
    debtId: "court_optional",
    categoryKey: "taxLegalDebt",
    typeKey: "courtOrderedDebt",
    label: "Court Optional"
  },
  {
    debtId: "family_optional",
    categoryKey: "privatePersonalDebt",
    typeKey: "familyLoan",
    label: "Family Optional"
  },
  {
    debtId: "friend_optional",
    categoryKey: "privatePersonalDebt",
    typeKey: "loanFromFriend",
    label: "Friend Optional"
  },
  {
    debtId: "informal_optional",
    categoryKey: "privatePersonalDebt",
    typeKey: "informalPersonalObligation",
    label: "Informal Optional"
  },
  {
    debtId: "business_loc_optional",
    categoryKey: "businessDebt",
    typeKey: "businessLineOfCredit",
    label: "Business LOC Optional"
  }
]);
const dentalOptionalMarkup = getRowMarkupByLabel(fakeDom.list.innerHTML, "Dental Optional");
assertFieldOptional(dentalOptionalMarkup, "data-pmi-debt-record-term", "Dental Bill Remaining Term");
assertFieldOptional(dentalOptionalMarkup, "data-pmi-debt-record-rate", "Dental Bill Interest Rate");
const medicalPlanOptionalMarkup = getRowMarkupByLabel(fakeDom.list.innerHTML, "Medical Plan Optional");
assertFieldOptional(medicalPlanOptionalMarkup, "data-pmi-debt-record-rate", "Medical Payment Plan Interest Rate");
const ltcOptionalMarkup = getRowMarkupByLabel(fakeDom.list.innerHTML, "LTC Optional");
assertFieldOptional(ltcOptionalMarkup, "data-pmi-debt-record-rate", "Long-Term Care Debt Interest Rate");
const legalOptionalMarkup = getRowMarkupByLabel(fakeDom.list.innerHTML, "Legal Optional");
assertFieldOptional(legalOptionalMarkup, "data-pmi-debt-record-extra-payoff", "Legal Judgment Extra Payoff");
assertFieldOptional(legalOptionalMarkup, "data-pmi-debt-record-rate", "Legal Judgment Interest Rate");
const courtOptionalMarkup = getRowMarkupByLabel(fakeDom.list.innerHTML, "Court Optional");
assertFieldOptional(courtOptionalMarkup, "data-pmi-debt-record-extra-payoff", "Court-Ordered Debt Extra Payoff");
assertFieldOptional(courtOptionalMarkup, "data-pmi-debt-record-rate", "Court-Ordered Debt Interest Rate");
const familyOptionalMarkup = getRowMarkupByLabel(fakeDom.list.innerHTML, "Family Optional");
assertFieldOptional(familyOptionalMarkup, "data-pmi-debt-record-term", "Family Loan Remaining Term");
assertFieldOptional(familyOptionalMarkup, "data-pmi-debt-record-rate", "Family Loan Interest Rate");
const friendOptionalMarkup = getRowMarkupByLabel(fakeDom.list.innerHTML, "Friend Optional");
assertFieldOptional(friendOptionalMarkup, "data-pmi-debt-record-term", "Loan From Friend Remaining Term");
assertFieldOptional(friendOptionalMarkup, "data-pmi-debt-record-rate", "Loan From Friend Interest Rate");
const informalOptionalMarkup = getRowMarkupByLabel(fakeDom.list.innerHTML, "Informal Optional");
assertFieldOptional(informalOptionalMarkup, "data-pmi-debt-record-term", "Informal Personal Obligation Remaining Term");
assertFieldOptional(informalOptionalMarkup, "data-pmi-debt-record-rate", "Informal Personal Obligation Interest Rate");
const businessLocOptionalMarkup = getRowMarkupByLabel(fakeDom.list.innerHTML, "Business LOC Optional");
assertFieldOptional(businessLocOptionalMarkup, "data-pmi-debt-record-term", "Business Line of Credit Remaining Term");

controller.hydrateDebtRecords([]);
assert.equal(controller.records.length, 0, "explicit saved empty debtRecords[] should preserve removed starter rows");
assert.equal(controller.serializeDebtRecords().length, 0);
assert.equal(fakeDom.list.innerHTML, "", "explicit saved empty debtRecords[] should not render starter rows or table shell");

const inputRecords = Object.freeze([
  Object.freeze({
    debtId: "debt_valid",
    categoryKey: "unsecuredConsumerDebt",
    typeKey: "creditCard",
    label: "Visa Card",
    currentBalance: "1200.50",
    paymentType: "fixedInstallment",
    paymentFrequency: "biweekly",
    paymentAmount: "80",
    minimumMonthlyPayment: "75",
    extraPayoffAmount: "20",
    interestRatePercent: "19.99",
    remainingTermMonths: "24",
    notes: "Primary card",
    sourceKey: null,
    isDefaultDebt: false,
    isCustomDebt: false,
    metadata: Object.freeze({ sourceType: "user-input", source: "debt-library", libraryEntryKey: "creditCard" })
  }),
  Object.freeze({
    debtId: "debt_invalid_balance",
    categoryKey: "medicalDebt",
    typeKey: "medicalBill",
    label: "Medical Bill",
    currentBalance: "abc",
    paymentType: "minimumPayment",
    minimumMonthlyPayment: "10",
    notes: "Legacy medical note",
    interestRatePercent: "bad",
    remainingTermMonths: "-3"
  }),
  Object.freeze({
    debtId: "debt_negative_balance",
    categoryKey: "consumerFinanceDebt",
    typeKey: "buyNowPayLater",
    label: "BNPL",
    currentBalance: "-50"
  }),
  Object.freeze({
    debtId: "debt_bad_optional",
    categoryKey: "businessDebt",
    typeKey: "businessLoan",
    label: "Business Loan",
    currentBalance: "3000",
    minimumMonthlyPayment: "not-a-number",
    interestRatePercent: "-1",
    remainingTermMonths: ""
  }),
  Object.freeze({
    debtId: "debt_primary_mortgage",
    categoryKey: "realEstateSecuredDebt",
    typeKey: "primaryResidenceMortgage",
    label: "Should Be Ignored",
    currentBalance: "999999"
  })
]);

controller.hydrateDebtRecords(inputRecords);
assert.match(fakeDom.list.innerHTML, /Visa Card/, "hydrate should render saved valid record labels");
assert.doesNotMatch(fakeDom.list.innerHTML, /Primary card/, "saved notes should not render in the simplified row UI");
assert.doesNotMatch(fakeDom.list.innerHTML, /Legacy medical note/, "legacy saved notes should not render in the simplified row UI");
assert.doesNotMatch(fakeDom.list.innerHTML, /data-pmi-debt-record-payment-type/, "legacy paymentType should not render as a visible select");
assert.match(fakeDom.list.innerHTML, /data-pmi-debt-record-payment-frequency/, "hydrated rows should render payment frequency select");
assert.doesNotMatch(fakeDom.list.innerHTML, /Should Be Ignored/, "hydrate should not preserve non-addable primary mortgage records");

const serialized = controller.serializeDebtRecords();
assert.equal(serialized.length, 3);

const valid = serialized.find((record) => record.debtId === "debt_valid");
assert.ok(valid, "valid debt record should serialize");
assert.equal(valid.label, "Visa Card");
assert.equal(valid.currentBalance, 1200.5);
assert.equal(valid.paymentType, "fixedInstallment");
assert.equal(valid.paymentFrequency, "biweekly");
assert.equal(valid.paymentAmount, 80);
assert.equal(valid.minimumMonthlyPayment, null);
assert.equal(valid.extraPayoffAmount, 20);
assert.equal(valid.interestRatePercent, 19.99);
assert.equal(valid.remainingTermMonths, 24);
assert.equal(valid.notes, "Primary card");
assert.equal(valid.categoryKey, "unsecuredConsumerDebt");
assert.equal(valid.typeKey, "creditCard");
assert.equal(valid.metadata.source, "debt-library");
assert.equal(valid.metadata.libraryEntryKey, "creditCard");

const invalidBalance = serialized.find((record) => record.debtId === "debt_invalid_balance");
assert.ok(invalidBalance, "blank or invalid balance rows should preserve editable debtRecords");
assert.equal(invalidBalance.currentBalance, null);
assert.equal(invalidBalance.paymentType, "minimumPayment");
assert.equal(invalidBalance.paymentFrequency, "monthly");
assert.equal(invalidBalance.paymentAmount, 10);
assert.equal(invalidBalance.minimumMonthlyPayment, 10);
assert.equal(invalidBalance.notes, "Legacy medical note");
assert.equal(invalidBalance.interestRatePercent, null);
assert.equal(invalidBalance.remainingTermMonths, null);

const badOptional = serialized.find((record) => record.debtId === "debt_bad_optional");
assert.ok(badOptional, "invalid optional fields should not block serialization");
assert.equal(badOptional.currentBalance, 3000);
assert.equal(badOptional.paymentAmount, null);
assert.equal(badOptional.minimumMonthlyPayment, null);
assert.equal(badOptional.interestRatePercent, null);
assert.equal(badOptional.remainingTermMonths, null);

const linkedMissingDebtRecordsSource = getDebtRecordsHydrationSourceLikeLinkedPage({
  grossAnnualIncome: "125000"
});
assert.equal(
  linkedMissingDebtRecordsSource,
  undefined,
  "linked PMI pages should pass missing debtRecords through as missing so the controller spawns starters"
);
controller.hydrateDebtRecords(linkedMissingDebtRecordsSource);
assert.equal(controller.records.length, 4, "missing linked debtRecords should spawn lean starter rows");
assert.equal(controller.records[0].debtId, "starter_debt_creditCard");
assert.deepEqual(
  Array.from(controller.records, (record) => record.typeKey),
  ["creditCard", "autoLoan", "federalStudentLoan", "personalLoan"],
  "missing linked debtRecords should spawn exactly the lean starter keys"
);

const linkedScalarHydrationSource = getDebtRecordsHydrationSourceLikeLinkedPage({
  autoLoans: "12000",
  creditCardDebt: "3400",
  mortgageBalance: "999000"
});
assert.equal(linkedScalarHydrationSource.length, 2, "linked scalar debts should seed rows only when debtRecords is missing");
assert.deepEqual(
  Array.from(linkedScalarHydrationSource, (record) => record.sourceKey),
  ["autoLoans", "creditCardDebt"]
);
assert.equal(
  linkedScalarHydrationSource.some((record) => record.sourceKey === "mortgageBalance"),
  false,
  "linked scalar migration should not seed housing-owned mortgage rows"
);
controller.hydrateDebtRecords(linkedScalarHydrationSource);
assert.equal(controller.records.length, 2, "linked scalar migration should hydrate only migrated non-mortgage debts");
assert.equal(controller.records[0].debtId, "legacy_scalar_debt_autoLoans");
assert.equal(controller.records[1].debtId, "legacy_scalar_debt_creditCardDebt");

const linkedExplicitEmptyHydrationSource = getDebtRecordsHydrationSourceLikeLinkedPage({
  debtRecords: [],
  autoLoans: "12000",
  creditCardDebt: "3400"
});
assert.deepEqual(linkedExplicitEmptyHydrationSource, [], "explicit linked debtRecords[] should win over scalar fields");
controller.hydrateDebtRecords(linkedExplicitEmptyHydrationSource);
assert.equal(controller.records.length, 0, "explicit linked debtRecords[] should remain an empty notebook");

const linkedSavedRowsHydrationSource = getDebtRecordsHydrationSourceLikeLinkedPage({
  debtRecords: [
    {
      debtId: "saved_card",
      categoryKey: "unsecuredConsumerDebt",
      typeKey: "creditCard",
      label: "Saved Card",
      currentBalance: "1111"
    }
  ],
  creditCardDebt: "9999"
});
assert.equal(linkedSavedRowsHydrationSource.length, 1, "saved linked debtRecords should win over scalar fields");
controller.hydrateDebtRecords(linkedSavedRowsHydrationSource);
assert.equal(controller.records.length, 1);
assert.equal(controller.records[0].debtId, "saved_card");
assert.equal(controller.records[0].currentBalance, 1111);

assert.deepEqual(inputRecords[0], {
  debtId: "debt_valid",
  categoryKey: "unsecuredConsumerDebt",
  typeKey: "creditCard",
  label: "Visa Card",
  currentBalance: "1200.50",
  paymentType: "fixedInstallment",
  paymentFrequency: "biweekly",
  paymentAmount: "80",
  minimumMonthlyPayment: "75",
  extraPayoffAmount: "20",
  interestRatePercent: "19.99",
  remainingTermMonths: "24",
  notes: "Primary card",
  sourceKey: null,
  isDefaultDebt: false,
  isCustomDebt: false,
  metadata: { sourceType: "user-input", source: "debt-library", libraryEntryKey: "creditCard" }
});

[
  "pages/next-step.html",
  "pages/confidential-inputs.html"
].forEach((relativePath) => {
  const source = readRepoFile(relativePath);
  assert.match(source, /debt-taxonomy\.js/);
  assert.match(source, /debt-library\.js/);
  assert.match(source, /pmi-debt-records\.js/);
  assert.match(source, /data-pmi-debt-records-root/);
  assert.match(source, /data-pmi-scalar-debt-compatibility hidden/);
  assert.match(source, /type="hidden" data-pmi-scalar-debt-compatibility-field/);
  assert.doesNotMatch(source, /name="debtRecords"/, "hidden scalar compatibility fields must not create debtRecords[]");
  assert.doesNotMatch(source, /<label for="auto-loans">Remaining Auto Loan Balances<\/label>/);
  assert.doesNotMatch(source, /<label for="credit-card-debt">Revolving Credit Card Debt<\/label>/);
  assert.ok(
    source.indexOf("pmi-debt-records.js") < source.indexOf("const pmiDebtRecordsController"),
    "Debt Records feature script should load before linked page controller initialization"
  );
  assert.match(source, /getDebtRecordsHydrationSource\(saved\)/);
  assert.match(source, /createDebtRecordsFromLegacyScalarFields/);
  assert.match(
    source,
    /if \(Array\.isArray\(savedDraft\.debtRecords\)\) {\s*return savedDraft\.debtRecords;\s*}/,
    "linked page hydration should preserve explicit debtRecords[] including []"
  );
  assert.match(
    source,
    /const migratedDebtRecords = createLegacyDebtRecords\(savedDraft\);[\s\S]*if \(migratedDebtRecords\.length\) {\s*return migratedDebtRecords;\s*}/,
    "linked page hydration should seed scalar rows only when debtRecords is missing"
  );
  assert.match(source, /syncDebtScalarCompatibilityFields/);
  assert.match(source, /pmiDebtRecordsChange/);
  assert.match(source, /draft\.debtRecords = pmiDebtRecordsController\.serializeDebtRecords\(\)/);
  assert.equal(
    countOccurrences(source, /const draft = serializeForm\(\);/g),
    1,
    "linked page should serialize the form only from the save action path"
  );
  assert.match(
    source,
    /saveExitButton\.addEventListener\("click", \(\) => {[\s\S]*const draft = serializeForm\(\);/,
    "linked page should not write debtRecords[] during initial page load"
  );
});

assertNoProtectedDiffs();

console.log("pmi-debt-records-check passed");
