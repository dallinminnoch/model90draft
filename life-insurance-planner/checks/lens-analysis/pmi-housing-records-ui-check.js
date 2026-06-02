const fs = require("fs");
const path = require("path");
const vm = require("vm");

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
  "primaryResidence",
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
  "primaryResidenceArrangement",
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

const vmContext = { window: {} };
vm.runInNewContext(moduleSource, vmContext, { filename: modulePath });
const housingRecordsApi = vmContext.window.LensApp.lensAnalysis.pmiHousingRecords;

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
assert(moduleSource.includes("PRIMARY_RESIDENCE_ARRANGEMENT_OPTIONS"), "Primary residence arrangement options are missing.");
assert(moduleSource.includes("primaryResidenceArrangement"), "Primary residence arrangement key is missing.");
assert(moduleSource.includes("derivePropertyRole"), "Derived propertyRole helper is missing.");
assert(moduleSource.includes("normalizeContinuesAfterDeath"), "Continues-after-death normalizer is missing.");
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
assert(!moduleSource.includes("Main Mortgage"), "Main mortgage wording should not remain in visible labels.");
assert(moduleSource.includes("Mortgage Balance"), "Mortgage balance label is missing.");
assert(moduleSource.includes("Mortgage Principal & Interest Payment"), "Mortgage principal-and-interest payment label is missing.");
assert(moduleSource.includes("Mortgage Interest Rate"), "Mortgage interest rate label is missing.");
assert(moduleSource.includes("Mortgage Remaining Term"), "Mortgage remaining term label is missing.");
assert(moduleSource.includes("Calculated Mortgage Payment"), "Calculated mortgage payment display label is missing.");
assert(moduleSource.includes("Debt Balance"), "Nested secured debt balance label is missing.");
assert(moduleSource.includes("Debt Monthly Payment"), "Nested secured debt monthly payment label is missing.");
assert(moduleSource.includes("Debt Interest Rate"), "Nested secured debt interest rate label is missing.");
assert(moduleSource.includes("Debt Remaining Term"), "Nested secured debt remaining term label is missing.");
assert(moduleSource.includes("REMOVED_TOP_LEVEL_SECURED_DEBT_TYPES"), "Removed top-level secured-debt type migration list is missing.");
assert(moduleSource.includes("migrateRemovedTopLevelSecuredDebtRecord"), "Removed top-level secured-debt migration helper is missing.");
assert(moduleSource.includes("serializeHousingRecord"), "Housing Records serialization wrapper is missing.");
assert(!moduleSource.includes("PROPERTY_ROLE_OPTIONS"), "Generic Property Role options should not remain visible.");
assert(!moduleSource.includes('label: "Property Role"'), "Generic Property Role label should not remain visible.");
assert(!moduleSource.includes('type: "propertyRole"'), "Generic Property Role field type should not remain visible.");
assert(!moduleSource.includes('fieldConfig.type === "propertyRole"'), "Generic Property Role renderer should not remain.");

const baseFieldsMatch = moduleSource.match(/const BASE_FIELDS = Object\.freeze\(\[([\s\S]*?)\]\);/);
assert(baseFieldsMatch, "Could not inspect Housing Records base fields.");
assert(!baseFieldsMatch[1].includes('"propertyRole"'), "Generic propertyRole should not be in visible base fields.");
const primaryResidenceBaseFieldsMatch = moduleSource.match(/const PRIMARY_RESIDENCE_BASE_FIELDS = Object\.freeze\(\[([\s\S]*?)\]\);/);
assert(primaryResidenceBaseFieldsMatch, "Could not inspect Primary Residence base fields.");
assert(!primaryResidenceBaseFieldsMatch[1].includes('"propertyRole"'), "Generic propertyRole should not be in visible Primary Residence base fields.");

