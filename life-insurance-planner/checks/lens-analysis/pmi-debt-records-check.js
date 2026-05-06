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
      getAttribute(name) {
        return name === "data-pmi-debt-id" ? debtId : null;
      },
      querySelector(selector) {
        const selectorToAttribute = {
          "[data-pmi-debt-record-label]": "data-pmi-debt-record-label",
          "[data-pmi-debt-record-balance]": "data-pmi-debt-record-balance",
          "[data-pmi-debt-record-payment-type]": "data-pmi-debt-record-payment-type",
          "[data-pmi-debt-record-payment-amount]": "data-pmi-debt-record-payment-amount",
          "[data-pmi-debt-record-payment]": "data-pmi-debt-record-payment",
          "[data-pmi-debt-record-extra-payoff]": "data-pmi-debt-record-extra-payoff",
          "[data-pmi-debt-record-rate]": "data-pmi-debt-record-rate",
          "[data-pmi-debt-record-term]": "data-pmi-debt-record-term",
          "[data-pmi-debt-record-notes]": "data-pmi-debt-record-notes"
        };
        const attribute = selectorToAttribute[selector];
        if (!attribute) {
          return null;
        }
        if (selector === "[data-pmi-debt-record-payment-type]") {
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
    "pages/manual-protection-modeling-inputs.html",
    "app/features/lens-analysis/blocks/debt-payoff.js",
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

const autoLoanEntry = debtLibrary.findDebtLibraryEntry("autoLoan");
const autoLoanRecord = pmiDebtRecords.createDebtRecordFromLibraryEntry(autoLoanEntry);
assert.ok(autoLoanRecord.debtId.startsWith("debt_"));
assert.equal(autoLoanRecord.categoryKey, "securedConsumerDebt");
assert.equal(autoLoanRecord.typeKey, "autoLoan");
assert.equal(autoLoanRecord.currentBalance, null);
assert.equal(autoLoanRecord.paymentType, "minimumPayment");
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

const secondVehicleLoanRecord = pmiDebtRecords.createDebtRecordFromLibraryEntry(
  debtLibrary.findDebtLibraryEntry("secondVehicleLoan")
);
const secondVehicleLeaseRecord = pmiDebtRecords.createDebtRecordFromLibraryEntry(
  debtLibrary.findDebtLibraryEntry("secondVehicleLease")
);
assert.equal(secondVehicleLoanRecord.typeKey, "secondVehicleLoan");
assert.equal(secondVehicleLoanRecord.paymentType, "minimumPayment");
assert.equal(secondVehicleLeaseRecord.typeKey, "secondVehicleLease");
assert.equal(secondVehicleLeaseRecord.paymentType, "leasePayment");

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

const fakeDom = createFakeRoot();
const controller = pmiDebtRecords.initPmiDebtRecords({ root: fakeDom.root });
assert.ok(controller);
assert.equal(fakeDom.root.dataset.pmiDebtRecordsInitialized, "true");
assert.equal(controller.records.length, 9, "default starter notebook rows should appear on init");
assert.match(fakeDom.list.innerHTML, /data-pmi-debt-records-table/, "compact debt records table shell should render");
assert.match(fakeDom.list.innerHTML, /data-pmi-debt-records-header/, "compact debt records table should render column headers");
[
  "Debt Type",
  "Label / Creditor",
  "Balance",
  "Payment Type",
  "Payment Amount",
  "Extra Payoff",
  "Remaining Term",
  "Interest Rate",
  "Notes",
  "Remove"
].forEach((header) => {
  assert.match(fakeDom.list.innerHTML, new RegExp(`>${header}<`), `${header} column header should render`);
});
assert.doesNotMatch(fakeDom.list.innerHTML, /pmi-debt-record-field/, "debt rows should not render as stacked card fields");
assert.doesNotMatch(fakeDom.list.innerHTML, /pmi-debt-record-grid/, "debt rows should not render the old stacked field grid");
assert.doesNotMatch(fakeDom.list.innerHTML, /pmi-debt-record-label-row/, "row labels should come from column headers");
assert.equal(parseRowsFromMarkup(fakeDom.list.innerHTML).length, 9, "starter debts should render as compact rows");
[
  "Credit Card Debt",
  "Student Loan",
  "Auto Loan",
  "Auto Lease",
  "Personal Loan",
  "Tax Debt / IRS Payment Plan",
  "Medical Debt",
  "Business Debt",
  "Other Debt"
].forEach((label) => {
  assert.match(fakeDom.list.innerHTML, new RegExp(label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), `${label} starter row should render`);
});

const starterSerialized = controller.serializeDebtRecords();
assert.equal(starterSerialized.length, 9, "starter rows should serialize as debtRecords[]");
assert.ok(starterSerialized.every((record) => record.isDefaultDebt === true));
assert.ok(starterSerialized.every((record) => record.currentBalance == null));
assert.equal(starterSerialized.find((record) => record.typeKey === "autoLease").paymentType, "leasePayment");
assert.equal(starterSerialized.find((record) => record.typeKey === "creditCard").metadata.source, "starter-notebook");

assert.equal(controller.removeDebtRecordById("starter_debt_creditCard"), true);
assert.doesNotMatch(fakeDom.list.innerHTML, /Credit Card Debt/, "starter rows should be removable");
assert.equal(controller.serializeDebtRecords().some((record) => record.typeKey === "creditCard"), false);

const addedFromLibrary = controller.addDebtRecordFromLibraryEntry(
  debtLibrary.findDebtLibraryEntry("secondVehicleLease")
);
assert.ok(addedFromLibrary, "users should be able to add debts from the library/menu path");
assert.equal(addedFromLibrary.typeKey, "secondVehicleLease");
assert.match(fakeDom.list.innerHTML, /Second Vehicle Lease/);

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
    minimumMonthlyPayment: "10",
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
assert.doesNotMatch(fakeDom.list.innerHTML, /Should Be Ignored/, "hydrate should not preserve non-addable primary mortgage records");

const serialized = controller.serializeDebtRecords();
assert.equal(serialized.length, 3);

const valid = serialized.find((record) => record.debtId === "debt_valid");
assert.ok(valid, "valid debt record should serialize");
assert.equal(valid.label, "Visa Card");
assert.equal(valid.currentBalance, 1200.5);
assert.equal(valid.paymentType, "fixedInstallment");
assert.equal(valid.paymentAmount, 80);
assert.equal(valid.minimumMonthlyPayment, 80);
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
assert.equal(invalidBalance.paymentAmount, 10);
assert.equal(invalidBalance.minimumMonthlyPayment, 10);
assert.equal(invalidBalance.interestRatePercent, null);
assert.equal(invalidBalance.remainingTermMonths, null);

const badOptional = serialized.find((record) => record.debtId === "debt_bad_optional");
assert.ok(badOptional, "invalid optional fields should not block serialization");
assert.equal(badOptional.currentBalance, 3000);
assert.equal(badOptional.paymentAmount, null);
assert.equal(badOptional.minimumMonthlyPayment, null);
assert.equal(badOptional.interestRatePercent, null);
assert.equal(badOptional.remainingTermMonths, null);

assert.deepEqual(inputRecords[0], {
  debtId: "debt_valid",
  categoryKey: "unsecuredConsumerDebt",
  typeKey: "creditCard",
  label: "Visa Card",
  currentBalance: "1200.50",
  paymentType: "fixedInstallment",
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
  assert.match(source, /hydrateDebtRecords\(saved\.debtRecords\)/);
  assert.match(source, /draft\.debtRecords = pmiDebtRecordsController\.serializeDebtRecords\(\)/);
});

assertNoProtectedDiffs();

console.log("pmi-debt-records-check passed");
