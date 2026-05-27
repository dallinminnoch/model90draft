(function (global) {
  const LensApp = global.LensApp || (global.LensApp = {});
  const lensAnalysis = LensApp.lensAnalysis || (LensApp.lensAnalysis = {});

  // Owner: PMI expense records controller.
  // Purpose: collect repeatable Additional Expenses records from PMI.
  // Healthcare bucket rows can affect Needs healthcareExpenses automatically;
  // non-healthcare rows remain raw-only for current output, and
  // continuationStatus is future support-treatment metadata.
  // Non-goals: no normalization, no formulas, no inflation/projection math,
  // no treatment assumptions, no Step 3 wiring, and no storage access.

  let generatedExpenseIdCounter = 0;
  let activeController = null;
  const STARTER_EXPENSE_TYPE_KEYS = Object.freeze([
    "householdInsurancePremiums",
    "medicalOutOfPocket",
    "groceries",
    "householdTransportation",
    "childcareExpense",
    "internetPhone",
    "householdConsumablesSupplies",
    "entertainmentRecreation",
    "recurringPersonalSpendingDefault"
  ]);
  const STARTER_EXPENSE_LABELS = Object.freeze({
    householdInsurancePremiums: "Non-Housing Monthly Insurance",
    medicalOutOfPocket: "Healthcare / Out-of-Pocket Medical",
    groceries: "Monthly Food / Grocery Cost",
    householdTransportation: "Monthly Transportation Cost",
    childcareExpense: "Childcare / Dependent Care",
    internetPhone: "Phone / Internet",
    householdConsumablesSupplies: "Household Essentials / Supplies",
    entertainmentRecreation: "Entertainment / Travel",
    recurringPersonalSpendingDefault: "Recurring Personal Spending"
  });
  const SAVINGS_HABIT_CATEGORY_KEY = "savingsGoalContributions";
  const SAVINGS_HABIT_TYPE_KEYS = Object.freeze([
    "hsaContributions",
    "retirementContributions",
    "brokerageInvestmentContributions",
    "educationSavingsContributions",
    "emergencyFundContributions",
    "sinkingFundContributions",
    "vacationLifestyleGoalContributions",
    "vehicleReplacementContributions",
    "homeRepairReserveContributions",
    "taxReserveContributions",
    "businessReserveContributions",
    "charitableGivingReserve",
    "familyEventWeddingSavings",
    "downPaymentSavings",
    "otherGoalSavings"
  ]);
  const DEFAULT_SAVINGS_HABIT_TARGET_ASSET_CATEGORIES = Object.freeze({
    retirementContributions: "traditionalRetirementAssets",
    brokerageInvestmentContributions: "taxableBrokerageInvestments",
    educationSavingsContributions: "educationSpecificSavings",
    emergencyFundContributions: "emergencyFund",
    sinkingFundContributions: "cashAndCashEquivalents",
    vacationLifestyleGoalContributions: "cashAndCashEquivalents",
    vehicleReplacementContributions: "cashAndCashEquivalents",
    homeRepairReserveContributions: "cashAndCashEquivalents",
    taxReserveContributions: "cashAndCashEquivalents",
    businessReserveContributions: "cashAndCashEquivalents",
    charitableGivingReserve: "cashAndCashEquivalents",
    familyEventWeddingSavings: "cashAndCashEquivalents",
    downPaymentSavings: "cashAndCashEquivalents",
    otherGoalSavings: "cashAndCashEquivalents"
  });
  const DEFAULT_RECORD_SCOPE = "expenses";
  const SAVINGS_RECORD_SCOPE = "savingsHabits";
  const RECORD_SCOPE_CONFIGS = Object.freeze({
    expenses: Object.freeze({
      scope: DEFAULT_RECORD_SCOPE,
      heading: "Additional Expenses",
      copy: "\"Continues after death?\" is saved for future support-treatment review. Review overlap with starter expense rows to avoid duplicate entry.",
      addButtonLabel: "Add Expense",
      modalTitle: "Add Expense",
      modalTitleId: "pmi-expense-library-title",
      modalCloseLabel: "Close expense library",
      modalDescription: "Add expenses not already captured by the starter expense rows. Healthcare bucket rows remain saved as healthcare-sensitive facts; non-healthcare rows remain saved raw facts unless another LENS component explicitly owns them.",
      searchPlaceholder: "Search expense types",
      filterLabel: "Expense library views",
      allFilterLabel: "All Expenses",
      recentEmptyText: "No recent expenses added in this session.",
      searchEmptyText: "No matching initial expense types found.",
      groupSingularLabel: "expense type",
      groupPluralLabel: "expense types",
      tableLabel: "Expense records notebook",
      typeColumnLabel: "Expense Type",
      labelColumnLabel: "Label / Vendor",
      amountLabel: "Amount",
      removeButtonPrefix: "Remove",
      accessibleTypePrefix: "Expense type",
      suggestedTypeKeys: Object.freeze([
        "healthInsurancePremiums",
        "medicalOutOfPocket",
        "prescriptionMedications",
        "dentalOutOfPocket",
        "visionOutOfPocket",
        "longTermCareInsurancePremiums",
        "householdUtilities",
        "groceries",
        "childcareExpense",
        "customExpenseRecord"
      ])
    }),
    savingsHabits: Object.freeze({
      scope: SAVINGS_RECORD_SCOPE,
      heading: "Savings Habit Records",
      copy: "Track savings, reserve, and investment contributions separately from expenses and existing asset balances.",
      addButtonLabel: "Add Savings Habit",
      modalTitle: "Add Savings Habit",
      modalTitleId: "pmi-savings-habit-library-title",
      modalCloseLabel: "Close savings habit library",
      modalDescription: "Add recurring savings, reserve, and investment contributions. These records are saved for planning context and stay separate from spending rows.",
      searchPlaceholder: "Search savings habits",
      filterLabel: "Savings habit library views",
      allFilterLabel: "All Savings",
      recentEmptyText: "No recent savings habits added in this session.",
      searchEmptyText: "No matching savings habit types found.",
      groupSingularLabel: "savings habit",
      groupPluralLabel: "savings habits",
      tableLabel: "Savings habit records notebook",
      typeColumnLabel: "Habit Type",
      labelColumnLabel: "Label / Goal",
      amountLabel: "Contribution",
      targetAssetColumnLabel: "Asset Target",
      removeButtonPrefix: "Remove",
      accessibleTypePrefix: "Savings habit type",
      suggestedTypeKeys: Object.freeze([
        "hsaContributions",
        "retirementContributions",
        "brokerageInvestmentContributions",
        "educationSavingsContributions",
        "emergencyFundContributions",
        "sinkingFundContributions"
      ])
    })
  });
  const EXPENSE_TYPE_ICON_BASE_PATH = "../Images/";
  const EXPENSE_TYPE_ICON_FALLBACK_FILE = "custom1.svg";
  const EXPENSE_TYPE_ICON_FILES = Object.freeze({
    banking: "banking.svg",
    business: "business1.svg",
    calendarReserve: "calendar-reserve.svg",
    custom: EXPENSE_TYPE_ICON_FALLBACK_FILE,
    debtPayment: "debt-payment.svg",
    dental: "dental.svg",
    education: "education.svg",
    entertainment: "entertainment.svg",
    familySupport: "family-support.svg",
    finalExpense: "final.svg",
    giving: "giving.svg",
    groceries: "groceries.svg",
    healthcare: "healthcare.svg",
    home: "home.svg",
    insurance: "insurance.svg",
    legal: "legal.svg",
    personalLiving: "personal-living.svg",
    pet: "pet.svg",
    savings: "savings.svg",
    taxes: "taxes.svg",
    travel: "travel.svg",
    utilities: "utilities.svg",
    vehicle: "vehicle.svg",
    vision: "vision.svg"
  });
  const EXPENSE_TYPE_ICON_BY_CATEGORY_KEY = Object.freeze({
    bankingFinanceCharges: EXPENSE_TYPE_ICON_FILES.banking,
    businessOverhead: EXPENSE_TYPE_ICON_FILES.business,
    businessSelfEmployment: EXPENSE_TYPE_ICON_FILES.business,
    childcare: EXPENSE_TYPE_ICON_FILES.familySupport,
    childcareEducation: EXPENSE_TYPE_ICON_FILES.familySupport,
    childActivityExpense: EXPENSE_TYPE_ICON_FILES.familySupport,
    customExpense: EXPENSE_TYPE_ICON_FILES.custom,
    debtObligations: EXPENSE_TYPE_ICON_FILES.debtPayment,
    dentalCare: EXPENSE_TYPE_ICON_FILES.dental,
    dependentSupport: EXPENSE_TYPE_ICON_FILES.familySupport,
    discretionaryLifestyle: EXPENSE_TYPE_ICON_FILES.entertainment,
    educationExpense: EXPENSE_TYPE_ICON_FILES.education,
    estateSettlement: EXPENSE_TYPE_ICON_FILES.finalExpense,
    familySupport: EXPENSE_TYPE_ICON_FILES.familySupport,
    foodGroceries: EXPENSE_TYPE_ICON_FILES.groceries,
    funeralBurial: EXPENSE_TYPE_ICON_FILES.finalExpense,
    givingCommunity: EXPENSE_TYPE_ICON_FILES.giving,
    homeHealthCare: EXPENSE_TYPE_ICON_FILES.healthcare,
    housingExpense: EXPENSE_TYPE_ICON_FILES.home,
    insurancePremiums: EXPENSE_TYPE_ICON_FILES.insurance,
    keyPersonReplacementExpense: EXPENSE_TYPE_ICON_FILES.business,
    legalAdministrative: EXPENSE_TYPE_ICON_FILES.legal,
    longTermCare: EXPENSE_TYPE_ICON_FILES.healthcare,
    medicalEquipment: EXPENSE_TYPE_ICON_FILES.healthcare,
    medicalFinalExpense: EXPENSE_TYPE_ICON_FILES.finalExpense,
    mentalHealthCare: EXPENSE_TYPE_ICON_FILES.healthcare,
    ongoingHealthcare: EXPENSE_TYPE_ICON_FILES.healthcare,
    otherFinalExpense: EXPENSE_TYPE_ICON_FILES.finalExpense,
    otherHealthcare: EXPENSE_TYPE_ICON_FILES.healthcare,
    otherLivingExpense: EXPENSE_TYPE_ICON_FILES.custom,
    periodicSinkingFund: EXPENSE_TYPE_ICON_FILES.calendarReserve,
    personalLiving: EXPENSE_TYPE_ICON_FILES.personalLiving,
    pets: EXPENSE_TYPE_ICON_FILES.pet,
    professionalServices: EXPENSE_TYPE_ICON_FILES.legal,
    savingsGoalContributions: EXPENSE_TYPE_ICON_FILES.savings,
    taxes: EXPENSE_TYPE_ICON_FILES.taxes,
    transportation: EXPENSE_TYPE_ICON_FILES.vehicle,
    travelVacations: EXPENSE_TYPE_ICON_FILES.travel,
    utilities: EXPENSE_TYPE_ICON_FILES.utilities,
    visionCare: EXPENSE_TYPE_ICON_FILES.vision
  });

  function escapeHtml(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function normalizeString(value) {
    return String(value == null ? "" : value).trim();
  }

  function normalizeRecordScope(value) {
    return normalizeString(value) === SAVINGS_RECORD_SCOPE ? SAVINGS_RECORD_SCOPE : DEFAULT_RECORD_SCOPE;
  }

  function isSavingsRecordScope(value) {
    return normalizeRecordScope(value) === SAVINGS_RECORD_SCOPE;
  }

  function getRecordScopeConfig(recordScope) {
    return RECORD_SCOPE_CONFIGS[normalizeRecordScope(recordScope)] || RECORD_SCOPE_CONFIGS[DEFAULT_RECORD_SCOPE];
  }

  function toOptionalNumber(value) {
    const normalized = normalizeString(value).replace(/,/g, "");
    if (!normalized) {
      return null;
    }

    const numericValue = Number(normalized);
    return Number.isFinite(numericValue) ? numericValue : null;
  }

  function toOptionalNonNegativeNumber(value) {
    const number = toOptionalNumber(value);
    return number == null || number < 0 ? null : number;
  }

  function clonePlainObject(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return {};
    }

    return Object.assign({}, value);
  }

  function getExpenseLibraryApi() {
    return lensAnalysis.expenseLibrary && typeof lensAnalysis.expenseLibrary === "object"
      ? lensAnalysis.expenseLibrary
      : {};
  }

  function getExpenseTaxonomyApi() {
    return lensAnalysis.expenseTaxonomy && typeof lensAnalysis.expenseTaxonomy === "object"
      ? lensAnalysis.expenseTaxonomy
      : {};
  }

  function getAssetTaxonomyApi() {
    return lensAnalysis.assetTaxonomy && typeof lensAnalysis.assetTaxonomy === "object"
      ? lensAnalysis.assetTaxonomy
      : {};
  }

  function getLibraryEntries() {
    const expenseLibrary = getExpenseLibraryApi();
    if (typeof expenseLibrary.getExpenseLibraryEntries === "function") {
      return expenseLibrary.getExpenseLibraryEntries();
    }

    return Array.isArray(expenseLibrary.EXPENSE_LIBRARY_ENTRIES)
      ? expenseLibrary.EXPENSE_LIBRARY_ENTRIES.slice()
      : [];
  }

  function findLibraryEntry(typeKey) {
    const expenseLibrary = getExpenseLibraryApi();
    if (typeof expenseLibrary.findExpenseLibraryEntry === "function") {
      return expenseLibrary.findExpenseLibraryEntry(typeKey);
    }

    return getLibraryEntries().find(function (entry) {
      return entry && (entry.typeKey === typeKey || entry.libraryEntryKey === typeKey);
    }) || null;
  }

  function isInitialAddableExpenseEntry(entry) {
    return Boolean(
      entry
      && entry.isAddable === true
      && entry.isProtected !== true
      && entry.isScalarFieldOwned !== true
      && entry.uiAvailability === "initial"
    );
  }

  function isSavingsHabitEntry(entry) {
    return normalizeString(entry && entry.categoryKey) === SAVINGS_HABIT_CATEGORY_KEY
      || SAVINGS_HABIT_TYPE_KEYS.indexOf(normalizeString(entry && (entry.typeKey || entry.libraryEntryKey))) !== -1;
  }

  function isScopedInitialAddableLibraryEntry(entry, recordScope) {
    if (!isInitialAddableExpenseEntry(entry)) {
      return false;
    }

    return normalizeRecordScope(recordScope) === SAVINGS_RECORD_SCOPE
      ? isSavingsHabitEntry(entry)
      : !isSavingsHabitEntry(entry);
  }

  function getInitialAddableLibraryEntries(recordScope) {
    return getLibraryEntries().filter(function (entry) {
      return isScopedInitialAddableLibraryEntry(entry, recordScope);
    });
  }

  function isStarterExpenseTypeKey(typeKey) {
    return STARTER_EXPENSE_TYPE_KEYS.indexOf(normalizeString(typeKey)) !== -1;
  }

  function isSupportedExpenseRecordEntry(entry, recordScope) {
    const normalizedScope = normalizeRecordScope(recordScope);
    return isScopedInitialAddableLibraryEntry(entry, normalizedScope)
      || (normalizedScope === DEFAULT_RECORD_SCOPE && isStarterExpenseTypeKey(entry && entry.typeKey));
  }

  function getCommonExpenseRecordSourceField(typeKey) {
    const expenseLibrary = getExpenseLibraryApi();
    if (typeof expenseLibrary.getCommonExpenseRecordSourceField === "function") {
      return expenseLibrary.getCommonExpenseRecordSourceField(typeKey);
    }

    return null;
  }

  function getCommonExpenseOngoingSupportFieldForRecord(record) {
    const safeRecord = record && typeof record === "object" ? record : {};
    const metadata = safeRecord.metadata && typeof safeRecord.metadata === "object" ? safeRecord.metadata : {};
    const isStarterRecord = safeRecord.isDefaultExpense === true || normalizeString(metadata.source) === "starter-notebook";
    if (!isStarterRecord) {
      return null;
    }

    const sourceField = getCommonExpenseRecordSourceField(safeRecord.typeKey || safeRecord.libraryEntryKey);
    return normalizeString(sourceField && sourceField.ongoingSupportField) || null;
  }

  function getTaxonomyCategory(categoryKey) {
    const taxonomy = getExpenseTaxonomyApi();
    if (typeof taxonomy.getExpenseCategory === "function") {
      return taxonomy.getExpenseCategory(categoryKey);
    }

    const categories = Array.isArray(taxonomy.DEFAULT_EXPENSE_CATEGORIES)
      ? taxonomy.DEFAULT_EXPENSE_CATEGORIES
      : [];
    return categories.find(function (category) {
      return category && category.categoryKey === categoryKey;
    }) || null;
  }

  function getCategoryLabel(categoryKey) {
    const category = getTaxonomyCategory(categoryKey);
    return normalizeString(category && category.label) || normalizeString(categoryKey) || "Expense";
  }

  function getAssetTaxonomyCategory(categoryKey) {
    const assetTaxonomy = getAssetTaxonomyApi();
    const categories = Array.isArray(assetTaxonomy.DEFAULT_ASSET_CATEGORIES)
      ? assetTaxonomy.DEFAULT_ASSET_CATEGORIES
      : [];
    return categories.find(function (category) {
      return category && category.categoryKey === categoryKey;
    }) || null;
  }

  function getSavingsTargetAssetOptions() {
    const assetTaxonomy = getAssetTaxonomyApi();
    return Array.isArray(assetTaxonomy.DEFAULT_ASSET_CATEGORIES)
      ? assetTaxonomy.DEFAULT_ASSET_CATEGORIES
        .filter(function (category) {
          return category && normalizeString(category.categoryKey) && normalizeString(category.label);
        })
        .map(function (category) {
          return {
            value: normalizeString(category.categoryKey),
            label: normalizeString(category.label)
          };
        })
      : [];
  }

  function isValidSavingsTargetAssetCategory(categoryKey) {
    return Boolean(getAssetTaxonomyCategory(categoryKey));
  }

  function getDefaultSavingsTargetAssetCategoryKey(typeKey) {
    const normalizedTypeKey = normalizeString(typeKey);
    return normalizeString(DEFAULT_SAVINGS_HABIT_TARGET_ASSET_CATEGORIES[normalizedTypeKey]) || null;
  }

  function normalizeSavingsTargetAssetCategoryKey(value, typeKey) {
    const explicitValue = normalizeString(value);
    if (explicitValue && isValidSavingsTargetAssetCategory(explicitValue)) {
      return explicitValue;
    }

    const defaultValue = getDefaultSavingsTargetAssetCategoryKey(typeKey);
    return defaultValue && isValidSavingsTargetAssetCategory(defaultValue) ? defaultValue : null;
  }

  function getSavingsTargetAssetLabel(categoryKey) {
    const category = getAssetTaxonomyCategory(categoryKey);
    return normalizeString(category && category.label) || normalizeString(categoryKey) || "Select target";
  }

  function getExpenseTypeLabel(record) {
    const safeRecord = record && typeof record === "object" ? record : {};
    const entry = findLibraryEntry(safeRecord.typeKey || safeRecord.libraryEntryKey);
    return normalizeString(entry && entry.label)
      || normalizeString(safeRecord.typeKey)
      || normalizeString(safeRecord.categoryKey)
      || "Expense";
  }

  function getExpenseTypeIconFile(record) {
    const safeRecord = record && typeof record === "object" ? record : {};
    if (
      safeRecord.isGeneratedExpense === true
      || safeRecord.isDebtPaymentExpense === true
      || normalizeString(safeRecord.categoryKey) === "debtPayment"
      || normalizeString(safeRecord.categoryKey) === "debtObligations"
    ) {
      return EXPENSE_TYPE_ICON_FILES.debtPayment;
    }

    const entry = findLibraryEntry(safeRecord.typeKey || safeRecord.libraryEntryKey);
    const categoryKey = normalizeString(safeRecord.categoryKey)
      || normalizeString(entry && entry.categoryKey);
    return EXPENSE_TYPE_ICON_BY_CATEGORY_KEY[categoryKey] || EXPENSE_TYPE_ICON_FALLBACK_FILE;
  }

  function getExpenseTypeIconModel(record, options) {
    const safeOptions = options && typeof options === "object" ? options : {};
    const accessibleTypePrefix = normalizeString(safeOptions.accessibleTypePrefix) || "Expense type";
    const label = getExpenseTypeLabel(record);
    const iconFile = getExpenseTypeIconFile(record);
    return {
      label,
      iconFile,
      src: EXPENSE_TYPE_ICON_BASE_PATH + iconFile,
      accessibleLabel: accessibleTypePrefix + ": " + label
    };
  }

  function renderExpenseTypeInlineLabel(iconModel, extraAttributes) {
    const safeIconModel = iconModel && typeof iconModel === "object"
      ? iconModel
      : getExpenseTypeIconModel({});
    return `
      <span class="pmi-expense-record-type-chip" data-pmi-expense-record-type-label data-pmi-expense-record-icon-file="${escapeHtml(safeIconModel.iconFile)}" data-pmi-expense-record-icon-src="${escapeHtml(safeIconModel.src)}"${extraAttributes ? " " + extraAttributes : ""} title="${escapeHtml(safeIconModel.label)}" aria-label="${escapeHtml(safeIconModel.accessibleLabel)}" tabindex="0">
        <img class="pmi-expense-record-type-icon" src="${escapeHtml(safeIconModel.src)}" alt="" aria-hidden="true" data-pmi-expense-record-type-icon>
        <span class="pmi-expense-record-type-visible-label">${escapeHtml(safeIconModel.label)}</span>
        <span class="pmi-expense-record-type-visually-hidden">${escapeHtml(safeIconModel.accessibleLabel)}</span>
      </span>
    `;
  }

  function formatDisplayAmount(value) {
    const number = toOptionalNumber(value);
    if (number == null) {
      return "-";
    }

    return "$" + number.toLocaleString("en-US", {
      maximumFractionDigits: number % 1 === 0 ? 0 : 2
    });
  }

  function formatCashFlowAmount(value) {
    const number = toOptionalNumber(value);
    if (number == null) {
      return "-";
    }

    const absValue = Math.abs(number);
    const formattedValue = "$" + absValue.toLocaleString("en-US", {
      maximumFractionDigits: absValue % 1 === 0 ? 0 : 2
    });
    return number < 0 ? "-" + formattedValue : formattedValue;
  }

  function formatDisplayToken(value) {
    const normalized = normalizeString(value);
    if (!normalized) {
      return "-";
    }

    return normalized
      .replace(/([a-z])([A-Z])/g, "$1 $2")
      .replace(/[_-]+/g, " ")
      .replace(/\b\w/g, function (letter) {
        return letter.toUpperCase();
      });
  }

  function roundCashFlowAmount(value) {
    return Number.isFinite(value) ? Math.round(value * 100) / 100 : 0;
  }

  function normalizeCashFlowFrequency(value) {
    const normalized = normalizeString(value);
    const compact = normalized.replace(/[\s_-]+/g, "").toLowerCase();
    if (!compact) {
      return "monthly";
    }

    if (compact === "onetime" || compact === "oneoff") {
      return "oneTime";
    }

    if (compact === "semiannual" || compact === "semiannually" || compact === "semiannualy") {
      return "semiAnnual";
    }

    if (compact === "biweekly" || compact === "everytwoweeks") {
      return "biweekly";
    }

    if (compact === "weekly") {
      return "weekly";
    }

    if (compact === "quarterly") {
      return "quarterly";
    }

    if (compact === "annual" || compact === "annually" || compact === "yearly") {
      return "annual";
    }

    return compact === "monthly" ? "monthly" : normalized;
  }

  function toMonthlyCashFlowAmount(amount, frequency) {
    const numericAmount = toOptionalNonNegativeNumber(amount);
    if (numericAmount == null) {
      return null;
    }

    const normalizedFrequency = normalizeCashFlowFrequency(frequency);
    const monthlyFactors = {
      weekly: 52 / 12,
      biweekly: 26 / 12,
      monthly: 1,
      quarterly: 1 / 3,
      semiAnnual: 1 / 6,
      annual: 1 / 12
    };

    if (normalizedFrequency === "oneTime") {
      return null;
    }

    const factor = monthlyFactors[normalizedFrequency];
    return Number.isFinite(factor) ? roundCashFlowAmount(numericAmount * factor) : null;
  }

  function firstOptionalNumber(values) {
    const sourceValues = Array.isArray(values) ? values : [];
    for (let index = 0; index < sourceValues.length; index += 1) {
      const number = toOptionalNumber(sourceValues[index]);
      if (number != null) {
        return number;
      }
    }

    return null;
  }

  function getRecordMonthlyAmount(record) {
    const safeRecord = record && typeof record === "object" ? record : {};
    const termType = normalizeExpenseTermType(safeRecord.termType, "ongoing");
    if (termType === "oneTime") {
      return null;
    }

    return toMonthlyCashFlowAmount(safeRecord.amount, safeRecord.frequency);
  }

  function getDebtRecordMonthlyAmount(record) {
    const safeRecord = record && typeof record === "object" ? record : {};
    const paymentFrequency = normalizeString(safeRecord.paymentFrequency || safeRecord.frequency) || "monthly";
    const paymentAmount = toOptionalNonNegativeNumber(safeRecord.paymentAmount);
    if (paymentAmount != null) {
      return toMonthlyCashFlowAmount(paymentAmount, paymentFrequency);
    }

    const minimumMonthlyPayment = toOptionalNonNegativeNumber(safeRecord.minimumMonthlyPayment);
    return minimumMonthlyPayment == null ? null : toMonthlyCashFlowAmount(minimumMonthlyPayment, "monthly");
  }

  function getSavingsContributionNormalizer() {
    const helperApi = lensAnalysis.savingsContributionFacts && typeof lensAnalysis.savingsContributionFacts === "object"
      ? lensAnalysis.savingsContributionFacts
      : {};
    if (typeof helperApi.normalizeSavingsContributionFacts === "function") {
      return helperApi.normalizeSavingsContributionFacts;
    }
    return typeof lensAnalysis.normalizeSavingsContributionFacts === "function"
      ? lensAnalysis.normalizeSavingsContributionFacts
      : null;
  }

  function getSavingsContributionRecords(input) {
    const safeInput = input && typeof input === "object" ? input : {};
    if (Array.isArray(safeInput.savingsContributionFacts)) {
      return safeInput.savingsContributionFacts;
    }
    if (Array.isArray(safeInput.savingsHabitRecords)) {
      return safeInput.savingsHabitRecords;
    }
    if (Array.isArray(safeInput.savingsContributionRecords)) {
      return safeInput.savingsContributionRecords;
    }
    if (Array.isArray(safeInput.plannedSavingsRecords)) {
      return safeInput.plannedSavingsRecords;
    }
    return [];
  }

  function calculateMonthlyPlannedSavings(input, trace) {
    const records = getSavingsContributionRecords(input);
    trace.includedSavingsContributions = [];
    trace.excludedSavingsContributions = [];
    trace.savingsContributionWarnings = [];
    trace.savingsContributionSource = "none";
    if (!records.length) {
      return 0;
    }

    const normalizeSavingsContributionFacts = getSavingsContributionNormalizer();
    if (typeof normalizeSavingsContributionFacts !== "function") {
      trace.savingsContributionSource = "missing-canonical-helper";
      trace.savingsContributionWarnings.push({
        code: "missing-savings-contribution-facts-helper",
        message: "Savings contribution facts helper is not loaded."
      });
      return 0;
    }

    const normalized = normalizeSavingsContributionFacts({
      assetTaxonomy: lensAnalysis.assetTaxonomy,
      savingsHabitRecords: records
    });
    const safeNormalized = normalized && typeof normalized === "object" ? normalized : {};
    trace.savingsContributionSource = "savings-contribution-facts";
    trace.includedSavingsContributions = Array.isArray(safeNormalized.facts)
      ? safeNormalized.facts.map(function (fact) {
        return {
          sourceRecordId: normalizeString(fact.sourceRecordId) || null,
          sourcePath: normalizeString(fact.sourcePath) || null,
          label: normalizeString(fact.label) || "Savings contribution",
          targetAssetCategoryKey: normalizeString(fact.targetAssetCategoryKey) || null,
          monthlyAmount: roundCashFlowAmount(toOptionalNonNegativeNumber(fact.monthlyAmount) || 0)
        };
      })
      : [];
    trace.excludedSavingsContributions = Array.isArray(safeNormalized.excludedFacts)
      ? safeNormalized.excludedFacts.map(function (fact) {
        return Object.assign({}, fact);
      })
      : [];
    trace.savingsContributionWarnings = Array.isArray(safeNormalized.warnings)
      ? safeNormalized.warnings.map(function (warning) {
        return Object.assign({}, warning);
      })
      : [];
    return roundCashFlowAmount(toOptionalNonNegativeNumber(safeNormalized.totalMonthlyAmount) || 0);
  }

  function calculateMonthlyCashFlow(input) {
    const safeInput = input && typeof input === "object" ? input : {};
    const income = safeInput.income && typeof safeInput.income === "object" ? safeInput.income : safeInput;
    const housing = safeInput.housing && typeof safeInput.housing === "object" ? safeInput.housing : safeInput;
    const trace = {
      includedExpenses: [],
      excludedExpenses: [],
      includedDebtPayments: [],
      excludedDebtPayments: [],
      includedSavingsContributions: [],
      excludedSavingsContributions: [],
      savingsContributionWarnings: [],
      savingsContributionSource: "none",
      housingSource: null,
      missing: []
    };

    const combinedAnnualNetIncome = firstOptionalNumber([
      income.combinedAnnualNetIncome,
      income.combinedHouseholdNetAnnualIncome,
      income.householdNetAnnualIncome
    ]);
    const insuredNetAnnualIncome = firstOptionalNumber([
      income.insuredNetAnnualIncome,
      income.netAnnualIncome,
      income.primaryNetAnnualIncome
    ]);
    const spouseNetAnnualIncome = firstOptionalNumber([
      income.spouseOrPartnerNetAnnualIncome,
      income.spouseNetAnnualIncome,
      income.partnerNetAnnualIncome
    ]);
    const monthlyTakeHomePay = combinedAnnualNetIncome == null
      ? roundCashFlowAmount(
        (insuredNetAnnualIncome == null ? 0 : insuredNetAnnualIncome / 12)
        + (spouseNetAnnualIncome == null ? 0 : spouseNetAnnualIncome / 12)
      )
      : roundCashFlowAmount(combinedAnnualNetIncome / 12);
    if (combinedAnnualNetIncome == null && insuredNetAnnualIncome == null && spouseNetAnnualIncome == null) {
      trace.missing.push("net-income-source");
    }

    const monthlyHousingCost = firstOptionalNumber([
      housing.calculatedMonthlyMortgagePayment,
      housing.monthlyHousingSupportCost,
      housing.monthlyHousingCost,
      housing.monthlyHousingPayment,
      housing.monthlyRentOrHousingPayment
    ]);
    const normalizedMonthlyHousingCost = monthlyHousingCost == null
      ? 0
      : roundCashFlowAmount(Math.max(0, monthlyHousingCost));
    if (monthlyHousingCost == null) {
      trace.missing.push("housing-payment-source");
    } else {
      trace.housingSource = normalizeString(housing.housingSource || housing.sourcePath) || "current-pmi-housing-payment";
    }

    const expenseSourceRecords = Array.isArray(safeInput.expenseRecords) ? safeInput.expenseRecords : [];
    const monthlyExpenses = expenseSourceRecords.reduce(function (total, record, index) {
      const monthlyAmount = getRecordMonthlyAmount(record);
      const safeRecord = record && typeof record === "object" ? record : {};
      if (monthlyAmount == null) {
        trace.excludedExpenses.push({
          index,
          expenseId: normalizeString(safeRecord.expenseId) || null,
          reason: normalizeCashFlowFrequency(safeRecord.frequency) === "oneTime" || normalizeString(safeRecord.termType) === "oneTime"
            ? "one-time-expense-excluded"
            : "monthly-equivalent-unavailable"
        });
        return total;
      }

      trace.includedExpenses.push({
        index,
        expenseId: normalizeString(safeRecord.expenseId) || null,
        monthlyAmount
      });
      return total + monthlyAmount;
    }, 0);

    const generatedDebtRecords = Array.isArray(safeInput.generatedExpenseRecords)
      ? safeInput.generatedExpenseRecords
      : [];
    const fallbackDebtRecords = !generatedDebtRecords.length && Array.isArray(safeInput.debtRecords)
      ? safeInput.debtRecords
      : [];
    const debtSourceRecords = generatedDebtRecords.length ? generatedDebtRecords : fallbackDebtRecords;
    const monthlyDebtPayments = debtSourceRecords.reduce(function (total, record, index) {
      const monthlyAmount = generatedDebtRecords.length
        ? getRecordMonthlyAmount(record)
        : getDebtRecordMonthlyAmount(record);
      const safeRecord = record && typeof record === "object" ? record : {};
      if (monthlyAmount == null) {
        trace.excludedDebtPayments.push({
          index,
          sourceDebtRecordId: normalizeString(safeRecord.sourceDebtRecordId || safeRecord.debtId) || null,
          reason: "monthly-debt-payment-unavailable"
        });
        return total;
      }

      trace.includedDebtPayments.push({
        index,
        sourceDebtRecordId: normalizeString(safeRecord.sourceDebtRecordId || safeRecord.debtId) || null,
        monthlyAmount
      });
      return total + monthlyAmount;
    }, 0);

    const roundedExpenses = roundCashFlowAmount(monthlyExpenses);
    const roundedDebt = roundCashFlowAmount(monthlyDebtPayments);
    const monthlyPlannedSavings = calculateMonthlyPlannedSavings(safeInput, trace);
    const monthlyLivingOutflow = roundCashFlowAmount(
      normalizedMonthlyHousingCost + roundedDebt + roundedExpenses
    );
    const remainingBeforeSavings = roundCashFlowAmount(
      monthlyTakeHomePay - normalizedMonthlyHousingCost - roundedDebt - roundedExpenses
    );
    const remainingAfterSavings = roundCashFlowAmount(remainingBeforeSavings - monthlyPlannedSavings);
    const shortfallBeforeSavings = roundCashFlowAmount(Math.max(0, -remainingBeforeSavings));
    const shortfallAfterSavings = roundCashFlowAmount(Math.max(0, -remainingAfterSavings));

    return {
      monthlyIncome: monthlyTakeHomePay,
      monthlyTakeHomePay,
      monthlyHousing: normalizedMonthlyHousingCost,
      monthlyHousingCost: normalizedMonthlyHousingCost,
      monthlyDebt: roundedDebt,
      monthlyDebtPayments: roundedDebt,
      monthlyExpenses: roundedExpenses,
      monthlyPlannedSavings,
      monthlyLivingOutflow,
      monthlyRequiredOutflow: monthlyLivingOutflow,
      remainingBeforeSavings,
      remainingAfterSavings,
      remainingMonthlyCashFlow: remainingAfterSavings,
      shortfallBeforeSavings,
      shortfallAfterSavings,
      savingsExceedAvailableSurplus: remainingBeforeSavings >= 0 && monthlyPlannedSavings > remainingBeforeSavings,
      isNegative: remainingAfterSavings < 0,
      hasIncomeSource: combinedAnnualNetIncome != null || insuredNetAnnualIncome != null || spouseNetAnnualIncome != null,
      trace
    };
  }

  function normalizeGeneratedExpenseFactForUi(expense) {
    const safeExpense = expense && typeof expense === "object" ? expense : {};
    if (safeExpense.isGeneratedExpense !== true || safeExpense.isDebtPaymentExpense !== true) {
      return null;
    }

    const sourceDebtRecordId = normalizeString(safeExpense.sourceDebtRecordId);
    const sourceDebtTypeKey = normalizeString(safeExpense.sourceDebtTypeKey);
    const amount = toOptionalNumber(safeExpense.amount);
    if (!sourceDebtRecordId || !sourceDebtTypeKey || amount == null) {
      return null;
    }

    return {
      expenseFactId: normalizeString(safeExpense.expenseFactId) || sourceDebtRecordId,
      typeKey: normalizeString(safeExpense.typeKey) || "debtPayment",
      categoryKey: normalizeString(safeExpense.categoryKey) || "debtPayment",
      label: normalizeString(safeExpense.label) || "Debt Payment",
      amount,
      frequency: normalizeString(safeExpense.paymentFrequency || safeExpense.frequency) || "monthly",
      termType: normalizeString(safeExpense.termType) || "ongoing",
      continuationStatus: normalizeString(safeExpense.continuationStatus) || "review",
      remainingTermMonths: toOptionalNonNegativeNumber(safeExpense.remainingTermMonths),
      sourceDebtRecordId,
      sourceDebtTypeKey,
      sourcePath: normalizeString(safeExpense.sourcePath) || null,
      duplicateProtectionKey: normalizeString(safeExpense.duplicateProtectionKey) || null,
      isGeneratedExpense: true,
      isDebtPaymentExpense: true,
      isReadOnly: true,
      isFormulaEligible: false
    };
  }

  function normalizeGeneratedExpenseFactsForUi(expenseFacts) {
    const sourceExpenses = Array.isArray(expenseFacts)
      ? expenseFacts
      : Array.isArray(expenseFacts && expenseFacts.expenses)
        ? expenseFacts.expenses
        : [];
    return sourceExpenses.map(normalizeGeneratedExpenseFactForUi).filter(Boolean);
  }

  function createGeneratedExpenseFactsFromDebtRecords(debtRecords) {
    const sourceRecords = Array.isArray(debtRecords) ? debtRecords : [];
    if (!sourceRecords.length || typeof lensAnalysis.createExpenseFactsFromSourceData !== "function") {
      return [];
    }

    const projection = lensAnalysis.createExpenseFactsFromSourceData({ debtRecords: sourceRecords });
    return normalizeGeneratedExpenseFactsForUi(projection);
  }

  function getFrequencyOptions() {
    const taxonomy = getExpenseTaxonomyApi();
    return Array.isArray(taxonomy.EXPENSE_FREQUENCY_OPTIONS)
      ? taxonomy.EXPENSE_FREQUENCY_OPTIONS.slice()
      : [
        { value: "weekly", label: "Weekly" },
        { value: "monthly", label: "Monthly" },
        { value: "quarterly", label: "Quarterly" },
        { value: "semiAnnual", label: "Semiannual" },
        { value: "annual", label: "Annual" },
        { value: "oneTime", label: "One-Time" }
      ];
  }

  function getTermTypeOptions() {
    const taxonomy = getExpenseTaxonomyApi();
    return Array.isArray(taxonomy.EXPENSE_TERM_TYPE_OPTIONS)
      ? taxonomy.EXPENSE_TERM_TYPE_OPTIONS.slice()
      : [
        { value: "ongoing", label: "Ongoing" },
        { value: "fixedYears", label: "Fixed Years" },
        { value: "untilAge", label: "Until Age" },
        { value: "untilDate", label: "Until Date" },
        { value: "oneTime", label: "One-Time" }
      ];
  }

  function isValidExpenseCategory(categoryKey) {
    const taxonomy = getExpenseTaxonomyApi();
    return typeof taxonomy.isValidExpenseCategory === "function"
      ? taxonomy.isValidExpenseCategory(categoryKey)
      : Boolean(getTaxonomyCategory(categoryKey));
  }

  function normalizeExpenseFrequency(frequency, fallback) {
    const taxonomy = getExpenseTaxonomyApi();
    if (typeof taxonomy.normalizeExpenseFrequency === "function") {
      return taxonomy.normalizeExpenseFrequency(frequency, fallback);
    }

    const normalized = normalizeString(frequency);
    const values = getFrequencyOptions().map(function (option) {
      return option.value;
    });
    if (values.indexOf(normalized) !== -1) {
      return normalized;
    }

    const normalizedFallback = normalizeString(fallback);
    return values.indexOf(normalizedFallback) !== -1 ? normalizedFallback : "monthly";
  }

  function normalizeExpenseTermType(termType, fallback) {
    const taxonomy = getExpenseTaxonomyApi();
    if (typeof taxonomy.normalizeExpenseTermType === "function") {
      return taxonomy.normalizeExpenseTermType(termType, fallback);
    }

    const normalized = normalizeString(termType);
    const values = getTermTypeOptions().map(function (option) {
      return option.value;
    });
    if (values.indexOf(normalized) !== -1) {
      return normalized;
    }

    const normalizedFallback = normalizeString(fallback);
    return values.indexOf(normalizedFallback) !== -1 ? normalizedFallback : "ongoing";
  }

  function getContinuationStatusOptions() {
    return [
      { value: "continues", label: "Continues after death" },
      { value: "stops", label: "Stops/reduces after death" },
      { value: "review", label: "Review case-by-case" }
    ];
  }

  function normalizeContinuationStatus(value, fallback) {
    const values = getContinuationStatusOptions().map(function (option) {
      return option.value;
    });
    const normalized = normalizeString(value);
    if (values.indexOf(normalized) !== -1) {
      return normalized;
    }

    const normalizedFallback = normalizeString(fallback);
    return values.indexOf(normalizedFallback) !== -1 ? normalizedFallback : "review";
  }

  function getLibraryDefaultContinuationStatus(entry) {
    return normalizeContinuationStatus(entry && entry.defaultContinuationStatus, "review");
  }

  function normalizeDateOnlyValue(value) {
    const normalized = normalizeString(value);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
      return null;
    }

    const parsed = new Date(normalized + "T00:00:00Z");
    if (Number.isNaN(parsed.getTime())) {
      return null;
    }

    return parsed.toISOString().slice(0, 10) === normalized ? normalized : null;
  }

  function generateExpenseId() {
    if (global.crypto && typeof global.crypto.randomUUID === "function") {
      return "expense_" + global.crypto.randomUUID().replace(/-/g, "_");
    }

    generatedExpenseIdCounter += 1;
    return "expense_" + Date.now() + "_" + generatedExpenseIdCounter;
  }

  function createStarterExpenseId(typeKey) {
    return "starter_expense_" + normalizeString(typeKey).replace(/[^A-Za-z0-9_-]+/g, "_");
  }

  function createExpenseRecordFromLibraryEntry(entry, options) {
    const safeEntry = entry && typeof entry === "object" ? entry : {};
    const safeOptions = options && typeof options === "object" ? options : {};
    const recordScope = normalizeRecordScope(safeOptions.recordScope);
    if (
      !isScopedInitialAddableLibraryEntry(safeEntry, recordScope)
      && !(recordScope === DEFAULT_RECORD_SCOPE && safeOptions.allowStarterEntry === true)
    ) {
      return null;
    }

    const typeKey = normalizeString(safeEntry.typeKey || safeEntry.libraryEntryKey);
    const categoryKey = normalizeString(safeEntry.categoryKey);
    const label = normalizeString(safeOptions.label) || normalizeString(safeEntry.label) || typeKey || "Added Expense";

    if (!typeKey || !categoryKey || !isValidExpenseCategory(categoryKey)) {
      return null;
    }

    const termType = normalizeExpenseTermType(safeOptions.termType, safeEntry.defaultTermType || "ongoing");
    const commonOngoingSupportField = safeOptions.isDefaultExpense === true
      ? normalizeString(getCommonExpenseRecordSourceField(typeKey)?.ongoingSupportField)
      : null;
    const targetAssetCategoryKey = isSavingsRecordScope(recordScope)
      ? normalizeSavingsTargetAssetCategoryKey(safeOptions.targetAssetCategoryKey, typeKey)
      : null;

    return {
      expenseId: normalizeString(safeOptions.expenseId) || generateExpenseId(),
      categoryKey,
      typeKey,
      label,
      amount: null,
      frequency: normalizeExpenseFrequency(safeOptions.frequency, safeEntry.defaultFrequency || "monthly"),
      termType,
      continuationStatus: normalizeContinuationStatus(
        safeOptions.continuationStatus,
        getLibraryDefaultContinuationStatus(safeEntry)
      ),
      termYears: termType === "fixedYears" && Number.isFinite(Number(safeEntry.suggestedTermYears))
        ? Number(safeEntry.suggestedTermYears)
        : null,
      endAge: null,
      endDate: null,
      sourceKey: normalizeString(safeOptions.sourceKey) || null,
      isDefaultExpense: safeOptions.isDefaultExpense === true,
      isScalarFieldOwned: false,
      isProtected: false,
      isRepeatableExpenseRecord: true,
      isCustomExpense: safeEntry.isCustomType === true || typeKey === "customExpenseRecord" || categoryKey === "customExpense",
      targetAssetCategoryKey,
      notes: null,
      metadata: {
        sourceType: "user-input",
        source: normalizeString(safeOptions.source) || "expense-library",
        libraryEntryKey: normalizeString(safeEntry.libraryEntryKey || typeKey),
        commonExpenseOngoingSupportField: commonOngoingSupportField || null
      }
    };
  }

  function normalizeRecordForUi(record, index, recordScope) {
    const safeRecord = record && typeof record === "object" ? record : {};
    const entry = findLibraryEntry(safeRecord.typeKey || safeRecord.libraryEntryKey);
    if (entry && !isSupportedExpenseRecordEntry(entry, recordScope)) {
      return null;
    }

    const categoryKey = normalizeString(safeRecord.categoryKey || (entry && entry.categoryKey));
    const typeKey = normalizeString(safeRecord.typeKey || (entry && entry.typeKey));
    const label = normalizeString(safeRecord.label || (entry && entry.label));

    if (!categoryKey || !typeKey || !label || !isValidExpenseCategory(categoryKey)) {
      return null;
    }

    if (!entry && typeKey !== "customExpenseRecord") {
      return null;
    }

    const metadata = clonePlainObject(safeRecord.metadata);
    delete metadata.commonExpenseSourceKey;
    const termType = normalizeExpenseTermType(safeRecord.termType, entry && entry.defaultTermType);
    const continuationStatus = normalizeContinuationStatus(
      safeRecord.continuationStatus,
      getLibraryDefaultContinuationStatus(entry)
    );
    const targetAssetCategoryKey = isSavingsRecordScope(recordScope)
      ? normalizeSavingsTargetAssetCategoryKey(
        safeRecord.targetAssetCategoryKey || safeRecord.assetCategoryKey,
        typeKey
      )
      : null;
    return {
      expenseId: normalizeString(safeRecord.expenseId) || generateExpenseId(),
      categoryKey,
      typeKey,
      label,
      amount: toOptionalNumber(safeRecord.amount),
      frequency: normalizeExpenseFrequency(safeRecord.frequency, entry && entry.defaultFrequency),
      termType,
      continuationStatus,
      termYears: termType === "fixedYears" ? toOptionalNonNegativeNumber(safeRecord.termYears) : null,
      endAge: termType === "untilAge" ? toOptionalNonNegativeNumber(safeRecord.endAge) : null,
      endDate: termType === "untilDate" ? normalizeDateOnlyValue(safeRecord.endDate) : null,
      sourceKey: normalizeString(safeRecord.sourceKey) || null,
      isDefaultExpense: safeRecord.isDefaultExpense === true && isStarterExpenseTypeKey(typeKey),
      isScalarFieldOwned: false,
      isProtected: false,
      isRepeatableExpenseRecord: true,
      isCustomExpense: safeRecord.isCustomExpense === true || typeKey === "customExpenseRecord" || categoryKey === "customExpense",
      targetAssetCategoryKey,
      notes: normalizeString(safeRecord.notes) || null,
      metadata: Object.assign({
        sourceType: "user-input",
        source: "expense-library",
        libraryEntryKey: normalizeString(typeKey)
      }, metadata, {
        commonExpenseOngoingSupportField: normalizeString(metadata.commonExpenseOngoingSupportField)
          || (safeRecord.isDefaultExpense === true && isStarterExpenseTypeKey(typeKey)
            ? normalizeString(getCommonExpenseRecordSourceField(typeKey)?.ongoingSupportField)
            : null)
          || null,
        sourceIndex: Number.isInteger(index) ? index : null
      })
    };
  }

  function createStarterExpenseRecords(recordScope) {
    if (normalizeRecordScope(recordScope) !== DEFAULT_RECORD_SCOPE) {
      return [];
    }

    return STARTER_EXPENSE_TYPE_KEYS
      .map(function (typeKey) {
        const entry = findLibraryEntry(typeKey);
        return createExpenseRecordFromLibraryEntry(entry, {
          recordScope: DEFAULT_RECORD_SCOPE,
          allowStarterEntry: true,
          expenseId: createStarterExpenseId(typeKey),
          label: STARTER_EXPENSE_LABELS[typeKey],
          frequency: "monthly",
          source: "starter-notebook",
          isDefaultExpense: true
        });
      })
      .filter(Boolean);
  }

  function createSearchText(entry) {
    return [
      entry.label,
      entry.typeKey,
      entry.libraryEntryKey,
      entry.categoryKey,
      entry.group,
      entry.description
    ].concat(Array.isArray(entry.searchTerms) ? entry.searchTerms : [])
      .concat(Array.isArray(entry.tags) ? entry.tags : [])
      .map(function (value) {
        return normalizeString(value).toLowerCase();
      })
      .filter(Boolean)
      .join(" ");
  }

  function matchesSearch(entry, query) {
    const normalizedQuery = normalizeString(query).toLowerCase();
    if (!normalizedQuery) {
      return true;
    }

    return createSearchText(entry).indexOf(normalizedQuery) !== -1;
  }

  function groupEntriesByCategory(entries) {
    return entries.reduce(function (groups, entry) {
      const categoryLabel = getCategoryLabel(entry.categoryKey);
      const existingGroup = groups.find(function (group) {
        return group.categoryLabel === categoryLabel;
      });
      const group = existingGroup || {
        categoryLabel,
        entries: []
      };

      if (!existingGroup) {
        groups.push(group);
      }

      group.entries.push(entry);
      return groups;
    }, []);
  }

  function formatValueForInput(value) {
    if (value == null || !Number.isFinite(Number(value))) {
      return "";
    }

    return String(Number(value));
  }

  function createInputId(prefix, expenseId, suffix) {
    return [
      prefix,
      normalizeString(expenseId).replace(/[^A-Za-z0-9_-]+/g, "-"),
      suffix
    ].filter(Boolean).join("-");
  }

  function renderSelectOptions(options, selectedValue) {
    return options.map(function (option) {
      const value = normalizeString(option.value);
      const label = normalizeString(option.label) || value;
      return `<option value="${escapeHtml(value)}"${value === selectedValue ? " selected" : ""}>${escapeHtml(label)}</option>`;
    }).join("");
  }

  function renderSavingsTargetAssetOptions(selectedValue) {
    const normalizedSelectedValue = normalizeString(selectedValue);
    const placeholderSelected = !normalizedSelectedValue ? " selected" : "";
    return `<option value=""${placeholderSelected}>Select target</option>`
      + renderSelectOptions(getSavingsTargetAssetOptions(), normalizedSelectedValue);
  }

  function renderSavingsTargetAssetField(record, expenseId, controller) {
    if (!isSavingsRecordScope(controller.recordScope)) {
      return "";
    }

    const targetAssetInputId = createInputId("pmi-expense-record", expenseId, "target-asset");
    const selectedValue = normalizeSavingsTargetAssetCategoryKey(
      record.targetAssetCategoryKey,
      record.typeKey
    );
    const label = controller.copy.targetAssetColumnLabel || "Asset Target";
    return `
      <div class="pmi-expense-record-cell" role="cell" data-column-label="${escapeHtml(label)}">
        <select id="${escapeHtml(targetAssetInputId)}" data-pmi-expense-record-target-asset-category aria-label="${escapeHtml(label)}">
          ${renderSavingsTargetAssetOptions(selectedValue)}
        </select>
      </div>
    `;
  }

  function renderCompactTermDetailField(record, expenseId) {
    const termType = normalizeString(record.termType);
    if (termType === "fixedYears") {
      const termYearsInputId = createInputId("pmi-expense-record", expenseId, "term-years");
      return `<input id="${escapeHtml(termYearsInputId)}" data-pmi-expense-record-term-years type="number" min="0" step="1" value="${escapeHtml(formatValueForInput(record.termYears))}" aria-label="Term Years">`;
    }

    if (termType === "untilAge") {
      const endAgeInputId = createInputId("pmi-expense-record", expenseId, "end-age");
      return `<input id="${escapeHtml(endAgeInputId)}" data-pmi-expense-record-end-age type="number" min="0" step="1" value="${escapeHtml(formatValueForInput(record.endAge))}" aria-label="End Age">`;
    }

    if (termType === "untilDate") {
      const endDateInputId = createInputId("pmi-expense-record", expenseId, "end-date");
      return `<input id="${escapeHtml(endDateInputId)}" data-pmi-expense-record-end-date type="date" value="${escapeHtml(record.endDate || "")}" aria-label="End Date">`;
    }

    return '<span class="pmi-expense-record-muted" aria-label="No term detail">-</span>';
  }

  function renderReadOnlyExpenseValue(value, className) {
    return `<span class="pmi-expense-record-readonly-value ${escapeHtml(className || "")}">${escapeHtml(value || "-")}</span>`;
  }

  function renderGeneratedExpenseRow(record) {
    const safeRecord = record && typeof record === "object" ? record : {};
    const expenseFactId = normalizeString(safeRecord.expenseFactId);
    const sourceDebtRecordId = normalizeString(safeRecord.sourceDebtRecordId);
    const termDetail = safeRecord.remainingTermMonths == null
      ? "-"
      : String(safeRecord.remainingTermMonths) + " mo";
    const debtPaymentIcon = getExpenseTypeIconModel(safeRecord);
    return `
      <div class="pmi-expense-record-row pmi-expense-record-row-generated" role="row" data-pmi-expense-generated-entry data-pmi-expense-generated-id="${escapeHtml(expenseFactId)}" data-source-debt-record-id="${escapeHtml(sourceDebtRecordId)}">
        <div class="pmi-expense-record-cell pmi-expense-record-type-cell" role="cell" data-column-label="Expense Type">
          ${renderExpenseTypeInlineLabel(debtPaymentIcon, 'data-pmi-expense-generated-type-chip data-pmi-expense-generated-source="Debt Records"')}
          <span class="pmi-expense-record-type-visually-hidden">From Debt Records</span>
        </div>
        <div class="pmi-expense-record-cell" role="cell" data-column-label="Label / Vendor">
          ${renderReadOnlyExpenseValue(safeRecord.label, "pmi-expense-record-generated-label")}
        </div>
        <div class="pmi-expense-record-cell" role="cell" data-column-label="Amount">
          ${renderReadOnlyExpenseValue(formatDisplayAmount(safeRecord.amount), "pmi-expense-record-generated-amount")}
        </div>
        <div class="pmi-expense-record-cell" role="cell" data-column-label="Frequency">
          ${renderReadOnlyExpenseValue(formatDisplayToken(safeRecord.frequency), "")}
        </div>
        <div class="pmi-expense-record-cell" role="cell" data-column-label="Duration">
          ${renderReadOnlyExpenseValue(formatDisplayToken(safeRecord.termType), "")}
        </div>
        <div class="pmi-expense-record-cell" role="cell" data-column-label="Term Detail">
          ${renderReadOnlyExpenseValue(termDetail, "")}
        </div>
        <div class="pmi-expense-record-cell" role="cell" data-column-label="Continues?">
          ${renderReadOnlyExpenseValue("Review", "")}
        </div>
        <div class="pmi-expense-record-cell" role="cell" data-column-label="Category">
          ${renderReadOnlyExpenseValue("Debt Payment", "pmi-expense-record-category-label")}
        </div>
        <div class="pmi-expense-record-cell pmi-expense-record-remove-cell" role="cell" data-column-label="Remove">
          <span class="pmi-expense-record-source-hint">Edit in Debt Records</span>
        </div>
      </div>
    `;
  }

  function renderShell(root, copy) {
    if (!root || root.dataset.pmiExpenseRecordsInitialized === "true") {
      return;
    }

    const shellCopy = copy && typeof copy === "object" ? copy : RECORD_SCOPE_CONFIGS[DEFAULT_RECORD_SCOPE];
    root.innerHTML = `
      <div class="field-group full-width form-subgroup-label pmi-expense-records-heading">
        <span>${escapeHtml(shellCopy.heading)}</span>
      </div>
      <div class="field-group full-width pmi-expense-records-copy">
        <p class="underwriting-helper-text">${escapeHtml(shellCopy.copy)}</p>
      </div>
      <div class="pmi-expense-records-list" data-pmi-expense-records-list></div>
      <div class="field-group pmi-expense-records-add-field">
        <button class="button tertiary-button pmi-expense-records-add-button" type="button" data-pmi-expense-records-add>${escapeHtml(shellCopy.addButtonLabel)}</button>
      </div>
    `;
    root.dataset.pmiExpenseRecordsInitialized = "true";
  }

  function renderCashFlowBar(root) {
    if (!root || root.dataset.pmiExpenseCashFlowInitialized === "true") {
      return;
    }

    root.innerHTML = `
      <section class="pmi-expense-cashflow" data-pmi-expense-cashflow-bar aria-live="polite">
        <div class="pmi-expense-cashflow-header">
          <div>
            <span class="pmi-expense-cashflow-kicker">Monthly cash flow</span>
          </div>
          <span class="pmi-expense-cashflow-status" data-pmi-expense-cashflow-status>After planned savings</span>
        </div>
        <div class="pmi-expense-cashflow-visual">
          <div class="pmi-expense-cashflow-track" data-pmi-expense-cashflow-track aria-label="Monthly cash-flow allocation">
            <svg class="pmi-expense-cashflow-ring" viewBox="0 0 100 100" aria-hidden="true" focusable="false">
              <circle class="pmi-expense-cashflow-ring-base" cx="50" cy="50" r="42" pathLength="100"></circle>
              <circle class="pmi-expense-cashflow-ring-segment pmi-expense-cashflow-ring-segment--housing" cx="50" cy="50" r="42" pathLength="100"></circle>
              <circle class="pmi-expense-cashflow-ring-segment pmi-expense-cashflow-ring-segment--debt" cx="50" cy="50" r="42" pathLength="100"></circle>
              <circle class="pmi-expense-cashflow-ring-segment pmi-expense-cashflow-ring-segment--expenses" cx="50" cy="50" r="42" pathLength="100"></circle>
              <circle class="pmi-expense-cashflow-ring-segment pmi-expense-cashflow-ring-segment--remaining" cx="50" cy="50" r="42" pathLength="100"></circle>
            </svg>
            <span class="pmi-expense-cashflow-segment pmi-expense-cashflow-segment--housing" data-pmi-expense-cashflow-segment="housing"></span>
            <span class="pmi-expense-cashflow-segment pmi-expense-cashflow-segment--debt" data-pmi-expense-cashflow-segment="debt"></span>
            <span class="pmi-expense-cashflow-segment pmi-expense-cashflow-segment--expenses" data-pmi-expense-cashflow-segment="expenses"></span>
            <span class="pmi-expense-cashflow-segment pmi-expense-cashflow-segment--remaining" data-pmi-expense-cashflow-segment="remaining"></span>
            <div class="pmi-expense-cashflow-center">
              <small>Remaining</small>
              <strong data-pmi-expense-cashflow-remaining>-</strong>
            </div>
          </div>
        </div>
        <div class="pmi-expense-cashflow-metrics" data-pmi-expense-cashflow-metrics>
          <span><b data-pmi-expense-cashflow-income>-</b><small>Take-home pay</small></span>
          <span><b data-pmi-expense-cashflow-housing>-</b><small>Housing burden</small></span>
          <span><b data-pmi-expense-cashflow-debt>-</b><small>Required debt</small></span>
          <span><b data-pmi-expense-cashflow-expenses>-</b><small>Lifestyle expenses</small></span>
          <span><b data-pmi-expense-cashflow-savings>-</b><small>Planned savings</small></span>
        </div>
        <div class="pmi-expense-cashflow-legend" aria-label="Cash-flow bar legend">
          <span><i class="pmi-expense-cashflow-legend-swatch pmi-expense-cashflow-legend-swatch--housing" aria-hidden="true"></i>Housing burden</span>
          <span><i class="pmi-expense-cashflow-legend-swatch pmi-expense-cashflow-legend-swatch--debt" aria-hidden="true"></i>Required debt</span>
          <span><i class="pmi-expense-cashflow-legend-swatch pmi-expense-cashflow-legend-swatch--expenses" aria-hidden="true"></i>Lifestyle expenses</span>
          <span><i class="pmi-expense-cashflow-legend-swatch pmi-expense-cashflow-legend-swatch--remaining" aria-hidden="true"></i>Remaining after savings</span>
        </div>
        <p class="pmi-expense-cashflow-note" data-pmi-expense-cashflow-note>Planned savings are applied after monthly obligations.</p>
      </section>
    `;
    root.dataset.pmiExpenseCashFlowInitialized = "true";
  }

  function getCashFlowElements(root) {
    const bar = root && typeof root.querySelector === "function"
      ? root.querySelector("[data-pmi-expense-cashflow-bar]")
      : null;
    if (!bar || typeof bar.querySelector !== "function") {
      return null;
    }

    return {
      bar,
      status: bar.querySelector("[data-pmi-expense-cashflow-status]"),
      income: bar.querySelector("[data-pmi-expense-cashflow-income]"),
      housing: bar.querySelector("[data-pmi-expense-cashflow-housing]"),
      debt: bar.querySelector("[data-pmi-expense-cashflow-debt]"),
      expenses: bar.querySelector("[data-pmi-expense-cashflow-expenses]"),
      savings: bar.querySelector("[data-pmi-expense-cashflow-savings]"),
      remaining: bar.querySelector("[data-pmi-expense-cashflow-remaining]"),
      note: bar.querySelector("[data-pmi-expense-cashflow-note]"),
      track: bar.querySelector("[data-pmi-expense-cashflow-track]")
    };
  }

  function getNamedFormControl(form, names) {
    if (!form || !form.elements || typeof form.elements.namedItem !== "function") {
      return null;
    }

    for (let index = 0; index < names.length; index += 1) {
      const control = form.elements.namedItem(names[index]);
      if (control && typeof control.value !== "undefined") {
        return control;
      }
    }

    return null;
  }

  function readControlNumber(control) {
    if (!control || typeof control.value === "undefined") {
      return null;
    }

    if (control.dataset && control.dataset.manualOverride === "true" && normalizeString(control.dataset.manualValue)) {
      return toOptionalNumber(control.dataset.manualValue);
    }

    if (control.dataset && normalizeString(control.dataset.calculatedValue)) {
      return toOptionalNumber(control.dataset.calculatedValue);
    }

    const normalizedValue = normalizeString(control.value);
    if (!normalizedValue) {
      return null;
    }

    const currencyLikeValue = normalizedValue.replace(/[^0-9.-]+/g, "");
    return toOptionalNumber(currencyLikeValue || normalizedValue);
  }

  function readControlString(control) {
    return control && typeof control.value !== "undefined" ? normalizeString(control.value) : "";
  }

  function createCommonExpenseSourceDataFromExpenseRecords(records) {
    const result = {};
    const recordTotals = {};

    (Array.isArray(records) ? records : []).forEach(function (record) {
      const ongoingSupportField = getCommonExpenseOngoingSupportFieldForRecord(record);
      const monthlyAmount = getRecordMonthlyAmount(record);
      if (!ongoingSupportField || monthlyAmount == null) {
        return;
      }

      recordTotals[ongoingSupportField] = (recordTotals[ongoingSupportField] || 0) + monthlyAmount;
    });

    Object.keys(recordTotals).forEach(function (ongoingSupportField) {
      result[ongoingSupportField] = recordTotals[ongoingSupportField];
    });

    return result;
  }

  function readDefaultCashFlowInputs(root, pageRoot) {
    const form = pageRoot || (root && typeof root.closest === "function" ? root.closest("form") : null);
    if (!form) {
      return {
        income: {},
        housing: {}
      };
    }

    const housingStatus = readControlString(getNamedFormControl(form, ["housingStatus"])).toLowerCase();
    const combinedNetAnnualIncomeControl = getNamedFormControl(form, ["netAnnualIncome"]);
    const spouseNetAnnualIncomeControl = getNamedFormControl(form, ["spouseNetAnnualIncome", "spouseOrPartnerNetAnnualIncome"]);
    const displayedNetAnnualIncome = readControlNumber(combinedNetAnnualIncomeControl);
    const spouseNetAnnualIncome = readControlNumber(spouseNetAnnualIncomeControl);
    const isSeparateIncomeSource = spouseNetAnnualIncome != null && spouseNetAnnualIncome > 0;
    const renterHousing = firstOptionalNumber([
      readControlNumber(getNamedFormControl(form, ["monthlyHousingCost", "monthlyRentOrHousingPayment", "monthlyRent"]))
    ]);
    const otherRenterHousing = readControlNumber(getNamedFormControl(form, ["otherMonthlyRenterHousingCosts"]));
    const monthlyUtilities = readControlNumber(getNamedFormControl(form, ["utilitiesCost"]));
    const monthlyHousingInsurance = readControlNumber(getNamedFormControl(form, ["housingInsuranceCost"]));
    const calculatedHousing = readControlNumber(getNamedFormControl(form, ["calculatedMonthlyMortgagePayment", "monthlyHousingSupportCost"]));
    const mortgagePaymentOnly = readControlNumber(getNamedFormControl(form, ["monthlyMortgagePaymentOnly"]));
    const associatedMonthlyCosts = readControlNumber(getNamedFormControl(form, ["associatedMonthlyCosts"]));
    let monthlyHousingCost = null;
    let housingSource = null;

    if (calculatedHousing != null && calculatedHousing > 0) {
      monthlyHousingCost = calculatedHousing;
      housingSource = "calculatedMonthlyMortgagePayment";
    } else if (housingStatus === "renter") {
      const rentTotal = (renterHousing == null ? 0 : renterHousing)
        + (otherRenterHousing == null ? 0 : otherRenterHousing)
        + (monthlyUtilities == null ? 0 : monthlyUtilities)
        + (monthlyHousingInsurance == null ? 0 : monthlyHousingInsurance);
      monthlyHousingCost = rentTotal > 0 ? rentTotal : null;
      housingSource = monthlyHousingCost == null ? null : "renter-housing-fields";
    } else if (housingStatus === "homeowner" || housingStatus === "owns free and clear") {
      if (monthlyHousingCost == null && (mortgagePaymentOnly != null || associatedMonthlyCosts != null)) {
        monthlyHousingCost = (mortgagePaymentOnly == null ? 0 : mortgagePaymentOnly) + (associatedMonthlyCosts == null ? 0 : associatedMonthlyCosts);
        housingSource = "monthlyMortgagePaymentOnly+associatedMonthlyCosts";
      }
    } else {
      monthlyHousingCost = firstOptionalNumber([
        calculatedHousing,
        renterHousing,
        mortgagePaymentOnly
      ]);
      housingSource = monthlyHousingCost == null ? null : "current-pmi-housing-payment";
    }

    return {
      income: {
        combinedAnnualNetIncome: isSeparateIncomeSource ? null : displayedNetAnnualIncome,
        netAnnualIncome: displayedNetAnnualIncome,
        spouseNetAnnualIncome
      },
      housing: {
        monthlyHousingCost,
        housingSource
      }
    };
  }

  function createModal(controller) {
    const documentRef = controller.documentRef;
    if (!documentRef || !documentRef.body) {
      return null;
    }

    const copy = controller.copy || RECORD_SCOPE_CONFIGS[DEFAULT_RECORD_SCOPE];
    const modal = documentRef.createElement("div");
    modal.className = "profile-search-modal";
    modal.setAttribute("data-pmi-expense-library-modal", "");
    modal.hidden = true;
    modal.innerHTML = `
      <div class="profile-search-modal-backdrop" data-pmi-expense-library-close></div>
      <div class="profile-search-modal-panel" role="dialog" aria-modal="true" aria-labelledby="${escapeHtml(copy.modalTitleId)}">
        <button class="profile-search-modal-close" type="button" aria-label="${escapeHtml(copy.modalCloseLabel)}" data-pmi-expense-library-close>x</button>
        <div class="profile-search-modal-header">
          <div>
            <h2 id="${escapeHtml(copy.modalTitleId)}">${escapeHtml(copy.modalTitle)}</h2>
            <p>${escapeHtml(copy.modalDescription)}</p>
          </div>
        </div>
        <div class="pmi-expense-library-search">
          <input type="text" placeholder="${escapeHtml(copy.searchPlaceholder)}" data-pmi-expense-library-search>
        </div>
        <div class="pmi-expense-library-filter-row" aria-label="${escapeHtml(copy.filterLabel)}">
          <button class="pmi-expense-library-filter is-active" type="button" data-pmi-expense-library-filter="suggested" aria-pressed="true">Suggested</button>
          <button class="pmi-expense-library-filter" type="button" data-pmi-expense-library-filter="all" aria-pressed="false">${escapeHtml(copy.allFilterLabel)}</button>
          <button class="pmi-expense-library-filter" type="button" data-pmi-expense-library-filter="recent" aria-pressed="false">Recent</button>
        </div>
        <div class="profile-search-results" data-pmi-expense-library-results></div>
      </div>
    `;

    documentRef.body.appendChild(modal);
    return modal;
  }

  function initPmiExpenseRecords(options) {
    const safeOptions = options && typeof options === "object" ? options : {};
    const root = typeof safeOptions.root === "string"
      ? document.querySelector(safeOptions.root)
      : safeOptions.root;

    if (!root) {
      return null;
    }

    const recordScope = normalizeRecordScope(safeOptions.recordScope);
    const copy = getRecordScopeConfig(recordScope);
    renderShell(root, copy);
    const cashFlowRoot = typeof safeOptions.cashFlowRoot === "string"
      ? document.querySelector(safeOptions.cashFlowRoot)
      : safeOptions.cashFlowRoot;
    const pageRoot = typeof safeOptions.pageRoot === "string"
      ? document.querySelector(safeOptions.pageRoot)
      : safeOptions.pageRoot;
    renderCashFlowBar(cashFlowRoot);

    const controller = {
      root,
      recordScope,
      copy,
      cashFlowRoot: cashFlowRoot || null,
      pageRoot: pageRoot || (root.closest && root.closest("form")) || null,
      documentRef: root.ownerDocument || document,
      records: [],
      generatedRecords: [],
      list: root.querySelector("[data-pmi-expense-records-list]"),
      addButton: root.querySelector("[data-pmi-expense-records-add]"),
      cashFlowElements: getCashFlowElements(cashFlowRoot),
      modal: null,
      searchInput: null,
      results: null
    };
    controller.libraryFilter = "suggested";
    controller.recentTypeKeys = [];
    controller.cashFlowDataProvider = typeof safeOptions.cashFlowDataProvider === "function"
      ? safeOptions.cashFlowDataProvider
      : function () {
        return readDefaultCashFlowInputs(root, controller.pageRoot);
      };
    controller.debtRecordsProvider = typeof safeOptions.debtRecordsProvider === "function"
      ? safeOptions.debtRecordsProvider
      : function () {
        const debtRecordsApi = lensAnalysis.pmiDebtRecords && typeof lensAnalysis.pmiDebtRecords === "object"
          ? lensAnalysis.pmiDebtRecords
          : {};
        return typeof debtRecordsApi.serializeDebtRecords === "function"
          ? debtRecordsApi.serializeDebtRecords()
          : [];
      };
    controller.savingsRecordsProvider = typeof safeOptions.savingsRecordsProvider === "function"
      ? safeOptions.savingsRecordsProvider
      : function () {
        return [];
      };

    function getRecordsSnapshot() {
      return controller.records.map(function (record) {
        return Object.assign({}, record, {
          metadata: clonePlainObject(record && record.metadata)
        });
      });
    }

    function notifyRecordsChanged() {
      if (!root || typeof root.dispatchEvent !== "function" || typeof global.CustomEvent !== "function") {
        return;
      }

      root.dispatchEvent(new global.CustomEvent("pmiExpenseRecordsChange", {
        bubbles: true,
        detail: {
          expenseRecords: getRecordsSnapshot()
        }
      }));
    }

    function getCashFlowInputData() {
      const providedData = typeof controller.cashFlowDataProvider === "function"
        ? controller.cashFlowDataProvider()
        : {};
      const safeProvidedData = providedData && typeof providedData === "object" ? providedData : {};
      return Object.assign({}, safeProvidedData, {
        expenseRecords: controller.records,
        generatedExpenseRecords: controller.generatedRecords,
        savingsHabitRecords: controller.savingsRecordsProvider()
      });
    }

    function setCashFlowText(element, value) {
      if (element) {
        element.textContent = value;
      }
    }

    function setCashFlowCenterAmountSize(element, value) {
      if (!element || !element.style) {
        return;
      }

      const normalizedValue = normalizeString(value);
      const compactLength = normalizedValue.replace(/\s+/g, "").length;
      let fontSize = "1.8rem";
      if (compactLength > 13) {
        fontSize = "1.08rem";
      } else if (compactLength > 11) {
        fontSize = "1.22rem";
      } else if (compactLength > 9) {
        fontSize = "1.38rem";
      } else if (compactLength > 7) {
        fontSize = "1.58rem";
      }

      if (typeof element.style.setProperty === "function") {
        element.style.setProperty("--cashflow-center-amount-size", fontSize);
        return;
      }

      element.style["--cashflow-center-amount-size"] = fontSize;
    }

    function setCashFlowShare(element, value) {
      if (!element || !element.style) {
        return;
      }

      element.style.flexBasis = Math.max(0, Math.min(100, value)).toFixed(2) + "%";
    }

    function setCashFlowDonut(track, shares) {
      if (!track || !track.style || !shares) {
        return;
      }

      const setProperty = typeof track.style.setProperty === "function"
        ? track.style.setProperty.bind(track.style)
        : function (name, value) {
          track.style[name] = value;
        };
      const segmentOrder = [
        { key: "housing", value: Math.max(0, Math.min(100, shares.housing || 0)) },
        { key: "debt", value: Math.max(0, Math.min(100, shares.debt || 0)) },
        { key: "expenses", value: Math.max(0, Math.min(100, shares.expenses || 0)) },
        { key: "remaining", value: Math.max(0, Math.min(100, shares.remaining || 0)) }
      ];
      const visibleSegments = segmentOrder.filter(function (segment) {
        return segment.value > 0.01;
      });
      const totalShare = visibleSegments.reduce(function (total, segment) {
        return total + segment.value;
      }, 0);
      const gapSize = visibleSegments.length > 1 ? 0.38 : 0;
      const availableShare = Math.max(0, 100 - (gapSize * visibleSegments.length));
      let cursor = visibleSegments.length > 1 ? gapSize / 2 : 0;
      let hasVisibleSegment = false;

      segmentOrder.forEach(function (segment) {
        if (segment.value > 0.01 && totalShare > 0) {
          if (hasVisibleSegment) {
            cursor += gapSize;
          }

          const segmentWidth = availableShare * (segment.value / totalShare);
          const segmentStart = Math.max(0, Math.min(100, cursor));
          const segmentEnd = Math.max(segmentStart, Math.min(100, segmentStart + segmentWidth));
          const segmentLength = Math.max(0, segmentEnd - segmentStart);
          setProperty("--cashflow-" + segment.key + "-start", segmentStart.toFixed(2) + "%");
          setProperty("--cashflow-" + segment.key + "-end", segmentEnd.toFixed(2) + "%");
          setProperty("--cashflow-" + segment.key + "-length", segmentLength.toFixed(2));
          setProperty("--cashflow-" + segment.key + "-offset", (-segmentStart).toFixed(2));
          cursor = segmentEnd;
          hasVisibleSegment = true;
          return;
        }

        const collapsedPosition = Math.max(0, Math.min(100, cursor));
        setProperty("--cashflow-" + segment.key + "-start", collapsedPosition.toFixed(2) + "%");
        setProperty("--cashflow-" + segment.key + "-end", collapsedPosition.toFixed(2) + "%");
        setProperty("--cashflow-" + segment.key + "-length", "0");
        setProperty("--cashflow-" + segment.key + "-offset", (-collapsedPosition).toFixed(2));
      });

      setProperty("--cashflow-remaining-color", shares.isNegative ? "var(--m90-critical)" : "var(--m90-stable)");
    }

    function updateCashFlowReadout() {
      const elements = controller.cashFlowElements;
      if (!elements) {
        return null;
      }

      const cashFlow = calculateMonthlyCashFlow(getCashFlowInputData());
      const visibleBudgetBase = Math.max(0, cashFlow.monthlyTakeHomePay - cashFlow.monthlyPlannedSavings);
      const denominator = Math.max(visibleBudgetBase, cashFlow.monthlyLivingOutflow, 1);
      const housingShare = cashFlow.monthlyHousingCost / denominator * 100;
      const debtShare = cashFlow.monthlyDebtPayments / denominator * 100;
      const expensesShare = cashFlow.monthlyExpenses / denominator * 100;
      const remainingShare = Math.max(0, cashFlow.remainingAfterSavings) / denominator * 100;
      setCashFlowText(elements.income, formatCashFlowAmount(cashFlow.monthlyTakeHomePay));
      setCashFlowText(elements.housing, formatCashFlowAmount(cashFlow.monthlyHousingCost));
      setCashFlowText(elements.debt, formatCashFlowAmount(cashFlow.monthlyDebtPayments));
      setCashFlowText(elements.expenses, formatCashFlowAmount(cashFlow.monthlyExpenses));
      setCashFlowText(elements.savings, formatCashFlowAmount(cashFlow.monthlyPlannedSavings));
      const formattedRemaining = formatCashFlowAmount(cashFlow.remainingAfterSavings);
      setCashFlowText(elements.remaining, formattedRemaining);
      setCashFlowCenterAmountSize(elements.remaining, formattedRemaining);
      let status = "After planned savings";
      if (cashFlow.shortfallBeforeSavings > 0) {
        status = "Expenses exceed income";
      } else if (cashFlow.savingsExceedAvailableSurplus) {
        status = "Savings exceed available surplus";
      } else if (cashFlow.monthlyPlannedSavings <= 0) {
        status = "Current cash flow";
      }
      setCashFlowText(elements.status, status);
      setCashFlowShare(elements.bar.querySelector('[data-pmi-expense-cashflow-segment="housing"]'), housingShare);
      setCashFlowShare(elements.bar.querySelector('[data-pmi-expense-cashflow-segment="debt"]'), debtShare);
      setCashFlowShare(elements.bar.querySelector('[data-pmi-expense-cashflow-segment="expenses"]'), expensesShare);
      setCashFlowShare(elements.bar.querySelector('[data-pmi-expense-cashflow-segment="remaining"]'), remainingShare);
      setCashFlowDonut(elements.track, {
        housing: housingShare,
        debt: debtShare,
        expenses: expensesShare,
        remaining: remainingShare,
        isNegative: cashFlow.isNegative
      });
      elements.bar.classList.toggle("is-negative", cashFlow.isNegative);
      elements.bar.classList.toggle("is-missing-income", !cashFlow.hasIncomeSource);

      const notes = [cashFlow.monthlyPlannedSavings > 0
        ? "Planned savings are applied after housing, debt, and lifestyle expenses."
        : "No planned savings entered."];
      if (!cashFlow.hasIncomeSource) {
        notes.push("Take-home pay is not available from current PMI income fields.");
      }
      if (cashFlow.trace.missing.indexOf("housing-payment-source") !== -1) {
        notes.push("Housing payment source is not available; home value and equity are not used.");
      }
      if (cashFlow.trace.excludedExpenses.some(function (entry) { return entry.reason === "one-time-expense-excluded"; })) {
        notes.push("One-time expenses are excluded from monthly cash flow.");
      }
      if (cashFlow.shortfallBeforeSavings > 0) {
        notes.push("Entered monthly obligations exceed monthly take-home pay before planned savings.");
      } else if (cashFlow.savingsExceedAvailableSurplus) {
        notes.push("Planned savings exceed available surplus after monthly obligations.");
      }
      if (cashFlow.trace.savingsContributionWarnings.length) {
        notes.push("Some savings records could not be included.");
      }
      setCashFlowText(elements.note, notes.join(" "));
      controller.lastMonthlyCashFlow = cashFlow;
      return cashFlow;
    }

    function syncRecordsFromDom() {
      if (!controller.list) {
        return;
      }

      const previousById = controller.records.reduce(function (map, record) {
        if (record.expenseId) {
          map[record.expenseId] = record;
        }
        return map;
      }, {});

      controller.records = Array.from(controller.list.querySelectorAll("[data-pmi-expense-record-entry]"))
        .map(function (row) {
          const expenseId = normalizeString(row.getAttribute("data-pmi-expense-id"));
          const existingRecord = previousById[expenseId] || {};
          const labelInput = row.querySelector("[data-pmi-expense-record-label]");
          const amountInput = row.querySelector("[data-pmi-expense-record-amount]");
          const frequencyInput = row.querySelector("[data-pmi-expense-record-frequency]");
          const termTypeInput = row.querySelector("[data-pmi-expense-record-term-type]");
          const continuationStatusInput = row.querySelector("[data-pmi-expense-record-continuation-status]");
          const targetAssetCategoryInput = row.querySelector("[data-pmi-expense-record-target-asset-category]");
          const termYearsInput = row.querySelector("[data-pmi-expense-record-term-years]");
          const endAgeInput = row.querySelector("[data-pmi-expense-record-end-age]");
          const endDateInput = row.querySelector("[data-pmi-expense-record-end-date]");
          const label = normalizeString(labelInput && labelInput.value) || existingRecord.label || "Added Expense";
          const termType = normalizeExpenseTermType(termTypeInput && termTypeInput.value, existingRecord.termType);

          return Object.assign({}, existingRecord, {
            expenseId: existingRecord.expenseId || expenseId || generateExpenseId(),
            label,
            amount: toOptionalNumber(amountInput && amountInput.value),
            frequency: normalizeExpenseFrequency(frequencyInput && frequencyInput.value, existingRecord.frequency),
            termType,
            continuationStatus: normalizeContinuationStatus(
              continuationStatusInput && continuationStatusInput.value,
              existingRecord.continuationStatus
            ),
            termYears: termType === "fixedYears" ? toOptionalNonNegativeNumber(termYearsInput && termYearsInput.value) : null,
            endAge: termType === "untilAge" ? toOptionalNonNegativeNumber(endAgeInput && endAgeInput.value) : null,
            endDate: termType === "untilDate" ? normalizeDateOnlyValue(endDateInput && endDateInput.value) : null,
            targetAssetCategoryKey: isSavingsRecordScope(controller.recordScope)
              ? normalizeSavingsTargetAssetCategoryKey(
                targetAssetCategoryInput && targetAssetCategoryInput.value,
                existingRecord.typeKey
              )
              : null
          });
        });
    }

    function renderRows() {
      if (!controller.list) {
        updateCashFlowReadout();
        return;
      }

      if (!controller.records.length && !controller.generatedRecords.length) {
        controller.list.innerHTML = "";
        updateCashFlowReadout();
        return;
      }

      const manualRowsMarkup = controller.records.map(function (record) {
        const expenseId = normalizeString(record.expenseId);
        const labelInputId = createInputId("pmi-expense-record", expenseId, "label");
        const amountInputId = createInputId("pmi-expense-record", expenseId, "amount");
        const frequencyInputId = createInputId("pmi-expense-record", expenseId, "frequency");
        const termTypeInputId = createInputId("pmi-expense-record", expenseId, "term-type");
        const continuationStatusInputId = createInputId("pmi-expense-record", expenseId, "continuation-status");
        const categoryId = createInputId("pmi-expense-record", expenseId, "category");
        const expenseTypeIcon = getExpenseTypeIconModel(record, {
          accessibleTypePrefix: controller.copy.accessibleTypePrefix
        });
        const categoryLabel = getCategoryLabel(record.categoryKey);
        const classificationMarkup = isSavingsRecordScope(controller.recordScope)
          ? renderSavingsTargetAssetField(record, expenseId, controller)
          : `
            <div class="pmi-expense-record-cell" role="cell" data-column-label="Continues?">
              <select id="${escapeHtml(continuationStatusInputId)}" data-pmi-expense-record-continuation-status aria-label="Continues after death?">
                ${renderSelectOptions(getContinuationStatusOptions(), normalizeContinuationStatus(record.continuationStatus, "review"))}
              </select>
            </div>
            <div class="pmi-expense-record-cell" role="cell" data-column-label="Category">
              <span class="pmi-expense-record-category-label" id="${escapeHtml(categoryId)}" title="${escapeHtml(categoryLabel)}">${escapeHtml(categoryLabel)}</span>
            </div>
          `;
        return `
          <div class="pmi-expense-record-row" role="row" data-pmi-expense-record-entry data-pmi-expense-id="${escapeHtml(expenseId)}">
            <div class="pmi-expense-record-cell pmi-expense-record-type-cell" role="cell" data-column-label="${escapeHtml(controller.copy.typeColumnLabel)}">
              ${renderExpenseTypeInlineLabel(expenseTypeIcon)}
            </div>
            <div class="pmi-expense-record-cell" role="cell" data-column-label="${escapeHtml(controller.copy.labelColumnLabel)}">
              <input id="${escapeHtml(labelInputId)}" data-pmi-expense-record-label type="text" value="${escapeHtml(record.label)}" aria-label="${escapeHtml(controller.copy.labelColumnLabel)}">
            </div>
            <div class="pmi-expense-record-cell" role="cell" data-column-label="${escapeHtml(controller.copy.amountLabel)}">
              <div class="profile-currency-field pmi-expense-record-compact-currency">
                <input id="${escapeHtml(amountInputId)}" data-pmi-expense-record-amount type="number" min="0" step="25" value="${escapeHtml(formatValueForInput(record.amount))}" aria-label="${escapeHtml(controller.copy.amountLabel)}">
                <span class="profile-currency-suffix">USD</span>
              </div>
            </div>
            <div class="pmi-expense-record-cell" role="cell" data-column-label="Frequency">
              <select id="${escapeHtml(frequencyInputId)}" data-pmi-expense-record-frequency aria-label="Frequency">
                ${renderSelectOptions(getFrequencyOptions(), normalizeString(record.frequency))}
              </select>
            </div>
            <div class="pmi-expense-record-cell" role="cell" data-column-label="Duration">
              <select id="${escapeHtml(termTypeInputId)}" data-pmi-expense-record-term-type aria-label="Duration">
                ${renderSelectOptions(getTermTypeOptions(), normalizeString(record.termType))}
              </select>
            </div>
            <div class="pmi-expense-record-cell" role="cell" data-column-label="Term Detail">
              ${renderCompactTermDetailField(record, expenseId)}
            </div>
            ${classificationMarkup}
            <div class="pmi-expense-record-cell pmi-expense-record-remove-cell" role="cell" data-column-label="Remove">
              <button class="pmi-asset-record-remove pmi-expense-record-remove" type="button" data-pmi-expense-record-remove aria-label="${escapeHtml(controller.copy.removeButtonPrefix)} ${escapeHtml(record.label)}">Remove</button>
            </div>
          </div>
        `;
      }).join("");
      const generatedRowsMarkup = controller.generatedRecords.map(renderGeneratedExpenseRow).join("");
      const rowsMarkup = manualRowsMarkup + generatedRowsMarkup;

      controller.list.innerHTML = `
        <div class="pmi-expense-records-table" role="table" aria-label="${escapeHtml(controller.copy.tableLabel)}" data-pmi-expense-records-table data-pmi-expense-record-scope="${escapeHtml(controller.recordScope)}">
          <div class="pmi-expense-records-header" role="row" data-pmi-expense-records-header>
            <span class="pmi-expense-record-type-header" role="columnheader">${escapeHtml(controller.copy.typeColumnLabel)}</span>
            <span role="columnheader">${escapeHtml(controller.copy.labelColumnLabel)}</span>
            <span role="columnheader">${escapeHtml(controller.copy.amountLabel)}</span>
            <span role="columnheader">Frequency</span>
            <span role="columnheader">Duration</span>
            <span role="columnheader">Term Detail</span>
            ${isSavingsRecordScope(controller.recordScope)
              ? `<span role="columnheader">${escapeHtml(controller.copy.targetAssetColumnLabel || "Asset Target")}</span>`
              : '<span role="columnheader">Continues?</span><span role="columnheader">Category</span>'}
            <span role="columnheader">Remove</span>
          </div>
          <div class="pmi-expense-records-body" role="rowgroup" data-pmi-expense-records-body>
            ${rowsMarkup}
          </div>
        </div>
      `;
      updateCashFlowReadout();
    }

    function renderResults() {
      if (!controller.results) {
        return;
      }

      const query = controller.searchInput ? controller.searchInput.value : "";
      const allEntries = getInitialAddableLibraryEntries(controller.recordScope);
      const suggestedTypeKeys = controller.copy.suggestedTypeKeys.reduce(function (map, typeKey) {
        map[typeKey] = true;
        return map;
      }, {});
      const recentTypeKeys = controller.recentTypeKeys.reduce(function (map, typeKey) {
        map[typeKey] = true;
        return map;
      }, {});
      const entries = allEntries.filter(function (entry) {
        if (!query && controller.libraryFilter === "suggested" && !suggestedTypeKeys[entry.typeKey]) {
          return false;
        }

        if (!query && controller.libraryFilter === "recent" && !recentTypeKeys[entry.typeKey]) {
          return false;
        }

        return matchesSearch(entry, query);
      });

      if (!entries.length) {
        controller.results.innerHTML = controller.libraryFilter === "recent" && !query
          ? `<div class="profile-search-results-empty">${escapeHtml(controller.copy.recentEmptyText)}</div>`
          : `<div class="profile-search-results-empty">${escapeHtml(controller.copy.searchEmptyText)}</div>`;
        return;
      }

      controller.results.innerHTML = groupEntriesByCategory(entries).map(function (group) {
        return `
          <section class="pmi-expense-library-group">
            <div class="pmi-asset-library-group-heading pmi-expense-library-group-heading">
              <h3>${escapeHtml(group.categoryLabel)}</h3>
              <span>${escapeHtml(group.entries.length)} ${group.entries.length === 1 ? escapeHtml(controller.copy.groupSingularLabel) : escapeHtml(controller.copy.groupPluralLabel)}</span>
            </div>
            <div class="pmi-asset-library-items pmi-expense-library-items">
              ${group.entries.map(function (entry) {
                return `
                  <button class="profile-search-result-button pmi-expense-library-result" type="button" data-pmi-expense-library-type-key="${escapeHtml(entry.typeKey)}">
                    <span class="pmi-asset-library-result-copy pmi-expense-library-result-copy">
                      <strong>${escapeHtml(entry.label)}</strong>
                      <span>${escapeHtml(entry.description || "")}</span>
                    </span>
                    <span class="pmi-asset-library-result-meta pmi-expense-library-result-meta">${escapeHtml(getCategoryLabel(entry.categoryKey))}</span>
                    <span class="pmi-asset-library-result-action pmi-expense-library-result-action" aria-hidden="true">
                      <img src="../Images/addasset.svg" alt="">
                    </span>
                  </button>
                `;
              }).join("")}
            </div>
          </section>
        `;
      }).join("");
    }

    function updateFilterButtons() {
      if (!controller.modal) {
        return;
      }

      controller.modal.querySelectorAll("[data-pmi-expense-library-filter]").forEach(function (button) {
        const isActive = button.getAttribute("data-pmi-expense-library-filter") === controller.libraryFilter;
        button.classList.toggle("is-active", isActive);
        button.setAttribute("aria-pressed", isActive ? "true" : "false");
      });
    }

    function closeModal() {
      if (controller.modal) {
        controller.modal.hidden = true;
      }
    }

    function addExpenseRecordFromLibraryEntry(entry) {
      const record = createExpenseRecordFromLibraryEntry(entry, {
        recordScope: controller.recordScope
      });
      if (!record) {
        return null;
      }

      syncRecordsFromDom();
      controller.records.push(record);
      controller.recentTypeKeys = [record.typeKey].concat(controller.recentTypeKeys.filter(function (typeKey) {
        return typeKey !== record.typeKey;
      })).slice(0, 8);
      renderRows();
      notifyRecordsChanged();
      return record;
    }

    function removeExpenseRecordById(expenseId) {
      const normalizedExpenseId = normalizeString(expenseId);
      if (!normalizedExpenseId) {
        return false;
      }

      syncRecordsFromDom();
      const nextRecords = controller.records.filter(function (record) {
        return record.expenseId !== normalizedExpenseId;
      });
      if (nextRecords.length === controller.records.length) {
        return false;
      }

      controller.records = nextRecords;
      renderRows();
      notifyRecordsChanged();
      return true;
    }

    function openModal() {
      if (!controller.modal) {
        controller.modal = createModal(controller);
        if (!controller.modal) {
          return;
        }

        controller.searchInput = controller.modal.querySelector("[data-pmi-expense-library-search]");
        controller.results = controller.modal.querySelector("[data-pmi-expense-library-results]");

        controller.modal.addEventListener("click", function (event) {
          if (event.target.closest("[data-pmi-expense-library-close]")) {
            closeModal();
            return;
          }

          const filterButton = event.target.closest("[data-pmi-expense-library-filter]");
          if (filterButton) {
            controller.libraryFilter = filterButton.getAttribute("data-pmi-expense-library-filter") || "suggested";
            updateFilterButtons();
            renderResults();
            return;
          }

          const resultButton = event.target.closest("[data-pmi-expense-library-type-key]");
          if (!resultButton) {
            return;
          }

          const entry = findLibraryEntry(resultButton.getAttribute("data-pmi-expense-library-type-key"));
          const record = addExpenseRecordFromLibraryEntry(entry);
          if (!record) {
            return;
          }

          closeModal();

          const row = controller.list
            ? Array.from(controller.list.querySelectorAll("[data-pmi-expense-record-entry]")).find(function (candidate) {
              return normalizeString(candidate.getAttribute("data-pmi-expense-id")) === record.expenseId;
            })
            : null;
          const amountInput = row && row.querySelector("[data-pmi-expense-record-amount]");
          if (amountInput && typeof amountInput.focus === "function") {
            amountInput.focus();
          }
        });

        controller.searchInput?.addEventListener("input", renderResults);
        controller.modal.addEventListener("keydown", function (event) {
          if (event.key === "Escape") {
            closeModal();
          }
        });
      }

      if (controller.searchInput) {
        controller.searchInput.value = "";
      }
      updateFilterButtons();
      renderResults();
      controller.modal.hidden = false;
      controller.searchInput?.focus();
    }

    function hydrateExpenseRecords(records) {
      controller.records = Array.isArray(records)
        ? records.map(function (record, index) {
          return normalizeRecordForUi(record, index, controller.recordScope);
        }).filter(Boolean)
        : createStarterExpenseRecords(controller.recordScope);
      renderRows();
      notifyRecordsChanged();
    }

    function hydrateGeneratedExpenseFacts(expenseFacts) {
      controller.generatedRecords = normalizeGeneratedExpenseFactsForUi(expenseFacts);
      renderRows();
    }

    function refreshGeneratedExpenseFactsFromDebtRecords() {
      const debtRecords = controller.debtRecordsProvider();
      controller.generatedRecords = createGeneratedExpenseFactsFromDebtRecords(debtRecords);
      renderRows();
    }

    function connectDebtRecordsGeneratedRows() {
      const form = root.closest && root.closest("form");
      const debtRoot = form && typeof form.querySelector === "function"
        ? form.querySelector("[data-pmi-debt-records-root]")
        : null;
      if (!debtRoot) {
        return;
      }

      const scheduleRefresh = function () {
        if (typeof global.requestAnimationFrame === "function") {
          global.requestAnimationFrame(refreshGeneratedExpenseFactsFromDebtRecords);
          return;
        }

        refreshGeneratedExpenseFactsFromDebtRecords();
      };

      debtRoot.addEventListener("input", scheduleRefresh);
      debtRoot.addEventListener("change", scheduleRefresh);
      debtRoot.addEventListener("click", scheduleRefresh);

      if (typeof global.MutationObserver === "function") {
        const observer = new global.MutationObserver(scheduleRefresh);
        observer.observe(debtRoot, {
          childList: true,
          subtree: true
        });
        controller.generatedDebtRowsObserver = observer;
      }
    }

    function connectCashFlowExternalInputs() {
      const form = controller.pageRoot || (root.closest && root.closest("form"));
      if (!form || typeof form.addEventListener !== "function") {
        return;
      }

      const scheduleUpdate = function (event) {
        if (event && root.contains && root.contains(event.target)) {
          return;
        }

        if (typeof global.requestAnimationFrame === "function") {
          global.requestAnimationFrame(updateCashFlowReadout);
          return;
        }

        updateCashFlowReadout();
      };

      form.addEventListener("input", scheduleUpdate);
      form.addEventListener("change", scheduleUpdate);
    }

    function serializeExpenseRecords() {
      syncRecordsFromDom();
      return controller.records
        .map(function (record) {
          const amount = toOptionalNumber(record.amount);
          const categoryKey = normalizeString(record.categoryKey);
          const typeKey = normalizeString(record.typeKey);
          const termType = normalizeExpenseTermType(record.termType, "ongoing");
          const frequency = normalizeExpenseFrequency(record.frequency, "monthly");
          const continuationStatus = normalizeContinuationStatus(record.continuationStatus, "review");
          const isDefaultExpense = controller.recordScope === DEFAULT_RECORD_SCOPE
            && record.isDefaultExpense === true
            && isStarterExpenseTypeKey(typeKey);
          const sourceKey = normalizeString(record.sourceKey) || null;
          const commonOngoingSupportField = isDefaultExpense
            ? normalizeString(getCommonExpenseRecordSourceField(typeKey)?.ongoingSupportField)
            : null;
          const metadata = clonePlainObject(record.metadata);
          const targetAssetCategoryKey = isSavingsRecordScope(controller.recordScope)
            ? normalizeSavingsTargetAssetCategoryKey(record.targetAssetCategoryKey, typeKey)
            : null;
          delete metadata.commonExpenseSourceKey;

          if ((!isDefaultExpense && amount == null) || amount < 0 || !categoryKey || !typeKey || !isValidExpenseCategory(categoryKey)) {
            return null;
          }

          return {
            expenseId: normalizeString(record.expenseId) || generateExpenseId(),
            categoryKey,
            typeKey,
            label: normalizeString(record.label) || typeKey || "Added Expense",
            amount,
            frequency,
            termType,
            continuationStatus,
            termYears: termType === "fixedYears" ? toOptionalNonNegativeNumber(record.termYears) : null,
            endAge: termType === "untilAge" ? toOptionalNonNegativeNumber(record.endAge) : null,
            endDate: termType === "untilDate" ? normalizeDateOnlyValue(record.endDate) : null,
            sourceKey,
            isDefaultExpense,
            isScalarFieldOwned: false,
            isProtected: false,
            isRepeatableExpenseRecord: true,
            isCustomExpense: record.isCustomExpense === true || typeKey === "customExpenseRecord" || categoryKey === "customExpense",
            ...(targetAssetCategoryKey ? {
              targetAssetCategoryKey,
              targetAssetCategoryLabel: getSavingsTargetAssetLabel(targetAssetCategoryKey)
            } : {}),
            notes: normalizeString(record.notes) || null,
            metadata: Object.assign({
              sourceType: "user-input",
              source: isDefaultExpense ? "starter-notebook" : "expense-library",
              libraryEntryKey: typeKey,
              commonExpenseOngoingSupportField: commonOngoingSupportField || null
            }, metadata)
          };
        })
        .filter(Boolean);
    }

    controller.hydrateExpenseRecords = hydrateExpenseRecords;
    controller.hydrateGeneratedExpenseFacts = hydrateGeneratedExpenseFacts;
    controller.refreshGeneratedExpenseFactsFromDebtRecords = refreshGeneratedExpenseFactsFromDebtRecords;
    controller.serializeExpenseRecords = serializeExpenseRecords;
    controller.addExpenseRecordFromLibraryEntry = addExpenseRecordFromLibraryEntry;
    controller.removeExpenseRecordById = removeExpenseRecordById;
    controller.updateCashFlowReadout = updateCashFlowReadout;

    controller.addButton?.addEventListener("click", openModal);
    controller.list?.addEventListener("click", function (event) {
      const removeButton = event.target.closest("[data-pmi-expense-record-remove]");
      if (!removeButton) {
        return;
      }

      const row = removeButton.closest("[data-pmi-expense-record-entry]");
      const expenseId = normalizeString(row && row.getAttribute("data-pmi-expense-id"));
      removeExpenseRecordById(expenseId);
    });

    controller.list?.addEventListener("input", function (event) {
      if (!event.target.closest("[data-pmi-expense-record-entry]")) {
        return;
      }

      syncRecordsFromDom();
      updateCashFlowReadout();
      notifyRecordsChanged();
    });

    controller.list?.addEventListener("change", function (event) {
      if (!event.target.closest("[data-pmi-expense-record-entry]")) {
        return;
      }

      syncRecordsFromDom();
      if (event.target.closest("[data-pmi-expense-record-term-type]")) {
        renderRows();
        notifyRecordsChanged();
        return;
      }
      updateCashFlowReadout();
      notifyRecordsChanged();
    });

    hydrateExpenseRecords();
    if (controller.recordScope === DEFAULT_RECORD_SCOPE) {
      connectCashFlowExternalInputs();
      connectDebtRecordsGeneratedRows();
      refreshGeneratedExpenseFactsFromDebtRecords();
      activeController = controller;
    }
    return controller;
  }

  function hydrateExpenseRecords(records) {
    if (activeController && typeof activeController.hydrateExpenseRecords === "function") {
      activeController.hydrateExpenseRecords(records);
    }
  }

  function hydrateGeneratedExpenseFacts(expenseFacts) {
    if (activeController && typeof activeController.hydrateGeneratedExpenseFacts === "function") {
      activeController.hydrateGeneratedExpenseFacts(expenseFacts);
    }
  }

  function refreshGeneratedExpenseFactsFromDebtRecords() {
    if (activeController && typeof activeController.refreshGeneratedExpenseFactsFromDebtRecords === "function") {
      activeController.refreshGeneratedExpenseFactsFromDebtRecords();
    }
  }

  function serializeExpenseRecords() {
    return activeController && typeof activeController.serializeExpenseRecords === "function"
      ? activeController.serializeExpenseRecords()
      : [];
  }

  lensAnalysis.pmiExpenseRecords = {
    initPmiExpenseRecords,
    hydrateExpenseRecords,
    hydrateGeneratedExpenseFacts,
    refreshGeneratedExpenseFactsFromDebtRecords,
    serializeExpenseRecords,
    createExpenseRecordFromLibraryEntry,
    createCommonExpenseSourceDataFromExpenseRecords,
    getInitialAddableExpenseEntries: function () {
      return getInitialAddableLibraryEntries(DEFAULT_RECORD_SCOPE);
    },
    getInitialAddableSavingsHabitEntries: function () {
      return getInitialAddableLibraryEntries(SAVINGS_RECORD_SCOPE);
    },
    getExpenseTypeIconFile,
    getExpenseTypeIconModel,
    calculateMonthlyCashFlow,
    toMonthlyCashFlowAmount
  };
})(window);
