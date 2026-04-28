(function () {
  const LensApp = window.LensApp || (window.LensApp = {});
  const lensAnalysis = LensApp.lensAnalysis || (LensApp.lensAnalysis = {});

  // Owner: lens-analysis feature module.
  // Purpose: define the canonical destination shape that raw PMI/profile data
  // should normalize into before any Lens method runs.
  // Non-goals: no DOM, no save/load logic, no formula logic, no page branching.
  const LENS_MODEL_SCHEMA_VERSION = "1.0.0";

  function createEmptyLensModel() {
    return {
      schemaVersion: LENS_MODEL_SCHEMA_VERSION,

      // Current income facts and income-replacement base inputs.
      // `spouseOrPartner*` means the current partner income context before the
      // insured's death. Active post-loss survivor assumptions normalize into
      // survivorScenario below.
      incomeBasis: {
        insuredGrossAnnualIncome: null,
        insuredNetAnnualIncome: null,
        bonusVariableAnnualIncome: null,
        annualEmployerBenefitsValue: null,
        // Neutral annual base for future analysis. This is not a total
        // replacement need, death benefit recommendation, or method result.
        annualIncomeReplacementBase: null,
        spouseOrPartnerGrossAnnualIncome: null,
        spouseOrPartnerNetAnnualIncome: null,
        survivorEarnedAnnualIncome: null,
        householdIncomeContributionPercent: null,
        incomeReplacementDurationYears: null,
        insuredRetirementHorizonYears: null,
        spouseOrPartnerRetirementHorizonYears: null,
        dependentSupportDurationYears: null,
        survivorIncomeStartDelayMonths: null,
        spouseOrPartnerIncomeGrowthRatePercent: null,
        householdExpenseReductionPercentAtDeath: null,
        spouseOrPartnerWorkReductionPercentAtDeath: null
      },

      // Post-death survivor and household scenario assumptions. These are
      // neutral planning facts only. They do not reduce ongoing support,
      // subtract from recommendations, calculate a coverage gap, or write into
      // current incomeBasis facts.
      survivorScenario: {
        survivorContinuesWorking: null,
        expectedSurvivorWorkReductionPercent: null,
        survivorGrossAnnualIncome: null,
        survivorNetAnnualIncome: null,
        survivorIncomeStartDelayMonths: null,
        survivorEarnedIncomeGrowthRatePercent: null,
        survivorRetirementHorizonYears: null,
        survivorNetIncomeTaxBasis: null
      },

      // Outstanding balances or payoff amounts to clear at death. Mortgage
      // stays explicit so DIME can keep it distinct from other debt. The
      // total is a method-agnostic card-level summary of these inputs, not a
      // method-specific analysis result.
      debtPayoff: {
        mortgageBalance: null,
        otherRealEstateLoanBalance: null,
        autoLoanBalance: null,
        creditCardBalance: null,
        studentLoanBalance: null,
        personalLoanBalance: null,
        businessDebtBalance: null,
        outstandingTaxLiabilities: null,
        otherDebtPayoffNeeds: null,
        totalDebtPayoffNeed: null
      },

      // Recurring survivor-support needs. Housing fields capture the current
      // monthly and annual support burden before any future mortgage payoff or
      // timeline adjustments. These are neutral facts, not recommendations.
      ongoingSupport: {
        currentMonthlyHouseholdExpenses: null,
        monthlyHousingSupportCost: null,
        annualHousingSupportCost: null,
        // Combined essential support summary. This is a neutral reusable
        // bucket-level composition, not a recommendation or death benefit.
        monthlyTotalEssentialSupportCost: null,
        annualTotalEssentialSupportCost: null,
        monthlyMortgagePayment: null,
        // Mortgage timing fact for future analysis. This pass does not decide
        // when mortgage support should phase out.
        mortgageRemainingTermMonths: null,
        mortgageInterestRatePercent: null,
        monthlyRentOrHousingPayment: null,
        // Renter-only recurring housing support component. This is not a
        // one-time transition need and does not apply to homeowner statuses.
        monthlyOtherRenterHousingCost: null,
        monthlyUtilities: null,
        monthlyHousingInsurance: null,
        monthlyPropertyTax: null,
        monthlyHoaCost: null,
        monthlyMaintenanceAndRepairs: null,
        monthlyFoodCost: null,
        monthlyTransportationCost: null,
        monthlyChildcareAndDependentCareCost: null,
        monthlyPhoneAndInternetCost: null,
        monthlyHouseholdSuppliesCost: null,
        monthlyHealthcareOutOfPocketCost: null,
        monthlyOtherInsuranceCost: null,
        monthlyOtherHouseholdExpenses: null,
        // Baseline non-housing survivor support excludes discretionary
        // personal spending by default. Scenario logic can include those later.
        monthlyNonHousingEssentialSupportCost: null,
        annualNonHousingEssentialSupportCost: null,
        monthlySubscriptionsCost: null,
        monthlyTravelAndDiscretionaryCost: null,
        // Discretionary/context spending is preserved separately and does not
        // feed baseline survivor support unless later logic explicitly opts in.
        monthlyDiscretionaryPersonalSpending: null,
        annualDiscretionaryPersonalSpending: null
      },

      // Dependent-support and education-funding needs. Linked/current and
      // additional planned dependents stay separate so normalization can
      // preserve source meaning. The total is a neutral lump-sum funding
      // target, not inflation-projected, present-valued, offset-adjusted, or a
      // recommendation.
      educationSupport: {
        linkedDependentCount: null,
        desiredAdditionalDependentCount: null,
        perLinkedDependentEducationFunding: null,
        perDesiredAdditionalDependentEducationFunding: null,
        sameEducationFundingForDesiredAdditionalDependents: null,
        linkedDependentEducationFundingNeed: null,
        desiredAdditionalDependentEducationFundingNeed: null,
        totalEducationFundingNeed: null
      },

      // Final life-event expenses. The total is a neutral lump-sum final
      // expense target, not inflation-adjusted, offset-adjusted, present-valued,
      // or a recommendation.
      finalExpenses: {
        funeralAndBurialCost: null,
        medicalEndOfLifeCost: null,
        estateSettlementCost: null,
        otherFinalExpenses: null,
        totalFinalExpenseNeed: null
      },

      // One-time survivor transition needs. These are neutral lump-sum
      // transition targets, not current assets, offsets, recurring support,
      // final expenses, education, debts, or recommendations.
      transitionNeeds: {
        survivorLiquidityBuffer: null,
        desiredEmergencyFund: null,
        housingTransitionReserve: null,
        otherTransitionNeeds: null,
        totalTransitionNeed: null
      },

      // Existing in-force coverage captured from linked profile policy records.
      // These are neutral reusable coverage facts. Analysis later decides
      // whether and how coverage offsets a recommendation.
      existingCoverage: {
        // Compact safe summaries for debug/future analysis, not raw policy
        // record storage and not a PMI-owned policy source of truth.
        profilePolicySummaries: [],
        profilePolicyCount: null,
        individualProfileCoverageTotal: null,
        groupProfileCoverageTotal: null,
        unclassifiedProfileCoverageTotal: null,
        totalProfileCoverage: null,
        coverageSource: null,
        totalExistingCoverage: null
      },

      // Raw asset facts projected from PMI asset source keys. This is not
      // treatment logic and does not replace the current offsetAssets
      // compatibility bucket.
      assetFacts: {
        assets: [],
        totalReportedAssetValue: null,
        metadata: {
          source: null,
          taxonomySource: null,
          omittedNoSourceCategoryKeys: []
        }
      },

      // Treated asset-offset output prepared from assetFacts plus Analysis
      // Setup treatment assumptions. Methods use this when Asset Offset Source
      // is Treated.
      treatedAssetOffsets: {
        assets: [],
        totalRawAssetValue: null,
        totalIncludedRawValue: null,
        totalTreatedAssetValue: null,
        excludedAssetValue: null,
        warnings: [],
        trace: [],
        metadata: {
          source: null,
          consumedByMethods: false
        }
      },

      // Current non-coverage assets that may later be considered as offsets.
      // These are neutral current-resource facts. They do not create needs,
      // subtract from needs, calculate a coverage gap, or produce a
      // recommendation.
      offsetAssets: {
        cashSavings: {
          value: null,
          includeInOffset: null,
          liquidityType: null,
          availablePercent: null,
          availableValue: null
        },
        currentEmergencyFund: {
          value: null,
          includeInOffset: null,
          liquidityType: null,
          availablePercent: null,
          availableValue: null
        },
        brokerageAccounts: {
          value: null,
          includeInOffset: null,
          liquidityType: null,
          availablePercent: null,
          availableValue: null
        },
        retirementAccounts: {
          value: null,
          includeInOffset: null,
          liquidityType: null,
          availablePercent: null,
          availableValue: null
        },
        realEstateEquity: {
          value: null,
          includeInOffset: null,
          liquidityType: null,
          availablePercent: null,
          availableValue: null
        },
        businessValue: {
          value: null,
          includeInOffset: null,
          liquidityType: null,
          availablePercent: null,
          availableValue: null
        },
        assetDataConfidence: null,
        totalReportedAssetValue: null,
        totalIncludedAssetValue: null,
        totalAvailableOffsetAssetValue: null
      },

      // Legacy offsets and in-force coverage placeholders retained for
      // compatibility/documentation while active assets normalize into
      // offsetAssets and policy coverage normalizes into existingCoverage.
      offsetsAndCoverage: {
        offsetAssetValues: {
          cashSavings: null,
          emergencyFund: null,
          brokerageAccounts: null,
          retirementAssets: null,
          realEstateEquity: null,
          businessValue: null
        },
        offsetAssetAvailabilityRules: {
          cashSavings: { isIncludedInOffset: null, liquidityCategory: null, percentAvailableForOffset: null },
          emergencyFund: { isIncludedInOffset: null, liquidityCategory: null, percentAvailableForOffset: null },
          brokerageAccounts: { isIncludedInOffset: null, liquidityCategory: null, percentAvailableForOffset: null },
          retirementAssets: { isIncludedInOffset: null, liquidityCategory: null, percentAvailableForOffset: null },
          realEstateEquity: { isIncludedInOffset: null, liquidityCategory: null, percentAvailableForOffset: null },
          businessValue: { isIncludedInOffset: null, liquidityCategory: null, percentAvailableForOffset: null }
        },
        offsetAssetTotals: {
          liquidAssetsAvailable: null,
          retirementAssetsAvailable: null,
          realEstateEquityAvailable: null,
          businessValueAvailable: null,
          otherAssetsAvailable: null,
          totalAssetsAvailableForOffset: null
        },
        currentCoverage: {
          individualInForceCoverageAmount: null,
          groupInForceCoverageAmount: null,
          totalInForceCoverageAmount: null,
          groupCoveragePortabilityStatus: null,
          individualCoverageType: null,
          individualCoverageYearsRemaining: null,
          coverageSourceType: null
        },
        offsetAssetConfidenceLevel: null
      },

      // Shared Lens assumptions and tax/filing context. Tax context is kept
      // separate from economic assumptions so factual filing inputs do not get
      // mixed with rate assumptions.
      assumptions: {
        taxContext: {
          maritalStatus: null,
          filingStatus: null,
          stateOfResidence: null,
          primaryDeductionMethod: null,
          spouseDeductionMethod: null,
          primaryItemizedDeductionAmount: null,
          spouseItemizedDeductionAmount: null
        },
        economicAssumptions: {
          inflationRatePercent: null,
          discountRatePercent: null,
          investmentReturnRatePercent: null,
          incomeGrowthRatePercent: null
        }
      },

      // Legacy one-time survivor obligations retained while downstream aliases
      // still exist. Active PMI transition reserves now normalize into
      // transitionNeeds above.
      oneTimeObligations: {
        immediateLiquidityNeed: null,
        housingTransitionReserve: null,
        specialPurposeFundingTotal: null,
        survivorEmergencyReserveGoal: null,
        otherOneTimeObligationsTotal: null
      }
    };
  }

  function deepFreeze(value) {
    if (!value || typeof value !== "object" || Object.isFrozen(value)) {
      return value;
    }

    Object.getOwnPropertyNames(value).forEach(function (key) {
      deepFreeze(value[key]);
    });

    return Object.freeze(value);
  }

  const EMPTY_LENS_MODEL = deepFreeze(createEmptyLensModel());

  lensAnalysis.LENS_MODEL_SCHEMA_VERSION = LENS_MODEL_SCHEMA_VERSION;
  lensAnalysis.EMPTY_LENS_MODEL = EMPTY_LENS_MODEL;
  lensAnalysis.createEmptyLensModel = createEmptyLensModel;
})();
