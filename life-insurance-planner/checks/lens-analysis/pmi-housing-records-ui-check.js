const fs = require("fs");
const path = require("path");

const repoRoot = path.resolve(__dirname, "../..");
const modulePath = path.join(repoRoot, "app/features/lens-analysis/pmi-housing-records.js");
const nextStepPath = path.join(repoRoot, "pages/next-step.html");
const confidentialInputsPath = path.join(repoRoot, "pages/confidential-inputs.html");
const componentsPath = path.join(repoRoot, "components.css");

function readFile(relativeOrAbsolutePath) {
  return fs.readFileSync(relativeOrAbsolutePath, "utf8");
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function walkJsFiles(directoryPath) {
  return fs.readdirSync(directoryPath, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directoryPath, entry.name);
    if (entry.isDirectory()) {
      return walkJsFiles(entryPath);
    }

    return entry.isFile() && entry.name.endsWith(".js") ? [entryPath] : [];
  });
}

const moduleSource = readFile(modulePath);
const nextStepSource = readFile(nextStepPath);
const confidentialInputsSource = readFile(confidentialInputsPath);
const componentsSource = readFile(componentsPath);
const pageSources = [
  { name: "next-step.html", source: nextStepSource },
  { name: "confidential-inputs.html", source: confidentialInputsSource }
];

const requiredTypeKeys = [
  "primaryResidenceMortgage",
  "primaryResidenceRent",
  "primaryResidenceOwnedFreeAndClear",
  "secondHomeVacationProperty",
  "rentalInvestmentProperty",
  "temporaryHousing",
  "housingOperatingCostOnly",
  "otherHousingObligation"
];

const requiredFieldKeys = [
  "propertyValue",
  "currentBalance",
  "monthlyPayment",
  "interestRatePercent",
  "remainingTermMonths",
  "propertyTaxMonthly",
  "homeownersInsuranceMonthly",
  "hoaMonthly",
  "maintenanceMonthly",
  "utilitiesMonthly",
  "rentMonthly",
  "leaseTermMonths",
  "otherHousingCostMonthly",
  "rentersInsuranceMonthly",
  "equityAmount",
  "homeSquareFootage",
  "homeAgeYears",
  "monthlyMaintenanceRecommendation",
  "mortgageTermRemainingYears",
  "mortgageTermRemainingMonths",
  "monthlyMortgagePaymentOnly",
  "associatedMonthlyCosts",
  "calculatedMonthlyMortgagePayment",
  "propertySecuredDebts",
  "debtType",
  "debtSubType",
  "rateType",
  "paymentType",
  "creditLimit",
  "drawPeriodEndDate",
  "interestOnlyDuringDrawPeriod",
  "repaymentPeriodMonths",
  "originalLoanAmount",
  "originalTermMonths",
  "balloonPaymentDate",
  "balloonAmount",
  "lienPosition",
  "linkedPropertyLabel",
  "grossMonthlyRentReceived",
  "monthlyCost",
  "expectedDurationMonths",
  "reasonLabel",
  "notes",
  "reviewStatus"
];

pageSources.forEach(({ name, source }) => {
  assert(source.includes("data-pmi-housing-records-root"), `${name} does not mount the Housing Records root.`);
  assert(source.includes("pmi-housing-records.js"), `${name} does not load the Housing Records module.`);
  assert(
    /class="form-grid pmi-scalar-housing-fields" data-pmi-scalar-housing-fields hidden aria-hidden="true"/.test(source),
    `${name} does not hide the old scalar housing workflow.`
  );
  assert(source.includes("initPmiHousingRecords"), `${name} does not initialize the Housing Records controller.`);
  assert(source.includes("maintenanceRowsProvider: () => readStoredMaintenanceConfig()"), `${name} does not pass the legacy maintenance config provider.`);
  assert(source.includes("hydrateHousingRecords(saved.housingRecords)"), `${name} does not hydrate housingRecords[].`);
  assert(source.includes("draft.housingRecords = pmiHousingRecordsController.serializeHousingRecords()"), `${name} does not save housingRecords[].`);
});

