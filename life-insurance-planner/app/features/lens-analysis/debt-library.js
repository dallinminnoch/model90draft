(function (global) {
  const LensApp = global.LensApp || (global.LensApp = {});
  const lensAnalysis = LensApp.lensAnalysis || (LensApp.lensAnalysis = {});

  // Owner: Lens analysis debt library metadata.
  // Purpose: define searchable raw debt types that future PMI debtRecords[]
  // rows can use. Treatment assumptions stay in Analysis Setup.

  const CATEGORY_LABELS = Object.freeze({
    realEstateSecuredDebt: "Real Estate Secured Debt",
    securedConsumerDebt: "Secured Consumer Debt",
    unsecuredConsumerDebt: "Unsecured Consumer Debt",
    educationDebt: "Education Debt",
    medicalDebt: "Medical Debt",
    taxLegalDebt: "Tax / Legal Debt",
    businessDebt: "Business Debt",
    privatePersonalDebt: "Private / Personal Debt",
    consumerFinanceDebt: "Consumer Finance Debt",
    otherDebt: "Other Debt"
  });

  const GROUPS = Object.freeze({
    realEstateSecuredDebt: "Real estate secured debt",
    securedConsumerDebt: "Secured consumer debt",
    unsecuredConsumerDebt: "Unsecured consumer debt",
    educationDebt: "Education debt",
    medicalDebt: "Medical debt",
    taxLegalDebt: "Tax and legal debt",
    businessDebt: "Business debt",
    privatePersonalDebt: "Private and personal debt",
    consumerFinanceDebt: "Consumer finance debt",
    otherDebt: "Other debt"
  });

  const RAW_DEBT_LIBRARY_ENTRIES = Object.freeze([
    ["primaryResidenceMortgage", "Primary Residence Mortgage", "realEstateSecuredDebt", GROUPS.realEstateSecuredDebt, "Primary residence mortgage balance. Use the Housing/Home Costs mortgage balance field instead of adding a duplicate debt record.", "home mortgage|primary mortgage|mortgage balance", { isAddable: false, isHousingFieldOwned: true, ownedByField: "mortgageBalance", duplicateProtection: "mortgageBalance-remains-single-source" }],
    ["heloc", "HELOC", "realEstateSecuredDebt", GROUPS.realEstateSecuredDebt, "Home equity line of credit balance.", "home equity line|home equity line of credit|property line of credit"],
    ["homeEquityLoan", "Home Equity Loan", "realEstateSecuredDebt", GROUPS.realEstateSecuredDebt, "Home equity loan balance.", "home equity debt|home equity installment"],
    ["secondMortgage", "Second Mortgage", "realEstateSecuredDebt", GROUPS.realEstateSecuredDebt, "Second mortgage or junior lien balance.", "junior mortgage|second lien"],
    ["otherPropertyLoan", "Other Property Loan", "realEstateSecuredDebt", GROUPS.realEstateSecuredDebt, "Other loan secured by real estate.", "property loan|real estate loan"],
    ["investmentPropertyMortgage", "Investment Property Mortgage", "realEstateSecuredDebt", GROUPS.realEstateSecuredDebt, "Mortgage secured by rental, investment, or non-primary real estate.", "rental mortgage|investment mortgage"],
    ["landLoan", "Land Loan", "realEstateSecuredDebt", GROUPS.realEstateSecuredDebt, "Loan secured by land.", "lot loan|raw land loan"],
    ["constructionLoan", "Construction Loan", "realEstateSecuredDebt", GROUPS.realEstateSecuredDebt, "Construction or renovation loan secured by real estate.", "construction debt|renovation loan"],

    ["autoLoan", "Auto Loan", "securedConsumerDebt", GROUPS.securedConsumerDebt, "Loan secured by a car or truck.", "car loan|vehicle loan"],
    ["motorcycleLoan", "Motorcycle Loan", "securedConsumerDebt", GROUPS.securedConsumerDebt, "Loan secured by a motorcycle.", "motorcycle financing"],
    ["rvLoan", "RV Loan", "securedConsumerDebt", GROUPS.securedConsumerDebt, "Loan secured by a recreational vehicle.", "recreational vehicle loan|camper loan"],
    ["boatLoan", "Boat Loan", "securedConsumerDebt", GROUPS.securedConsumerDebt, "Loan secured by a boat or watercraft.", "marine loan|watercraft loan"],
    ["aircraftLoan", "Aircraft Loan", "securedConsumerDebt", GROUPS.securedConsumerDebt, "Loan secured by a personal aircraft.", "plane loan|aviation loan"],
    ["equipmentLoan", "Equipment Loan", "securedConsumerDebt", GROUPS.securedConsumerDebt, "Loan secured by personal equipment. Use Business Equipment Loan when the obligation is business-owned.", "secured equipment|equipment financing"],
    ["securedPersonalLoan", "Secured Personal Loan", "securedConsumerDebt", GROUPS.securedConsumerDebt, "Personal loan secured by pledged collateral.", "collateral loan|secured loan"],

    ["creditCard", "Credit Card", "unsecuredConsumerDebt", GROUPS.unsecuredConsumerDebt, "Revolving credit card balance.", "credit card debt|card balance"],
    ["storeCard", "Store Card", "unsecuredConsumerDebt", GROUPS.unsecuredConsumerDebt, "Retail store card or merchant card balance.", "retail card|merchant card"],
    ["chargeCard", "Charge Card", "unsecuredConsumerDebt", GROUPS.unsecuredConsumerDebt, "Charge card balance.", "amex charge card|charge account"],
    ["unsecuredLineOfCredit", "Unsecured Line of Credit", "unsecuredConsumerDebt", GROUPS.unsecuredConsumerDebt, "Unsecured personal line of credit balance.", "personal line|unsecured loc"],
    ["personalLoan", "Personal Loan", "unsecuredConsumerDebt", GROUPS.unsecuredConsumerDebt, "Unsecured personal loan balance.", "signature loan|unsecured loan"],
    ["debtConsolidationLoan", "Debt Consolidation Loan", "unsecuredConsumerDebt", GROUPS.unsecuredConsumerDebt, "Debt consolidation loan balance.", "consolidation loan|consolidated debt"],

    ["federalStudentLoan", "Federal Student Loan", "educationDebt", GROUPS.educationDebt, "Federal student loan balance.", "federal education loan|direct loan"],
    ["privateStudentLoan", "Private Student Loan", "educationDebt", GROUPS.educationDebt, "Private student loan balance.", "private education loan"],
    ["parentPlusLoan", "Parent PLUS Loan", "educationDebt", GROUPS.educationDebt, "Parent PLUS education loan balance.", "plus loan|parent education loan"],
    ["studentLoanRefinance", "Student Loan Refinance", "educationDebt", GROUPS.educationDebt, "Refinanced student loan balance.", "student refinance|education refinance"],

    ["medicalBill", "Medical Bill", "medicalDebt", GROUPS.medicalDebt, "Outstanding medical bill balance.", "hospital bill|doctor bill"],
    ["medicalPaymentPlan", "Medical Payment Plan", "medicalDebt", GROUPS.medicalDebt, "Medical payment plan balance.", "hospital payment plan|medical installment"],
    ["dentalBill", "Dental Bill", "medicalDebt", GROUPS.medicalDebt, "Outstanding dental bill balance.", "orthodontic bill|dental debt"],
    ["longTermCareDebt", "Long-Term Care / Care Expense Debt", "medicalDebt", GROUPS.medicalDebt, "Care-related expense debt or payment obligation.", "care debt|long term care bill|ltc debt"],

    ["irsTaxDebt", "IRS Tax Debt", "taxLegalDebt", GROUPS.taxLegalDebt, "Federal tax debt balance.", "irs debt|federal taxes"],
    ["stateTaxDebt", "State Tax Debt", "taxLegalDebt", GROUPS.taxLegalDebt, "State tax debt balance.", "state taxes|state tax liability"],
    ["propertyTaxDebt", "Property Tax Debt", "taxLegalDebt", GROUPS.taxLegalDebt, "Past-due property tax balance.", "property taxes|tax lien"],
    ["legalJudgment", "Legal Judgment", "taxLegalDebt", GROUPS.taxLegalDebt, "Legal judgment balance.", "judgment|court judgment"],
    ["courtOrderedDebt", "Court-Ordered Debt", "taxLegalDebt", GROUPS.taxLegalDebt, "Court-ordered payment obligation.", "court order|legal obligation"],
    ["backTaxes", "Back Taxes", "taxLegalDebt", GROUPS.taxLegalDebt, "Past-due tax obligation.", "past due taxes|tax arrears"],

    ["businessLoan", "Business Loan", "businessDebt", GROUPS.businessDebt, "Business loan balance.", "company loan|commercial loan"],
    ["businessLineOfCredit", "Business Line of Credit", "businessDebt", GROUPS.businessDebt, "Business line of credit balance.", "business loc|company line"],
    ["sbaLoan", "SBA Loan", "businessDebt", GROUPS.businessDebt, "Small Business Administration loan balance.", "small business loan|sba debt"],
    ["commercialMortgage", "Commercial Mortgage", "businessDebt", GROUPS.businessDebt, "Mortgage tied to a business-owned commercial obligation.", "commercial real estate loan|business mortgage"],
    ["accountsPayableBusinessObligation", "Accounts Payable / Business Obligation", "businessDebt", GROUPS.businessDebt, "Business payable or operating obligation.", "accounts payable|business obligation"],
    ["businessEquipmentLoan", "Business Equipment Loan", "businessDebt", GROUPS.businessDebt, "Business-owned equipment financing obligation.", "equipment financing|commercial equipment loan"],

    ["familyLoan", "Family Loan", "privatePersonalDebt", GROUPS.privatePersonalDebt, "Loan owed to a family member.", "relative loan|family note"],
    ["privateNote", "Private Note", "privatePersonalDebt", GROUPS.privatePersonalDebt, "Private note or private lending obligation.", "promissory note|private loan"],
    ["loanFromFriend", "Loan From Friend", "privatePersonalDebt", GROUPS.privatePersonalDebt, "Loan owed to a friend.", "friend loan|personal note"],
    ["informalPersonalObligation", "Informal Personal Obligation", "privatePersonalDebt", GROUPS.privatePersonalDebt, "Informal personal obligation not documented as a standard loan.", "informal debt|personal obligation"],

    ["buyNowPayLater", "Buy Now Pay Later", "consumerFinanceDebt", GROUPS.consumerFinanceDebt, "Buy now pay later balance.", "bnpl|affirm|klarna|afterpay"],
    ["consumerFinanceInstallmentLoan", "Consumer Finance / Installment Loan", "consumerFinanceDebt", GROUPS.consumerFinanceDebt, "Consumer finance installment balance.", "installment loan|consumer finance"],
    ["paydayLoan", "Payday Loan", "consumerFinanceDebt", GROUPS.consumerFinanceDebt, "Payday loan balance.", "cash advance|short term payday"],
    ["retailFinancing", "Retail Financing", "consumerFinanceDebt", GROUPS.consumerFinanceDebt, "Retail purchase financing balance.", "store financing|retail installment"],
    ["personalInstallmentLoan", "Personal Installment Loan", "consumerFinanceDebt", GROUPS.consumerFinanceDebt, "Personal installment loan balance.", "installment debt|consumer installment"],

    ["otherDebt", "Other Debt", "otherDebt", GROUPS.otherDebt, "Other debt obligation not covered by another standard library entry.", "misc debt|other liability"],
    ["customDebt", "Custom Debt", "otherDebt", GROUPS.otherDebt, "Advisor-defined raw debt obligation.", "custom|advisor defined debt", { isCustomType: true }]
  ]);

  function splitAliases(value) {
    return String(value == null ? "" : value)
      .split("|")
      .map(function (alias) {
        return alias.trim();
      })
      .filter(Boolean);
  }

  function toDebtLibraryEntry(definition) {
    const options = definition[6] && typeof definition[6] === "object" ? definition[6] : {};
    const aliases = splitAliases(definition[5]);
    const categoryLabel = CATEGORY_LABELS[definition[2]];
    if (categoryLabel && aliases.indexOf(categoryLabel) === -1) {
      aliases.push(categoryLabel);
    }

    return Object.freeze({
      libraryEntryKey: definition[0],
      typeKey: definition[0],
      label: definition[1],
      categoryKey: definition[2],
      groupKey: definition[2],
      group: definition[3],
      description: definition[4],
      aliases: Object.freeze(aliases),
      isDefaultVisible: options.isDefaultVisible === true,
      isAddable: options.isAddable !== false,
      isCustomType: options.isCustomType === true,
      isHousingFieldOwned: options.isHousingFieldOwned === true,
      ownedByField: options.ownedByField || null,
      duplicateProtection: options.duplicateProtection || null
    });
  }

  const DEBT_LIBRARY_ENTRIES = Object.freeze(
    RAW_DEBT_LIBRARY_ENTRIES.map(toDebtLibraryEntry)
  );

  const DEBT_LIBRARY_GROUPS = Object.freeze(
    DEBT_LIBRARY_ENTRIES.reduce(function (groups, entry) {
      if (entry.group && groups.indexOf(entry.group) === -1) {
        groups.push(entry.group);
      }
      return groups;
    }, [])
  );

  function cloneEntry(entry) {
    return Object.assign({}, entry, {
      aliases: Array.isArray(entry.aliases) ? entry.aliases.slice() : []
    });
  }

  function getDebtLibraryEntries() {
    return DEBT_LIBRARY_ENTRIES.map(cloneEntry);
  }

  function findDebtLibraryEntry(typeKey) {
    const normalizedTypeKey = String(typeKey == null ? "" : typeKey).trim();
    if (!normalizedTypeKey) {
      return null;
    }

    const entry = DEBT_LIBRARY_ENTRIES.find(function (candidate) {
      return candidate.typeKey === normalizedTypeKey
        || candidate.libraryEntryKey === normalizedTypeKey;
    });
    return entry ? cloneEntry(entry) : null;
  }

  lensAnalysis.debtLibrary = Object.freeze({
    DEBT_LIBRARY_ENTRIES,
    DEBT_LIBRARY_GROUPS,
    getDebtLibraryEntries,
    findDebtLibraryEntry
  });
})(window);
