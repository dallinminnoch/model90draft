(function (global) {
  const LensApp = global.LensApp || (global.LensApp = {});
  const lensAnalysis = LensApp.lensAnalysis || (LensApp.lensAnalysis = {});

  // Owner: Lens analysis asset taxonomy.
  // Purpose: define raw asset category metadata for future PMI asset facts.
  // Non-goals: no DOM reads, no persistence, no bucket building, no treatment
  // logic, no offset math, no recommendations, and no Step 3 wiring.

  const DEFAULT_ASSET_CATEGORIES = Object.freeze([
    Object.freeze({
      categoryKey: "cashAndCashEquivalents",
      label: "Cash & Cash Equivalents",
      group: "liquid",
      description: "Checking, savings, money market, CDs, and other cash-like balances.",
      defaultPmiSourceKey: "cashAndCashEquivalents",
      legacySourceKeys: Object.freeze(["cashSavings"]),
      hasCurrentPmiSource: true,
      defaultTreatmentBias: "cash-like",
      notes: "Current PMI cashAndCashEquivalents maps here; legacy cashSavings remains an alias."
    }),
    Object.freeze({
      categoryKey: "emergencyFund",
      label: "Emergency Fund",
      group: "liquid",
      description: "Dedicated emergency reserve balance entered as a raw current asset fact.",
      defaultPmiSourceKey: "emergencyFund",
      legacySourceKeys: Object.freeze(["emergencyFund"]),
      hasCurrentPmiSource: true,
      defaultTreatmentBias: "cash-like",
      notes: "Separate from survivor transition needs and desired emergency fund targets."
    }),
    Object.freeze({
      categoryKey: "taxableBrokerageInvestments",
      label: "Taxable Brokerage / Investments",
      group: "investment",
      description: "Taxable brokerage and non-retirement investment account balances.",
      defaultPmiSourceKey: "taxableBrokerageInvestments",
      legacySourceKeys: Object.freeze(["brokerageAccounts"]),
      hasCurrentPmiSource: true,
      defaultTreatmentBias: "step-up-investment",
      notes: "Current PMI taxableBrokerageInvestments maps here; legacy brokerageAccounts remains an alias."
    }),
    Object.freeze({
      categoryKey: "traditionalRetirementAssets",
      label: "Traditional Retirement Assets",
      group: "retirement",
      description: "Traditional 401(k), IRA, and similar pre-tax retirement account balances.",
      defaultPmiSourceKey: "traditionalRetirementAssets",
      legacySourceKeys: Object.freeze(["retirementAssets"]),
      hasCurrentPmiSource: true,
      defaultTreatmentBias: "taxable-retirement",
      notes: "Current PMI traditionalRetirementAssets maps here; legacy retirementAssets may mix traditional, Roth, and other retirement balances."
    }),
    Object.freeze({
      categoryKey: "rothTaxAdvantagedRetirementAssets",
      label: "Roth / Tax-Advantaged Retirement Assets",
      group: "retirement",
      description: "Roth IRA, Roth 401(k), and similar tax-advantaged retirement account balances.",
      defaultPmiSourceKey: "rothTaxAdvantagedRetirementAssets",
      legacySourceKeys: Object.freeze([]),
      hasCurrentPmiSource: true,
      defaultTreatmentBias: "roth-retirement",
      notes: "Current PMI rothTaxAdvantagedRetirementAssets maps here."
    }),
    Object.freeze({
      categoryKey: "qualifiedAnnuities",
      label: "Qualified Annuities",
      group: "annuity",
      description: "Qualified annuity balances held inside tax-qualified retirement arrangements.",
      defaultPmiSourceKey: "qualifiedAnnuities",
      legacySourceKeys: Object.freeze([]),
      hasCurrentPmiSource: true,
      defaultTreatmentBias: "qualified-annuity",
      notes: "Current PMI qualifiedAnnuities maps here."
    }),
    Object.freeze({
      categoryKey: "nonqualifiedAnnuities",
      label: "Nonqualified Annuities",
      group: "annuity",
      description: "Nonqualified annuity account values or surrender values.",
      defaultPmiSourceKey: "nonqualifiedAnnuities",
      legacySourceKeys: Object.freeze([]),
      hasCurrentPmiSource: true,
      defaultTreatmentBias: "nonqualified-annuity",
      notes: "Current PMI nonqualifiedAnnuities maps here."
    }),
    Object.freeze({
      categoryKey: "primaryResidenceEquity",
      label: "Primary Residence Equity",
      group: "realEstate",
      description: "Estimated equity in the client's primary residence.",
      defaultPmiSourceKey: "primaryResidenceEquity",
      legacySourceKeys: Object.freeze(["realEstateEquity"]),
      hasCurrentPmiSource: true,
      defaultTreatmentBias: "real-estate-equity",
      notes: "Current PMI primaryResidenceEquity maps here; legacy realEstateEquity remains an alias but old records cannot distinguish primary residence from other real estate."
    }),
    Object.freeze({
      categoryKey: "otherRealEstateEquity",
      label: "Other Real Estate Equity",
      group: "realEstate",
      description: "Estimated equity in rental, vacation, investment, or other non-primary real estate.",
      defaultPmiSourceKey: "otherRealEstateEquity",
      legacySourceKeys: Object.freeze([]),
      hasCurrentPmiSource: true,
      defaultTreatmentBias: "real-estate-equity",
      notes: "Current PMI otherRealEstateEquity maps here."
    }),
    Object.freeze({
      categoryKey: "businessPrivateCompanyValue",
      label: "Business / Private Company Value",
      group: "business",
      description: "Estimated business ownership, private company, or closely held entity value.",
      defaultPmiSourceKey: "businessPrivateCompanyValue",
      legacySourceKeys: Object.freeze(["businessValue"]),
      hasCurrentPmiSource: true,
      defaultTreatmentBias: "business-illiquid",
      notes: "Current PMI businessPrivateCompanyValue maps here; legacy businessValue remains an alias."
    }),
    Object.freeze({
      categoryKey: "educationSpecificSavings",
      label: "Education-Specific Savings",
      group: "restrictedPurpose",
      description: "529 plans, Coverdell accounts, or other education-dedicated savings.",
      defaultPmiSourceKey: "educationSpecificSavings",
      legacySourceKeys: Object.freeze([]),
      hasCurrentPmiSource: true,
      defaultTreatmentBias: "restricted-purpose",
      notes: "Current PMI educationSpecificSavings maps here; education treatment stays in Analysis Setup."
    }),
    Object.freeze({
      categoryKey: "trustRestrictedAssets",
      label: "Trust / Restricted Assets",
      group: "restrictedPurpose",
      description: "Trust-owned, restricted, pledged, or otherwise limited-access asset balances.",
      defaultPmiSourceKey: "trustRestrictedAssets",
      legacySourceKeys: Object.freeze([]),
      hasCurrentPmiSource: true,
      defaultTreatmentBias: "restricted-asset",
      notes: "Current PMI trustRestrictedAssets maps here; future treatment should account for access restrictions outside PMI."
    }),
    Object.freeze({
      categoryKey: "stockCompensationDeferredCompensation",
      label: "Stock Compensation / Deferred Compensation",
      group: "compensation",
      description: "RSUs, options, deferred compensation, and other employer-linked asset values.",
      defaultPmiSourceKey: "stockCompensationDeferredCompensation",
      legacySourceKeys: Object.freeze([]),
      hasCurrentPmiSource: true,
      defaultTreatmentBias: "case-specific",
      notes: "Current PMI stockCompensationDeferredCompensation maps here; future library entries may need vesting and forfeiture raw facts."
    }),
    Object.freeze({
      categoryKey: "digitalAssetsCrypto",
      label: "Digital Assets / Crypto",
      group: "alternative",
      description: "Digital assets, cryptocurrency, and similar alternative asset balances.",
      defaultPmiSourceKey: "digitalAssetsCrypto",
      legacySourceKeys: Object.freeze([]),
      hasCurrentPmiSource: true,
      defaultTreatmentBias: "alternative-asset",
      notes: "Current PMI digitalAssetsCrypto maps here; future treatment may account for volatility, custody, and access risk."
    }),
    Object.freeze({
      categoryKey: "otherCustomAsset",
      label: "Other / Custom Asset",
      group: "custom",
      description: "Advisor-defined asset category for raw asset facts not covered by the default list.",
      defaultPmiSourceKey: "otherCustomAsset",
      legacySourceKeys: Object.freeze([]),
      hasCurrentPmiSource: true,
      defaultTreatmentBias: "custom",
      notes: "Current PMI otherCustomAsset maps here. Use for exceptional cases; do not use to reintroduce standard personal belongings as default categories."
    })
  ]);

  const LEGACY_ASSET_SOURCE_ALIASES = Object.freeze({
    cashSavings: Object.freeze({
      categoryKey: "cashAndCashEquivalents",
      note: "Legacy cash/savings scalar source."
    }),
    emergencyFund: Object.freeze({
      categoryKey: "emergencyFund",
      note: "Legacy emergency fund scalar source."
    }),
    brokerageAccounts: Object.freeze({
      categoryKey: "taxableBrokerageInvestments",
      note: "Legacy brokerage account scalar source."
    }),
    retirementAssets: Object.freeze({
      categoryKey: "traditionalRetirementAssets",
      note: "Legacy retirement scalar source; may include mixed traditional, Roth, and other retirement assets."
    }),
    realEstateEquity: Object.freeze({
      categoryKey: "primaryResidenceEquity",
      note: "Legacy real estate equity scalar source; old records cannot distinguish primary residence from other real estate."
    }),
    businessValue: Object.freeze({
      categoryKey: "businessPrivateCompanyValue",
      note: "Legacy business value scalar source."
    })
  });

  const DEFAULT_VISIBLE_ASSET_CATEGORY_KEYS = Object.freeze(
    DEFAULT_ASSET_CATEGORIES.map(function (category) {
      return category.categoryKey;
    })
  );

  // Future searchable asset-library entries should be maintained separately
  // from the default visible categories above.
  const FUTURE_SEARCHABLE_ASSET_LIBRARY_GROUPS = Object.freeze([
    "Cash, deposits, and short-term reserves",
    "Taxable investment accounts",
    "Retirement assets",
    "Annuities",
    "Real estate",
    "Business and private company value",
    "Stock compensation and employer benefits",
    "Education-specific assets",
    "Trusts, estates, and restricted assets",
    "Government, pension, and survivor income-like benefits",
    "Digital and alternative assets",
    "Receivables and contractual rights",
    "Special-case assets",
    "Custom asset types"
  ]);

  lensAnalysis.assetTaxonomy = Object.freeze({
    DEFAULT_ASSET_CATEGORIES,
    DEFAULT_VISIBLE_ASSET_CATEGORY_KEYS,
    LEGACY_ASSET_SOURCE_ALIASES,
    FUTURE_SEARCHABLE_ASSET_LIBRARY_GROUPS
  });
})(window);
