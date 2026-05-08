(function (global) {
  const LensApp = global.LensApp || (global.LensApp = {});
  const lensAnalysis = LensApp.lensAnalysis || (LensApp.lensAnalysis = {});

  // Owner: inactive living-floor context preparation for remaining-household floors.
  // Non-goals: no floor calculation, scenario wiring, persistence, DOM access,
  // normalization mutation, policy resolution, or display rendering.

  const CONTEXT_RESOLVER_VERSION = 1;
  const ACTIVE_RUNTIME_CONSUMER = false;
  const DECEASED_INSURED_COUNT_DEFAULT = 1;

  const STATE_CODE_VALUES = Object.freeze([
    "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "DC", "FL",
    "GA", "HI", "ID", "IL", "IN", "IA", "KS", "KY", "LA", "ME",
    "MD", "MA", "MI", "MN", "MS", "MO", "MT", "NE", "NV", "NH",
    "NJ", "NM", "NY", "NC", "ND", "OH", "OK", "OR", "PA", "RI",
    "SC", "SD", "TN", "TX", "UT", "VT", "VA", "WA", "WV", "WI",
    "WY"
  ]);

  const FOOD_AT_HOME_BAND_KEYS = Object.freeze([
    "infantToddler",
    "youngChild",
    "olderChild",
    "teenMale",
    "teenFemale",
    "adultMale",
    "adultFemale",
    "adultUnknown",
    "childUnknown"
  ]);

  const STATE_SOURCE_PRIORITY = Object.freeze([
    "profileAddressState",
    "pmiIncomeTaxState",
    "accountDefaultState",
    "nationalDefault"
  ]);

  function isPlainObject(value) {
    return Boolean(value && typeof value === "object" && !Array.isArray(value));
  }

  function clonePlainValue(value) {
    if (Array.isArray(value)) {
      return value.map(clonePlainValue);
    }

    if (isPlainObject(value)) {
      return Object.keys(value).sort().reduce(function (clone, key) {
        const nextValue = clonePlainValue(value[key]);
        if (nextValue !== undefined) {
          clone[key] = nextValue;
        }
        return clone;
      }, {});
    }

    if (typeof value === "number") {
      return Number.isFinite(value) ? value : null;
    }

    return value === undefined ? null : value;
  }

  function normalizeString(value) {
    return String(value == null ? "" : value).trim();
  }

  function toOptionalNumber(value) {
    if (value == null || value === "") {
      return null;
    }

    if (typeof value === "number") {
      return Number.isFinite(value) ? value : null;
    }

    const normalized = String(value).replace(/[$,%\s,]/g, "").trim();
    if (!normalized) {
      return null;
    }

    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : null;
  }

  function toNonnegativeInteger(value) {
    const parsed = toOptionalNumber(value);
    return parsed === null || parsed < 0 ? null : Math.floor(parsed);
  }

  function createIssue(code, message, details) {
    const issue = { code, message };
    if (details !== undefined) {
      issue.details = clonePlainValue(details);
    }
    return issue;
  }

  function addWarning(warnings, code, message, details) {
    warnings.push(createIssue(code, message, details));
  }

  function addDataGap(dataGaps, code, message, details) {
    dataGaps.push(createIssue(code, message, details));
  }

  function getNestedValue(source, path) {
    if (!isPlainObject(source)) {
      return undefined;
    }

    return path.reduce(function (current, key) {
      return current == null ? undefined : current[key];
    }, source);
  }

  function getFirstPresent(candidates) {
    for (let index = 0; index < candidates.length; index += 1) {
      const value = candidates[index];
      if (value !== null && value !== undefined && normalizeString(value) !== "") {
        return value;
      }
    }
    return null;
  }

  function normalizeStateCode(value) {
    const stateCode = normalizeString(value).toUpperCase();
    return STATE_CODE_VALUES.includes(stateCode) ? stateCode : "";
  }

  function resolveStateCandidate(label, value, warnings) {
    const rawValue = normalizeString(value);
    if (!rawValue) {
      return {
        rawValue: null,
        stateCode: null
      };
    }

    const stateCode = normalizeStateCode(rawValue);
    if (!stateCode) {
      addWarning(
        warnings,
        "invalid-state-code-ignored",
        "State value was ignored because it was not a valid USPS code.",
        { stateSource: label, received: rawValue }
      );
      return {
        rawValue,
        stateCode: null
      };
    }

    return {
      rawValue,
      stateCode
    };
  }

  function resolveStateContext(input, warnings, dataGaps) {
    const profileRecord = isPlainObject(input.profileRecord) ? input.profileRecord : {};
    const profileFacts = isPlainObject(input.profileFacts) ? input.profileFacts : {};
    const pmiFacts = isPlainObject(input.pmiFacts) ? input.pmiFacts : {};
    const taxContext = isPlainObject(input.taxContext) ? input.taxContext : {};
    const accountContext = isPlainObject(input.accountContext) ? input.accountContext : {};

    const profileCandidate = resolveStateCandidate("profileAddressState", getFirstPresent([
      input.profileAddressState,
      profileRecord.state,
      profileRecord.addressState,
      getNestedValue(profileRecord, ["address", "state"]),
      profileFacts.state,
      profileFacts.addressState
    ]), warnings);

    const pmiCandidate = resolveStateCandidate("pmiIncomeTaxState", getFirstPresent([
      input.stateOfResidence,
      pmiFacts.stateOfResidence,
      taxContext.stateOfResidence,
      getNestedValue(profileFacts, ["taxContext", "stateOfResidence"])
    ]), warnings);

    const accountCandidate = resolveStateCandidate("accountDefaultState", getFirstPresent([
      input.accountDefaultState,
      accountContext.defaultState,
      accountContext.accountDefaultState
    ]), warnings);

    const stateMismatchWarning = profileCandidate.stateCode && pmiCandidate.stateCode && profileCandidate.stateCode !== pmiCandidate.stateCode
      ? "profile-pmi-state-mismatch"
      : null;
    if (stateMismatchWarning) {
      addWarning(
        warnings,
        stateMismatchWarning,
        "Profile address state and PMI income/tax state differ; profile address state was used by priority.",
        {
          profileAddressState: profileCandidate.stateCode,
          pmiIncomeTaxState: pmiCandidate.stateCode
        }
      );
    }

    const stateUsed = profileCandidate.stateCode
      || pmiCandidate.stateCode
      || accountCandidate.stateCode
      || "nationalDefault";
    const stateSource = profileCandidate.stateCode
      ? "profileAddressState"
      : pmiCandidate.stateCode
        ? "pmiIncomeTaxState"
        : accountCandidate.stateCode
          ? "accountDefaultState"
          : "nationalDefault";
    const nationalFallbackUsed = stateSource === "nationalDefault";

    if (nationalFallbackUsed) {
      addDataGap(
        dataGaps,
        "state-national-default-used",
        "No valid profile, PMI income/tax, or account default state was available; national default was used."
      );
    }

    return {
      profileAddressState: profileCandidate.stateCode,
      pmiIncomeTaxState: pmiCandidate.stateCode,
      accountDefaultState: accountCandidate.stateCode,
      stateUsed,
      stateSource,
      stateMismatchWarning,
      nationalFallbackUsed
    };
  }

  function parseDateOnly(value) {
    const normalized = normalizeString(value);
    const match = normalized.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!match) {
      return null;
    }

    const year = Number(match[1]);
    const monthIndex = Number(match[2]) - 1;
    const day = Number(match[3]);
    const date = new Date(year, monthIndex, day);
    if (
      Number.isNaN(date.getTime())
      || date.getFullYear() !== year
      || date.getMonth() !== monthIndex
      || date.getDate() !== day
    ) {
      return null;
    }

    return date;
  }

  function calculateAge(dateOfBirth, valuationDate) {
    const birth = parseDateOnly(dateOfBirth);
    const valuation = parseDateOnly(valuationDate);
    if (!birth || !valuation) {
      return null;
    }

    let age = valuation.getFullYear() - birth.getFullYear();
    const birthdayHasOccurred = valuation.getMonth() > birth.getMonth()
      || (
        valuation.getMonth() === birth.getMonth()
        && valuation.getDate() >= birth.getDate()
      );

    if (!birthdayHasOccurred) {
      age -= 1;
    }

    return age >= 0 ? age : null;
  }

  function normalizeSex(value) {
    const normalized = normalizeString(value).toLowerCase();
    if (["m", "male", "man", "boy"].includes(normalized)) {
      return "male";
    }
    if (["f", "female", "woman", "girl"].includes(normalized)) {
      return "female";
    }
    return "unknown";
  }

  function normalizeMaritalStatus(value) {
    return normalizeString(value).toLowerCase();
  }

  function isMarriedOrPartnered(value) {
    const status = normalizeMaritalStatus(value);
    return [
      "married",
      "married filing jointly",
      "married filing separately",
      "partnered",
      "domestic partnership",
      "civil union",
      "spouse",
      "partner"
    ].includes(status);
  }

  function parseMaybeJsonArray(value) {
    if (Array.isArray(value)) {
      return value;
    }

    if (typeof value !== "string") {
      return [];
    }

    const normalized = value.trim();
    if (!normalized) {
      return [];
    }

    try {
      const parsed = JSON.parse(normalized);
      return Array.isArray(parsed) ? parsed : [];
    } catch (_error) {
      return [];
    }
  }

  function hasPresentValue(value) {
    return value !== null && value !== undefined && normalizeString(value) !== "";
  }

  function createMember(role, source, fields) {
    const safeFields = isPlainObject(fields) ? fields : {};
    return {
      role,
      source,
      dateOfBirth: normalizeString(safeFields.dateOfBirth || safeFields.birthDate || safeFields.dob),
      age: toNonnegativeInteger(safeFields.age || safeFields.calculatedAge || safeFields.ageText),
      sex: normalizeSex(safeFields.sex || safeFields.gender),
      relationship: normalizeString(safeFields.relationship || safeFields.relation || role)
    };
  }

  function getClientMember(input) {
    const profileRecord = isPlainObject(input.profileRecord) ? input.profileRecord : {};
    const profileFacts = isPlainObject(input.profileFacts) ? input.profileFacts : {};
    return createMember("client", "profileRecord", {
      dateOfBirth: getFirstPresent([
        input.clientDateOfBirth,
        profileRecord.dateOfBirth,
        profileRecord.birthDate,
        profileRecord.clientDateOfBirth,
        profileFacts.dateOfBirth,
        profileFacts.clientDateOfBirth
      ]),
      age: getFirstPresent([
        input.clientAge,
        profileRecord.age,
        profileRecord.clientAge,
        profileFacts.age,
        profileFacts.clientAge
      ]),
      sex: getFirstPresent([
        input.clientSex,
        input.clientGender,
        profileRecord.sex,
        profileRecord.gender,
        profileFacts.sex,
        profileFacts.gender
      ])
    });
  }

  function getSpouseMember(input) {
    const profileRecord = isPlainObject(input.profileRecord) ? input.profileRecord : {};
    const profileFacts = isPlainObject(input.profileFacts) ? input.profileFacts : {};
    const spouse = isPlainObject(profileRecord.spouse)
      ? profileRecord.spouse
      : isPlainObject(profileRecord.partner)
        ? profileRecord.partner
        : {};
    const spouseFacts = isPlainObject(profileFacts.spouse)
      ? profileFacts.spouse
      : isPlainObject(profileFacts.partner)
        ? profileFacts.partner
        : {};

    return createMember("spouse", "profileRecord.spouse", {
      dateOfBirth: getFirstPresent([
        input.spouseDateOfBirth,
        profileRecord.spouseDateOfBirth,
        profileRecord.partnerDateOfBirth,
        spouse.dateOfBirth,
        spouse.birthDate,
        profileFacts.spouseDateOfBirth,
        spouseFacts.dateOfBirth,
        spouseFacts.birthDate
      ]),
      age: getFirstPresent([
        input.spouseAge,
        profileRecord.spouseAge,
        profileRecord.partnerAge,
        spouse.age,
        profileFacts.spouseAge,
        spouseFacts.age
      ]),
      sex: getFirstPresent([
        input.spouseSex,
        input.spouseGender,
        profileRecord.spouseSex,
        profileRecord.spouseGender,
        spouse.sex,
        spouse.gender,
        profileFacts.spouseSex,
        profileFacts.spouseGender,
        spouseFacts.sex,
        spouseFacts.gender
      ])
    });
  }

  function hasSpouseOrPartner(input) {
    const profileRecord = isPlainObject(input.profileRecord) ? input.profileRecord : {};
    const profileFacts = isPlainObject(input.profileFacts) ? input.profileFacts : {};
    const spouse = isPlainObject(profileRecord.spouse) ? profileRecord.spouse : {};
    const partner = isPlainObject(profileRecord.partner) ? profileRecord.partner : {};
    return isMarriedOrPartnered(getFirstPresent([
      input.maritalStatus,
      profileRecord.maritalStatus,
      profileRecord.linkedMaritalStatusDisplay,
      profileFacts.maritalStatus,
      profileFacts.linkedMaritalStatusDisplay
    ]))
      || ["spouseDateOfBirth", "spouseAge", "spouseIncome", "partnerDateOfBirth", "partnerAge"].some(function (field) {
        return hasPresentValue(profileRecord[field]);
      })
      || Object.keys(spouse).length > 0
      || Object.keys(partner).length > 0;
  }

  function isProjectedOrFutureDependent(detail) {
    const status = normalizeString(detail.status || detail.lifecycleStatus || detail.type).toLowerCase();
    const relationship = normalizeString(detail.relationship || detail.relation).toLowerCase();
    return detail.projected === true
      || detail.future === true
      || detail.planned === true
      || ["projected", "future", "planned"].includes(status)
      || relationship.includes("projected")
      || relationship.includes("future")
      || relationship.includes("planned");
  }

  function normalizeDependentDetail(detail, source, index) {
    const safeDetail = isPlainObject(detail) ? detail : { age: detail };
    if (isProjectedOrFutureDependent(safeDetail)) {
      return null;
    }

    return createMember("dependent", `${source}[${index}]`, safeDetail);
  }

  function getStructuredDependentsFromValue(value, source) {
    const parsed = parseMaybeJsonArray(value);
    if (!parsed.length) {
      return [];
    }

    return parsed.map(function (detail, index) {
      return normalizeDependentDetail(detail, source, index);
    }).filter(Boolean);
  }

  function isDependentHouseholdMember(member) {
    if (!isPlainObject(member) || isProjectedOrFutureDependent(member)) {
      return false;
    }

    if (member.isDependent === true || member.dependent === true) {
      return true;
    }

    const relationship = normalizeString(member.relationship || member.relation || member.type).toLowerCase();
    return [
      "dependent",
      "child",
      "children",
      "son",
      "daughter",
      "minor",
      "student"
    ].some(function (token) {
      return relationship.includes(token);
    });
  }

  function createFallbackDependents(count, source) {
    const safeCount = Math.max(0, count || 0);
    return Array.from({ length: safeCount }, function (_value, index) {
      return createMember("dependent", `${source}[${index}]`, {});
    });
  }

  function collectCurrentDependents(input, trace) {
    const profileRecord = isPlainObject(input.profileRecord) ? input.profileRecord : {};
    const profileFacts = isPlainObject(input.profileFacts) ? input.profileFacts : {};

    const structuredSources = [
      { source: "input.dependentDetails", value: input.dependentDetails },
      { source: "profileRecord.dependentDetails", value: profileRecord.dependentDetails },
      { source: "profileFacts.dependentDetails", value: profileFacts.dependentDetails },
      { source: "input.dependents", value: input.dependents },
      { source: "profileRecord.dependents", value: profileRecord.dependents },
      { source: "profileFacts.dependents", value: profileFacts.dependents },
      { source: "input.householdMembers", value: input.householdMembers },
      { source: "profileRecord.householdMembers", value: profileRecord.householdMembers },
      { source: "profileFacts.householdMembers", value: profileFacts.householdMembers }
    ];

    for (let index = 0; index < structuredSources.length; index += 1) {
      const candidate = structuredSources[index];
      if (candidate.source.endsWith("householdMembers")) {
        const members = parseMaybeJsonArray(candidate.value)
          .filter(isDependentHouseholdMember)
          .map(function (member, memberIndex) {
            return normalizeDependentDetail(member, candidate.source, memberIndex);
          })
          .filter(Boolean);
        if (members.length) {
          trace.dependentSource = candidate.source;
          trace.usedStructuredDependentSource = true;
          return members;
        }
        continue;
      }

      const members = getStructuredDependentsFromValue(candidate.value, candidate.source);
      if (members.length) {
        trace.dependentSource = candidate.source;
        trace.usedStructuredDependentSource = true;
        return members;
      }
    }

    const fallbackCount = toNonnegativeInteger(getFirstPresent([
      input.currentDependentsCount,
      input.dependentsCount,
      input.dependentCount,
      profileRecord.currentDependentsCount,
      profileRecord.dependentsCount,
      profileRecord.dependentCount,
      profileFacts.currentDependentsCount,
      profileFacts.dependentsCount,
      profileFacts.dependentCount
    ]));

    if (fallbackCount !== null && fallbackCount > 0) {
      trace.dependentSource = "dependentsCount";
      trace.usedStructuredDependentSource = false;
      trace.dependentCountFallbackUsed = true;
      return createFallbackDependents(fallbackCount, "dependentsCount");
    }

    trace.dependentSource = "none";
    trace.usedStructuredDependentSource = false;
    return [];
  }

  function resolveValuationDate(input) {
    return normalizeString(input.valuationDate || getNestedValue(input, ["scenarioContext", "valuationDate"]));
  }

  function resolveAge(member, valuationDate, flags) {
    if (member.dateOfBirth && valuationDate) {
      const dobAge = calculateAge(member.dateOfBirth, valuationDate);
      if (dobAge !== null) {
        return {
          age: dobAge,
          source: "dateOfBirth"
        };
      }
    }

    if (member.age !== null && member.age !== undefined) {
      return {
        age: member.age,
        source: "explicitAge"
      };
    }

    flags.missingAgeFallbackUsed = true;
    return {
      age: null,
      source: "missing"
    };
  }

  function classifyFoodBand(member, valuationDate, flags) {
    const ageResult = resolveAge(member, valuationDate, flags);
    const age = ageResult.age;
    const sex = member.sex || "unknown";

    if (age === null) {
      return member.role === "dependent" || member.role === "child"
        ? "childUnknown"
        : "adultUnknown";
    }

    if (age <= 3) {
      return "infantToddler";
    }

    if (age <= 8) {
      return "youngChild";
    }

    if (age <= 13) {
      return "olderChild";
    }

    if (age <= 18) {
      if (sex === "male") {
        return "teenMale";
      }
      if (sex === "female") {
        return "teenFemale";
      }
      flags.missingSexFallbackUsed = true;
      return "childUnknown";
    }

    if (sex === "male") {
      return "adultMale";
    }

    if (sex === "female") {
      return "adultFemale";
    }

    flags.missingSexFallbackUsed = true;
    return "adultUnknown";
  }

  function createEmptyBandCounts() {
    return FOOD_AT_HOME_BAND_KEYS.reduce(function (counts, bandKey) {
      counts[bandKey] = 0;
      return counts;
    }, {});
  }

  function getDeceasedInsuredRole(input) {
    const scenarioContext = isPlainObject(input.scenarioContext) ? input.scenarioContext : {};
    const role = normalizeString(
      input.deceasedInsuredRole
      || scenarioContext.deceasedInsuredRole
      || scenarioContext.insuredRole
      || scenarioContext.deceasedRole
    ).toLowerCase();

    if (["spouse", "partner", "surviving-spouse", "survivingPartner"].includes(role)) {
      return "spouse";
    }

    return "client";
  }

  function resolveDeceasedInsuredCount(input) {
    const scenarioContext = isPlainObject(input.scenarioContext) ? input.scenarioContext : {};
    const parsed = toNonnegativeInteger(getFirstPresent([
      input.deceasedInsuredCount,
      scenarioContext.deceasedInsuredCount
    ]));

    return parsed === null || parsed < 1 ? DECEASED_INSURED_COUNT_DEFAULT : parsed;
  }

  function resolveExplicitAdultDriverCount(input) {
    const scenarioContext = isPlainObject(input.scenarioContext) ? input.scenarioContext : {};
    const profileFacts = isPlainObject(input.profileFacts) ? input.profileFacts : {};
    const pmiFacts = isPlainObject(input.pmiFacts) ? input.pmiFacts : {};
    return toNonnegativeInteger(getFirstPresent([
      input.adultDriverCount,
      scenarioContext.adultDriverCount,
      profileFacts.adultDriverCount,
      pmiFacts.adultDriverCount
    ]));
  }

  function resolveHouseholdExpenseLivingFloorContext(input) {
    const safeInput = isPlainObject(input) ? input : {};
    const warnings = [];
    const dataGaps = [];
    const trace = {
      excludedProjectedDependentsCount: toNonnegativeInteger(getFirstPresent([
        safeInput.projectedDependentsCount,
        getNestedValue(safeInput.profileRecord, ["projectedDependentsCount"]),
        getNestedValue(safeInput.profileFacts, ["projectedDependentsCount"]),
        safeInput.childrenNeedingFunding
      ])) || 0
    };
    const stateContext = resolveStateContext(safeInput, warnings, dataGaps);
    const valuationDate = resolveValuationDate(safeInput);
    const deceasedInsuredRole = getDeceasedInsuredRole(safeInput);
    const deceasedInsuredCount = resolveDeceasedInsuredCount(safeInput);
    const spouseDetected = hasSpouseOrPartner(safeInput);
    const dependents = collectCurrentDependents(safeInput, trace);
    const survivingMembers = [];

    if (deceasedInsuredRole === "spouse") {
      survivingMembers.push(getClientMember(safeInput));
    } else if (spouseDetected) {
      survivingMembers.push(getSpouseMember(safeInput));
    }

    dependents.forEach(function (dependent) {
      survivingMembers.push(dependent);
    });

    const bandFlags = {
      missingAgeFallbackUsed: false,
      missingSexFallbackUsed: false
    };
    const householdMemberBandCounts = createEmptyBandCounts();
    let survivingAdultCount = 0;

    survivingMembers.forEach(function (member) {
      const bandKey = classifyFoodBand(member, valuationDate, bandFlags);
      householdMemberBandCounts[bandKey] += 1;
      if (["adultMale", "adultFemale", "adultUnknown"].includes(bandKey)) {
        survivingAdultCount += 1;
      }
    });

    const dependentCount = dependents.length;
    let adultEquivalentFallbackUsed = false;
    let noSurvivingAdultDetected = false;
    let realSurvivingHouseholdMembers = survivingMembers.length;
    let survivingHouseholdMembers = realSurvivingHouseholdMembers;

    if (survivingAdultCount === 0 && dependentCount > 0) {
      noSurvivingAdultDetected = true;
      adultEquivalentFallbackUsed = true;
      householdMemberBandCounts.adultUnknown += 1;
      survivingHouseholdMembers += 1;
      addWarning(
        warnings,
        "no-surviving-adult-detected",
        "No surviving adult was detected while dependents remain; an adult-equivalent fallback was added for floor sizing.",
        { dependentCount }
      );
    }

    if (survivingHouseholdMembers < 1) {
      adultEquivalentFallbackUsed = true;
      householdMemberBandCounts.adultUnknown += 1;
      survivingHouseholdMembers = 1;
      addWarning(
        warnings,
        "surviving-household-clamped",
        "No remaining household member was detected; household size was clamped to one for floor sizing."
      );
    }

    if (bandFlags.missingAgeFallbackUsed) {
      addWarning(
        warnings,
        "missing-age-fallback-used",
        "One or more remaining household members used an age fallback band."
      );
    }

    if (bandFlags.missingSexFallbackUsed) {
      addWarning(
        warnings,
        "missing-sex-fallback-used",
        "One or more remaining household members used a sex/gender fallback band."
      );
    }

    const explicitAdultDriverCount = resolveExplicitAdultDriverCount(safeInput);
    const driverCountFallbackUsed = explicitAdultDriverCount === null;
    const adultDriverCount = explicitAdultDriverCount === null ? survivingAdultCount : explicitAdultDriverCount;
    if (driverCountFallbackUsed) {
      addWarning(
        warnings,
        "adult-driver-count-fallback-used",
        "Adult driver count was not supplied; surviving adult count was used.",
        { survivingAdultCount }
      );
    }

    const householdContext = {
      totalCurrentHouseholdMembers: deceasedInsuredCount + realSurvivingHouseholdMembers,
      survivingHouseholdMembers,
      realSurvivingHouseholdMembers,
      deceasedInsuredCount,
      deceasedInsuredRole,
      survivingAdultCount,
      dependentCount,
      adultDriverCount,
      adultDriverCountSource: explicitAdultDriverCount === null ? "survivingAdultCount" : "explicitAdultDriverCount",
      householdMemberBandCounts,
      noSurvivingAdultDetected,
      missingAgeFallbackUsed: bandFlags.missingAgeFallbackUsed,
      missingSexFallbackUsed: bandFlags.missingSexFallbackUsed,
      adultEquivalentFallbackUsed,
      driverCountFallbackUsed
    };

    return {
      stateContext,
      householdContext,
      warnings,
      dataGaps,
      trace: Object.assign({}, trace, {
        valuationDate: valuationDate || null,
        spouseDetected,
        dependentSource: trace.dependentSource || "none",
        usedStructuredDependentSource: trace.usedStructuredDependentSource === true,
        dependentCountFallbackUsed: trace.dependentCountFallbackUsed === true,
        excludedProjectedDependentsCount: trace.excludedProjectedDependentsCount,
        remainingHouseholdMemberRoles: survivingMembers.map(function (member) {
          return member.role;
        }),
        stateSourcePriority: STATE_SOURCE_PRIORITY.slice()
      }),
      metadata: {
        resolverVersion: CONTEXT_RESOLVER_VERSION,
        activeRuntimeConsumer: ACTIVE_RUNTIME_CONSUMER,
        householdSizingRuleKey: "remainingHouseholdAfterInsuredDeath"
      }
    };
  }

  lensAnalysis.householdExpenseLivingFloorContextResolver = Object.freeze({
    CONTEXT_RESOLVER_VERSION,
    DECEASED_INSURED_COUNT_DEFAULT,
    STATE_CODE_VALUES,
    FOOD_AT_HOME_BAND_KEYS,
    STATE_SOURCE_PRIORITY,
    resolveHouseholdExpenseLivingFloorContext
  });
})(globalThis);