const housingTypeOptionsMatch = moduleSource.match(/const HOUSING_TYPE_OPTIONS = Object\.freeze\(\[([\s\S]*?)\]\);/);
assert(housingTypeOptionsMatch, "Could not inspect top-level Housing Record type options.");
assert(housingTypeOptionsMatch[1].includes('value: "primaryResidence"'), "Top-level Housing Record type picker is missing Primary residence.");
assert(housingTypeOptionsMatch[1].includes('label: "Primary residence"'), "Top-level Housing Record type picker should label the option Primary residence.");
[
  "primaryResidenceMortgage",
  "Primary Residence - Mortgage",
  "primaryResidenceRent",
  "Primary Residence - Rent",
  "primaryResidenceOwnedFreeAndClear",
  "Primary Residence - Owned Free and Clear",
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

const arrangementOptionsMatch = moduleSource.match(/const PRIMARY_RESIDENCE_ARRANGEMENT_OPTIONS = Object\.freeze\(\[([\s\S]*?)\]\);/);
assert(arrangementOptionsMatch, "Could not inspect Primary Residence arrangement options.");
[
  "Own with mortgage",
  "Own free and clear",
  "Rent"
].forEach((arrangementLabel) => {
  assert(arrangementOptionsMatch[1].includes(arrangementLabel), `Primary residence arrangement ${arrangementLabel} is missing.`);
});
assert(moduleSource.includes('type: "primaryResidenceArrangement"'), "Primary Residence arrangement selector field is missing.");

const topLevelTypeValues = housingRecordsApi.housingTypeOptions.map((option) => option.value);
assert(topLevelTypeValues.includes("primaryResidence"), "Exported top-level type options are missing primaryResidence.");
[
  "primaryResidenceMortgage",
  "primaryResidenceRent",
  "primaryResidenceOwnedFreeAndClear",
  "secondMortgageHeloc",
  "secondMortgage",
  "heloc",
  "homeEquityLoan"
].forEach((forbiddenType) => {
  assert(!topLevelTypeValues.includes(forbiddenType), `Exported top-level type options include removed ${forbiddenType}.`);
});

const arrangementLabels = housingRecordsApi.primaryResidenceArrangementOptions.map((option) => option.label);
[
  "Own with mortgage",
  "Own free and clear",
  "Rent"
].forEach((label) => {
  assert(arrangementLabels.includes(label), `Exported Primary Residence arrangement ${label} is missing.`);
});

[
  ["primaryResidence", "investmentProperty", "primaryResidence"],
  ["secondHomeVacationProperty", "primaryResidence", "secondaryResidence"],
  ["rentalInvestmentProperty", "primaryResidence", "investmentProperty"],
  ["temporaryHousing", "primaryResidence", "temporaryHousing"],
  ["housingOperatingCostOnly", "primaryResidence", "other"],
  ["otherHousingObligation", "primaryResidence", "other"]
].forEach(([typeKey, staleRole, expectedRole]) => {
  const derivedRoleRecord = housingRecordsApi.createHousingRecord({ typeKey, propertyRole: staleRole });
  assert(
    derivedRoleRecord.propertyRole === expectedRole,
    `${typeKey} should derive propertyRole ${expectedRole}, got ${derivedRoleRecord.propertyRole}.`
  );
});
assert(
  /function serializeHousingRecord[\s\S]*propertyRole: derivePropertyRole/.test(moduleSource),
  "Housing Records serialization should derive propertyRole instead of trusting stale raw values."
);

const continuesOptionsMatch = moduleSource.match(/const CONTINUES_AFTER_DEATH_OPTIONS = Object\.freeze\(\[([\s\S]*?)\]\);/);
assert(continuesOptionsMatch, "Could not inspect continues-after-death options.");
assert(continuesOptionsMatch[1].includes('value: "yes"'), "Continues-after-death options should include Yes.");
assert(continuesOptionsMatch[1].includes('value: "no"'), "Continues-after-death options should include No.");
assert(!continuesOptionsMatch[1].includes('value: "review"'), "Continues-after-death options should not include Review.");
assert(!continuesOptionsMatch[1].includes('label: "Review"'), "Continues-after-death options should not show Review.");

const defaultContinuesRecord = housingRecordsApi.createHousingRecord({ typeKey: "primaryResidence" });
assert(defaultContinuesRecord.continuesAfterDeath === "yes", "Housing record continuesAfterDeath should default to yes.");
const staleReviewContinuesRecord = housingRecordsApi.createHousingRecord({ typeKey: "primaryResidence", continuesAfterDeath: "review" });
assert(staleReviewContinuesRecord.continuesAfterDeath === "yes", "Stale housing record Review continuesAfterDeath should sanitize to yes.");
const noContinuesRecord = housingRecordsApi.createHousingRecord({ typeKey: "primaryResidence", continuesAfterDeath: "no" });
assert(noContinuesRecord.continuesAfterDeath === "no", "Housing record continuesAfterDeath should preserve no.");
const securedDebtContinuesRecord = housingRecordsApi.createHousingRecord({
  typeKey: "primaryResidence",
  primaryResidenceArrangement: "ownWithMortgage",
  propertySecuredDebts: [
    { debtType: "heloc" },
    { debtType: "secondMortgage", continuesAfterDeath: "review" },
    { debtType: "homeEquityLoan", continuesAfterDeath: "no" }
  ]
});
assert(securedDebtContinuesRecord.propertySecuredDebts[0].continuesAfterDeath === "yes", "Property-secured debt continuesAfterDeath should default to yes.");
assert(securedDebtContinuesRecord.propertySecuredDebts[1].continuesAfterDeath === "yes", "Stale property-secured debt Review continuesAfterDeath should sanitize to yes.");
assert(securedDebtContinuesRecord.propertySecuredDebts[2].continuesAfterDeath === "no", "Property-secured debt continuesAfterDeath should preserve no.");

[
  ["primaryResidenceMortgage", "ownWithMortgage"],
  ["primaryResidenceRent", "rent"],
  ["primaryResidenceOwnedFreeAndClear", "ownFreeAndClear"]
].forEach(([oldTypeKey, expectedArrangement]) => {
  const migratedRecord = housingRecordsApi.createHousingRecord({
    typeKey: oldTypeKey,
    propertyValue: "500000",
    currentBalance: "300000",
    rentMonthly: "2500",
    propertySecuredDebts: [{ debtType: "heloc", currentBalance: "10000" }]
  });
  assert(migratedRecord.typeKey === "primaryResidence", `${oldTypeKey} did not migrate to primaryResidence.`);
  assert(
    migratedRecord.primaryResidenceArrangement === expectedArrangement,
    `${oldTypeKey} did not migrate to arrangement ${expectedArrangement}.`
  );
  assert(migratedRecord.propertyValue === "500000", `${oldTypeKey} did not preserve propertyValue.`);
  if (expectedArrangement === "rent") {
    assert(migratedRecord.rentMonthly === "2500", `${oldTypeKey} did not preserve rentMonthly.`);
    assert(migratedRecord.propertySecuredDebts.length === 0, `${oldTypeKey} rent migration should not preserve property-secured debts.`);
  }
  if (expectedArrangement !== "rent") {
    assert(migratedRecord.propertySecuredDebts.length === 1, `${oldTypeKey} owned migration did not preserve property-secured debts.`);
  }
});

const primaryRentRecord = housingRecordsApi.createHousingRecord({
  typeKey: "primaryResidence",
  primaryResidenceArrangement: "rent",
  propertySecuredDebts: [{ debtType: "heloc" }]
});
assert(primaryRentRecord.propertySecuredDebts.length === 0, "Primary Residence rent should not retain property-secured debts.");

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
  "primaryResidence",
  "secondHomeVacationProperty",
  "rentalInvestmentProperty",
  "housingOperatingCostOnly"
].forEach((typeKey) => {
  assert(moduleSource.includes(`"${typeKey}"`), `Property-secured debt owner type ${typeKey} is missing.`);
});
const propertySecuredDebtOwnerTypesMatch = moduleSource.match(/const PROPERTY_SECURED_DEBT_OWNER_TYPES = Object\.freeze\(\[([\s\S]*?)\]\);/);
assert(propertySecuredDebtOwnerTypesMatch, "Could not inspect property-secured debt owner types.");
assert(!propertySecuredDebtOwnerTypesMatch[1].includes('"primaryResidenceMortgage"'), "Old primary residence mortgage owner type should not remain in secured-debt owner list.");
assert(!propertySecuredDebtOwnerTypesMatch[1].includes('"primaryResidenceOwnedFreeAndClear"'), "Old primary residence free-and-clear owner type should not remain in secured-debt owner list.");
assert(moduleSource.includes('normalizePrimaryResidenceArrangement(recordOrTypeKey?.primaryResidenceArrangement) !== "rent"'), "Primary residence rent arrangements should not support property-secured debt sections.");

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