assert(moduleSource.includes("data-pmi-housing-record-add"), "Housing Records add control is missing.");
assert(moduleSource.includes("data-pmi-housing-record-remove"), "Housing Records remove control is missing.");
assert(moduleSource.includes("data-pmi-housing-record-input"), "Housing Records editable fields are missing.");
assert(moduleSource.includes("FIELD_GROUPS_BY_TYPE"), "Housing Records type-specific field map is missing.");
assert(moduleSource.includes("shouldShowField"), "Housing Records field visibility helper is missing.");
assert(moduleSource.includes("PROPERTY_SECURED_DEBT_TYPE_OPTIONS"), "Property-secured debt type options are missing.");
assert(moduleSource.includes("PROPERTY_SECURED_DEBT_OWNER_TYPES"), "Property-secured debt owner type list is missing.");
assert(moduleSource.includes("renderPropertySecuredDebtSection"), "Property-secured debt section renderer is missing.");
assert(moduleSource.includes("data-pmi-property-secured-debt-add"), "Property-secured debt add control is missing.");
assert(moduleSource.includes("data-pmi-property-secured-debt-remove"), "Property-secured debt remove control is missing.");
assert(moduleSource.includes("data-pmi-property-secured-debt-input"), "Property-secured debt editable fields are missing.");
assert(moduleSource.includes("shouldShowPropertySecuredDebtField"), "Property-secured debt field visibility helper is missing.");
assert(moduleSource.includes('debtType === "heloc"'), "HELOC-only property-secured debt fields are not guarded by debt type.");
assert(moduleSource.includes("serializeHousingRecords"), "Housing Records serialize API is missing.");
assert(moduleSource.includes("hydrateHousingRecords"), "Housing Records hydrate API is missing.");
assert(moduleSource.includes("Non-goals: no normalization"), "Housing Records module does not document calculation-neutral ownership.");
assert(moduleSource.includes("calculateHousingSupportInputs"), "Housing Records does not reuse the existing housing support helper.");
assert(moduleSource.includes("mapRecordToHousingCalculationSource"), "Housing Records does not map record fields to legacy housing helper inputs.");
assert(moduleSource.includes("updateCalculatedDisplaysForRow"), "Housing Records does not update calculated displays at the record level.");
assert(moduleSource.includes("data-pmi-housing-record-calculated-action"), "Housing Records calculated fields do not expose edit/reset actions.");
assert(moduleSource.includes("monthlyMaintenanceRecommendationManualOverride"), "Maintenance manual override metadata is missing.");
assert(moduleSource.includes("HOME_SQUARE_FOOTAGE_OPTIONS"), "Legacy home square footage options are missing.");
assert(moduleSource.includes("REMOVED_ESCROW_FIELD_KEYS"), "Removed escrow field sanitizer is missing.");
assert(moduleSource.includes("omitRemovedEscrowFields"), "Escrow field omission helper is missing.");
assert(moduleSource.includes("controller.records.map(serializeHousingRecord)"), "Housing Records serialization does not use the safe record serializer.");
assert(/function serializeHousingRecord[\s\S]*omitRemovedEscrowFields/.test(moduleSource), "Housing Records serialization does not omit removed escrow fields.");
assert(!/escrowStatus:\s*Object\.freeze/.test(moduleSource), "Escrow status field definition should not be rendered.");
assert(!moduleSource.includes('"escrowStatus"') || moduleSource.includes("REMOVED_ESCROW_FIELD_KEYS"), "Escrow status should only appear in the removed-field sanitizer.");
assert(!moduleSource.includes('label: "Escrow Status"'), "Escrow Status label should not remain visible.");
assert(!moduleSource.includes('label: "Escrowed"'), "Escrowed option label should not remain visible.");
assert(!moduleSource.includes('label: "Not Escrowed"'), "Not Escrowed option label should not remain visible.");
assert(!moduleSource.includes("Costs Included"), "Costs-included payment label should not remain visible.");
assert(!moduleSource.includes("Included in Payment"), "Included-in-payment label should not remain visible.");
assert(moduleSource.includes("Principal & Interest Payment"), "Mortgage payment label should use principal-and-interest wording.");
assert(moduleSource.includes("Calculated Principal & Interest Payment"), "Calculated mortgage payment display should use principal-and-interest wording.");
assert(moduleSource.includes("REMOVED_TOP_LEVEL_SECURED_DEBT_TYPES"), "Removed top-level secured-debt type migration list is missing.");
assert(moduleSource.includes("migrateRemovedTopLevelSecuredDebtRecord"), "Removed top-level secured-debt migration helper is missing.");
assert(moduleSource.includes("serializeHousingRecord"), "Housing Records serialization wrapper is missing.");

const housingTypeOptionsMatch = moduleSource.match(/const HOUSING_TYPE_OPTIONS = Object\.freeze\(\[([\s\S]*?)\]\);/);
assert(housingTypeOptionsMatch, "Could not inspect top-level Housing Record type options.");
[
  "secondMortgageHeloc",
  "Second Mortgage / HELOC",
  'value: "secondMortgage"',
  'value: "heloc"',
  'value: "homeEquityLoan"'
].forEach((forbiddenOption) => {
  assert(
    !housingTypeOptionsMatch[1].includes(forbiddenOption),
    `Top-level Housing Record type picker still includes ${forbiddenOption}.`
  );
});

