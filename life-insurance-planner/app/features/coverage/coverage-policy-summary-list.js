(function (globalScope) {
  const root = globalScope || {};
  const LensApp = root.LensApp || (root.LensApp = {});
  const coverageUtils = LensApp.coverage || {};
  const coverageSummaryList = LensApp.coverageSummaryList || (LensApp.coverageSummaryList = {});

  // Owner: coverage feature display helpers.
  // Purpose: render reusable existing-coverage summaries from profile.coveragePolicies[].
  // Non-goals: no persistence, no modal state, no profile mutation, no PMI-specific logic.

  const CLASSIFICATION_LABELS = {
    individual: "Individual Coverage",
    groupEmployer: "Group / Employer Coverage",
    unclassified: "Existing Coverage"
  };

  function toTrimmedString(value) {
    return String(value == null ? "" : value).trim();
  }

  function escapeHtml(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function normalizeCurrencyValue(value) {
    if (typeof coverageUtils.normalizeCoverageCurrencyValue === "function") {
      return coverageUtils.normalizeCoverageCurrencyValue(value);
    }

    const normalized = toTrimmedString(value).replace(/[^0-9.]/g, "");
    const firstDot = normalized.indexOf(".");
    const cleaned = firstDot === -1
      ? normalized
      : `${normalized.slice(0, firstDot + 1)}${normalized.slice(firstDot + 1).replace(/\./g, "")}`;
    const number = Number(cleaned);
    return cleaned && Number.isFinite(number) ? number.toFixed(2) : "";
  }

  function normalizeCurrencyNumber(value) {
    const normalized = normalizeCurrencyValue(value);
    const number = Number(normalized || 0);
    return Number.isFinite(number) ? Math.max(0, number) : 0;
  }

  function formatCurrencyDisplay(value) {
    const number = Number(value || 0);
    const safeNumber = Number.isFinite(number) ? Math.max(0, number) : 0;
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(safeNumber);
  }

  function normalizePolicyRecord(policy) {
    if (typeof coverageUtils.normalizeCoveragePolicyRecord === "function") {
      return coverageUtils.normalizeCoveragePolicyRecord(policy);
    }

    return policy && typeof policy === "object" ? { ...policy } : {};
  }

  function classifyPolicy(policy) {
    if (typeof coverageUtils.classifyCoveragePolicy === "function") {
      return coverageUtils.classifyCoveragePolicy(policy);
    }

    const policyType = toTrimmedString(policy?.policyType).toLowerCase();
    if (/group\s*life/i.test(policyType)) {
      return "groupEmployer";
    }

    return policyType ? "individual" : "unclassified";
  }

  function getDeathBenefitAmount(policy) {
    if (typeof coverageUtils.getCoverageDeathBenefitAmount === "function") {
      return coverageUtils.getCoverageDeathBenefitAmount(policy);
    }

    return normalizeCurrencyNumber(policy?.faceAmount);
  }

  function getDocumentEntries(policy) {
    const normalized = policy && typeof policy === "object" ? policy : {};
    if (Array.isArray(normalized.documents)) {
      return normalized.documents.filter(function (documentEntry) {
        return documentEntry && typeof documentEntry === "object" && toTrimmedString(documentEntry.name);
      });
    }

    const documentName = toTrimmedString(normalized.documentName);
    return documentName ? [{ name: documentName }] : [];
  }

  function getClassificationLabel(classification) {
    return CLASSIFICATION_LABELS[classification] || CLASSIFICATION_LABELS.unclassified;
  }

  function createCoveragePolicySummary(policy, options) {
    const normalized = normalizePolicyRecord(policy);
    const classification = classifyPolicy(normalized);
    const classificationLabel = getClassificationLabel(classification);
    const deathBenefitAmount = getDeathBenefitAmount(normalized);
    const documents = getDocumentEntries(normalized);
    const title = toTrimmedString(
      normalized.carrierName
      || normalized.policyCarrier
      || normalized.employerOrPlanSponsor
      || normalized.policyType
      || options?.fallbackTitle
      || "Existing Coverage"
    );
    const insuredLabel = toTrimmedString(normalized.insuredName) || "Insured not entered";
    const premiumModeLabel = toTrimmedString(normalized.premiumMode) || "Premium mode not entered";
    const premiumAmount = normalizeCurrencyNumber(normalized.premiumAmount);
    const premiumAmountLabel = premiumAmount > 0 ? formatCurrencyDisplay(premiumAmount) : "Premium amount not entered";

    return {
      sourcePolicy: policy,
      policy: normalized,
      classification,
      classificationLabel,
      entryMode: toTrimmedString(normalized.entryMode),
      title,
      insuredLabel,
      deathBenefitAmount,
      deathBenefitLabel: deathBenefitAmount > 0 ? formatCurrencyDisplay(deathBenefitAmount) : "Death benefit not entered",
      premiumModeLabel,
      premiumAmount,
      premiumAmountLabel,
      documentCount: documents.length,
      documentLabel: documents.length
        ? `${documents.length} ${documents.length === 1 ? "file" : "files"} attached`
        : "No files attached"
    };
  }

  function createCoverageTotals(policies) {
    const safePolicies = Array.isArray(policies) ? policies : [];
    const summary = typeof coverageUtils.summarizeCoveragePolicies === "function"
      ? coverageUtils.summarizeCoveragePolicies(safePolicies)
      : safePolicies.reduce(function (totals, policy) {
          const normalized = normalizePolicyRecord(policy);
          const amount = getDeathBenefitAmount(normalized);
          if (amount <= 0) {
            return totals;
          }

          const classification = classifyPolicy(normalized);
          if (classification === "individual") {
            totals.individualCoverageTotal += amount;
          } else if (classification === "groupEmployer") {
            totals.groupCoverageTotal += amount;
          } else {
            totals.unclassifiedCoverageTotal += amount;
          }
          totals.totalCoverage += amount;
          totals.policyCount += 1;
          return totals;
        }, {
          individualCoverageTotal: 0,
          groupCoverageTotal: 0,
          unclassifiedCoverageTotal: 0,
          totalCoverage: 0,
          policyCount: 0
        });

    return {
      individualCoverageTotal: normalizeCurrencyNumber(summary?.individualCoverageTotal),
      groupCoverageTotal: normalizeCurrencyNumber(summary?.groupCoverageTotal),
      unclassifiedCoverageTotal: normalizeCurrencyNumber(summary?.unclassifiedCoverageTotal),
      totalCoverage: normalizeCurrencyNumber(summary?.totalCoverage),
      policyCount: safePolicies.length,
      policiesWithDeathBenefitCount: Number(summary?.policyCount || 0)
    };
  }

  function renderCoverageEmptyStateHtml(options) {
    const emptyClass = toTrimmedString(options?.emptyClass) || "coverage-policy-empty";
    const title = toTrimmedString(options?.emptyTitle) || "No existing coverage is saved yet.";
    const copy = toTrimmedString(options?.emptyCopy) || "Add existing coverage to show policy records here.";

    return `
      <div class="${escapeHtml(emptyClass)}">
        <strong>${escapeHtml(title)}</strong>
        <p>${escapeHtml(copy)}</p>
      </div>
    `;
  }

  function renderCoveragePolicyCardHtml(summary, index, options) {
    const itemClass = toTrimmedString(options?.itemClass) || "coverage-policy-summary-card";
    const copyClass = toTrimmedString(options?.copyClass) || "coverage-policy-summary-copy";
    const actionsClass = toTrimmedString(options?.actionsClass) || "coverage-policy-summary-actions";
    const indexAttributeName = toTrimmedString(options?.indexAttribute);
    const indexAttribute = indexAttributeName ? ` ${escapeHtml(indexAttributeName)}="${escapeHtml(index)}"` : "";
    const actionsMarkup = typeof options?.renderActions === "function"
      ? toTrimmedString(options.renderActions(summary, index))
      : "";

    return `
      <article class="${escapeHtml(itemClass)}"${indexAttribute}>
        <div class="${escapeHtml(copyClass)}">
          <strong>${escapeHtml(summary.title)}</strong>
          <span>${escapeHtml(summary.classificationLabel)} &bull; ${escapeHtml(summary.insuredLabel)}</span>
          <span>Death Benefit: ${escapeHtml(summary.deathBenefitLabel)} &bull; ${escapeHtml(summary.premiumModeLabel)} &bull; ${escapeHtml(summary.premiumAmountLabel)}</span>
          <span>${escapeHtml(summary.documentLabel)}</span>
        </div>
        ${actionsMarkup ? `<div class="${escapeHtml(actionsClass)}">${actionsMarkup}</div>` : ""}
      </article>
    `;
  }

  function renderCoveragePolicyListHtml(policies, options) {
    const safePolicies = Array.isArray(policies) ? policies : [];
    if (!safePolicies.length) {
      return renderCoverageEmptyStateHtml(options);
    }

    return safePolicies.map(function (policy, index) {
      return renderCoveragePolicyCardHtml(createCoveragePolicySummary(policy, options), index, options);
    }).join("");
  }

  function renderCoveragePolicyList(container, policies, options) {
    if (!container) {
      return [];
    }

    const safePolicies = Array.isArray(policies) ? policies : [];
    container.innerHTML = renderCoveragePolicyListHtml(safePolicies, options);
    return safePolicies.map(function (policy, index) {
      return createCoveragePolicySummary(policy, { ...options, index });
    });
  }

  function renderCoverageTotalsHtml(policies) {
    const totals = createCoverageTotals(policies);
    return `
      <dl class="coverage-policy-totals">
        <div>
          <dt>Individual Coverage</dt>
          <dd>${escapeHtml(formatCurrencyDisplay(totals.individualCoverageTotal))}</dd>
        </div>
        <div>
          <dt>Group / Employer Coverage</dt>
          <dd>${escapeHtml(formatCurrencyDisplay(totals.groupCoverageTotal))}</dd>
        </div>
        <div>
          <dt>Other / Unclassified Coverage</dt>
          <dd>${escapeHtml(formatCurrencyDisplay(totals.unclassifiedCoverageTotal))}</dd>
        </div>
        <div>
          <dt>Total Existing Coverage</dt>
          <dd>${escapeHtml(formatCurrencyDisplay(totals.totalCoverage))}</dd>
        </div>
      </dl>
    `;
  }

  function renderCoverageTotals(container, policies) {
    if (!container) {
      return createCoverageTotals(policies);
    }

    container.innerHTML = renderCoverageTotalsHtml(policies);
    return createCoverageTotals(policies);
  }

  Object.assign(coverageSummaryList, {
    CLASSIFICATION_LABELS,
    createCoveragePolicySummary,
    createCoverageTotals,
    renderCoveragePolicyListHtml,
    renderCoveragePolicyList,
    renderCoverageTotalsHtml,
    renderCoverageTotals,
    renderCoverageEmptyStateHtml
  });

  if (typeof module !== "undefined" && module.exports) {
    module.exports = coverageSummaryList;
  }
})(typeof window !== "undefined" ? window : globalThis);
