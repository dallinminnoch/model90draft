(function (global) {
  const LensApp = global.LensApp || (global.LensApp = {});
  const lensAnalysis = LensApp.lensAnalysis || (LensApp.lensAnalysis = {});

  // Owner: Lens analysis expense taxonomy.
  // Purpose: define broad raw expense category metadata for future PMI
  // expenseFacts and expenseRecords.
  // Non-goals: this module is metadata only; runtime behavior belongs to
  // future owners.

  const DEFAULT_EXPENSE_CATEGORIES = Object.freeze([
    Object.freeze({
      categoryKey: "medicalFinalExpense",
      label: "Medical Final Expense",
      description: "One-time medical and end-of-life costs that are part of final expense planning.",
      domain: "finalExpense",
      timingRole: "oneTime",
      isHealthcareSensitive: true,
      isFinalExpenseComponent: true,
      defaultInflationRole: "healthcareInflation",
      sortOrder: 10
    }),
    Object.freeze({
      categoryKey: "funeralBurial",
      label: "Funeral / Burial",
      description: "Funeral, burial, cremation, memorial, and related final arrangement costs.",
      domain: "finalExpense",
      timingRole: "oneTime",
      isHealthcareSensitive: false,
      isFinalExpenseComponent: true,
      defaultInflationRole: "finalExpenseInflation",
      sortOrder: 20
    }),
    Object.freeze({
      categoryKey: "estateSettlement",
      label: "Estate Settlement",
      description: "Probate, legal, tax preparation, executor, and estate administration costs.",
      domain: "finalExpense",
      timingRole: "oneTime",
      isHealthcareSensitive: false,
      isFinalExpenseComponent: true,
      defaultInflationRole: "finalExpenseInflation",
      sortOrder: 30
    }),
    Object.freeze({
      categoryKey: "otherFinalExpense",
      label: "Other Final Expense",
      description: "Other one-time final expenses not captured by the named final-expense buckets.",
      domain: "finalExpense",
      timingRole: "oneTime",
      isHealthcareSensitive: false,
      isFinalExpenseComponent: true,
      defaultInflationRole: "finalExpenseInflation",
      sortOrder: 40
    }),
    Object.freeze({
      categoryKey: "ongoingHealthcare",
      label: "Ongoing Healthcare",
      description: "Recurring health insurance, out-of-pocket care, medications, and ordinary healthcare costs.",
      domain: "healthcare",
      timingRole: "recurring",
      isHealthcareSensitive: true,
      isFinalExpenseComponent: false,
      defaultInflationRole: "healthcareInflation",
      sortOrder: 100
    }),
    Object.freeze({
      categoryKey: "dentalCare",
      label: "Dental Care",
      description: "Dental insurance, dental care, orthodontics, and related dental costs.",
      domain: "healthcare",
      timingRole: "mixed",
      isHealthcareSensitive: true,
      isFinalExpenseComponent: false,
      defaultInflationRole: "healthcareInflation",
      sortOrder: 110
    }),
    Object.freeze({
      categoryKey: "visionCare",
      label: "Vision Care",
      description: "Vision insurance, eye care, glasses, contacts, and related vision costs.",
      domain: "healthcare",
      timingRole: "mixed",
      isHealthcareSensitive: true,
      isFinalExpenseComponent: false,
      defaultInflationRole: "healthcareInflation",
      sortOrder: 120
    }),
    Object.freeze({
      categoryKey: "mentalHealthCare",
      label: "Mental Health Care",
      description: "Therapy, counseling, psychiatric care, and related mental health costs.",
      domain: "healthcare",
      timingRole: "recurring",
      isHealthcareSensitive: true,
      isFinalExpenseComponent: false,
      defaultInflationRole: "healthcareInflation",
      sortOrder: 130
    }),
    Object.freeze({
      categoryKey: "longTermCare",
      label: "Long-Term Care",
      description: "Assisted living, nursing care, memory care, adult day care, respite, and long-term custodial care costs.",
      domain: "healthcare",
      timingRole: "mixed",
      isHealthcareSensitive: true,
      isFinalExpenseComponent: false,
      defaultInflationRole: "healthcareInflation",
      sortOrder: 140
    }),
    Object.freeze({
      categoryKey: "homeHealthCare",
      label: "Home Health Care",
      description: "Home health aides, in-home nursing, medical alert monitoring, and care delivered in the home.",
      domain: "healthcare",
      timingRole: "recurring",
      isHealthcareSensitive: true,
      isFinalExpenseComponent: false,
      defaultInflationRole: "healthcareInflation",
      sortOrder: 150
    }),
    Object.freeze({
      categoryKey: "medicalEquipment",
      label: "Medical Equipment",
      description: "Durable medical equipment, hearing aids, mobility aids, adaptive modifications, and related equipment costs.",
      domain: "healthcare",
      timingRole: "mixed",
      isHealthcareSensitive: true,
      isFinalExpenseComponent: false,
      defaultInflationRole: "healthcareInflation",
      sortOrder: 160
    }),
    Object.freeze({
      categoryKey: "otherHealthcare",
      label: "Other Healthcare",
      description: "Healthcare costs that do not fit the standard medical, dental, vision, care, or equipment buckets.",
      domain: "healthcare",
      timingRole: "mixed",
      isHealthcareSensitive: true,
      isFinalExpenseComponent: false,
      defaultInflationRole: "healthcareInflation",
      sortOrder: 170
    }),
    Object.freeze({
      categoryKey: "housingExpense",
      label: "Housing Expense",
      description: "Rent, mortgage, property tax, homeowners insurance, HOA dues, maintenance, assessments, and related housing costs.",
      domain: "living",
      timingRole: "recurring",
      isHealthcareSensitive: false,
      isFinalExpenseComponent: false,
      defaultInflationRole: "householdInflation",
      sortOrder: 200
    }),
    Object.freeze({
      categoryKey: "utilities",
      label: "Utilities",
      description: "Utilities, internet, phone, and household service costs.",
      domain: "living",
      timingRole: "recurring",
      isHealthcareSensitive: false,
      isFinalExpenseComponent: false,
      defaultInflationRole: "householdInflation",
      sortOrder: 210
    }),
    Object.freeze({
      categoryKey: "foodGroceries",
      label: "Food / Groceries",
      description: "Groceries, household food, and ordinary family food costs.",
      domain: "living",
      timingRole: "recurring",
      isHealthcareSensitive: false,
      isFinalExpenseComponent: false,
      defaultInflationRole: "householdInflation",
      sortOrder: 220
    }),
    Object.freeze({
      categoryKey: "transportation",
      label: "Transportation",
      description: "Fuel, vehicle insurance, maintenance, transit, and transportation costs.",
      domain: "living",
      timingRole: "recurring",
      isHealthcareSensitive: false,
      isFinalExpenseComponent: false,
      defaultInflationRole: "householdInflation",
      sortOrder: 230
    }),
    Object.freeze({
      categoryKey: "insurancePremiums",
      label: "Insurance Premiums",
      description: "Non-health insurance premiums, including renters, umbrella, disability, life, and related household protection costs.",
      domain: "living",
      timingRole: "recurring",
      isHealthcareSensitive: false,
      isFinalExpenseComponent: false,
      defaultInflationRole: "householdInflation",
      sortOrder: 240
    }),
    Object.freeze({
      categoryKey: "childcare",
      label: "Childcare",
      description: "Childcare and dependent care costs.",
      domain: "living",
      timingRole: "recurring",
      isHealthcareSensitive: false,
      isFinalExpenseComponent: false,
      defaultInflationRole: "householdInflation",
      sortOrder: 250
    }),
    Object.freeze({
      categoryKey: "dependentSupport",
      label: "Dependent Support",
      description: "Support costs for dependents outside ordinary childcare or education buckets.",
      domain: "living",
      timingRole: "recurring",
      isHealthcareSensitive: false,
      isFinalExpenseComponent: false,
      defaultInflationRole: "householdInflation",
      sortOrder: 260
    }),
    Object.freeze({
      categoryKey: "personalLiving",
      label: "Personal Living",
      description: "Personal care, clothing, household supplies, memberships, and ordinary living expenses.",
      domain: "living",
      timingRole: "recurring",
      isHealthcareSensitive: false,
      isFinalExpenseComponent: false,
      defaultInflationRole: "householdInflation",
      sortOrder: 270
    }),
    Object.freeze({
      categoryKey: "otherLivingExpense",
      label: "Other Living Expense",
      description: "Other recurring living expenses not captured by a named household bucket.",
      domain: "living",
      timingRole: "mixed",
      isHealthcareSensitive: false,
      isFinalExpenseComponent: false,
      defaultInflationRole: "householdInflation",
      sortOrder: 280
    }),
    Object.freeze({
      categoryKey: "educationExpense",
      label: "Education Expense",
      description: "Tuition, tutoring, testing, and education-related expenses.",
      domain: "education",
      timingRole: "mixed",
      isHealthcareSensitive: false,
      isFinalExpenseComponent: false,
      defaultInflationRole: "educationInflation",
      sortOrder: 300
    }),
    Object.freeze({
      categoryKey: "childActivityExpense",
      label: "Child Activity Expense",
      description: "Sports, activities, enrichment, and extracurricular child expenses.",
      domain: "education",
      timingRole: "recurring",
      isHealthcareSensitive: false,
      isFinalExpenseComponent: false,
      defaultInflationRole: "educationInflation",
      sortOrder: 310
    }),
    Object.freeze({
      categoryKey: "childcareEducation",
      label: "Childcare Education",
      description: "Education-linked childcare, preschool, daycare, and early education costs.",
      domain: "education",
      timingRole: "recurring",
      isHealthcareSensitive: false,
      isFinalExpenseComponent: false,
      defaultInflationRole: "educationInflation",
      sortOrder: 320
    }),
    Object.freeze({
      categoryKey: "businessOverhead",
      label: "Business Overhead",
      description: "Business rent, payroll coverage, and operating overhead expenses.",
      domain: "business",
      timingRole: "recurring",
      isHealthcareSensitive: false,
      isFinalExpenseComponent: false,
      defaultInflationRole: "future",
      sortOrder: 400
    }),
    Object.freeze({
      categoryKey: "professionalServices",
      label: "Professional Services",
      description: "Professional fees, licensing, advisory, and service expenses.",
      domain: "business",
      timingRole: "mixed",
      isHealthcareSensitive: false,
      isFinalExpenseComponent: false,
      defaultInflationRole: "future",
      sortOrder: 410
    }),
    Object.freeze({
      categoryKey: "keyPersonReplacementExpense",
      label: "Key Person Replacement Expense",
      description: "One-time cost to replace a key person or critical professional role.",
      domain: "business",
      timingRole: "oneTime",
      isHealthcareSensitive: false,
      isFinalExpenseComponent: false,
      defaultInflationRole: "future",
      sortOrder: 420
    }),
    Object.freeze({
      categoryKey: "customExpense",
      label: "Custom Expense",
      description: "Advisor-defined expense category for costs not covered by the default taxonomy.",
      domain: "custom",
      timingRole: "mixed",
      isHealthcareSensitive: false,
      isFinalExpenseComponent: false,
      defaultInflationRole: "none",
      sortOrder: 900
    })
  ]);

  const EXPENSE_FREQUENCY_OPTIONS = Object.freeze([
    Object.freeze({ value: "weekly", label: "Weekly", sortOrder: 10 }),
    Object.freeze({ value: "monthly", label: "Monthly", sortOrder: 20 }),
    Object.freeze({ value: "quarterly", label: "Quarterly", sortOrder: 30 }),
    Object.freeze({ value: "semiAnnual", label: "Semiannual", sortOrder: 40 }),
    Object.freeze({ value: "annual", label: "Annual", sortOrder: 50 }),
    Object.freeze({ value: "oneTime", label: "One-Time", sortOrder: 60 })
  ]);

  const EXPENSE_TERM_TYPE_OPTIONS = Object.freeze([
    Object.freeze({ value: "ongoing", label: "Ongoing", sortOrder: 10 }),
    Object.freeze({ value: "fixedYears", label: "Fixed Years", sortOrder: 20 }),
    Object.freeze({ value: "untilAge", label: "Until Age", sortOrder: 30 }),
    Object.freeze({ value: "untilDate", label: "Until Date", sortOrder: 40 }),
    Object.freeze({ value: "oneTime", label: "One-Time", sortOrder: 50 })
  ]);

  const DEFAULT_EXPENSE_CATEGORY_KEYS = Object.freeze(
    DEFAULT_EXPENSE_CATEGORIES.map(function (category) {
      return category.categoryKey;
    })
  );

  const HEALTHCARE_SENSITIVE_EXPENSE_CATEGORY_KEYS = Object.freeze(
    DEFAULT_EXPENSE_CATEGORIES
      .filter(function (category) {
        return category.isHealthcareSensitive === true;
      })
      .map(function (category) {
        return category.categoryKey;
      })
  );

  const FINAL_EXPENSE_COMPONENT_CATEGORY_KEYS = Object.freeze(
    DEFAULT_EXPENSE_CATEGORIES
      .filter(function (category) {
        return category.isFinalExpenseComponent === true;
      })
      .map(function (category) {
        return category.categoryKey;
      })
  );

  const EXPENSE_FREQUENCY_VALUES = Object.freeze(
    EXPENSE_FREQUENCY_OPTIONS.map(function (option) {
      return option.value;
    })
  );

  const EXPENSE_TERM_TYPE_VALUES = Object.freeze(
    EXPENSE_TERM_TYPE_OPTIONS.map(function (option) {
      return option.value;
    })
  );

  function clonePlainObject(value) {
    return Object.assign({}, value);
  }

  function normalizeToken(value) {
    return String(value == null ? "" : value).trim();
  }

  function getExpenseCategories() {
    return DEFAULT_EXPENSE_CATEGORIES.map(clonePlainObject);
  }

  function getExpenseCategory(categoryKey) {
    const normalizedKey = normalizeToken(categoryKey);
    if (!normalizedKey) {
      return null;
    }

    const category = DEFAULT_EXPENSE_CATEGORIES.find(function (candidate) {
      return candidate.categoryKey === normalizedKey;
    });
    return category ? clonePlainObject(category) : null;
  }

  function isValidExpenseCategory(categoryKey) {
    return Boolean(getExpenseCategory(categoryKey));
  }

  function isValidExpenseFrequency(frequency) {
    return EXPENSE_FREQUENCY_VALUES.indexOf(normalizeToken(frequency)) !== -1;
  }

  function isValidExpenseTermType(termType) {
    return EXPENSE_TERM_TYPE_VALUES.indexOf(normalizeToken(termType)) !== -1;
  }

  function normalizeExpenseFrequency(frequency, fallback) {
    const normalizedFrequency = normalizeToken(frequency);
    if (isValidExpenseFrequency(normalizedFrequency)) {
      return normalizedFrequency;
    }

    const normalizedFallback = normalizeToken(fallback);
    return isValidExpenseFrequency(normalizedFallback) ? normalizedFallback : "monthly";
  }

  function normalizeExpenseTermType(termType, fallback) {
    const normalizedTermType = normalizeToken(termType);
    if (isValidExpenseTermType(normalizedTermType)) {
      return normalizedTermType;
    }

    const normalizedFallback = normalizeToken(fallback);
    return isValidExpenseTermType(normalizedFallback) ? normalizedFallback : "ongoing";
  }

  lensAnalysis.expenseTaxonomy = Object.freeze({
    DEFAULT_EXPENSE_CATEGORIES,
    DEFAULT_EXPENSE_CATEGORY_KEYS,
    HEALTHCARE_SENSITIVE_EXPENSE_CATEGORY_KEYS,
    FINAL_EXPENSE_COMPONENT_CATEGORY_KEYS,
    EXPENSE_FREQUENCY_OPTIONS,
    EXPENSE_FREQUENCY_VALUES,
    EXPENSE_TERM_TYPE_OPTIONS,
    EXPENSE_TERM_TYPE_VALUES,
    getExpenseCategories,
    getExpenseCategory,
    isValidExpenseCategory,
    isValidExpenseFrequency,
    isValidExpenseTermType,
    normalizeExpenseFrequency,
    normalizeExpenseTermType
  });
})(window);
