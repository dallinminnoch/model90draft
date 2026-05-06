#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "..", "..");

function readRepoFile(relativePath, encoding) {
  return fs.readFileSync(path.join(repoRoot, relativePath), encoding || "utf8");
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function getExpenseSection(source, nextHeading) {
  const heading = "<h2>Expenses and Lifestyle</h2>";
  const start = source.indexOf(heading);
  assert.ok(start >= 0, "Expected Expenses and Lifestyle heading.");

  const end = source.indexOf(nextHeading, start);
  assert.ok(end > start, `Expected next section heading ${nextHeading}.`);
  return source.slice(start, end);
}

function assertFieldRow(section, field) {
  const rowPattern = new RegExp(
    `<div class="pmi-scalar-expense-row" role="row" data-pmi-scalar-expense-field="${escapeRegex(field.name)}">[\\s\\S]*?<input\\b[^>]*id="${escapeRegex(field.id)}"[^>]*name="${escapeRegex(field.name)}"[^>]*type="number"[^>]*min="0"[^>]*step="50"`,
    "m"
  );
  assert.match(section, rowPattern, `${field.name} should remain a scalar number input in a notebook row.`);
  assert.match(section, new RegExp(`<label for="${escapeRegex(field.id)}">${escapeRegex(field.label)}<\\/label>`), `${field.label} label should stay bound to ${field.id}.`);
}

function getCssRule(source, selector) {
  const pattern = new RegExp(`${escapeRegex(selector)}\\s*\\{[\\s\\S]*?\\n\\}`, "m");
  const match = source.match(pattern);
  assert.ok(match, `Expected CSS rule for ${selector}.`);
  return match[0];
}

function assertLinkedPage(pagePath, nextHeading) {
  const source = readRepoFile(pagePath);
  const section = getExpenseSection(source, nextHeading);

  assert.match(section, /data-pmi-scalar-expenses-notebook/, `${pagePath} should render scalar expenses in a notebook shell.`);
  assert.match(section, /<div class="pmi-scalar-expenses-section" data-pmi-scalar-expenses-section="household">/, `${pagePath} should keep Household Spending grouped.`);
  assert.match(section, /<div class="pmi-scalar-expenses-section" data-pmi-scalar-expenses-section="personal">/, `${pagePath} should keep personal discretionary spending grouped.`);
  assert.match(section, /<span>Expense<\/span>[\s\S]*<span>Amount<\/span>[\s\S]*<span>Frequency<\/span>[\s\S]*<span>Category \/ Treatment<\/span>/, `${pagePath} should expose table headers.`);
  assert.equal((section.match(/data-pmi-scalar-expense-field="/g) || []).length, SCALAR_FIELDS.length, `${pagePath} should render one compact row per scalar expense field.`);
  assert.equal((section.match(/<span class="pmi-scalar-expense-readonly">Monthly<\/span>/g) || []).length, SCALAR_FIELDS.length, `${pagePath} should keep scalar rows monthly without adding editable frequency controls.`);

  SCALAR_FIELDS.forEach((field) => assertFieldRow(section, field));

  assert.doesNotMatch(section, /section-divider-field|form-subgroup-label/, `${pagePath} should not use the old stacked scalar subgroup layout.`);
  assert.doesNotMatch(section, /isGeneratedExpense|isDebtPaymentExpense|sourceDebtRecordId|data-pmi-expense-generated/, `${pagePath} should not introduce generated debt-payment expense behavior in the scalar card.`);

  assert.match(source, /Array\.from\(form\.elements\)\.forEach\(\(element\) => \{/, `${pagePath} should still serialize form controls generically.`);
  SCALAR_FIELDS.forEach(function (field) {
    assert.match(source, new RegExp(`name="${escapeRegex(field.name)}"`), `${field.name} should remain available to generic form serialization.`);
  });

  assert.match(section, /data-pmi-expense-records-root/, `${pagePath} should keep the Additional Expenses widget below scalar rows.`);
}

function assertManualPage() {
  const pagePath = "pages/manual-protection-modeling-inputs.html";
  const source = readRepoFile(pagePath, "latin1");
  const section = getExpenseSection(source, "<h2>Education Funding</h2>");

  assert.match(section, /data-pmi-scalar-expenses-notebook/, "Manual PMI page should render scalar expenses in a notebook shell.");
  assert.equal((section.match(/data-pmi-scalar-expense-field="/g) || []).length, SCALAR_FIELDS.length, "Manual PMI page should render one compact row per scalar expense field.");
  SCALAR_FIELDS.forEach((field) => assertFieldRow(section, field));
  assert.doesNotMatch(section, /section-divider-field|form-subgroup-label/, "Manual PMI page should not use the old stacked scalar subgroup layout.");
  assert.doesNotMatch(section, /data-pmi-expense-records-root/, "Manual PMI page should not add the Additional Expenses repeatable widget.");
  assert.match(source, /serializeLensFormSnapshot\(form\)/, "Manual PMI page should keep using the shared form snapshot serializer.");
}

const SCALAR_FIELDS = Object.freeze([
  Object.freeze({ id: "insurance-cost", name: "insuranceCost", label: "Non-Housing Monthly Insurance" }),
  Object.freeze({ id: "healthcare-out-of-pocket-cost", name: "healthcareOutOfPocketCost", label: "Healthcare / Out-of-Pocket Medical" }),
  Object.freeze({ id: "food-cost", name: "foodCost", label: "Monthly Food / Grocery Cost" }),
  Object.freeze({ id: "transportation-cost", name: "transportationCost", label: "Monthly Transportation Cost" }),
  Object.freeze({ id: "childcare-dependent-care-cost", name: "childcareDependentCareCost", label: "Childcare / Dependent Care" }),
  Object.freeze({ id: "phone-internet-cost", name: "phoneInternetCost", label: "Phone / Internet" }),
  Object.freeze({ id: "household-supplies-cost", name: "householdSuppliesCost", label: "Household Essentials / Supplies" }),
  Object.freeze({ id: "other-household-expenses", name: "otherHouseholdExpenses", label: "Other Household Expenses" }),
  Object.freeze({ id: "travel-discretionary-cost", name: "travelDiscretionaryCost", label: "Entertainment / Travel" }),
  Object.freeze({ id: "subscriptions-cost", name: "subscriptionsCost", label: "Recurring Personal Spending" })
]);

assertLinkedPage("pages/next-step.html", "<h2>Assets and Offset Planning</h2>");
assertLinkedPage("pages/confidential-inputs.html", "<h2>Assets and Offset Planning</h2>");
assertManualPage();

const componentsCss = readRepoFile("components.css");
assert.match(componentsCss, /\.pmi-scalar-expenses-header,\s*\.pmi-scalar-expense-row\s*\{[\s\S]*?display: grid;[\s\S]*?grid-template-columns:[\s\S]*?minmax\(0, 1\.45fr\)[\s\S]*?minmax\(0, 0\.62fr\)[\s\S]*?minmax\(0, 0\.5fr\)[\s\S]*?minmax\(0, 0\.88fr\)/, "Scalar expense rows should use compact flexible grid columns.");
assert.match(componentsCss, /\.pmi-scalar-expense-row input\s*\{[\s\S]*?width: 100%;[\s\S]*?min-width: 0;[\s\S]*?min-height: 1\.72rem;[\s\S]*?border-radius: 0\.18rem;/, "Scalar expense controls should be compact and sharper.");
[
  ".pmi-scalar-expenses-notebook",
  ".pmi-scalar-expenses-table"
].forEach(function (selector) {
  assert.doesNotMatch(getCssRule(componentsCss, selector), /overflow-x:\s*auto/, `${selector} should not rely on horizontal scrolling.`);
});

console.log("PMI scalar expenses notebook check passed.");
