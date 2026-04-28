(function (global) {
  const LensApp = global.LensApp || (global.LensApp = {});
  const lensAnalysis = LensApp.lensAnalysis || (LensApp.lensAnalysis = {});

  // Owner: Lens analysis asset library metadata.
  // Purpose: define value-only asset/account types that PMI can add as raw
  // assetRecords[]. Treatment assumptions stay in Analysis Setup.

  const CATEGORY_LABELS = Object.freeze({
    cashAndCashEquivalents: "Cash & Cash Equivalents",
    emergencyFund: "Emergency Fund",
    taxableBrokerageInvestments: "Taxable Brokerage / Investments",
    traditionalRetirementAssets: "Traditional Retirement Assets",
    rothTaxAdvantagedRetirementAssets: "Roth / Tax-Advantaged Retirement Assets",
    qualifiedAnnuities: "Qualified Annuities",
    nonqualifiedAnnuities: "Nonqualified Annuities",
    primaryResidenceEquity: "Primary Residence Equity",
    otherRealEstateEquity: "Other Real Estate Equity",
    businessPrivateCompanyValue: "Business / Private Company Value",
    educationSpecificSavings: "Education-Specific Savings",
    trustRestrictedAssets: "Trust / Restricted Assets",
    stockCompensationDeferredCompensation: "Stock Compensation / Deferred Compensation",
    digitalAssetsCrypto: "Digital Assets / Crypto",
    otherCustomAsset: "Other / Custom Asset"
  });

  const GROUPS = Object.freeze({
    cash: "Cash, deposits, and short-term reserves",
    taxableInvestments: "Taxable investment accounts",
    retirement: "Retirement assets",
    annuities: "Annuities",
    realEstate: "Real estate",
    business: "Business and private company value",
    stockCompensation: "Stock compensation and employer benefits",
    education: "Education-specific assets",
    trustRestricted: "Trusts, estates, and restricted assets",
    incomeBenefits: "Government, pension, and survivor income-like benefits",
    alternative: "Digital and alternative assets",
    receivables: "Receivables and contractual rights",
    specialCase: "Special-case assets",
    custom: "Custom asset types"
  });

  const RAW_ASSET_LIBRARY_ENTRIES = Object.freeze([
    ["checkingAccount", "Checking Account", "cashAndCashEquivalents", GROUPS.cash, "Bank checking account balance.", "checking|bank account|deposit account"],
    ["savingsAccount", "Savings Account", "cashAndCashEquivalents", GROUPS.cash, "Bank savings account balance.", "savings|bank savings|deposit account"],
    ["highYieldSavingsAccount", "High-Yield Savings Account", "cashAndCashEquivalents", GROUPS.cash, "High-yield bank savings account balance.", "hysa|high yield|savings"],
    ["moneyMarketDepositAccount", "Money Market Deposit Account", "cashAndCashEquivalents", GROUPS.cash, "Bank money market deposit account balance.", "money market|mmda|deposit account"],
    ["moneyMarketMutualFund", "Money Market Mutual Fund", "cashAndCashEquivalents", GROUPS.cash, "Money market mutual fund balance.", "money market fund|cash fund|mutual fund"],
    ["certificateOfDeposit", "Certificate of Deposit", "cashAndCashEquivalents", GROUPS.cash, "Certificate of deposit account value.", "cd|bank cd|time deposit"],
    ["cdLadder", "CD Ladder", "cashAndCashEquivalents", GROUPS.cash, "Combined value of a certificate of deposit ladder.", "certificates of deposit|cd ladder"],
    ["treasuryBills", "Treasury Bills", "cashAndCashEquivalents", GROUPS.cash, "Treasury bill holdings value.", "t bills|tbills|short treasury"],
    ["treasuryNotes", "Treasury Notes", "cashAndCashEquivalents", GROUPS.cash, "Treasury note holdings value.", "t notes|treasury securities"],
    ["treasuryDirectHoldings", "TreasuryDirect Holdings", "cashAndCashEquivalents", GROUPS.cash, "TreasuryDirect account holdings value.", "treasurydirect|treasury account"],
    ["shortTermBondFund", "Short-Term Bond Fund", "cashAndCashEquivalents", GROUPS.cash, "Short-term bond fund value.", "short term bonds|bond fund"],
    ["ultraShortBondFund", "Ultra-Short Bond Fund", "cashAndCashEquivalents", GROUPS.cash, "Ultra-short duration bond fund value.", "ultra short bonds|cash alternative"],
    ["cashManagementAccount", "Cash Management Account", "cashAndCashEquivalents", GROUPS.cash, "Cash management account balance.", "cma|brokerage cash|cash account"],
    ["brokerageSweepAccount", "Brokerage Sweep Account", "cashAndCashEquivalents", GROUPS.cash, "Brokerage sweep cash balance.", "sweep|sweep account|brokerage cash"],
    ["digitalPaymentAppBalance", "PayPal / Venmo / Cash App Balance", "cashAndCashEquivalents", GROUPS.cash, "Payment app cash balance.", "paypal|venmo|cash app|payment app"],
    ["foreignCurrencyCash", "Foreign Currency Cash", "cashAndCashEquivalents", GROUPS.cash, "Foreign currency cash or deposit balance.", "foreign cash|currency|fx cash"],
    ["emergencyFundReserve", "Emergency Fund", "emergencyFund", GROUPS.cash, "Dedicated emergency fund balance.", "emergency reserve|rainy day fund"],
    ["sinkingFund", "Sinking Fund", "cashAndCashEquivalents", GROUPS.cash, "Cash reserve set aside for a known future expense.", "reserve fund|planned expense fund"],
    ["businessCashReserve", "Business Cash Reserve", "cashAndCashEquivalents", GROUPS.cash, "Business cash reserve available as a reported asset value.", "business cash|company reserve"],
    ["escrowedCash", "Escrowed Cash", "cashAndCashEquivalents", GROUPS.cash, "Cash held in escrow.", "escrow|restricted cash|held cash"],

    ["taxableBrokerageAccount", "Taxable Brokerage Account", "taxableBrokerageInvestments", GROUPS.taxableInvestments, "Taxable brokerage account value.", "brokerage|taxable account|investment account"],
    ["jointBrokerageAccount", "Joint Brokerage Account", "taxableBrokerageInvestments", GROUPS.taxableInvestments, "Joint taxable investment account value.", "joint investment|brokerage"],
    ["individualBrokerageAccount", "Individual Brokerage Account", "taxableBrokerageInvestments", GROUPS.taxableInvestments, "Individual taxable brokerage or investment account value.", "individual investment|brokerage"],
    ["transferOnDeathBrokerageAccount", "Transfer-on-Death Brokerage Account", "taxableBrokerageInvestments", GROUPS.taxableInvestments, "Transfer-on-death taxable brokerage account value.", "tod account|tod brokerage|beneficiary brokerage"],
    ["managedAccount", "Managed Account", "taxableBrokerageInvestments", GROUPS.taxableInvestments, "Professionally managed taxable account value.", "managed portfolio|managed investment"],
    ["separatelyManagedAccount", "Separately Managed Account", "taxableBrokerageInvestments", GROUPS.taxableInvestments, "Separately managed account value.", "sma|separate account"],
    ["roboAdvisorAccount", "Robo-Advisor Account", "taxableBrokerageInvestments", GROUPS.taxableInvestments, "Robo-advisor taxable investment account value.", "robo advisor|automated investment"],
    ["mutualFundAccount", "Mutual Fund Account", "taxableBrokerageInvestments", GROUPS.taxableInvestments, "Taxable mutual fund account value.", "mutual funds|fund account"],
    ["etfPortfolio", "ETF Portfolio", "taxableBrokerageInvestments", GROUPS.taxableInvestments, "Taxable exchange-traded fund portfolio value.", "etf|exchange traded funds"],
    ["individualStockPortfolio", "Individual Stock Portfolio", "taxableBrokerageInvestments", GROUPS.taxableInvestments, "Taxable individual stock holdings value.", "stocks|equities|stock portfolio"],
    ["individualBondPortfolio", "Individual Bond Portfolio", "taxableBrokerageInvestments", GROUPS.taxableInvestments, "Taxable individual bond holdings value.", "bonds|bond ladder"],
    ["municipalBondPortfolio", "Municipal Bond Portfolio", "taxableBrokerageInvestments", GROUPS.taxableInvestments, "Municipal bond holdings value.", "munis|municipal bonds|tax exempt bonds"],
    ["treasuryBondPortfolio", "Treasury Bond Portfolio", "taxableBrokerageInvestments", GROUPS.taxableInvestments, "Treasury bond portfolio value.", "treasury bonds|government bonds"],
    ["corporateBondPortfolio", "Corporate Bond Portfolio", "taxableBrokerageInvestments", GROUPS.taxableInvestments, "Corporate bond portfolio value.", "corporate bonds|bond portfolio"],
    ["highYieldBondPortfolio", "High-Yield Bond Portfolio", "taxableBrokerageInvestments", GROUPS.taxableInvestments, "High-yield bond portfolio value.", "junk bonds|high yield bonds"],
    ["brokeredCds", "Brokered CDs", "taxableBrokerageInvestments", GROUPS.taxableInvestments, "Brokered certificate of deposit holdings value.", "brokered cd|brokerage cd"],
    ["reitHoldings", "REIT Holdings", "taxableBrokerageInvestments", GROUPS.taxableInvestments, "Real estate investment trust holdings value.", "reit|real estate investment trust"],
    ["dividendPortfolio", "Dividend Portfolio", "taxableBrokerageInvestments", GROUPS.taxableInvestments, "Dividend-focused taxable portfolio value.", "dividend stocks|income portfolio"],
    ["concentratedStockPosition", "Concentrated Stock Position", "taxableBrokerageInvestments", GROUPS.taxableInvestments, "Concentrated publicly traded stock position value.", "single stock|concentrated equity"],
    ["marginAccount", "Margin Account", "taxableBrokerageInvestments", GROUPS.taxableInvestments, "Taxable margin account gross asset value.", "margin brokerage|margin loan account"],
    ["pledgedBrokerageAccount", "Pledged Brokerage Account", "taxableBrokerageInvestments", GROUPS.taxableInvestments, "Brokerage account pledged as collateral, captured as raw value only.", "pledged account|collateral account"],
    ["collateralizedInvestmentAccount", "Collateralized Investment Account", "taxableBrokerageInvestments", GROUPS.taxableInvestments, "Investment account used as collateral, captured as raw value only.", "collateralized account|secured investment account"],
    ["donorAdvisedFund", "Donor-Advised Fund", "trustRestrictedAssets", GROUPS.taxableInvestments, "Donor-advised fund balance captured as a restricted-purpose asset.", "daf|charitable fund|donor advised"],
    ["privatePlacementInvestment", "Private Placement Investment", "taxableBrokerageInvestments", GROUPS.taxableInvestments, "Private placement investment value.", "private placement|alternative investment"],

    ["traditionalIra", "Traditional IRA", "traditionalRetirementAssets", GROUPS.retirement, "Traditional IRA balance.", "ira|pre tax ira|traditional retirement"],
    ["rothIra", "Roth IRA", "rothTaxAdvantagedRetirementAssets", GROUPS.retirement, "Roth IRA balance.", "roth|tax advantaged retirement"],
    ["rolloverIra", "Rollover IRA", "traditionalRetirementAssets", GROUPS.retirement, "Rollover IRA balance.", "rollover|ira rollover"],
    ["inheritedIra", "Inherited IRA", "traditionalRetirementAssets", GROUPS.retirement, "Inherited IRA balance.", "beneficiary ira|inherited retirement"],
    ["inheritedRothIra", "Inherited Roth IRA", "rothTaxAdvantagedRetirementAssets", GROUPS.retirement, "Inherited Roth IRA balance.", "beneficiary roth|inherited roth"],
    ["sepIra", "SEP IRA", "traditionalRetirementAssets", GROUPS.retirement, "SEP IRA balance.", "sep|self employed pension"],
    ["simpleIra", "SIMPLE IRA", "traditionalRetirementAssets", GROUPS.retirement, "SIMPLE IRA balance.", "simple|small business ira"],
    ["traditional401k", "Traditional 401(k)", "traditionalRetirementAssets", GROUPS.retirement, "Pre-tax employer retirement account balance.", "401k|pre tax 401k"],
    ["roth401k", "Roth 401(k)", "rothTaxAdvantagedRetirementAssets", GROUPS.retirement, "Roth 401(k) balance.", "roth 401k|designated roth"],
    ["solo401k", "Solo 401(k)", "traditionalRetirementAssets", GROUPS.retirement, "Solo 401(k) balance.", "individual 401k|self employed 401k"],
    ["plan403b", "403(b)", "traditionalRetirementAssets", GROUPS.retirement, "Traditional 403(b) account balance.", "403b|teacher retirement"],
    ["roth403b", "Roth 403(b)", "rothTaxAdvantagedRetirementAssets", GROUPS.retirement, "Roth 403(b) account balance.", "roth 403b"],
    ["plan457b", "457(b)", "traditionalRetirementAssets", GROUPS.retirement, "457(b) deferred compensation plan balance.", "457b|deferred comp retirement"],
    ["governmental457b", "Governmental 457(b)", "traditionalRetirementAssets", GROUPS.retirement, "Governmental 457(b) plan balance.", "government 457|public 457"],
    ["nonGovernmental457b", "Non-Governmental 457(b)", "traditionalRetirementAssets", GROUPS.retirement, "Non-governmental 457(b) plan balance.", "private 457|non governmental 457"],
    ["thriftSavingsPlan", "Thrift Savings Plan", "traditionalRetirementAssets", GROUPS.retirement, "Federal Thrift Savings Plan balance.", "tsp|federal retirement"],
    ["pensionLumpSumValue", "Pension Lump-Sum Value", "traditionalRetirementAssets", GROUPS.retirement, "Estimated pension lump-sum value.", "pension lump sum|pension value"],
    ["cashBalancePension", "Cash Balance Pension", "traditionalRetirementAssets", GROUPS.retirement, "Cash balance pension account value.", "cash balance plan|pension"],
    ["definedBenefitPensionValue", "Defined Benefit Pension Value", "traditionalRetirementAssets", GROUPS.retirement, "Estimated defined benefit pension value.", "db pension|defined benefit"],
    ["profitSharingPlan", "Profit-Sharing Plan", "traditionalRetirementAssets", GROUPS.retirement, "Profit-sharing retirement plan balance.", "profit sharing|qualified plan"],
    ["moneyPurchasePlan", "Money Purchase Plan", "traditionalRetirementAssets", GROUPS.retirement, "Money purchase pension plan balance.", "money purchase pension"],
    ["keoghPlan", "Keogh Plan", "traditionalRetirementAssets", GROUPS.retirement, "Keogh retirement plan balance.", "keogh|self employed retirement"],
    ["deferredRetirementAccount", "Deferred Retirement Account", "traditionalRetirementAssets", GROUPS.retirement, "Deferred retirement account balance.", "deferred retirement"],
    ["qualifiedPlanBalance", "Qualified Plan Balance", "traditionalRetirementAssets", GROUPS.retirement, "Qualified retirement plan balance.", "qualified plan|retirement plan"],
    ["afterTax401kBalance", "After-Tax 401(k) Balance", "rothTaxAdvantagedRetirementAssets", GROUPS.retirement, "After-tax 401(k) balance.", "after tax 401k|tax advantaged retirement"],
    ["megaBackdoorRothBalance", "Mega Backdoor Roth Balance", "rothTaxAdvantagedRetirementAssets", GROUPS.retirement, "Mega backdoor Roth balance.", "mega backdoor roth|after tax roth"],
    ["selfDirectedIra", "Self-Directed IRA", "traditionalRetirementAssets", GROUPS.retirement, "Self-directed traditional IRA balance.", "sdira|self directed retirement"],
    ["selfDirectedRothIra", "Self-Directed Roth IRA", "rothTaxAdvantagedRetirementAssets", GROUPS.retirement, "Self-directed Roth IRA balance.", "self directed roth|roth sdira"],
    ["preciousMetalsIra", "Precious Metals IRA", "traditionalRetirementAssets", GROUPS.retirement, "Precious metals IRA balance.", "gold ira|metals ira"],
    ["realEstateIra", "Real Estate IRA", "traditionalRetirementAssets", GROUPS.retirement, "Self-directed IRA real estate value.", "ira real estate|self directed real estate"],

    ["qualifiedFixedAnnuity", "Qualified Fixed Annuity", "qualifiedAnnuities", GROUPS.annuities, "Qualified fixed annuity account value.", "qualified annuity|fixed annuity"],
    ["qualifiedVariableAnnuity", "Qualified Variable Annuity", "qualifiedAnnuities", GROUPS.annuities, "Qualified variable annuity account value.", "qualified va|variable annuity"],
    ["qualifiedIndexedAnnuity", "Qualified Indexed Annuity", "qualifiedAnnuities", GROUPS.annuities, "Qualified indexed annuity account value.", "fia|indexed annuity"],
    ["qualifiedImmediateAnnuity", "Qualified Immediate Annuity", "qualifiedAnnuities", GROUPS.annuities, "Qualified immediate annuity value.", "immediate annuity|spia"],
    ["qualifiedDeferredIncomeAnnuity", "Qualified Deferred Income Annuity", "qualifiedAnnuities", GROUPS.annuities, "Qualified deferred income annuity value.", "dia|deferred income annuity"],
    ["qualifiedLongevityAnnuityContract", "Qualified Longevity Annuity Contract", "qualifiedAnnuities", GROUPS.annuities, "Qualified longevity annuity contract value.", "qlac|longevity annuity"],
    ["nonqualifiedFixedAnnuity", "Nonqualified Fixed Annuity", "nonqualifiedAnnuities", GROUPS.annuities, "Nonqualified fixed annuity account value.", "nonqualified annuity|fixed annuity"],
    ["nonqualifiedVariableAnnuity", "Nonqualified Variable Annuity", "nonqualifiedAnnuities", GROUPS.annuities, "Nonqualified variable annuity account value.", "nonqualified va|variable annuity"],
    ["nonqualifiedIndexedAnnuity", "Nonqualified Indexed Annuity", "nonqualifiedAnnuities", GROUPS.annuities, "Nonqualified indexed annuity account value.", "indexed annuity|fia"],
    ["nonqualifiedImmediateAnnuity", "Nonqualified Immediate Annuity", "nonqualifiedAnnuities", GROUPS.annuities, "Nonqualified immediate annuity value.", "spia|immediate annuity"],
    ["nonqualifiedDeferredIncomeAnnuity", "Nonqualified Deferred Income Annuity", "nonqualifiedAnnuities", GROUPS.annuities, "Nonqualified deferred income annuity value.", "dia|deferred income annuity"],
    ["registeredIndexLinkedAnnuity", "Registered Index-Linked Annuity", "nonqualifiedAnnuities", GROUPS.annuities, "Registered index-linked annuity value.", "rila|index linked annuity"],
    ["structuredAnnuity", "Structured Annuity", "nonqualifiedAnnuities", GROUPS.annuities, "Structured annuity value.", "structured annuity"],
    ["privateAnnuity", "Private Annuity", "nonqualifiedAnnuities", GROUPS.annuities, "Private annuity value.", "private annuity"],
    ["charitableGiftAnnuity", "Charitable Gift Annuity", "nonqualifiedAnnuities", GROUPS.annuities, "Charitable gift annuity value.", "cga|charitable annuity"],
    ["annuityDeathBenefitValue", "Annuity Death Benefit Value", "nonqualifiedAnnuities", GROUPS.annuities, "Annuity death benefit value as a raw reported amount.", "annuity beneficiary value"],
    ["annuitySurrenderValue", "Annuity Surrender Value", "nonqualifiedAnnuities", GROUPS.annuities, "Annuity surrender value.", "surrender value|cash surrender"],
    ["annuityGuaranteedWithdrawalBenefit", "Annuity Guaranteed Withdrawal Benefit", "nonqualifiedAnnuities", GROUPS.annuities, "Guaranteed withdrawal benefit value.", "gwb|glwb|withdrawal benefit"],
    ["annuitySurvivorContinuationValue", "Annuity Survivor Continuation Value", "nonqualifiedAnnuities", GROUPS.annuities, "Survivor continuation value for an annuity.", "survivor continuation|annuity continuation"],

    ["primaryResidenceEquity", "Primary Residence Equity", "primaryResidenceEquity", GROUPS.realEstate, "Estimated equity in the primary residence.", "home equity|primary home"],
    ["secondHomeEquity", "Second Home Equity", "otherRealEstateEquity", GROUPS.realEstate, "Estimated equity in a second home.", "second home|secondary residence"],
    ["vacationHomeEquity", "Vacation Home Equity", "otherRealEstateEquity", GROUPS.realEstate, "Estimated equity in a vacation home.", "vacation home|secondary home"],
    ["rentalPropertyEquity", "Rental Property Equity", "otherRealEstateEquity", GROUPS.realEstate, "Estimated equity in rental real estate.", "rental|investment property"],
    ["shortTermRentalPropertyEquity", "Short-Term Rental Property Equity", "otherRealEstateEquity", GROUPS.realEstate, "Estimated equity in short-term rental real estate.", "short term rental|vacation rental"],
    ["commercialRealEstateEquity", "Commercial Real Estate Equity", "otherRealEstateEquity", GROUPS.realEstate, "Estimated equity in commercial real estate.", "commercial property|cre"],
    ["farmland", "Farmland", "otherRealEstateEquity", GROUPS.realEstate, "Estimated farmland equity value.", "farm land|agricultural land"],
    ["ranchLand", "Ranch Land", "otherRealEstateEquity", GROUPS.realEstate, "Estimated ranch land value.", "ranch|grazing land"],
    ["timberland", "Timberland", "otherRealEstateEquity", GROUPS.realEstate, "Estimated timberland value.", "timber|forest land"],
    ["rawLand", "Raw Land", "otherRealEstateEquity", GROUPS.realEstate, "Estimated raw land value.", "undeveloped land"],
    ["developmentLand", "Development Land", "otherRealEstateEquity", GROUPS.realEstate, "Estimated development land value.", "developable land"],
    ["multiFamilyPropertyEquity", "Multi-Family Property Equity", "otherRealEstateEquity", GROUPS.realEstate, "Estimated equity in multi-family real estate.", "multifamily|apartment property"],
    ["realEstatePartnershipInterest", "Real Estate Partnership Interest", "otherRealEstateEquity", GROUPS.realEstate, "Real estate partnership interest value.", "real estate partnership"],
    ["realEstateSyndicationInterest", "Real Estate Syndication Interest", "otherRealEstateEquity", GROUPS.realEstate, "Real estate syndication interest value.", "syndication|real estate syndicate"],
    ["privateReit", "Private REIT", "otherRealEstateEquity", GROUPS.realEstate, "Private real estate investment trust value.", "private reit|nontraded reit"],
    ["publicReit", "Public REIT", "taxableBrokerageInvestments", GROUPS.realEstate, "Publicly traded REIT holdings value.", "public reit|listed reit"],
    ["delawareStatutoryTrustInterest", "Delaware Statutory Trust Interest", "otherRealEstateEquity", GROUPS.realEstate, "Delaware statutory trust interest value.", "dst|statutory trust"],
    ["tenancyInCommonRealEstateInterest", "Tenancy-in-Common Real Estate Interest", "otherRealEstateEquity", GROUPS.realEstate, "Tenancy-in-common real estate interest value.", "tic|tenancy in common"],
    ["inheritedRealEstateInterest", "Inherited Real Estate Interest", "otherRealEstateEquity", GROUPS.realEstate, "Inherited real estate interest value.", "inherited property|estate property"],
    ["lifeEstateInterest", "Life Estate Interest", "otherRealEstateEquity", GROUPS.realEstate, "Life estate interest value.", "life estate"],
    ["remainderInterest", "Remainder Interest", "otherRealEstateEquity", GROUPS.realEstate, "Remainder interest value.", "remainder|future interest"],
    ["mineralRights", "Mineral Rights", "otherRealEstateEquity", GROUPS.realEstate, "Mineral rights value.", "oil rights|gas rights|mineral interest"],
    ["waterRights", "Water Rights", "otherRealEstateEquity", GROUPS.realEstate, "Water rights value.", "water interest"],
    ["airRights", "Air Rights", "otherRealEstateEquity", GROUPS.realEstate, "Air rights value.", "development rights|air space rights"],

    ["soleProprietorshipValue", "Sole Proprietorship Value", "businessPrivateCompanyValue", GROUPS.business, "Estimated value of a sole proprietorship.", "sole proprietor|business value"],
    ["llcMembershipInterest", "LLC Membership Interest", "businessPrivateCompanyValue", GROUPS.business, "LLC membership interest value.", "llc|membership interest"],
    ["partnershipInterest", "Partnership Interest", "businessPrivateCompanyValue", GROUPS.business, "Partnership interest value.", "partnership"],
    ["limitedPartnershipInterest", "Limited Partnership Interest", "businessPrivateCompanyValue", GROUPS.business, "Limited partnership interest value.", "lp interest|limited partner"],
    ["sCorpOwnershipValue", "S-Corp Ownership Value", "businessPrivateCompanyValue", GROUPS.business, "S corporation ownership value.", "s corp|s corporation"],
    ["cCorpOwnershipValue", "C-Corp Ownership Value", "businessPrivateCompanyValue", GROUPS.business, "C corporation ownership value.", "c corp|c corporation"],
    ["closelyHeldBusinessValue", "Closely Held Business Value", "businessPrivateCompanyValue", GROUPS.business, "Estimated value of closely held business ownership.", "closely held company|private business"],
    ["professionalPracticeValue", "Professional Practice Value", "businessPrivateCompanyValue", GROUPS.business, "Professional practice ownership value.", "practice value|professional firm"],
    ["medicalPracticeValue", "Medical Practice Value", "businessPrivateCompanyValue", GROUPS.business, "Medical practice ownership value.", "physician practice|doctor practice"],
    ["dentalPracticeValue", "Dental Practice Value", "businessPrivateCompanyValue", GROUPS.business, "Dental practice ownership value.", "dentist practice"],
    ["lawPracticeValue", "Law Practice Value", "businessPrivateCompanyValue", GROUPS.business, "Law practice ownership value.", "legal practice|law firm"],
    ["accountingPracticeValue", "Accounting Practice Value", "businessPrivateCompanyValue", GROUPS.business, "Accounting practice ownership value.", "cpa practice|accounting firm"],
    ["advisoryPracticeValue", "Advisory Practice Value", "businessPrivateCompanyValue", GROUPS.business, "Advisory practice ownership value.", "financial advisory|ria practice"],
    ["franchiseOwnershipValue", "Franchise Ownership Value", "businessPrivateCompanyValue", GROUPS.business, "Franchise ownership value.", "franchise"],
    ["familyBusinessInterest", "Family Business Interest", "businessPrivateCompanyValue", GROUPS.business, "Family business ownership interest value.", "family company"],
    ["buySellAgreementValue", "Buy-Sell Agreement Value", "businessPrivateCompanyValue", GROUPS.business, "Buy-sell agreement value.", "buy sell|business agreement"],
    ["businessLiquidationValue", "Business Liquidation Value", "businessPrivateCompanyValue", GROUPS.business, "Estimated business liquidation value.", "liquidation|forced sale"],
    ["businessBookValue", "Business Book Value", "businessPrivateCompanyValue", GROUPS.business, "Business book value.", "book value"],
    ["businessAppraisedValue", "Business Appraised Value", "businessPrivateCompanyValue", GROUPS.business, "Appraised business value.", "business appraisal|appraised company"],
    ["businessEnterpriseValue", "Business Enterprise Value", "businessPrivateCompanyValue", GROUPS.business, "Business enterprise value.", "enterprise value|company value"],
    ["ownerDistributionValue", "Owner Distribution Value", "businessPrivateCompanyValue", GROUPS.business, "Expected owner distribution value.", "owner distributions|profit distribution"],
    ["accountsReceivableBusiness", "Accounts Receivable", "businessPrivateCompanyValue", GROUPS.business, "Business accounts receivable value.", "ar|business receivable"],
    ["businessInventoryValue", "Business Inventory Value", "businessPrivateCompanyValue", GROUPS.business, "Business inventory value.", "inventory|company inventory"],
    ["businessEquipmentValue", "Business Equipment Value", "businessPrivateCompanyValue", GROUPS.business, "Business equipment value.", "company equipment|business machinery"],
    ["businessRealEstateEquity", "Business Real Estate Equity", "businessPrivateCompanyValue", GROUPS.business, "Business-owned real estate equity value.", "business property|company real estate"],
    ["keyPersonBenefit", "Key Person Benefit", "businessPrivateCompanyValue", GROUPS.business, "Business key person benefit value captured as a raw business asset fact.", "key person|business continuity benefit"],
    ["businessOwnedAssetAvailableToSurvivor", "Business-Owned Asset Available to Survivor", "businessPrivateCompanyValue", GROUPS.business, "Business-owned asset value reported as potentially available to the survivor.", "business owned asset|survivor business asset"],
    ["carriedInterest", "Carried Interest", "businessPrivateCompanyValue", GROUPS.business, "Carried interest value.", "carry|promote"],
    ["privateEquityInterest", "Private Equity Interest", "businessPrivateCompanyValue", GROUPS.business, "Private equity interest value.", "pe interest|private equity"],
    ["ventureCapitalInterest", "Venture Capital Interest", "businessPrivateCompanyValue", GROUPS.business, "Venture capital interest value.", "vc interest|venture investment"],
    ["startupEquity", "Startup Equity", "businessPrivateCompanyValue", GROUPS.business, "Startup equity value.", "startup shares|startup ownership"],
    ["founderShares", "Founder Shares", "businessPrivateCompanyValue", GROUPS.business, "Founder share value.", "founder stock|founder equity"],

    ["restrictedStockUnits", "Restricted Stock Units", "stockCompensationDeferredCompensation", GROUPS.stockCompensation, "Restricted stock unit value.", "rsu|rsus|restricted stock units"],
    ["performanceStockUnits", "Performance Stock Units", "stockCompensationDeferredCompensation", GROUPS.stockCompensation, "Performance stock unit value.", "psu|performance shares"],
    ["restrictedStockAwards", "Restricted Stock Awards", "stockCompensationDeferredCompensation", GROUPS.stockCompensation, "Restricted stock award value.", "rsa|restricted stock"],
    ["employeeStockPurchasePlan", "Employee Stock Purchase Plan", "stockCompensationDeferredCompensation", GROUPS.stockCompensation, "Employee stock purchase plan value.", "espp|employee stock"],
    ["incentiveStockOptions", "Incentive Stock Options", "stockCompensationDeferredCompensation", GROUPS.stockCompensation, "Incentive stock option value.", "iso|stock options"],
    ["nonqualifiedStockOptions", "Nonqualified Stock Options", "stockCompensationDeferredCompensation", GROUPS.stockCompensation, "Nonqualified stock option value.", "nso|nqso|stock options"],
    ["vestedStockOptions", "Vested Stock Options", "stockCompensationDeferredCompensation", GROUPS.stockCompensation, "Vested stock option value.", "vested options"],
    ["unvestedStockOptions", "Unvested Stock Options", "stockCompensationDeferredCompensation", GROUPS.stockCompensation, "Unvested stock option value.", "unvested options"],
    ["phantomStock", "Phantom Stock", "stockCompensationDeferredCompensation", GROUPS.stockCompensation, "Phantom stock value.", "phantom equity"],
    ["stockAppreciationRights", "Stock Appreciation Rights", "stockCompensationDeferredCompensation", GROUPS.stockCompensation, "Stock appreciation right value.", "sar|appreciation rights"],
    ["deferredCompensationPlan", "Deferred Compensation Plan", "stockCompensationDeferredCompensation", GROUPS.stockCompensation, "Deferred compensation plan value.", "deferred comp|deferred compensation"],
    ["nonqualifiedDeferredCompensation", "Nonqualified Deferred Compensation", "stockCompensationDeferredCompensation", GROUPS.stockCompensation, "Nonqualified deferred compensation balance.", "nqdc|nonqualified deferred comp"],
    ["serpBenefit", "SERP Benefit", "stockCompensationDeferredCompensation", GROUPS.stockCompensation, "Supplemental executive retirement plan benefit value.", "serp|executive retirement"],
    ["executiveBonusPlanValue", "Executive Bonus Plan Value", "stockCompensationDeferredCompensation", GROUPS.stockCompensation, "Executive bonus plan value.", "executive bonus"],
    ["goldenParachuteBenefit", "Golden Parachute Benefit", "stockCompensationDeferredCompensation", GROUPS.stockCompensation, "Golden parachute benefit value.", "golden parachute|change in control"],
    ["severanceBenefit", "Severance Benefit", "stockCompensationDeferredCompensation", GROUPS.stockCompensation, "Severance benefit value.", "severance"],
    ["retentionBonus", "Retention Bonus", "stockCompensationDeferredCompensation", GROUPS.stockCompensation, "Retention bonus value.", "retention|stay bonus"],
    ["unpaidBonus", "Unpaid Bonus", "stockCompensationDeferredCompensation", GROUPS.stockCompensation, "Unpaid bonus value.", "bonus receivable|earned bonus"],
    ["commissionReceivableCompensation", "Commission Receivable", "stockCompensationDeferredCompensation", GROUPS.stockCompensation, "Commission receivable tied to employment or compensation.", "commission|sales commission"],
    ["employerStockAccount", "Employer Stock Account", "stockCompensationDeferredCompensation", GROUPS.stockCompensation, "Employer stock account value.", "company stock|employer shares"],
    ["employeeOwnershipPlan", "Employee Ownership Plan", "stockCompensationDeferredCompensation", GROUPS.stockCompensation, "Employee ownership plan value.", "employee ownership"],
    ["esopBalance", "ESOP Balance", "stockCompensationDeferredCompensation", GROUPS.stockCompensation, "Employee stock ownership plan balance.", "esop|employee stock ownership"],
    ["profitInterestUnits", "Profit Interest Units", "stockCompensationDeferredCompensation", GROUPS.stockCompensation, "Profit interest unit value.", "profits interest|profit units"],
    ["carriedInterestUnits", "Carried Interest Units", "stockCompensationDeferredCompensation", GROUPS.stockCompensation, "Carried interest unit value.", "carry units|carried interest"],

    ["plan529Account", "529 Plan", "educationSpecificSavings", GROUPS.education, "Education-dedicated 529 plan account value.", "529|college savings|education savings"],
    ["multiple529Plans", "Multiple 529 Plans", "educationSpecificSavings", GROUPS.education, "Combined value of multiple 529 plan accounts.", "529 plans|college savings plans"],
    ["coverdellEsa", "Coverdell ESA", "educationSpecificSavings", GROUPS.education, "Coverdell education savings account value.", "coverdell|esa"],
    ["utmaAccount", "UTMA Account", "educationSpecificSavings", GROUPS.education, "Uniform Transfers to Minors Act account value.", "utma|custodial account"],
    ["ugmaAccount", "UGMA Account", "educationSpecificSavings", GROUPS.education, "Uniform Gifts to Minors Act account value.", "ugma|custodial account"],
    ["prepaidTuitionPlan", "Prepaid Tuition Plan", "educationSpecificSavings", GROUPS.education, "Prepaid tuition plan value.", "prepaid tuition"],
    ["educationSavingsAccount", "Education Savings Account", "educationSpecificSavings", GROUPS.education, "Education savings account value.", "esa|education account"],
    ["dedicatedEducationBrokerageAccount", "Dedicated Education Brokerage Account", "educationSpecificSavings", GROUPS.education, "Taxable brokerage account dedicated to education funding.", "education brokerage|college brokerage"],
    ["dedicatedEducationSavingsAccount", "Dedicated Education Savings Account", "educationSpecificSavings", GROUPS.education, "Savings account dedicated to education funding.", "education savings|college savings"],
    ["scholarshipFund", "Scholarship Fund", "educationSpecificSavings", GROUPS.education, "Scholarship fund value.", "scholarship|education fund"],
    ["grandparentOwned529Plan", "Grandparent-Owned 529 Plan", "educationSpecificSavings", GROUPS.education, "Grandparent-owned 529 plan value reported for planning context.", "grandparent 529|529"],
    ["custodialEducationAccount", "Custodial Education Account", "educationSpecificSavings", GROUPS.education, "Custodial account intended for education funding.", "custodial education|utma education"],
    ["ableEducationAccount", "ABLE Account", "educationSpecificSavings", GROUPS.education, "ABLE account value when used as an education or disability-related savings source.", "able|529a|disability savings"],
    ["educationTrust", "Education Trust", "educationSpecificSavings", GROUPS.education, "Trust assets dedicated to education funding.", "education trust|college trust"],

    ["revocableTrustAssets", "Revocable Trust Assets", "trustRestrictedAssets", GROUPS.trustRestricted, "Revocable trust asset value.", "living trust|revocable trust"],
    ["irrevocableTrustAssets", "Irrevocable Trust Assets", "trustRestrictedAssets", GROUPS.trustRestricted, "Irrevocable trust asset value.", "irrevocable trust"],
    ["spousalLifetimeAccessTrustAssets", "Spousal Lifetime Access Trust Assets", "trustRestrictedAssets", GROUPS.trustRestricted, "Spousal lifetime access trust asset value.", "slat|spousal lifetime access trust"],
    ["creditShelterTrustAssets", "Credit Shelter Trust Assets", "trustRestrictedAssets", GROUPS.trustRestricted, "Credit shelter trust asset value.", "credit shelter|bypass trust"],
    ["bypassTrustAssets", "Bypass Trust Assets", "trustRestrictedAssets", GROUPS.trustRestricted, "Bypass trust asset value.", "bypass trust|credit shelter"],
    ["maritalTrustAssets", "Marital Trust Assets", "trustRestrictedAssets", GROUPS.trustRestricted, "Marital trust asset value.", "marital trust"],
    ["qtipTrustAssets", "QTIP Trust Assets", "trustRestrictedAssets", GROUPS.trustRestricted, "Qualified terminable interest property trust asset value.", "qtip|marital trust"],
    ["specialNeedsTrustAssets", "Special Needs Trust Assets", "trustRestrictedAssets", GROUPS.trustRestricted, "Special needs trust asset value.", "snt|special needs"],
    ["spendthriftTrustAssets", "Spendthrift Trust Assets", "trustRestrictedAssets", GROUPS.trustRestricted, "Spendthrift trust asset value.", "spendthrift"],
    ["dynastyTrustAssets", "Dynasty Trust Assets", "trustRestrictedAssets", GROUPS.trustRestricted, "Dynasty trust asset value.", "dynasty trust"],
    ["grantorTrustAssets", "Grantor Trust Assets", "trustRestrictedAssets", GROUPS.trustRestricted, "Grantor trust asset value.", "grantor trust"],
    ["nonGrantorTrustAssets", "Non-Grantor Trust Assets", "trustRestrictedAssets", GROUPS.trustRestricted, "Non-grantor trust asset value.", "non grantor trust"],
    ["charitableRemainderTrustInterest", "Charitable Remainder Trust Interest", "trustRestrictedAssets", GROUPS.trustRestricted, "Charitable remainder trust interest value.", "crt|charitable remainder"],
    ["charitableLeadTrustInterest", "Charitable Lead Trust Interest", "trustRestrictedAssets", GROUPS.trustRestricted, "Charitable lead trust interest value.", "clt|charitable lead"],
    ["testamentaryTrustInterest", "Testamentary Trust Interest", "trustRestrictedAssets", GROUPS.trustRestricted, "Testamentary trust interest value.", "testamentary trust"],
    ["trustDistributionRight", "Trust Distribution Right", "trustRestrictedAssets", GROUPS.trustRestricted, "Value of a trust distribution right.", "trust distribution"],
    ["trustRemainderInterest", "Trust Remainder Interest", "trustRestrictedAssets", GROUPS.trustRestricted, "Trust remainder interest value.", "remainder interest"],
    ["estateReceivable", "Estate Receivable", "trustRestrictedAssets", GROUPS.trustRestricted, "Estate receivable value.", "estate|receivable"],
    ["inheritanceReceivable", "Inheritance Receivable", "trustRestrictedAssets", GROUPS.trustRestricted, "Expected inheritance receivable value.", "inheritance|estate receivable"],
    ["probateAsset", "Probate Asset", "trustRestrictedAssets", GROUPS.trustRestricted, "Probate asset value.", "probate|estate asset"],
    ["restrictedInheritance", "Restricted Inheritance", "trustRestrictedAssets", GROUPS.trustRestricted, "Restricted inheritance value.", "inheritance restriction"],
    ["familyLimitedPartnershipInterest", "Family Limited Partnership Interest", "trustRestrictedAssets", GROUPS.trustRestricted, "Family limited partnership interest value.", "flp|family partnership"],
    ["familyLlcInterest", "Family LLC Interest", "trustRestrictedAssets", GROUPS.trustRestricted, "Family LLC interest value.", "family llc"],

    ["socialSecuritySurvivorBenefit", "Social Security Survivor Benefit", "otherCustomAsset", GROUPS.incomeBenefits, "Income-stream or benefit-style entry, not an ordinary liquid asset. Treatment is controlled in Analysis Setup.", "social security|survivor benefit"],
    ["socialSecurityChildBenefit", "Social Security Child Benefit", "otherCustomAsset", GROUPS.incomeBenefits, "Income-stream or benefit-style entry, not an ordinary liquid asset. Treatment is controlled in Analysis Setup.", "social security child|child benefit"],
    ["widowWidowerBenefit", "Widow/Widower Benefit", "otherCustomAsset", GROUPS.incomeBenefits, "Income-stream or benefit-style entry, not an ordinary liquid asset. Treatment is controlled in Analysis Setup.", "widow benefit|widower benefit"],
    ["pensionSurvivorBenefit", "Pension Survivor Benefit", "otherCustomAsset", GROUPS.incomeBenefits, "Income-stream or benefit-style entry, not an ordinary liquid asset. Treatment is controlled in Analysis Setup.", "pension benefit|survivor pension"],
    ["jointAndSurvivorPensionBenefit", "Joint and Survivor Pension Benefit", "otherCustomAsset", GROUPS.incomeBenefits, "Income-stream or benefit-style entry, not an ordinary liquid asset. Treatment is controlled in Analysis Setup.", "joint survivor pension|pension survivor"],
    ["militarySurvivorBenefitPlan", "Military Survivor Benefit Plan", "otherCustomAsset", GROUPS.incomeBenefits, "Income-stream or benefit-style entry, not an ordinary liquid asset. Treatment is controlled in Analysis Setup.", "sbp|military survivor"],
    ["veteransSurvivorBenefit", "Veterans Survivor Benefit", "otherCustomAsset", GROUPS.incomeBenefits, "Income-stream or benefit-style entry, not an ordinary liquid asset. Treatment is controlled in Analysis Setup.", "va survivor|veterans benefit"],
    ["railroadRetirementSurvivorBenefit", "Railroad Retirement Survivor Benefit", "otherCustomAsset", GROUPS.incomeBenefits, "Income-stream or benefit-style entry, not an ordinary liquid asset. Treatment is controlled in Analysis Setup.", "railroad retirement|rrb survivor"],
    ["civilServiceSurvivorBenefit", "Civil Service Survivor Benefit", "otherCustomAsset", GROUPS.incomeBenefits, "Income-stream or benefit-style entry, not an ordinary liquid asset. Treatment is controlled in Analysis Setup.", "civil service|federal survivor"],
    ["publicEmployeeSurvivorBenefit", "Public Employee Survivor Benefit", "otherCustomAsset", GROUPS.incomeBenefits, "Income-stream or benefit-style entry, not an ordinary liquid asset. Treatment is controlled in Analysis Setup.", "public pension survivor"],
    ["unionSurvivorBenefit", "Union Survivor Benefit", "otherCustomAsset", GROUPS.incomeBenefits, "Income-stream or benefit-style entry, not an ordinary liquid asset. Treatment is controlled in Analysis Setup.", "union benefit"],
    ["workersCompensationSurvivorBenefit", "Workers Compensation Survivor Benefit", "otherCustomAsset", GROUPS.incomeBenefits, "Income-stream or benefit-style entry, not an ordinary liquid asset. Treatment is controlled in Analysis Setup.", "workers comp|survivor compensation"],
    ["disabilitySurvivorBenefit", "Disability Survivor Benefit", "otherCustomAsset", GROUPS.incomeBenefits, "Income-stream or benefit-style entry, not an ordinary liquid asset. Treatment is controlled in Analysis Setup.", "disability benefit"],
    ["structuredSettlementIncome", "Structured Settlement Income", "otherCustomAsset", GROUPS.incomeBenefits, "Income-stream or benefit-style entry, not an ordinary liquid asset. Treatment is controlled in Analysis Setup.", "structured settlement"],
    ["legalSettlementIncome", "Legal Settlement Income", "otherCustomAsset", GROUPS.incomeBenefits, "Income-stream or benefit-style entry, not an ordinary liquid asset. Treatment is controlled in Analysis Setup.", "settlement income"],
    ["alimonyReceivable", "Alimony Receivable", "otherCustomAsset", GROUPS.incomeBenefits, "Income-stream or benefit-style entry, not an ordinary liquid asset. Treatment is controlled in Analysis Setup.", "spousal support|maintenance receivable"],
    ["childSupportReceivable", "Child Support Receivable", "otherCustomAsset", GROUPS.incomeBenefits, "Income-stream or benefit-style entry, not an ordinary liquid asset. Treatment is controlled in Analysis Setup.", "child support"],
    ["royaltyIncomeStream", "Royalty Income Stream", "otherCustomAsset", GROUPS.incomeBenefits, "Income-stream or benefit-style entry, not an ordinary liquid asset. Treatment is controlled in Analysis Setup.", "royalties|royalty income"],
    ["licensingIncomeStream", "Licensing Income Stream", "otherCustomAsset", GROUPS.incomeBenefits, "Income-stream or benefit-style entry, not an ordinary liquid asset. Treatment is controlled in Analysis Setup.", "licensing|license income"],
    ["rentalIncomeStream", "Rental Income Stream", "otherCustomAsset", GROUPS.incomeBenefits, "Income-stream or benefit-style entry, not an ordinary liquid asset. Treatment is controlled in Analysis Setup.", "rental income"],
    ["businessContinuationIncome", "Business Continuation Income", "otherCustomAsset", GROUPS.incomeBenefits, "Income-stream or benefit-style entry, not an ordinary liquid asset. Treatment is controlled in Analysis Setup.", "business continuation|continuation income"],

    ["bitcoin", "Bitcoin", "digitalAssetsCrypto", GROUPS.alternative, "Bitcoin holdings value.", "btc|crypto"],
    ["ethereum", "Ethereum", "digitalAssetsCrypto", GROUPS.alternative, "Ethereum holdings value.", "eth|crypto"],
    ["cryptocurrencyPortfolio", "Cryptocurrency Portfolio", "digitalAssetsCrypto", GROUPS.alternative, "Cryptocurrency portfolio value.", "crypto portfolio|digital assets"],
    ["stablecoins", "Stablecoins", "digitalAssetsCrypto", GROUPS.alternative, "Stablecoin holdings value.", "stablecoin|usdc|usdt"],
    ["digitalWallet", "Digital Wallet", "digitalAssetsCrypto", GROUPS.alternative, "Digital wallet asset value.", "crypto wallet|wallet"],
    ["exchangeAccount", "Exchange Account", "digitalAssetsCrypto", GROUPS.alternative, "Digital asset exchange account value.", "crypto exchange|coinbase|exchange"],
    ["coldStorageWallet", "Cold Storage Wallet", "digitalAssetsCrypto", GROUPS.alternative, "Cold storage digital asset wallet value.", "cold wallet|hardware wallet"],
    ["nftPortfolio", "NFT Portfolio", "digitalAssetsCrypto", GROUPS.alternative, "NFT portfolio value.", "nft|tokenized media"],
    ["tokenizedAssets", "Tokenized Assets", "digitalAssetsCrypto", GROUPS.alternative, "Tokenized asset holdings value.", "tokenized|tokens"],
    ["privateCryptoInvestment", "Private Crypto Investment", "digitalAssetsCrypto", GROUPS.alternative, "Private crypto or digital asset investment value.", "private crypto|digital investment"],
    ["cryptoMiningEquipmentValue", "Crypto Mining Equipment Value", "digitalAssetsCrypto", GROUPS.alternative, "Crypto mining equipment value as a digital-asset-related business asset fact.", "mining equipment|crypto mining"],
    ["preciousMetals", "Precious Metals", "digitalAssetsCrypto", GROUPS.alternative, "Precious metals value.", "metals|bullion"],
    ["gold", "Gold", "digitalAssetsCrypto", GROUPS.alternative, "Gold holdings value.", "gold bullion|precious metal"],
    ["silver", "Silver", "digitalAssetsCrypto", GROUPS.alternative, "Silver holdings value.", "silver bullion|precious metal"],
    ["platinum", "Platinum", "digitalAssetsCrypto", GROUPS.alternative, "Platinum holdings value.", "platinum bullion|precious metal"],
    ["commodityFund", "Commodity Fund", "digitalAssetsCrypto", GROUPS.alternative, "Commodity fund value.", "commodities|commodity investment"],
    ["managedFuturesAccount", "Managed Futures Account", "digitalAssetsCrypto", GROUPS.alternative, "Managed futures account value.", "managed futures|cta"],
    ["hedgeFundInterest", "Hedge Fund Interest", "digitalAssetsCrypto", GROUPS.alternative, "Hedge fund interest value.", "hedge fund"],
    ["privateCreditFund", "Private Credit Fund", "digitalAssetsCrypto", GROUPS.alternative, "Private credit fund value.", "private credit"],
    ["intervalFund", "Interval Fund", "digitalAssetsCrypto", GROUPS.alternative, "Interval fund value.", "interval fund"],
    ["tenderOfferFund", "Tender Offer Fund", "digitalAssetsCrypto", GROUPS.alternative, "Tender offer fund value.", "tender fund"],
    ["privateRealEstateFund", "Private Real Estate Fund", "otherRealEstateEquity", GROUPS.alternative, "Private real estate fund value.", "real estate fund|private real estate"],
    ["privateInfrastructureFund", "Private Infrastructure Fund", "digitalAssetsCrypto", GROUPS.alternative, "Private infrastructure fund value.", "infrastructure|private infrastructure"],
    ["privateDebtInvestment", "Private Debt Investment", "digitalAssetsCrypto", GROUPS.alternative, "Private debt investment value.", "private debt|direct lending"],

    ["promissoryNoteReceivable", "Promissory Note Receivable", "otherCustomAsset", GROUPS.receivables, "Promissory note receivable value.", "promissory note|note receivable"],
    ["privateLoanReceivable", "Private Loan Receivable", "otherCustomAsset", GROUPS.receivables, "Private loan receivable value.", "private loan|loan receivable"],
    ["sellerFinancingNote", "Seller Financing Note", "otherCustomAsset", GROUPS.receivables, "Seller financing note value.", "seller note|seller financing"],
    ["installmentSaleReceivable", "Installment Sale Receivable", "otherCustomAsset", GROUPS.receivables, "Installment sale receivable value.", "installment sale"],
    ["legalSettlementReceivable", "Legal Settlement Receivable", "otherCustomAsset", GROUPS.receivables, "Legal settlement receivable value.", "settlement receivable"],
    ["insuranceSettlementReceivable", "Insurance Settlement Receivable", "otherCustomAsset", GROUPS.receivables, "Insurance settlement receivable value.", "settlement|claim receivable"],
    ["taxRefundReceivable", "Tax Refund Receivable", "otherCustomAsset", GROUPS.receivables, "Expected tax refund receivable value.", "tax refund"],
    ["businessSaleReceivable", "Business Sale Receivable", "businessPrivateCompanyValue", GROUPS.receivables, "Business sale receivable value.", "business sale|sale proceeds"],
    ["earnoutReceivable", "Earnout Receivable", "businessPrivateCompanyValue", GROUPS.receivables, "Earnout receivable value.", "earnout|contingent payment"],
    ["deferredSaleProceeds", "Deferred Sale Proceeds", "otherCustomAsset", GROUPS.receivables, "Deferred sale proceeds value.", "deferred proceeds"],
    ["royaltyReceivable", "Royalty Receivable", "otherCustomAsset", GROUPS.receivables, "Royalty receivable value.", "royalty|royalties"],
    ["licensingReceivable", "Licensing Receivable", "otherCustomAsset", GROUPS.receivables, "Licensing receivable value.", "license receivable"],
    ["contractCommissionReceivable", "Contract Commission Receivable", "otherCustomAsset", GROUPS.receivables, "Contractual commission receivable value.", "commission receivable|sales receivable"],
    ["bonusReceivable", "Bonus Receivable", "stockCompensationDeferredCompensation", GROUPS.receivables, "Bonus receivable value.", "bonus|earned bonus"],
    ["severanceReceivable", "Severance Receivable", "stockCompensationDeferredCompensation", GROUPS.receivables, "Severance receivable value.", "severance|severance pay"],
    ["contractualDeathBenefit", "Contractual Death Benefit", "otherCustomAsset", GROUPS.receivables, "Contractual death benefit receivable value that is not existing coverage inventory.", "contractual benefit|death benefit receivable"],

    ["hsaBalance", "HSA Balance", "otherCustomAsset", GROUPS.specialCase, "Health savings account balance.", "hsa|health savings account"],
    ["ableAccount", "ABLE Account", "educationSpecificSavings", GROUPS.specialCase, "ABLE account value.", "able|529a|disability savings"],
    ["foreignBankAccount", "Foreign Bank Account", "cashAndCashEquivalents", GROUPS.specialCase, "Foreign bank account balance.", "foreign account|foreign deposit"],
    ["foreignInvestmentAccount", "Foreign Investment Account", "taxableBrokerageInvestments", GROUPS.specialCase, "Foreign investment account value.", "foreign brokerage|foreign investments"],
    ["foreignPension", "Foreign Pension", "traditionalRetirementAssets", GROUPS.specialCase, "Foreign pension value.", "foreign retirement|foreign pension plan"],
    ["foreignRealEstate", "Foreign Real Estate", "otherRealEstateEquity", GROUPS.specialCase, "Foreign real estate equity value.", "foreign property|international real estate"],
    ["offshoreTrustInterest", "Offshore Trust Interest", "trustRestrictedAssets", GROUPS.specialCase, "Offshore trust interest value.", "offshore trust"],
    ["communityPropertyShare", "Community Property Share", "otherCustomAsset", GROUPS.specialCase, "Community property share value.", "community property"],
    ["separatePropertyAsset", "Separate Property Asset", "otherCustomAsset", GROUPS.specialCase, "Separate property asset value.", "separate property"],
    ["maritalPropertySettlementAsset", "Marital Property Settlement Asset", "otherCustomAsset", GROUPS.specialCase, "Marital property settlement asset value.", "marital settlement|property settlement"],
    ["divorceSettlementReceivable", "Divorce Settlement Receivable", "otherCustomAsset", GROUPS.specialCase, "Divorce settlement receivable value.", "divorce settlement"],
    ["prenuptialAgreementAsset", "Prenuptial Agreement Asset", "otherCustomAsset", GROUPS.specialCase, "Prenuptial agreement asset value.", "prenup|prenuptial"],
    ["postnuptialAgreementAsset", "Postnuptial Agreement Asset", "otherCustomAsset", GROUPS.specialCase, "Postnuptial agreement asset value.", "postnup|postnuptial"],
    ["restrictedAccount", "Restricted Account", "trustRestrictedAssets", GROUPS.specialCase, "Restricted account value.", "restricted asset|limited access account"],
    ["pledgedAsset", "Pledged Asset", "trustRestrictedAssets", GROUPS.specialCase, "Pledged asset value.", "pledged|collateral"],
    ["collateralAccount", "Collateral Account", "trustRestrictedAssets", GROUPS.specialCase, "Collateral account value.", "collateral|secured account"],
    ["frozenAsset", "Frozen Asset", "trustRestrictedAssets", GROUPS.specialCase, "Frozen asset value.", "frozen|restricted"],
    ["litigationAsset", "Litigation Asset", "otherCustomAsset", GROUPS.specialCase, "Litigation-related asset value.", "litigation|legal claim"],
    ["bankruptcyEstateInterest", "Bankruptcy Estate Interest", "trustRestrictedAssets", GROUPS.specialCase, "Bankruptcy estate interest value.", "bankruptcy estate"],

    ["otherLiquidAsset", "Other Liquid Asset", "otherCustomAsset", GROUPS.custom, "Other advisor-defined liquid asset value.", "custom liquid|other cash", true],
    ["otherInvestmentAsset", "Other Investment Asset", "otherCustomAsset", GROUPS.custom, "Other advisor-defined investment asset value.", "custom investment", true],
    ["otherRetirementAsset", "Other Retirement Asset", "otherCustomAsset", GROUPS.custom, "Other advisor-defined retirement asset value.", "custom retirement", true],
    ["otherRealEstateAsset", "Other Real Estate Asset", "otherCustomAsset", GROUPS.custom, "Other advisor-defined real estate asset value.", "custom real estate", true],
    ["otherBusinessAsset", "Other Business Asset", "otherCustomAsset", GROUPS.custom, "Other advisor-defined business asset value.", "custom business", true],
    ["otherRestrictedAsset", "Other Restricted Asset", "otherCustomAsset", GROUPS.custom, "Other advisor-defined restricted asset value.", "custom restricted", true],
    ["otherIncomeStream", "Other Income Stream", "otherCustomAsset", GROUPS.custom, "Other advisor-defined income-stream style value.", "custom income|income stream", true],
    ["otherCustomAsset", "Other Custom Asset", "otherCustomAsset", GROUPS.custom, "Advisor-defined raw asset value not covered by the standard library.", "custom|misc asset|other asset", true]
  ]);

  function splitAliases(value) {
    return String(value == null ? "" : value)
      .split("|")
      .map(function (alias) {
        return alias.trim();
      })
      .filter(Boolean);
  }

  function toAssetLibraryEntry(definition) {
    const aliases = splitAliases(definition[5]);
    const categoryLabel = CATEGORY_LABELS[definition[2]];
    if (categoryLabel && aliases.indexOf(categoryLabel) === -1) {
      aliases.push(categoryLabel);
    }

    return Object.freeze({
      typeKey: definition[0],
      label: definition[1],
      categoryKey: definition[2],
      group: definition[3],
      description: definition[4],
      aliases: Object.freeze(aliases),
      isCustomType: definition[6] === true
    });
  }

  const ASSET_LIBRARY_ENTRIES = Object.freeze(
    RAW_ASSET_LIBRARY_ENTRIES.map(toAssetLibraryEntry)
  );

  const ASSET_LIBRARY_GROUPS = Object.freeze(
    ASSET_LIBRARY_ENTRIES.reduce(function (groups, entry) {
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

  function getAssetLibraryEntries() {
    return ASSET_LIBRARY_ENTRIES.map(cloneEntry);
  }

  function findAssetLibraryEntry(typeKey) {
    const normalizedTypeKey = String(typeKey == null ? "" : typeKey).trim();
    if (!normalizedTypeKey) {
      return null;
    }

    const entry = ASSET_LIBRARY_ENTRIES.find(function (candidate) {
      return candidate.typeKey === normalizedTypeKey;
    });
    return entry ? cloneEntry(entry) : null;
  }

  lensAnalysis.assetLibrary = Object.freeze({
    ASSET_LIBRARY_ENTRIES,
    ASSET_LIBRARY_GROUPS,
    getAssetLibraryEntries,
    findAssetLibraryEntry
  });
})(window);
