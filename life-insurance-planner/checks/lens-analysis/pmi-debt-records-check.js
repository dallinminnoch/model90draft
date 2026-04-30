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
  const rowPattern = /<div class="field-group full-width pmi-debt-record-field" data-pmi-debt-record-entry data-pmi-debt-id="([^"]+)">([\s\S]*?)(?=<\/div>\s*(?:<div class="field-group full-width pmi-debt-record-field"|$))/g;
  const rows = [];
  let match;

  while ((match = rowPattern.exec(source)) !== null) {
    const debtId = decodeHtml(match[1]);
    const rowMarkup = match[2];
    rows.push({
      getAttribute(name) {
        return name === "data-pmi-debt-id" ? debtId : null;
      },
      querySelector(selector) {
        const selectorToAttribute = {
          "[data-pmi-debt-record-label]": "data-pmi-debt-record-label",
          "[data-pmi-debt-record-balance]": "data-pmi-debt-record-balance",
          "[data-pmi-debt-record-payment]": "data-pmi-debt-record-payment",
          "[data-pmi-debt-record-rate]": "data-pmi-debt-record-rate",
          "[data-pmi-debt-record-term]": "data-pmi-debt-record-term"
        };
        const attribute = selectorToAttribute[selector];
        if (!attribute) {
          return null;
        }
        const inputPattern = new RegExp("<input[^>]*" + attribute + "[^>]*>", "i");
        const inputMatch = rowMarkup.match(inputPattern);
        return inputMatch ? { value: parseAttribute(inputMatch[0], "value") } : null;
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
    "app/features/lens-analysis/lens-model-builder.js",
    "app/features/lens-analysis/analysis-methods.js",
    "app/features/lens-analysis/analysis-setup.js",
    "app/features/lens-analysis/analysis-settings-adapter.js",
    "app/features/lens-analysis/step-three-analysis-display.js",
    "app/features/lens-analysis/asset-treatment-calculations.js"
  ];
  const status = execFileSync("git", ["status", "--short", "--"].concat(protectedFiles), {
    cwd: repoRoot,
    encoding: "utf8"
  }).trim();

  assert.equal(status, "", "protected formula/model/normalization/schema/manual files should not have diffs");
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
assert.equal(autoLoanRecord.minimumMonthlyPayment, null);
assert.equal(autoLoanRecord.interestRatePercent, null);
assert.equal(autoLoanRecord.remainingTermMonths, null);
assert.equal(autoLoanRecord.sourceKey, null);
assert.equal(autoLoanRecord.isDefaultDebt, false);
assert.equal(autoLoanRecord.isCustomDebt, false);
assert.equal(autoLoanRecord.metadata.sourceType, "user-input");
assert.equal(autoLoanRecord.metadata.source, "debt-library");
assert.equal(autoLoanRecord.metadata.libraryEntryKey, "autoLoan");

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

const inputRecords = Object.freeze([
  Object.freeze({
    debtId: "debt_valid",
    categoryKey: "unsecuredConsumerDebt",
    typeKey: "creditCard",
    label: "Visa Card",
    currentBalance: "1200.50",
    minimumMonthlyPayment: "75",
    interestRatePercent: "19.99",
    remainingTermMonths: "24",
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
assert.equal(serialized.length, 2);

const valid = serialized.find((record) => record.debtId === "debt_valid");
assert.ok(valid, "valid debt record should serialize");
assert.equal(valid.label, "Visa Card");
assert.equal(valid.currentBalance, 1200.5);
assert.equal(valid.minimumMonthlyPayment, 75);
assert.equal(valid.interestRatePercent, 19.99);
assert.equal(valid.remainingTermMonths, 24);
assert.equal(valid.categoryKey, "unsecuredConsumerDebt");
assert.equal(valid.typeKey, "creditCard");
assert.equal(valid.metadata.source, "debt-library");
assert.equal(valid.metadata.libraryEntryKey, "creditCard");

const badOptional = serialized.find((record) => record.debtId === "debt_bad_optional");
assert.ok(badOptional, "invalid optional fields should not block serialization");
assert.equal(badOptional.currentBalance, 3000);
assert.equal(badOptional.minimumMonthlyPayment, null);
assert.equal(badOptional.interestRatePercent, null);
assert.equal(badOptional.remainingTermMonths, null);

assert.deepEqual(inputRecords[0], {
  debtId: "debt_valid",
  categoryKey: "unsecuredConsumerDebt",
  typeKey: "creditCard",
  label: "Visa Card",
  currentBalance: "1200.50",
  minimumMonthlyPayment: "75",
  interestRatePercent: "19.99",
  remainingTermMonths: "24",
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