const fieldGroupsMatch = moduleSource.match(/const FIELD_GROUPS_BY_TYPE = Object\.freeze\(\{([\s\S]*?)\n  \}\);/);
assert(fieldGroupsMatch, "Could not inspect top-level Housing Record field groups.");
assert(!fieldGroupsMatch[1].includes("secondMortgageHeloc:"), "Removed secondMortgageHeloc field group should not remain.");

[
  "secondMortgage",
  "heloc",
  "homeEquityLoan",
  "otherPropertySecuredDebt"
].forEach((debtType) => {
  assert(moduleSource.includes(`value: "${debtType}"`), `Property-secured debt type ${debtType} is missing.`);
});
const propertySecuredDebtOptionsMatch = moduleSource.match(/const PROPERTY_SECURED_DEBT_TYPE_OPTIONS = Object\.freeze\(\[([\s\S]*?)\]\);/);
assert(propertySecuredDebtOptionsMatch, "Could not inspect property-secured debt type options.");
assert(!propertySecuredDebtOptionsMatch[1].includes('value: "firstMortgage"'), "Nested property-secured debt picker should not include firstMortgage.");
assert(!propertySecuredDebtOptionsMatch[1].includes('label: "First Mortgage"'), "Nested property-secured debt picker should not include First Mortgage.");
assert(moduleSource.includes('normalizedValue === "firstMortgage"'), "Stale firstMortgage nested debts are not sanitized.");
assert(moduleSource.includes('return "otherPropertySecuredDebt"'), "Stale firstMortgage nested debts should convert safely.");
assert(moduleSource.includes("Additional Property-Secured Debts"), "Additional Property-Secured Debts section label is missing.");
assert(!moduleSource.includes(">Property-Secured Debts<"), "Old Property-Secured Debts section label should not remain visible.");

[
  "primaryResidenceMortgage",
  "primaryResidenceOwnedFreeAndClear",
  "secondHomeVacationProperty",
  "rentalInvestmentProperty",
  "housingOperatingCostOnly"
].forEach((typeKey) => {
  assert(moduleSource.includes(`"${typeKey}"`), `Property-secured debt owner type ${typeKey} is missing.`);
});
const propertySecuredDebtOwnerTypesMatch = moduleSource.match(/const PROPERTY_SECURED_DEBT_OWNER_TYPES = Object\.freeze\(\[([\s\S]*?)\]\);/);
assert(propertySecuredDebtOwnerTypesMatch, "Could not inspect property-secured debt owner types.");
assert(!propertySecuredDebtOwnerTypesMatch[1].includes('"primaryResidenceRent"'), "Rent records should not show property-secured debt sections.");

requiredTypeKeys.forEach((typeKey) => {
  assert(moduleSource.includes(typeKey), `Housing record type ${typeKey} is missing.`);
});

requiredFieldKeys.forEach((fieldKey) => {
  assert(moduleSource.includes(fieldKey), `Housing record field ${fieldKey} is missing.`);
});

function assertTypeIncludes(typeKey, fieldKeys) {
  const groupPattern = new RegExp(`${typeKey}: Object\\.freeze\\(\\[([\\s\\S]*?)\\]\\)`);
  const groupMatch = moduleSource.match(groupPattern);
  assert(groupMatch, `Could not find field group for ${typeKey}.`);
  fieldKeys.forEach((fieldKey) => {
    assert(groupMatch[1].includes(`"${fieldKey}"`), `${typeKey} is missing ${fieldKey}.`);
  });
}

function assertTypeExcludes(typeKey, fieldKeys) {
  const groupPattern = new RegExp(`${typeKey}: Object\\.freeze\\(\\[([\\s\\S]*?)\\]\\)`);
  const groupMatch = moduleSource.match(groupPattern);
  assert(groupMatch, `Could not find field group for ${typeKey}.`);
  fieldKeys.forEach((fieldKey) => {
    assert(!groupMatch[1].includes(`"${fieldKey}"`), `${typeKey} should not include ${fieldKey}.`);
  });
}

