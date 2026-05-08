#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const repoRoot = path.resolve(__dirname, "..", "..");
const context = {
  LensApp: {
    lensAnalysis: {}
  },
  console
};
context.window = context;
context.globalThis = context;
vm.createContext(context);

function loadScript(relativePath) {
  const absolutePath = path.join(repoRoot, relativePath);
  const source = fs.readFileSync(absolutePath, "utf8");
  vm.runInContext(source, context, { filename: absolutePath });
  return source;
}

loadScript("app/features/lens-analysis/expense-taxonomy.js");
loadScript("app/features/lens-analysis/expense-library.js");
loadScript("app/features/lens-analysis/household-expense-lifestyle-range-policy.js");

const lensAnalysis = context.LensApp.lensAnalysis;
const taxonomy = lensAnalysis.expenseTaxonomy;
const library = lensAnalysis.expenseLibrary;
const lifestylePolicy = lensAnalysis.householdExpenseLifestyleRangePolicy;

assert.ok(taxonomy, "expense taxonomy should load");
assert.ok(library, "expense library should load");
assert.ok(lifestylePolicy, "household expense lifestyle policy should load");

const taxonomyCategoryKeys = new Set(
  taxonomy.getExpenseCategories().map(function (category) {
    return category.categoryKey;
  })
);
const libraryEntriesByType = new Map(
  library.getExpenseLibraryEntries().map(function (entry) {
    return [entry.typeKey, entry];
  })
);
const rules = lifestylePolicy.listLifestyleRangePolicies();
const rulesByType = new Map(
  rules.map(function (rule) {
    return [rule.expenseTypeKey, rule];
  })
);

// Empty by design: future exceptions must include a plain-English reason here.
const ALLOWED_NON_TAXONOMY_POLICY_CATEGORIES = Object.freeze({});

const affectedRows = Object.freeze({
  houseCleaning: Object.freeze({
    categoryKey: "housingExpense",
    sliderEligible: true,
    conservativeFloorRatio: 0,
    elevatedCeilingRatio: 1.4
  }),
  lawnSnowPestPoolServices: Object.freeze({
    categoryKey: "housingExpense",
    sliderEligible: true,
    conservativeFloorRatio: 0.25,
    elevatedCeilingRatio: 1.35
  }),
  dryCleaningLaundry: Object.freeze({
    categoryKey: "personalLiving",
    sliderEligible: true,
    conservativeFloorRatio: 0.25,
    elevatedCeilingRatio: 1.25
  }),
  personalCare: Object.freeze({
    categoryKey: "personalLiving",
    sliderEligible: true,
    conservativeFloorRatio: 0.4,
    elevatedCeilingRatio: 1.25
  })
});

const broadParentRows = Object.freeze({
  diningTakeout: Object.freeze({
    categoryKey: "foodGroceries",
    sliderEligible: true,
    conservativeFloorRatio: 0,
    elevatedCeilingRatio: 1.75
  }),
  householdServices: Object.freeze({
    categoryKey: "personalLiving",
    sliderEligible: true,
    conservativeFloorRatio: 0.25,
    elevatedCeilingRatio: 1.35
  }),
  educationEnrichment: Object.freeze({
    categoryKey: "educationExpense",
    sliderEligible: false,
    conservativeFloorRatio: 1,
    elevatedCeilingRatio: 1
  })
});

assert.equal(rules.length, 86, "lifestyle policy row count should add only the three approved broad parent rows");
assert.equal(
  rules.filter(function (rule) {
    return rule.sliderEligible === true;
  }).length,
  41,
  "admin-editable slider-eligible row count should increase only by diningTakeout and householdServices"
);

