(function (global) {
  const root = global.LensApp || (global.LensApp = {});
  const lensAnalysis = root.lensAnalysis || (root.lensAnalysis = {});

  // Owner: Coverage Strategy diagnostics.
  // Purpose: build a diagnostic-only obligation ledger from current Need Line
  // component outputs. Non-goals: no graph math, raw PMI projection, DOM,
  // storage, Resource Line, gap/surplus, chart, or UI behavior.
  const COVERAGE_STRATEGY_OBLIGATION_LEDGER_VERSION = "coverage-strategy-obligation-ledger-v1";
  const DEFAULT_TOLERANCE = 0.01;

  const COMPONENT_DEFINITIONS = Object.freeze([
    Object.freeze({
      componentKey: "mortgage",
      ownerComponent: "mortgage",
      categoryKey: "mortgage",
      label: "Mortgage",
      sourcePath: "needPoints[].componentAmounts.mortgage",
      sourceType: "coverage-strategy-component"
    }),
    Object.freeze({
      componentKey: "debtPayoff",
      ownerComponent: "nonMortgageDebt",
      categoryKey: "nonMortgageDebt",
      label: "Non-mortgage debt",
      sourcePath: "needPoints[].componentAmounts.debtPayoff",
      sourceType: "coverage-strategy-component"
    }),
    Object.freeze({
      componentKey: "education",
      ownerComponent: "education",
      categoryKey: "education",
      label: "Education",
      sourcePath: "needPoints[].componentAmounts.education",
      sourceType: "coverage-strategy-component"
    }),
    Object.freeze({
      componentKey: "healthcareExpenses",
      ownerComponent: "healthcare",
      categoryKey: "healthcare",
      label: "Healthcare",
      sourcePath: "needPoints[].componentAmounts.healthcareExpenses",
      sourceType: "coverage-strategy-component"
    }),
    Object.freeze({
      componentKey: "finalExpenses",
      ownerComponent: "finalExpense",
      categoryKey: "finalExpense",
      label: "Final expense",
      sourcePath: "needPoints[].componentAmounts.finalExpenses",
      sourceType: "coverage-strategy-component"
    }),
    Object.freeze({
      componentKey: "transitionNeeds",
      ownerComponent: "transitionNeeds",
      categoryKey: "transitionNeeds",
      label: "Transition needs",
      sourcePath: "needPoints[].componentAmounts.transitionNeeds",
      sourceType: "coverage-strategy-component"
    }),
    Object.freeze({
      componentKey: "essentialSupport",
      ownerComponent: "essentialSupport",
      categoryKey: "essentialSupport",
      label: "Essential support",
      sourcePath: "needPoints[].componentAmounts.essentialSupport",
      sourceType: "coverage-strategy-component"
    }),
    Object.freeze({
      componentKey: "discretionarySupport",
      ownerComponent: "discretionarySupport",
      categoryKey: "discretionarySupport",
      label: "Discretionary support",
      sourcePath: "needPoints[].componentAmounts.discretionarySupport",
      sourceType: "coverage-strategy-component"
    })
  ]);

  function isPlainObject(value) {
    return Boolean(value && typeof value === "object" && !Array.isArray(value));
  }

  function clonePlainValue(value) {
    if (value == null) {
      return value;
    }
    return JSON.parse(JSON.stringify(value));
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
    const parsed = Number(String(value).replace(/[$,%\s,]/g, "").trim());
    return Number.isFinite(parsed) ? parsed : null;
  }

  function roundMoney(value) {
    return Number.isFinite(value) ? Number(value.toFixed(2)) : 0;
  }

  function createIssue(code, message, details) {
    return {
      code,
      message,
      details: isPlainObject(details) ? clonePlainValue(details) : {}
    };
  }

  function uniqueStrings(values) {
    const seen = new Set();
    return (Array.isArray(values) ? values : []).reduce(function (list, value) {
      const normalized = normalizeString(value);
      if (!normalized || seen.has(normalized)) {
        return list;
      }
      seen.add(normalized);
      list.push(normalized);
      return list;
    }, []);
  }

  function getNeedPoints(input) {
    if (Array.isArray(input?.needPoints)) {
      return input.needPoints;
    }
    if (Array.isArray(input?.needLine?.needPoints)) {
      return input.needLine.needPoints;
    }
    return [];
  }

  function getComponentModels(input) {
    if (isPlainObject(input?.componentModels)) {
      return input.componentModels;
    }
    if (isPlainObject(input?.needLine?.componentModels)) {
      return input.needLine.componentModels;
    }
    return {};
  }

  function getPointComponentAmount(point, componentKey) {
    const amount = toOptionalNumber(point?.componentAmounts?.[componentKey]);
    return amount == null ? 0 : roundMoney(amount);
  }

  function getPointNeedAmount(point) {
    const amount = toOptionalNumber(point?.needAmount ?? point?.grossNeedAmount);
    return amount == null ? 0 : roundMoney(amount);
  }

  function getPointComponentTotal(point) {
    const componentAmounts = isPlainObject(point?.componentAmounts) ? point.componentAmounts : {};
    return roundMoney(Object.keys(componentAmounts).reduce(function (sum, key) {
      const amount = toOptionalNumber(componentAmounts[key]);
      return sum + (amount == null ? 0 : amount);
    }, 0));
  }

  function getProjectionModeForPoint(point, componentKey, ownerComponent) {
    const timing = point?.trace?.componentTiming || {};
    return normalizeString(timing[componentKey])
      || normalizeString(timing[ownerComponent])
      || "current-component-output";
  }

  function getTreatmentModeForPoint(point, definition) {
    if (definition.ownerComponent === "education") {
      return normalizeString(point?.trace?.educationProjection?.effectiveEducationTreatmentMode)
        || normalizeString(point?.trace?.educationProjection?.educationTreatmentMode)
        || null;
    }
    if (definition.ownerComponent === "mortgage") {
      return normalizeString(point?.trace?.mortgageProjection?.sourceFactsUsed?.normalizedMortgageMode)
        || normalizeString(point?.trace?.mortgageProjection?.sourceFactsUsed?.rawMortgageMode)
        || null;
    }
    return null;
  }

  function getComponentTraceForPoint(point, definition) {
    const trace = isPlainObject(point?.trace) ? point.trace : {};
    const componentTraceByOwner = {
      mortgage: trace.mortgageProjection || null,
      nonMortgageDebt: trace.debtProjection || null,
      education: trace.educationProjection || null,
      healthcare: trace.healthcareProjection || null,
      finalExpense: trace.finalExpenseProjection || null,
      transitionNeeds: trace.transitionNeedsProjection || null,
      essentialSupport: point?.supportTrace || null,
      discretionarySupport: {
        componentTiming: trace.componentTiming?.discretionarySupport || null
      }
    };
    return clonePlainValue(componentTraceByOwner[definition.ownerComponent] || {});
  }

  function getComponentModelTrace(componentModels, definition) {
    const modelByOwner = {
      mortgage: componentModels.mortgageLifetimeProjection || componentModels.mortgageProjectionTrace || null,
      nonMortgageDebt: componentModels.nonMortgageDebtLifetimeProjection || componentModels.debtLifetimeProjection || null,
      education: componentModels.education?.lifetimeProjection || null,
      healthcare: componentModels.healthcare?.lifetimeProjection || null,
      finalExpense: componentModels.finalExpenses?.lifetimeProjection || null,
      transitionNeeds: componentModels.transitionNeeds?.lifetimeProjection || null,
      essentialSupport: componentModels.support || null,
      discretionarySupport: componentModels.discretionarySupport || null
    };
    return clonePlainValue(modelByOwner[definition.ownerComponent] || {});
  }

  function collectSourcePathsFromValue(value, output) {
    if (Array.isArray(value)) {
      value.forEach(function (entry) {
        collectSourcePathsFromValue(entry, output);
      });
      return;
    }
    if (!isPlainObject(value)) {
      return;
    }
    Object.keys(value).forEach(function (key) {
      const entry = value[key];
      if (key === "sourcePath" && normalizeString(entry)) {
        output.push(entry);
        return;
      }
      if (key === "sourcePaths" && Array.isArray(entry)) {
        entry.forEach(function (sourcePath) {
          if (normalizeString(sourcePath)) {
            output.push(sourcePath);
          }
        });
        return;
      }
      collectSourcePathsFromValue(entry, output);
    });
  }

  function collectSupportSourcePaths(componentModel, annualAmountsByYear) {
    const sourcePaths = [];
    collectSourcePathsFromValue(componentModel, sourcePaths);
    (Array.isArray(annualAmountsByYear) ? annualAmountsByYear : []).forEach(function (annualPoint) {
      collectSourcePathsFromValue(annualPoint?.trace, sourcePaths);
    });
    return uniqueStrings(sourcePaths);
  }

  function getSupportSourceBasis(supportType, sourcePaths, componentModel, annualAmountsByYear) {
    const joinedPaths = uniqueStrings(sourcePaths).join("|");
    if (joinedPaths.indexOf("treatedOngoingSupport.mortgageAdjusted.") >= 0) {
      return "treated-ongoing-support";
    }
    if (joinedPaths.indexOf("treatedOngoingSupport.") >= 0) {
      return "treated-ongoing-support";
    }
    if (
      joinedPaths.indexOf("ongoingSupport.annualTotalEssentialSupportCost") >= 0
      || joinedPaths.indexOf("ongoingSupport.monthlyTotalEssentialSupportCost") >= 0
      || joinedPaths.indexOf("ongoingSupport.annualDiscretionaryPersonalSpending") >= 0
    ) {
      return "raw-ongoing-support";
    }
    const firstTraceSource = normalizeString(annualAmountsByYear?.[0]?.trace?.source);
    const componentTraceSource = normalizeString(componentModel?.trace?.source);
    if (firstTraceSource.indexOf("needsResult.trace.") >= 0 || componentTraceSource.indexOf("needsResult.trace.") >= 0) {
      return "needs-result-trace";
    }
    if (normalizeString(componentModel?.reconstructionStatus).indexOf("fallback") >= 0) {
      return "fallback-aggregate";
    }
    if (supportType === "discretionarySupport" && Object.keys(componentModel || {}).length > 0) {
      return "needs-result-trace";
    }
    return Object.keys(componentModel || {}).length > 0 ? "fallback-aggregate" : "unavailable";
  }

  function makeKnownIncludedField(fieldKey, label, ownerComponent, sourcePath) {
    return {
      fieldKey,
      label,
      ownerComponent,
      sourcePath: sourcePath || null,
      amountAvailable: false
    };
  }

  function buildKnownIncludedSupportFields(supportType, sourcePaths) {
    if (supportType === "discretionarySupport") {
      return [
        makeKnownIncludedField(
          "annualDiscretionaryPersonalSpending",
          "Discretionary personal spending",
          "discretionarySupport",
          sourcePaths.find(function (sourcePath) {
            return sourcePath.indexOf("annualDiscretionaryPersonalSpending") >= 0;
          }) || null
        )
      ];
    }

    const fields = [
      makeKnownIncludedField("monthlyHousingSupportCost", "Housing support", "essentialSupport", null),
      makeKnownIncludedField("nonMortgageHousingCosts", "Non-mortgage housing costs", "essentialSupport", null),
      makeKnownIncludedField("monthlyUtilities", "Utilities", "essentialSupport", null),
      makeKnownIncludedField("monthlyFoodCost", "Food", "essentialSupport", null),
      makeKnownIncludedField("monthlyTransportationCost", "Transportation", "essentialSupport", null),
      makeKnownIncludedField("monthlyChildcareAndDependentCareCost", "Childcare and dependent care", "essentialSupport", null),
      makeKnownIncludedField("monthlyPhoneAndInternetCost", "Phone and internet", "essentialSupport", null),
      makeKnownIncludedField("monthlyHouseholdSuppliesCost", "Household supplies", "essentialSupport", null),
      makeKnownIncludedField("monthlyOtherHouseholdExpenses", "Other household costs", "essentialSupport", null),
      makeKnownIncludedField("monthlyOtherInsuranceCost", "Insurance and support costs", "essentialSupport", null),
      makeKnownIncludedField("monthlyHealthcareOutOfPocketCost", "Medical out-of-pocket if support-owned", "essentialSupport", null)
    ];

    return fields.map(function (field) {
      const sourcePath = sourcePaths.find(function (candidatePath) {
        return candidatePath.indexOf(field.fieldKey) >= 0;
      });
      return sourcePath ? { ...field, sourcePath } : field;
    });
  }

  function createOverlapCandidate(ownerComponent, status, reason, evidence) {
    return {
      ownerComponent,
      status,
      reason,
      evidence: isPlainObject(evidence) ? clonePlainValue(evidence) : {}
    };
  }

  function getMortgageOverlapCandidate(componentModels) {
    const trace = componentModels?.mortgageSupportOwnershipTrace || {};
    if (trace.mortgagePaymentAlreadyInNeeds === true) {
      return createOverlapCandidate(
        "mortgage",
        "proven-overlap",
        "Mortgage payment support is marked as already represented in Needs/support.",
        {
          mortgagePaymentAlreadyInNeeds: true,
          sourcePath: trace.mortgagePaymentAlreadyInNeedsSource || "treatedMortgagePaymentPlan.mortgagePaymentAlreadyInNeeds",
          mortgageComponentOwnsImmediatePayoff: trace.mortgageComponentOwnsImmediatePayoff === true,
          mortgageComponentOwnsPaymentSupport: trace.mortgageComponentOwnsPaymentSupport === true,
          noSupportAmountChangedByLedger: true
        }
      );
    }
    if (trace.mortgageOwnedSupportActive === true || trace.mortgageComponentOwnsPaymentSupport === true) {
      return createOverlapCandidate(
        "mortgage",
        "possible-overlap",
        "Mortgage component owns a payment stream, but support source proof is not complete in the ledger row.",
        {
          mortgageOwnedSupportActive: trace.mortgageOwnedSupportActive === true,
          mortgageComponentOwnsPaymentSupport: trace.mortgageComponentOwnsPaymentSupport === true
        }
      );
    }
    return createOverlapCandidate(
      "mortgage",
      "not-detected",
      "No mortgage support overlap proof was present in component models.",
      {}
    );
  }

  function getHealthcareOverlapCandidate(componentModels) {
    const projection = componentModels?.healthcare?.lifetimeProjection || {};
    const supportOwnedCount = toOptionalNumber(projection.supportOwnedHealthcareExpenseExcludedCount) || 0;
    if (supportOwnedCount > 0) {
      return createOverlapCandidate(
        "healthcare",
        "not-detected",
        "Support-owned healthcare-looking expenses were excluded from the healthcare component, so the ledger should not treat them as a healthcare double count.",
        {
          supportOwnedHealthcareExpenseExcludedCount: supportOwnedCount,
          supportOwnedByCurrentPolicy: true,
          excludedRecords: Array.isArray(projection.healthcareLookingExcludedRecords)
            ? projection.healthcareLookingExcludedRecords
            : []
        }
      );
    }
    if (projection.includedRecordCount > 0 && projection.aggregateFallbackUsed === true) {
      return createOverlapCandidate(
        "healthcare",
        "possible-overlap",
        "Healthcare projection has aggregate fallback data; support ownership cannot be proven from ledger rows alone.",
        {
          aggregateFallbackUsed: true,
          includedRecordCount: projection.includedRecordCount || 0
        }
      );
    }
    return createOverlapCandidate(
      "healthcare",
      "not-detected",
      "No support-owned healthcare overlap proof was present in component models.",
      {}
    );
  }

  function getPathSuggestingOwner(sourcePaths, ownerComponent) {
    const patternsByOwner = {
      nonMortgageDebt: ["debt", "minimumMonthlyPayment", "monthlyPayment"],
      education: ["education", "educationSavings"],
      finalExpense: ["finalExpense", "finalExpenses", "funeral", "burial"],
      transitionNeeds: ["transition", "transitionNeeds"]
    };
    const patterns = patternsByOwner[ownerComponent] || [];
    return sourcePaths.find(function (sourcePath) {
      const normalized = sourcePath.toLowerCase();
      return patterns.some(function (pattern) {
        return normalized.indexOf(pattern.toLowerCase()) >= 0;
      });
    }) || null;
  }

  function getPossibleSourcePathOverlapCandidate(sourcePaths, ownerComponent) {
    const matchingPath = getPathSuggestingOwner(sourcePaths, ownerComponent);
    if (!matchingPath) {
      return createOverlapCandidate(
        ownerComponent,
        "not-detected",
        `No ${ownerComponent} support overlap source path was detected.`,
        {}
      );
    }
    return createOverlapCandidate(
      ownerComponent,
      "possible-overlap",
      `A support source path suggests possible ${ownerComponent} ownership, but the ledger does not have enough proof to split support.`,
      { sourcePath: matchingPath }
    );
  }

  function buildSupportOwnershipDataGaps(sourceBasis, sourcePaths, candidates, supportType) {
    const dataGaps = [];
    if (sourceBasis === "fallback-aggregate" || sourceBasis === "needs-result-trace") {
      dataGaps.push(createIssue(
        "support-aggregate-source-too-broad-to-split",
        "Support is represented as an aggregate source; the ledger cannot split support ownership without more granular source composition.",
        { supportType, sourceBasis }
      ));
    }
    if (!sourcePaths.length) {
      dataGaps.push(createIssue(
        "support-composition-source-paths-missing",
        "Support ownership diagnostics could not find granular support source paths.",
        { supportType }
      ));
    }
    candidates.forEach(function (candidate) {
      if (candidate.status === "proven-overlap") {
        dataGaps.push(createIssue(
          "support-dedicated-owner-overlap-diagnostic-only",
          "A dedicated component overlap was detected, but this diagnostic ledger pass did not split or subtract support.",
          { supportType, ownerComponent: candidate.ownerComponent }
        ));
      } else if (candidate.status === "possible-overlap") {
        dataGaps.push(createIssue(
          "support-dedicated-owner-overlap-unproven",
          "A possible dedicated component overlap was detected, but source proof was insufficient for any support split.",
          { supportType, ownerComponent: candidate.ownerComponent }
        ));
      }
    });
    if (
      candidates.some(function (candidate) {
        return candidate.ownerComponent === "healthcare"
          && candidate.evidence?.supportOwnedByCurrentPolicy === true;
      })
    ) {
      dataGaps.push(createIssue(
        "support-owned-healthcare-policy-diagnostic",
        "Support-owned healthcare-looking expenses are currently kept in support and excluded from healthcare; future ownership cleanup should preserve that policy or change it explicitly.",
        { supportType }
      ));
    }
    return dataGaps;
  }

  function getSupportOwnershipStatus(sourceBasis, candidates, dataGaps, annualAmountsByYear) {
    const hasAmount = (Array.isArray(annualAmountsByYear) ? annualAmountsByYear : []).some(function (point) {
      return Math.abs(toOptionalNumber(point?.amount) || 0) > DEFAULT_TOLERANCE;
    });
    if (!hasAmount && sourceBasis === "unavailable") {
      return "unavailable";
    }
    if (candidates.some(function (candidate) { return candidate.status === "proven-overlap"; })) {
      return "support-owned-with-proven-overlap";
    }
    if (candidates.some(function (candidate) { return candidate.status === "possible-overlap"; })) {
      return "support-owned-with-possible-overlap";
    }
    if (
      sourceBasis === "fallback-aggregate"
      || sourceBasis === "needs-result-trace"
      || dataGaps.some(function (gap) {
        return gap.code === "support-aggregate-source-too-broad-to-split"
          || gap.code === "support-composition-source-paths-missing";
      })
    ) {
      return "aggregate-ownership-ambiguous";
    }
    return "support-owned-clean";
  }

  function buildSupportOwnershipSummary(definition, annualAmountsByYear, componentModels) {
    if (definition.ownerComponent !== "essentialSupport" && definition.ownerComponent !== "discretionarySupport") {
      return null;
    }
    const componentModel = getComponentModelTrace(componentModels, definition);
    const sourcePaths = collectSupportSourcePaths(componentModel, annualAmountsByYear);
    const sourceBasis = getSupportSourceBasis(definition.ownerComponent, sourcePaths, componentModel, annualAmountsByYear);
    const candidates = definition.ownerComponent === "essentialSupport"
      ? [
          getMortgageOverlapCandidate(componentModels),
          getPossibleSourcePathOverlapCandidate(sourcePaths, "nonMortgageDebt"),
          getPossibleSourcePathOverlapCandidate(sourcePaths, "education"),
          getHealthcareOverlapCandidate(componentModels),
          getPossibleSourcePathOverlapCandidate(sourcePaths, "finalExpense"),
          getPossibleSourcePathOverlapCandidate(sourcePaths, "transitionNeeds")
        ]
      : [
          createOverlapCandidate(
            "mortgage",
            "not-detected",
            "Mortgage support ownership is evaluated against Essential Support, not Discretionary Support.",
            {}
          ),
          getPossibleSourcePathOverlapCandidate(sourcePaths, "nonMortgageDebt"),
          getPossibleSourcePathOverlapCandidate(sourcePaths, "education"),
          getPossibleSourcePathOverlapCandidate(sourcePaths, "healthcare"),
          getPossibleSourcePathOverlapCandidate(sourcePaths, "finalExpense"),
          getPossibleSourcePathOverlapCandidate(sourcePaths, "transitionNeeds")
        ];
    const possibleOverlapCandidates = candidates.filter(function (candidate) {
      return candidate.status !== "not-detected";
    });
    const provenDedicatedOwnerOverlaps = candidates.filter(function (candidate) {
      return candidate.status === "proven-overlap";
    });
    const ambiguousOverlapCandidates = candidates.filter(function (candidate) {
      return candidate.status === "possible-overlap";
    });
    const dataGaps = buildSupportOwnershipDataGaps(sourceBasis, sourcePaths, candidates, definition.ownerComponent);

    return {
      supportType: definition.ownerComponent,
      sourceBasis,
      sourcePaths,
      knownIncludedFields: buildKnownIncludedSupportFields(definition.ownerComponent, sourcePaths),
      possibleOverlapCandidates,
      provenDedicatedOwnerOverlaps,
      ambiguousOverlapCandidates,
      allOwnerCandidates: candidates,
      dataGaps,
      ownershipStatus: getSupportOwnershipStatus(sourceBasis, candidates, dataGaps, annualAmountsByYear),
      graphMathChanged: false,
      supportAmountsChanged: false,
      supportSplitApplied: false,
      diagnosticOnly: true
    };
  }

  function collectComponentIssues(componentModels, definition, issueKey) {
    const model = getComponentModelTrace(componentModels, definition);
    const issues = Array.isArray(model?.[issueKey]) ? model[issueKey] : [];
    return issues.map(clonePlainValue);
  }

  function hasMeaningfulComponentDiagnostics(componentModels, definition) {
    const model = getComponentModelTrace(componentModels, definition);
    return Boolean(
      isPlainObject(model)
      && (
        Object.keys(model).length > 0
        && (
          (Array.isArray(model.warnings) && model.warnings.length > 0)
          || (Array.isArray(model.dataGaps) && model.dataGaps.length > 0)
          || model.status === "partial"
          || model.status === "unavailable"
        )
      )
    );
  }

  function buildAnnualAmountsForComponent(needPoints, definition) {
    return needPoints.map(function (point) {
      const amount = getPointComponentAmount(point, definition.componentKey);
      const trace = getComponentTraceForPoint(point, definition);
      let grossAmount = amount;
      let offsetAmount = 0;
      if (definition.ownerComponent === "education" && isPlainObject(point?.trace?.educationProjection)) {
        const gross = toOptionalNumber(point.trace.educationProjection.grossEducationNeedAmount);
        const net = toOptionalNumber(point.trace.educationProjection.netEducationNeedAmount);
        const savingsOffset = toOptionalNumber(point.trace.educationProjection.educationSavingsOffsetAmount) || 0;
        const resourceOffset = toOptionalNumber(point.trace.educationProjection.educationResourceSpendingOffsetAmount) || 0;
        if (gross != null) {
          grossAmount = roundMoney(gross);
        }
        if (net != null) {
          offsetAmount = roundMoney(Math.max(0, grossAmount - net));
        } else {
          offsetAmount = roundMoney(Math.max(0, savingsOffset + resourceOffset));
        }
      }
      return {
        yearIndex: Math.max(0, Math.round(toOptionalNumber(point?.yearIndex) || 0)),
        calendarYear: toOptionalNumber(point?.calendarYear) == null
          ? null
          : Math.round(toOptionalNumber(point.calendarYear)),
        amount,
        grossAmount: roundMoney(grossAmount),
        offsetAmount,
        netAmount: amount,
        projectionMode: getProjectionModeForPoint(point, definition.componentKey, definition.ownerComponent),
        treatmentMode: getTreatmentModeForPoint(point, definition),
        trace
      };
    });
  }

  function buildLedgerRows(needPoints, componentModels, omittedZeroComponents) {
    return COMPONENT_DEFINITIONS.reduce(function (rows, definition) {
      const annualAmountsByYear = buildAnnualAmountsForComponent(needPoints, definition);
      const hasNonzeroAmount = annualAmountsByYear.some(function (point) {
        return Math.abs(point.amount) > DEFAULT_TOLERANCE;
      });
      const hasDiagnostics = hasMeaningfulComponentDiagnostics(componentModels, definition);

      if (!hasNonzeroAmount && !hasDiagnostics) {
        omittedZeroComponents.push({
          componentKey: definition.componentKey,
          ownerComponent: definition.ownerComponent,
          reason: "zero-component-without-diagnostics"
        });
        return rows;
      }

      const firstPoint = annualAmountsByYear[0] || {};
      const supportOwnershipSummary = buildSupportOwnershipSummary(
        definition,
        annualAmountsByYear,
        componentModels
      );
      rows.push({
        obligationId: `coverage-strategy:${definition.ownerComponent}`,
        sourceType: definition.sourceType,
        sourcePath: definition.sourcePath,
        sourceRecordId: null,
        sourceComponentKey: definition.componentKey,
        ownerComponent: definition.ownerComponent,
        categoryKey: definition.categoryKey,
        label: definition.label,
        projectionMode: firstPoint.projectionMode || "current-component-output",
        treatmentMode: firstPoint.treatmentMode || null,
        includedInNeedLine: true,
        excludedReason: null,
        doubleCountGroup: definition.ownerComponent,
        annualAmountsByYear,
        trace: {
          source: "current-coverage-strategy-need-line-output",
          componentKey: definition.componentKey,
          ...(supportOwnershipSummary ? { supportOwnershipSummary } : {}),
          componentModel: getComponentModelTrace(componentModels, definition)
        },
        ...(supportOwnershipSummary ? { supportOwnershipSummary } : {}),
        warnings: collectComponentIssues(componentModels, definition, "warnings"),
        dataGaps: collectComponentIssues(componentModels, definition, "dataGaps").concat(
          supportOwnershipSummary ? supportOwnershipSummary.dataGaps : []
        )
      });
      return rows;
    }, []);
  }

  function buildAnnualParity(needPoints, rows, tolerance) {
    return needPoints.map(function (point) {
      const yearIndex = Math.max(0, Math.round(toOptionalNumber(point?.yearIndex) || 0));
      const ledgerTotal = roundMoney(rows.reduce(function (sum, row) {
        const annualPoint = Array.isArray(row.annualAmountsByYear)
          ? row.annualAmountsByYear.find(function (entry) {
              return entry.yearIndex === yearIndex;
            })
          : null;
        return sum + (toOptionalNumber(annualPoint?.amount) || 0);
      }, 0));
      const needLineAmount = getPointNeedAmount(point);
      const componentAmountTotal = getPointComponentTotal(point);
      const differenceFromNeedLine = roundMoney(ledgerTotal - needLineAmount);
      const differenceFromComponentAmounts = roundMoney(ledgerTotal - componentAmountTotal);
      return {
        yearIndex,
        calendarYear: toOptionalNumber(point?.calendarYear) == null
          ? null
          : Math.round(toOptionalNumber(point.calendarYear)),
        ledgerTotal,
        needLineAmount,
        componentAmountTotal,
        differenceFromNeedLine,
        differenceFromComponentAmounts,
        matchesNeedLine: Math.abs(differenceFromNeedLine) <= tolerance,
        matchesComponentAmounts: Math.abs(differenceFromComponentAmounts) <= tolerance
      };
    });
  }

  function summarizeOwners(rows) {
    return rows.reduce(function (summary, row) {
      const owner = row.ownerComponent || "unknown";
      const existing = summary[owner] || {
        ownerComponent: owner,
        rowCount: 0,
        includedRowCount: 0,
        totalCurrentYearAmount: 0
      };
      existing.rowCount += 1;
      if (row.includedInNeedLine === true) {
        existing.includedRowCount += 1;
      }
      const firstPoint = Array.isArray(row.annualAmountsByYear) ? row.annualAmountsByYear[0] : null;
      existing.totalCurrentYearAmount = roundMoney(existing.totalCurrentYearAmount + (toOptionalNumber(firstPoint?.amount) || 0));
      summary[owner] = existing;
      return summary;
    }, {});
  }

  function buildCoverageStrategyObligationLedger(input) {
    const safeInput = isPlainObject(input) ? input : {};
    const warnings = [];
    const dataGaps = [];
    const toleranceCandidate = toOptionalNumber(safeInput.tolerance);
    const tolerance = toleranceCandidate == null || toleranceCandidate < 0
      ? DEFAULT_TOLERANCE
      : toleranceCandidate;
    const needPoints = getNeedPoints(safeInput).map(clonePlainValue);
    const componentModels = getComponentModels(safeInput);
    const omittedZeroComponents = [];

    if (!needPoints.length) {
      dataGaps.push(createIssue(
        "coverage-strategy-obligation-ledger-need-points-unavailable",
        "Coverage Strategy obligation ledger could not be built because needPoints were unavailable.",
        {}
      ));
    }

    needPoints.forEach(function (point, index) {
      if (!isPlainObject(point?.componentAmounts)) {
        dataGaps.push(createIssue(
          "coverage-strategy-obligation-ledger-component-amounts-unavailable",
          "Coverage Strategy obligation ledger could not inspect componentAmounts for a need point.",
          { index, yearIndex: point?.yearIndex ?? null }
        ));
      }
    });

    const rows = buildLedgerRows(needPoints, componentModels, omittedZeroComponents);
    const annualParity = buildAnnualParity(needPoints, rows, tolerance);
    const maxDifference = roundMoney(annualParity.reduce(function (max, parity) {
      return Math.max(
        max,
        Math.abs(parity.differenceFromNeedLine),
        Math.abs(parity.differenceFromComponentAmounts)
      );
    }, 0));
    const allYearsMatchNeedLine = annualParity.every(function (parity) {
      return parity.matchesNeedLine;
    });
    const allYearsMatchComponentAmounts = annualParity.every(function (parity) {
      return parity.matchesComponentAmounts;
    });
    if (annualParity.length && (!allYearsMatchNeedLine || !allYearsMatchComponentAmounts)) {
      warnings.push(createIssue(
        "coverage-strategy-obligation-ledger-parity-mismatch",
        "Coverage Strategy obligation ledger totals did not match the current Need Line output.",
        { maxDifference, tolerance }
      ));
    }

    return {
      version: COVERAGE_STRATEGY_OBLIGATION_LEDGER_VERSION,
      ledgerStatus: dataGaps.length
        ? "partial"
        : (allYearsMatchNeedLine && allYearsMatchComponentAmounts ? "complete" : "mismatch"),
      diagnosticOnly: true,
      ledgerDrivesNeedLine: false,
      rows,
      annualParity,
      ownerSummary: summarizeOwners(rows),
      omittedZeroComponents,
      allYearsMatchNeedLine,
      allYearsMatchComponentAmounts,
      maxDifference,
      tolerance,
      rowCount: rows.length,
      omittedZeroComponentCount: omittedZeroComponents.length,
      warnings,
      dataGaps,
      trace: {
        source: "coverage-strategy-obligation-ledger",
        inputSource: "current-coverage-strategy-need-points-and-component-models",
        rawPmiInputsConsumed: false,
        projectionEnginesCalled: false,
        graphMathChanged: false,
        resourceLineChanged: false,
        gapSurplusChanged: false,
        chartChanged: false,
        storageUsed: false,
        displayHtmlUsed: false,
        inputMutated: false
      }
    };
  }

  lensAnalysis.COVERAGE_STRATEGY_OBLIGATION_LEDGER_VERSION =
    COVERAGE_STRATEGY_OBLIGATION_LEDGER_VERSION;
  lensAnalysis.buildCoverageStrategyObligationLedger = buildCoverageStrategyObligationLedger;

  if (typeof module !== "undefined" && module.exports) {
    module.exports = {
      COVERAGE_STRATEGY_OBLIGATION_LEDGER_VERSION,
      buildCoverageStrategyObligationLedger
    };
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