function assertArrangementIncludes(arrangementKey, fieldKeys) {
  const groupPattern = new RegExp(`${arrangementKey}: Object\\.freeze\\(\\[([\\s\\S]*?)\\]\\)`);
  const groupMatch = moduleSource.match(groupPattern);
  assert(groupMatch, `Could not find Primary Residence arrangement field group for ${arrangementKey}.`);
  fieldKeys.forEach((fieldKey) => {
    assert(groupMatch[1].includes(`"${fieldKey}"`), `${arrangementKey} is missing ${fieldKey}.`);
  });
}

function assertArrangementExcludes(arrangementKey, fieldKeys) {
  const groupPattern = new RegExp(`${arrangementKey}: Object\\.freeze\\(\\[([\\s\\S]*?)\\]\\)`);
  const groupMatch = moduleSource.match(groupPattern);
  assert(groupMatch, `Could not find Primary Residence arrangement field group for ${arrangementKey}.`);
  fieldKeys.forEach((fieldKey) => {
    assert(!groupMatch[1].includes(`"${fieldKey}"`), `${arrangementKey} should not include ${fieldKey}.`);
  });
}

assertArrangementIncludes("ownWithMortgage", [
  "propertyValue",
  "equityAmount",
  "currentBalance",
  "monthlyPayment",
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
assertArrangementExcludes("ownWithMortgage", [
  "escrowStatus",
  "costsIncludedInPayment",
  "propertyTaxIncludedInPayment",
  "insuranceIncludedInPayment",
  "homeownersInsuranceIncludedInPayment",
  "hoaIncludedInPayment"
]);
assertArrangementIncludes("rent", [
  "rentMonthly",
  "otherHousingCostMonthly",
  "utilitiesMonthly",
  "rentersInsuranceMonthly"
]);
assertArrangementExcludes("rent", [
  "currentBalance",
  "monthlyPayment",
  "interestRatePercent",
  "mortgageTermRemainingYears",
  "mortgageTermRemainingMonths",
  "monthlyMortgagePaymentOnly",
  "propertyValue",
  "equityAmount",
  "homeSquareFootage",
  "homeAgeYears",
  "monthlyMaintenanceRecommendation"
]);
assertArrangementIncludes("ownFreeAndClear", [
  "propertyValue",
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
assertArrangementExcludes("ownFreeAndClear", [
  "currentBalance",
  "monthlyPayment",
  "interestRatePercent",
  "mortgageTermRemainingYears",
  "mortgageTermRemainingMonths",
  "monthlyMortgagePaymentOnly"
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
