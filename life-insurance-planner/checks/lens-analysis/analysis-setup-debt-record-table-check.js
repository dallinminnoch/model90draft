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

function loadScript(context, relativePath) {
  vm.runInContext(readRepoFile(relativePath), context, { filename: relativePath });
}

function createContext() {
  const context = {
    console,
    document: {
      addEventListener: () => {},
      querySelector: () => null,
      querySelectorAll: () => []
    },
    window: null
  };
  context.window = context;
  context.globalThis = context;
  context.LensApp = {
    analysisSetup: {},
    lensAnalysis: {}
  };
  context.window.LensApp = context.LensApp;
  vm.createContext(context);

  loadScript(context, "app/features/lens-analysis/debt-taxonomy.js");
  loadScript(context, "app/features/lens-analysis/debt-treatment-calculations.js");
  loadScript(context, "app/features/lens-analysis/analysis-setup.js");

  return context;
}

function extractFunctionBody(source, functionName, nextFunctionName) {
  const start = source.indexOf(`function ${functionName}`);
  const end = source.indexOf(`function ${nextFunctionName}`, start);
  assert.notEqual(start, -1, `${functionName} should exist.`);
  assert.notEqual(end, -1, `${nextFunctionName} should follow ${functionName}.`);
  return source.slice(start, end);
}

function toPlainObject(value) {
  return JSON.parse(JSON.stringify(value));
}

const context = createContext();
const analysisSetup = context.LensApp.analysisSetup;
const source = readRepoFile("app/features/lens-analysis/analysis-setup.js");
const html = readRepoFile("pages/analysis-setup.html");

assert.equal(
  typeof analysisSetup.resolveAnalysisSetupDebtRecordTreatmentRows,
  "function",
  "Analysis Setup should expose the debtRecords table resolver for focused checks."
);

assert.deepEqual(
  toPlainObject(analysisSetup.resolveAnalysisSetupDebtRecordTreatmentRows({ protectionModeling: { data: {} } })),
  [],
  "Missing debtRecords[] should not create static payoff rows."
);
assert.deepEqual(
  toPlainObject(analysisSetup.resolveAnalysisSetupDebtRecordTreatmentRows({ protectionModeling: { data: { debtRecords: [] } } })),
  [],
  "Explicit saved debtRecords: [] should render as empty, not starter rows."
);
assert.deepEqual(
  toPlainObject(analysisSetup.resolveAnalysisSetupDebtRecordTreatmentRows({ protectionModeling: { data: { autoLoans: 25000 } } })),
  [],
  "Scalar debt fields should not create visible Analysis Setup payoff rows when debtRecords[] is missing."
);

const recordRows = toPlainObject(analysisSetup.resolveAnalysisSetupDebtRecordTreatmentRows({
  protectionModeling: {
    data: {
      mortgageBalance: 350000,
      debtRecords: [
        {
          debtId: "debt-auto-1",
          categoryKey: "securedConsumerDebt",
          typeKey: "autoLoan",
          label: "Family SUV loan",
          currentBalance: 18000,
          minimumMonthlyPayment: 430,
          paymentFrequency: "monthly"
        },
        {
          debtId: "debt-card-1",
          categoryKey: "unsecuredConsumerDebt",
          typeKey: "creditCardDebt",
          label: "Rewards card",
          currentBalance: 9400,
          minimumMonthlyPayment: 260
        },
        {
          debtId: "debt-student-1",
          categoryKey: "educationDebt",
          typeKey: "studentLoan",
          label: "Student loan",
          currentBalance: 31500,
          minimumMonthlyPayment: 375
        },
        {
          debtId: "debt-primary-mortgage",
          categoryKey: "realEstateSecuredDebt",
          typeKey: "primaryResidenceMortgage",
          label: "Primary mortgage",
          currentBalance: 350000,
          sourceKey: "mortgageBalance"
        },
        {
          debtId: "debt-zero",
          categoryKey: "medicalDebt",
          typeKey: "medicalDebt",
          label: "Paid medical bill",
          currentBalance: 0
        },
        {
          debtId: "debt-missing-balance",
          categoryKey: "consumerFinanceDebt",
          typeKey: "personalLoan",
          label: "Missing balance"
        },
        {
          debtId: "debt-lease-no-payoff",
          categoryKey: "securedConsumerDebt",
          typeKey: "autoLease",
          label: "Vehicle lease",
          paymentAmount: 525
        }
      ]
    }
  }
}));

assert.deepEqual(
  recordRows.map((row) => row.rowKey),
  ["debt-auto-1", "debt-card-1", "debt-student-1"],
  "Only valid positive-balance non-mortgage debtRecords should render as payoff rows."
);
assert.deepEqual(
  recordRows.map((row) => row.label),
  ["Family SUV loan", "Rewards card", "Student loan"],
  "Visible debt payoff rows should use PMI debt record labels."
);
assert.deepEqual(
  recordRows.map((row) => row.currentBalance),
  [18000, 9400, 31500],
  "Visible debt payoff rows should use PMI debt record current balances."
);
assert.match(recordRows[0].sourcePreviewText, /\$18,000/);
assert.match(recordRows[0].sourcePreviewText, /\$430 monthly/);
assert.match(recordRows[1].sourcePreviewText, /\$9,400/);
assert.match(recordRows[1].sourcePreviewText, /\$260\/mo/);
assert.equal(
  recordRows.some((row) => row.label === "Primary mortgage"),
  false,
  "Primary residence mortgage should stay out of the generic debt payoff table."
);

const renderBody = extractFunctionBody(source, "renderDebtTreatmentRows", "getDebtTreatmentFieldMap");
assert.match(renderBody, /resolveAnalysisSetupDebtRecordTreatmentRows/);
assert.match(renderBody, /No debts entered in PMI\. Add debts in Preliminary \/ Protection Modeling to apply payoff treatment\./);
assert.doesNotMatch(
  renderBody,
  /getDebtCategoryTreatmentItems\(\)\.forEach/,
  "renderDebtTreatmentRows should not render static category rows."
);
assert.match(renderBody, /data-analysis-debt-row="\$\{escapeHtml\(item\.rowKey\)\}"/);
assert.match(renderBody, /data-analysis-debt-treatment-key="\$\{escapeHtml\(item\.treatmentKey\)\}"/);

assert.match(html, /Balance \/ payment/);
assert.match(html, /data-analysis-debt-table/);
assert.match(html, /Mortgage treatment/);
assert.doesNotMatch(html, /Real Estate Secured Debt<\/span>/);
assert.doesNotMatch(html, /Secured Consumer Debt<\/span>/);

console.log("analysis-setup-debt-record-table-check passed");
