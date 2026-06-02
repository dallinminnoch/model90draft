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
  "secondMortgageHeloc",
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
  "debtSubType",
  "rateType",
  "paymentType",
  "creditLimit",
  "drawPeriodEndDate",
  "interestOnlyDuringDrawPeriod",
  "repaymentPeriodMonths",
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
assert(moduleSource.includes("showForDebtSubType"), "HELOC-only field visibility metadata is missing.");
assert(moduleSource.includes('showForDebtSubType: "heloc"'), "HELOC-only fields are not guarded by debt subtype.");
assert(moduleSource.includes("shouldShowField"), "Housing Records field visibility helper is missing.");
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
assert(moduleSource.includes("controller.records.map(omitRemovedEscrowFields)"), "Housing Records serialization does not omit removed escrow fields.");
assert(!/escrowStatus:\s*Object\.freeze/.test(moduleSource), "Escrow status field definition should not be rendered.");
assert(!moduleSource.includes('"escrowStatus"') || moduleSource.includes("REMOVED_ESCROW_FIELD_KEYS"), "Escrow status should only appear in the removed-field sanitizer.");
assert(!moduleSource.includes('label: "Escrow Status"'), "Escrow Status label should not remain visible.");
assert(!moduleSource.includes('label: "Escrowed"'), "Escrowed option label should not remain visible.");
assert(!moduleSource.includes('label: "Not Escrowed"'), "Not Escrowed option label should not remain visible.");
assert(!moduleSource.includes("Costs Included"), "Costs-included payment label should not remain visible.");
assert(!moduleSource.includes("Included in Payment"), "Included-in-payment label should not remain visible.");
assert(moduleSource.includes("Principal & Interest Payment"), "Mortgage payment label should use principal-and-interest wording.");
assert(moduleSource.includes("Calculated Principal & Interest Payment"), "Calculated mortgage payment display should use principal-and-interest wording.");

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
assertTypeExcludes("secondMortgageHeloc", [
  "escrowStatus",
  "costsIncludedInPayment",
  "propertyTaxIncludedInPayment",
  "insuranceIncludedInPayment",
  "homeownersInsuranceIncludedInPayment",
  "hoaIncludedInPayment"
]);

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