rules.forEach(function (rule) {
  const typeKey = rule.expenseTypeKey;
  const categoryKey = rule.categoryKey;
  assert.ok(typeKey, "lifestyle policy row should have expenseTypeKey");
  assert.ok(categoryKey, `${typeKey} should have categoryKey`);
  assert.ok(libraryEntriesByType.has(typeKey), `${typeKey} should exist in expense-library.js`);

  if (!taxonomyCategoryKeys.has(categoryKey)) {
    const allowlistReason = ALLOWED_NON_TAXONOMY_POLICY_CATEGORIES[categoryKey];
    assert.ok(
      allowlistReason,
      `${typeKey} uses non-taxonomy category ${categoryKey} without documented allowlist reason`
    );
    assert.equal(typeof allowlistReason, "string", `${categoryKey} allowlist reason should be documented text`);
  }
});

Object.keys(affectedRows).forEach(function (typeKey) {
  const expected = affectedRows[typeKey];
  const libraryEntry = libraryEntriesByType.get(typeKey);
  const rule = rulesByType.get(typeKey);
  const resolved = lifestylePolicy.resolveLifestyleRangePolicy({ expenseTypeKey: typeKey });

  assert.ok(rule, `${typeKey} should exist in lifestyle policy`);
  assert.ok(resolved, `${typeKey} should resolve from lifestyle policy`);
  assert.equal(rule.categoryKey, expected.categoryKey, `${typeKey} policy category should match corrected taxonomy category`);
  assert.equal(rule.categoryKey, libraryEntry.categoryKey, `${typeKey} policy category should match current library category`);
  assert.ok(taxonomyCategoryKeys.has(rule.categoryKey), `${typeKey} corrected category should exist in taxonomy`);
  assert.equal(resolved.categoryKey, expected.categoryKey, `${typeKey} resolved category should be corrected`);
  assert.equal(rule.sliderEligible, expected.sliderEligible, `${typeKey} slider eligibility should not change`);
  assert.equal(rule.conservativeFloorRatio, expected.conservativeFloorRatio, `${typeKey} conservative floor ratio should not change`);
  assert.equal(rule.elevatedCeilingRatio, expected.elevatedCeilingRatio, `${typeKey} elevated ceiling ratio should not change`);
});

Object.keys(broadParentRows).forEach(function (typeKey) {
  const expected = broadParentRows[typeKey];
  const libraryEntry = libraryEntriesByType.get(typeKey);
  const rule = rulesByType.get(typeKey);
  const resolved = lifestylePolicy.resolveLifestyleRangePolicy({ expenseTypeKey: typeKey });

  assert.ok(libraryEntry, `${typeKey} should exist in expense-library.js`);
  assert.ok(rule, `${typeKey} should exist in lifestyle policy`);
  assert.ok(resolved, `${typeKey} should resolve from lifestyle policy`);
  assert.equal(rule.categoryKey, expected.categoryKey, `${typeKey} policy category should match approved taxonomy category`);
  assert.equal(rule.categoryKey, libraryEntry.categoryKey, `${typeKey} policy category should match current library category`);
  assert.ok(taxonomyCategoryKeys.has(rule.categoryKey), `${typeKey} category should exist in taxonomy`);
  assert.equal(libraryEntry.uiAvailability, "initial", `${typeKey} should be initial PMI-selectable`);
  assert.equal(libraryEntry.isAddable, true, `${typeKey} should be addable`);
  assert.equal(libraryEntry.isProtected, false, `${typeKey} should not be protected from selection`);
  assert.equal(libraryEntry.isScalarFieldOwned, false, `${typeKey} should not be scalar-owned`);
  assert.equal(rule.sliderEligible, expected.sliderEligible, `${typeKey} slider eligibility should match approved behavior`);
  assert.equal(rule.conservativeFloorRatio, expected.conservativeFloorRatio, `${typeKey} conservative floor ratio should match approved behavior`);
  assert.equal(rule.elevatedCeilingRatio, expected.elevatedCeilingRatio, `${typeKey} elevated ceiling ratio should match approved behavior`);
});

[
  "householdServices",
  "personalCare"
].forEach(function (categoryKey) {
  assert.equal(
    rules.some(function (rule) {
      return rule.categoryKey === categoryKey;
    }),
    false,
    `${categoryKey} should not remain as a lifestyle policy categoryKey`
  );
});

console.log("household-expense-policy-metadata-consistency-check passed");
