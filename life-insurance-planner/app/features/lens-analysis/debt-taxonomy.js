(function (global) {
  const LensApp = global.LensApp || (global.LensApp = {});
  const lensAnalysis = LensApp.lensAnalysis || (LensApp.lensAnalysis = {});

  // Owner: Lens analysis debt taxonomy.
  // Purpose: define broad raw debt category metadata for future PMI debt facts.
  // Non-goals: no DOM reads, no persistence, no debt-record building, no
  // treatment assumptions, no payoff/support/exclude logic, no recommendations,
  // and no Step 3 wiring.

  const DEFAULT_DEBT_CATEGORIES = Object.freeze([
    Object.freeze({
      categoryKey: "realEstateSecuredDebt",
      label: "Real Estate Secured Debt",
      groupKey: "realEstateSecuredDebt",
      group: "Real estate secured debt",
      description: "Mortgages, HELOCs, land loans, construction loans, and other debts secured by real estate.",
      defaultPmiSourceKeys: Object.freeze(["mortgageBalance", "otherRealEstateLoans"]),
      hasCurrentPmiSource: true,
      notes: "Primary residence mortgage remains owned by the Housing/Home Costs mortgageBalance field; primary residence equity is not debt."
    }),
    Object.freeze({
      categoryKey: "securedConsumerDebt",
      label: "Secured Consumer Debt",
      groupKey: "securedConsumerDebt",
      group: "Secured consumer debt",
      description: "Consumer loans secured by vehicles, equipment, or other pledged personal property.",
      defaultPmiSourceKeys: Object.freeze(["autoLoans"]),
      hasCurrentPmiSource: true,
      notes: "Vehicle and equipment loan types map here unless the obligation is clearly business-owned."
    }),
    Object.freeze({
      categoryKey: "unsecuredConsumerDebt",
      label: "Unsecured Consumer Debt",
      groupKey: "unsecuredConsumerDebt",
      group: "Unsecured consumer debt",
      description: "Credit cards, personal loans, unsecured lines of credit, and other unsecured consumer obligations.",
      defaultPmiSourceKeys: Object.freeze(["creditCardDebt", "personalLoans"]),
      hasCurrentPmiSource: true,
      notes: "Payoff or exclusion treatment belongs in Analysis Setup, not PMI debt intake."
    }),
    Object.freeze({
      categoryKey: "educationDebt",
      label: "Education Debt",
      groupKey: "educationDebt",
      group: "Education debt",
      description: "Student loans and education-related lending obligations.",
      defaultPmiSourceKeys: Object.freeze(["studentLoans"]),
      hasCurrentPmiSource: true,
      notes: "Loan discharge assumptions are treatment assumptions and should not live in raw debt intake."
    }),
    Object.freeze({
      categoryKey: "medicalDebt",
      label: "Medical Debt",
      groupKey: "medicalDebt",
      group: "Medical debt",
      description: "Medical, dental, care, and health-related balances or payment plans.",
      defaultPmiSourceKeys: Object.freeze([]),
      hasCurrentPmiSource: false,
      notes: "No current scalar PMI source exists; future entries should come through repeatable debt records."
    }),
    Object.freeze({
      categoryKey: "taxLegalDebt",
      label: "Tax / Legal Debt",
      groupKey: "taxLegalDebt",
      group: "Tax and legal debt",
      description: "Tax liabilities, judgments, court-ordered obligations, and similar legal debts.",
      defaultPmiSourceKeys: Object.freeze(["taxLiabilities"]),
      hasCurrentPmiSource: true,
      notes: "Tax and legal obligations are raw balances; collection priority is not decided here."
    }),
    Object.freeze({
      categoryKey: "businessDebt",
      label: "Business Debt",
      groupKey: "businessDebt",
      group: "Business debt",
      description: "Business loans, business lines of credit, commercial mortgages, accounts payable, and business obligations.",
      defaultPmiSourceKeys: Object.freeze(["businessDebt"]),
      hasCurrentPmiSource: true,
      notes: "Commercial mortgage entries map here when the obligation is primarily business-owned."
    }),
    Object.freeze({
      categoryKey: "privatePersonalDebt",
      label: "Private / Personal Debt",
      groupKey: "privatePersonalDebt",
      group: "Private and personal debt",
      description: "Family loans, private notes, friend loans, and informal personal obligations.",
      defaultPmiSourceKeys: Object.freeze([]),
      hasCurrentPmiSource: false,
      notes: "Use for private obligations that are not standard consumer-finance products."
    }),
    Object.freeze({
      categoryKey: "consumerFinanceDebt",
      label: "Consumer Finance Debt",
      groupKey: "consumerFinanceDebt",
      group: "Consumer finance debt",
      description: "Buy now pay later, retail financing, payday loans, and similar installment finance obligations.",
      defaultPmiSourceKeys: Object.freeze([]),
      hasCurrentPmiSource: false,
      notes: "Consumer finance entries remain raw balances until treatment is intentionally wired elsewhere."
    }),
    Object.freeze({
      categoryKey: "otherDebt",
      label: "Other Debt",
      groupKey: "otherDebt",
      group: "Other debt",
      description: "Advisor-defined or uncategorized debt obligations not covered by another broad category.",
      defaultPmiSourceKeys: Object.freeze(["otherLoanObligations"]),
      hasCurrentPmiSource: true,
      notes: "Use for exceptional cases; add a library entry later when a repeated pattern becomes clear."
    })
  ]);

  const DEFAULT_DEBT_CATEGORY_KEYS = Object.freeze(
    DEFAULT_DEBT_CATEGORIES.map(function (category) {
      return category.categoryKey;
    })
  );

  const CURRENT_PMI_DEBT_SOURCE_FIELDS = Object.freeze([
    Object.freeze({
      sourceKey: "mortgageBalance",
      label: "Primary Residence Mortgage",
      categoryKey: "realEstateSecuredDebt",
      owner: "housing-home-costs",
      isHousingFieldOwned: true,
      duplicateProtection: "mortgageBalance-remains-single-source"
    }),
    Object.freeze({
      sourceKey: "otherRealEstateLoans",
      label: "HELOC / Second Mortgage / Other Property Loans",
      categoryKey: "realEstateSecuredDebt",
      owner: "debts-and-liabilities",
      isHousingFieldOwned: false
    }),
    Object.freeze({
      sourceKey: "autoLoans",
      label: "Auto Loan Balances",
      categoryKey: "securedConsumerDebt",
      owner: "debts-and-liabilities",
      isHousingFieldOwned: false
    }),
    Object.freeze({
      sourceKey: "creditCardDebt",
      label: "Credit Card Debt",
      categoryKey: "unsecuredConsumerDebt",
      owner: "debts-and-liabilities",
      isHousingFieldOwned: false
    }),
    Object.freeze({
      sourceKey: "studentLoans",
      label: "Student Loan Balances",
      categoryKey: "educationDebt",
      owner: "debts-and-liabilities",
      isHousingFieldOwned: false
    }),
    Object.freeze({
      sourceKey: "personalLoans",
      label: "Personal Loan Balances",
      categoryKey: "unsecuredConsumerDebt",
      owner: "debts-and-liabilities",
      isHousingFieldOwned: false
    }),
    Object.freeze({
      sourceKey: "taxLiabilities",
      label: "Tax Liabilities",
      categoryKey: "taxLegalDebt",
      owner: "debts-and-liabilities",
      isHousingFieldOwned: false
    }),
    Object.freeze({
      sourceKey: "businessDebt",
      label: "Business Debt",
      categoryKey: "businessDebt",
      owner: "debts-and-liabilities",
      isHousingFieldOwned: false
    }),
    Object.freeze({
      sourceKey: "otherLoanObligations",
      label: "Other Loan Obligations",
      categoryKey: "otherDebt",
      owner: "debts-and-liabilities",
      isHousingFieldOwned: false
    })
  ]);

  lensAnalysis.debtTaxonomy = Object.freeze({
    DEFAULT_DEBT_CATEGORIES,
    DEFAULT_DEBT_CATEGORY_KEYS,
    CURRENT_PMI_DEBT_SOURCE_FIELDS
  });
})(window);
