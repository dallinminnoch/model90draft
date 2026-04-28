(function () {
  const LensApp = window.LensApp || (window.LensApp = {});
  const lensAnalysis = LensApp.lensAnalysis || (LensApp.lensAnalysis = {});
  const coverageUtils = LensApp.coverage || {};

  // Owner: existing-coverage Lens block module.
  // Purpose: summarize linked profile coveragePolicies[] into neutral Lens
  // coverage facts. Policy records remain profile-owned source data.
  // Non-goals: no DOM reads, no persistence, no policy editing, no legacy
  // scalar coverage fallback, no offsets, and no recommendation logic.

  const EXISTING_COVERAGE_BLOCK_ID = "existing-coverage";
  const EXISTING_COVERAGE_BLOCK_TYPE = "existing-coverage.profile-policies";
  const EXISTING_COVERAGE_BLOCK_VERSION = 1;

  const EXISTING_COVERAGE_BLOCK_SOURCE_FIELDS = Object.freeze({
    profilePolicies: "coveragePolicies"
  });

  const EXISTING_COVERAGE_BLOCK_OUTPUT_CONTRACT = Object.freeze({
    blockId: EXISTING_COVERAGE_BLOCK_ID,
    blockType: EXISTING_COVERAGE_BLOCK_TYPE,
    blockVersion: EXISTING_COVERAGE_BLOCK_VERSION,
    outputs: {
      profilePolicySummaries: {
        type: "array",
        canonicalDestination: "existingCoverage.profilePolicySummaries",
        meaning: "Safe compact summaries of linked profile policy records, not raw full policy storage."
      },
      profilePolicyCount: {
        type: "number",
        canonicalDestination: "existingCoverage.profilePolicyCount",
        meaning: "Count of linked profile coverage policy records."
      },
      individualProfileCoverageTotal: {
        type: "number|null",
        canonicalDestination: "existingCoverage.individualProfileCoverageTotal",
        meaning: "Total face amount for linked profile policies classified as individual coverage."
      },
      groupProfileCoverageTotal: {
        type: "number|null",
        canonicalDestination: "existingCoverage.groupProfileCoverageTotal",
        meaning: "Total face amount for linked profile policies classified as group or employer coverage."
      },
      unclassifiedProfileCoverageTotal: {
        type: "number|null",
        canonicalDestination: "existingCoverage.unclassifiedProfileCoverageTotal",
        meaning: "Total face amount for linked profile policies classified as unclassified or unknown coverage."
      },
      totalProfileCoverage: {
        type: "number|null",
        canonicalDestination: "existingCoverage.totalProfileCoverage",
        meaning: "Total profile policy coverage from linked profile coveragePolicies[]."
      },
      coverageSource: {
        type: "string",
        canonicalDestination: "existingCoverage.coverageSource",
        meaning: "profile-policies when linked profile policy records exist, otherwise none."
      },
      totalExistingCoverage: {
        type: "number|null",
        canonicalDestination: "existingCoverage.totalExistingCoverage",
        meaning: "Total existing coverage available from the profile-policy source. Not offset-adjusted or a recommendation."
      }
    }
  });

  function isCoverageUtilityAvailable() {
    return typeof coverageUtils.normalizeCoveragePolicyRecord === "function"
      && typeof coverageUtils.classifyCoveragePolicy === "function"
      && typeof coverageUtils.getCoverageDeathBenefitAmount === "function"
      && typeof coverageUtils.summarizeCoveragePolicies === "function";
  }

  function toPolicyArray(value) {
    return Array.isArray(value)
      ? value.filter(function (policy) {
          return policy && typeof policy === "object";
        })
      : [];
  }

  function toTrimmedString(value) {
    return String(value == null ? "" : value).trim();
  }

  function createProfilePolicySummary(policy, index) {
    const normalizedPolicy = coverageUtils.normalizeCoveragePolicyRecord(policy);
    const classification = coverageUtils.classifyCoveragePolicy(normalizedPolicy);
    const deathBenefitAmount = coverageUtils.getCoverageDeathBenefitAmount(normalizedPolicy);

    return {
      policyIndex: index,
      policyId: toTrimmedString(normalizedPolicy.id),
      entryMode: toTrimmedString(normalizedPolicy.entryMode),
      coverageClassification: toTrimmedString(classification),
      coverageSource: toTrimmedString(normalizedPolicy.coverageSource),
      policyType: toTrimmedString(normalizedPolicy.policyType),
      carrierName: toTrimmedString(normalizedPolicy.policyCarrier || normalizedPolicy.carrierName),
      employerOrPlanSponsor: toTrimmedString(normalizedPolicy.employerOrPlanSponsor),
      insuredName: toTrimmedString(normalizedPolicy.insuredName),
      ownerName: toTrimmedString(normalizedPolicy.ownerName),
      deathBenefitAmount,
      status: toTrimmedString(normalizedPolicy.status)
    };
  }

  function createProfileLinkedMetadata(outputValue, canonicalDestination) {
    const hasValue = Array.isArray(outputValue)
      ? outputValue.length > 0
      : outputValue != null;

    return lensAnalysis.createOutputMetadata({
      sourceType: hasValue ? "profile-linked" : "missing",
      confidence: hasValue ? "reported" : "unknown",
      rawField: EXISTING_COVERAGE_BLOCK_SOURCE_FIELDS.profilePolicies,
      canonicalDestination
    });
  }

  function createCalculatedCoverageMetadata(outputValue, canonicalDestination) {
    return lensAnalysis.createOutputMetadata({
      sourceType: outputValue == null ? "missing" : "calculated",
      confidence: outputValue == null ? "unknown" : "calculated_from_profile_policies",
      rawField: EXISTING_COVERAGE_BLOCK_SOURCE_FIELDS.profilePolicies,
      canonicalDestination
    });
  }

  function createExistingCoverageBlockOutput(sourceData) {
    const data = sourceData && typeof sourceData === "object" ? sourceData : {};
    const sourcePolicies = toPolicyArray(data[EXISTING_COVERAGE_BLOCK_SOURCE_FIELDS.profilePolicies]);
    const hasProfilePolicies = sourcePolicies.length > 0;
    const canSummarizeCoverage = isCoverageUtilityAvailable();
    const policySummaries = canSummarizeCoverage
      ? sourcePolicies.map(createProfilePolicySummary)
      : [];
    const summary = hasProfilePolicies && canSummarizeCoverage
      ? coverageUtils.summarizeCoveragePolicies(sourcePolicies)
      : null;

    const outputs = {
      profilePolicySummaries: policySummaries,
      profilePolicyCount: sourcePolicies.length,
      individualProfileCoverageTotal: hasProfilePolicies ? (summary?.individualCoverageTotal || 0) : null,
      groupProfileCoverageTotal: hasProfilePolicies ? (summary?.groupCoverageTotal || 0) : null,
      unclassifiedProfileCoverageTotal: hasProfilePolicies ? (summary?.unclassifiedCoverageTotal || 0) : null,
      totalProfileCoverage: hasProfilePolicies ? (summary?.totalCoverage || 0) : null,
      coverageSource: hasProfilePolicies ? "profile-policies" : "none",
      totalExistingCoverage: hasProfilePolicies ? (summary?.totalCoverage || 0) : null
    };

    return lensAnalysis.createBlockOutput({
      blockId: EXISTING_COVERAGE_BLOCK_ID,
      blockType: EXISTING_COVERAGE_BLOCK_TYPE,
      blockVersion: EXISTING_COVERAGE_BLOCK_VERSION,
      outputs,
      outputMetadata: {
        profilePolicySummaries: createProfileLinkedMetadata(
          outputs.profilePolicySummaries,
          EXISTING_COVERAGE_BLOCK_OUTPUT_CONTRACT.outputs.profilePolicySummaries.canonicalDestination
        ),
        profilePolicyCount: createProfileLinkedMetadata(
          outputs.profilePolicyCount,
          EXISTING_COVERAGE_BLOCK_OUTPUT_CONTRACT.outputs.profilePolicyCount.canonicalDestination
        ),
        individualProfileCoverageTotal: createCalculatedCoverageMetadata(
          outputs.individualProfileCoverageTotal,
          EXISTING_COVERAGE_BLOCK_OUTPUT_CONTRACT.outputs.individualProfileCoverageTotal.canonicalDestination
        ),
        groupProfileCoverageTotal: createCalculatedCoverageMetadata(
          outputs.groupProfileCoverageTotal,
          EXISTING_COVERAGE_BLOCK_OUTPUT_CONTRACT.outputs.groupProfileCoverageTotal.canonicalDestination
        ),
        unclassifiedProfileCoverageTotal: createCalculatedCoverageMetadata(
          outputs.unclassifiedProfileCoverageTotal,
          EXISTING_COVERAGE_BLOCK_OUTPUT_CONTRACT.outputs.unclassifiedProfileCoverageTotal.canonicalDestination
        ),
        totalProfileCoverage: createCalculatedCoverageMetadata(
          outputs.totalProfileCoverage,
          EXISTING_COVERAGE_BLOCK_OUTPUT_CONTRACT.outputs.totalProfileCoverage.canonicalDestination
        ),
        coverageSource: createProfileLinkedMetadata(
          outputs.coverageSource,
          EXISTING_COVERAGE_BLOCK_OUTPUT_CONTRACT.outputs.coverageSource.canonicalDestination
        ),
        totalExistingCoverage: createCalculatedCoverageMetadata(
          outputs.totalExistingCoverage,
          EXISTING_COVERAGE_BLOCK_OUTPUT_CONTRACT.outputs.totalExistingCoverage.canonicalDestination
        )
      }
    });
  }

  lensAnalysis.EXISTING_COVERAGE_BLOCK_ID = EXISTING_COVERAGE_BLOCK_ID;
  lensAnalysis.EXISTING_COVERAGE_BLOCK_TYPE = EXISTING_COVERAGE_BLOCK_TYPE;
  lensAnalysis.EXISTING_COVERAGE_BLOCK_VERSION = EXISTING_COVERAGE_BLOCK_VERSION;
  lensAnalysis.EXISTING_COVERAGE_BLOCK_SOURCE_FIELDS = EXISTING_COVERAGE_BLOCK_SOURCE_FIELDS;
  lensAnalysis.EXISTING_COVERAGE_BLOCK_OUTPUT_CONTRACT = EXISTING_COVERAGE_BLOCK_OUTPUT_CONTRACT;
  lensAnalysis.createExistingCoverageBlockOutput = createExistingCoverageBlockOutput;
})();