assertTypeIncludes("primaryResidenceMortgage", [
  "currentBalance",
  "interestRatePercent",
  "mortgageTermRemainingYears",
  "mortgageTermRemainingMonths",
  "monthlyMortgagePaymentOnly",
  "associatedMonthlyCosts",
  "calculatedMonthlyMortgagePayment",
  "propertyTaxMonthly",
  "homeownersInsuranceMonthly",
  "hoaMonthly",
  "maintenanceMonthly",
  "utilitiesMonthly",
  "otherHousingCostMonthly",
  "homeSquareFootage",
  "homeAgeYears",
  "monthlyMaintenanceRecommendation"
]);
assertTypeExcludes("primaryResidenceMortgage", [
  "escrowStatus",
  "costsIncludedInPayment",
  "propertyTaxIncludedInPayment",
  "insuranceIncludedInPayment",
  "homeownersInsuranceIncludedInPayment",
  "hoaIncludedInPayment"
]);
assertTypeIncludes("primaryResidenceRent", [
  "rentMonthly",
  "otherHousingCostMonthly",
  "utilitiesMonthly",
  "rentersInsuranceMonthly"
]);
assertTypeExcludes("primaryResidenceRent", [
  "homeSquareFootage",
  "homeAgeYears",
  "monthlyMaintenanceRecommendation"
]);
assertTypeIncludes("primaryResidenceOwnedFreeAndClear", [
  "equityAmount",
  "propertyTaxMonthly",
  "hoaMonthly",
  "homeownersInsuranceMonthly",
  "maintenanceMonthly",
  "utilitiesMonthly",
  "otherHousingCostMonthly",
  "homeSquareFootage",
  "homeAgeYears",
  "monthlyMaintenanceRecommendation"
]);
["secondHomeVacationProperty", "rentalInvestmentProperty", "housingOperatingCostOnly"].forEach((typeKey) => {
  assertTypeIncludes(typeKey, [
    "propertyTaxMonthly",
    "homeownersInsuranceMonthly",
    "hoaMonthly",
    "maintenanceMonthly",
    "utilitiesMonthly",
    "otherHousingCostMonthly",
    "homeSquareFootage",
    "homeAgeYears",
    "monthlyMaintenanceRecommendation"
  ]);
  assertTypeExcludes(typeKey, [
    "escrowStatus",
    "costsIncludedInPayment",
    "propertyTaxIncludedInPayment",
    "insuranceIncludedInPayment",
    "homeownersInsuranceIncludedInPayment",
    "hoaIncludedInPayment"
  ]);
});
[
  "homeSquareFootage",
  "homeAgeYears",
  "monthlyMaintenanceRecommendation",
  "housingStatus",
  "monthlyHousingCost",
  "otherMonthlyRenterHousingCosts",
  "mortgageBalance",
  "mortgageTermRemainingYears",
  "mortgageTermRemainingMonths",
  "mortgageInterestRate",
  "propertyTax",
  "monthlyHoaCost",
  "housingInsuranceCost",
  "utilitiesCost",
  "primaryResidenceEquity",
  "monthlyMortgagePaymentOnly",
  "associatedMonthlyCosts",
  "calculatedMonthlyMortgagePayment",
  "mortgageTermRemaining"
].forEach((fieldName) => {
  assert(
    nextStepSource.includes(`name="${fieldName}"`) || confidentialInputsSource.includes(`name="${fieldName}"`),
    `Old scalar field ${fieldName} was not preserved in the PMI pages.`
  );
});

assert(componentsSource.includes(".pmi-housing-records-shell"), "Housing Records component shell CSS is missing.");
assert(componentsSource.includes(".pmi-housing-record-card"), "Housing Records card CSS is missing.");
assert(componentsSource.includes(".pmi-housing-record-calculated-shell"), "Housing Records calculated display CSS is missing.");
assert(componentsSource.includes(".pmi-property-secured-debts-section"), "Property-secured debt section CSS is missing.");
assert(componentsSource.includes(".pmi-property-secured-debt-card"), "Property-secured debt card CSS is missing.");
assert(
  componentsSource.includes("[data-pmi-scalar-housing-fields][hidden]"),
  "Hidden scalar housing fields need an explicit display guard against .form-grid."
);

const calculationFilesWithHousingRecords = walkJsFiles(path.join(repoRoot, "app/features/lens-analysis"))
  .filter((filePath) => path.basename(filePath) !== "pmi-housing-records.js")
  .filter((filePath) => readFile(filePath).includes("housingRecords"))
  .map((filePath) => path.relative(repoRoot, filePath));

assert(
  calculationFilesWithHousingRecords.length === 0,
  `housingRecords is referenced outside the UI module: ${calculationFilesWithHousingRecords.join(", ")}`
);

const forbiddenScalarSyncPattern = /housingRecords[\s\S]{0,240}(housingStatus|monthlyHousingCost|mortgageBalance|calculatedMonthlyMortgagePayment|monthlyMortgagePaymentOnly|associatedMonthlyCosts)/;
pageSources.forEach(({ name, source }) => {
  assert(!forbiddenScalarSyncPattern.test(source), `${name} appears to sync housingRecords into scalar calculation fields.`);
});

console.log("PMI housing records UI check passed.");
