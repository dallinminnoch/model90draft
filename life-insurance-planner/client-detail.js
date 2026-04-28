    (function () {
      const LensApp = window.LensApp || (window.LensApp = {});

      function mountClientProfileViewer(options) {
        const viewerOptions = options && typeof options === "object" ? options : {};
        const host = viewerOptions.host || document.querySelector("[data-client-detail-host]");

        if (!host) {
          return null;
        }

        if (typeof host.__clientProfileViewerCleanup === "function") {
          host.__clientProfileViewerCleanup();
        }

        const requestParamsOverride = viewerOptions.requestParams instanceof URLSearchParams
          ? new URLSearchParams(viewerOptions.requestParams.toString())
          : viewerOptions.requestParams && typeof viewerOptions.requestParams === "object"
            ? new URLSearchParams(viewerOptions.requestParams)
            : null;
        const requestedRecordId = String(viewerOptions.recordId || "").trim();
        const requestedCaseRef = String(viewerOptions.caseRef || "").trim().toUpperCase();
        const requestedTabOverride = String(viewerOptions.tab || "").trim().toLowerCase();
        const isOverlayViewer = String(viewerOptions.mode || "").trim().toLowerCase() === "overlay";
        const handleViewerClose = typeof viewerOptions.onClose === "function" ? viewerOptions.onClose : null;

      const STORAGE_KEYS = {
        authSession: "lipPlannerAuthSession",
        clientRecords: "lensClientRecords",
        accessibility: "clientDirectoryAccessibility"
      };

      function loadJson(source, key) {
        try {
          return JSON.parse(source.getItem(key) || "null");
        } catch (error) {
          return null;
        }
      }

      function getStorageIdentity() {
        const session = loadJson(localStorage, STORAGE_KEYS.authSession);
        return session?.email ? String(session.email).trim().toLowerCase() : "guest";
      }

      function getRecordsStorageKey() {
        return `${STORAGE_KEYS.clientRecords}:${getStorageIdentity()}`;
      }

      function getAccessibilitySettingsStorageKey() {
        return `${STORAGE_KEYS.accessibility}:${getStorageIdentity()}`;
      }

      function getClientDetailRequestParams() {
        if (requestParamsOverride || requestedRecordId || requestedCaseRef || requestedTabOverride) {
          const params = requestParamsOverride
            ? new URLSearchParams(requestParamsOverride.toString())
            : new URLSearchParams();

          if (requestedRecordId && !params.has("id")) {
            params.set("id", requestedRecordId);
          }

          if (requestedCaseRef && !params.has("caseRef")) {
            params.set("caseRef", requestedCaseRef);
          }

          if (requestedTabOverride && !params.has("tab")) {
            params.set("tab", requestedTabOverride);
          }

          return params;
        }

        return new URL(window.location.href).searchParams;
      }

      function escapeHtml(value) {
        return String(value)
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;")
          .replace(/"/g, "&quot;")
          .replace(/'/g, "&#39;");
      }

      function closeViewerOrReturnToDirectory() {
        if (handleViewerClose) {
          handleViewerClose();
          return;
        }

        window.location.href = "clients.html";
      }

      function createViewerMountCleanup() {
        const cleanup = function () {
          delete host.__clientProfileViewerCleanup;
        };
        host.__clientProfileViewerCleanup = cleanup;
        return cleanup;
      }

      const clientDirectoryHelpers = window.LensApp?.clientDirectoryHelpers || {};
      const clientRecordsApi = window.LensApp?.clientRecords || {};
      const coveragePolicyUtils = window.LensApp?.coverage || {};
      const coverageSummaryList = window.LensApp?.coverageSummaryList || {};
      const getClientRecordByReference = typeof clientRecordsApi.getClientRecordByReference === "function"
        ? clientRecordsApi.getClientRecordByReference
        : null;
      const mergePendingClientRecords = typeof clientRecordsApi.mergePendingClientRecords === "function"
        ? clientRecordsApi.mergePendingClientRecords
        : null;
      const getCurrentDependentCount = typeof clientRecordsApi.getCurrentDependentCount === "function"
        ? clientRecordsApi.getCurrentDependentCount
        : function () {
          return 0;
        };
      const normalizePriority = clientDirectoryHelpers.normalizePriority;
      const getClientLifecycleStatus = clientDirectoryHelpers.getClientLifecycleStatus;
      const getClientStatusDisplay = clientDirectoryHelpers.getClientStatusDisplay;

      function getPriorityDisplay(value) {
        if (value === "high") {
          return "High";
        }
        if (value === "medium") {
          return "Medium";
        }
        if (value === "low") {
          return "Low";
        }
        return "Not provided";
      }

      function formatDate(value) {
        if (!value) {
          return "Not provided";
        }

        const date = new Date(`${value}T00:00:00`);
        if (Number.isNaN(date.getTime())) {
          return String(value);
        }

        return `${String(date.getMonth() + 1).padStart(2, "0")}/${String(date.getDate()).padStart(2, "0")}/${date.getFullYear()}`;
      }

      function formatCurrency(value) {
        const number = Number(String(value || "").replace(/,/g, ""));
        if (!number) {
          return "Not provided";
        }

        return new Intl.NumberFormat("en-US", {
          style: "currency",
          currency: "USD",
          maximumFractionDigits: 0
        }).format(number);
      }

      function formatCurrencyTotal(value) {
        const number = Number(value);
        const safeNumber = Number.isFinite(number) ? number : 0;
        return new Intl.NumberFormat("en-US", {
          style: "currency",
          currency: "USD",
          maximumFractionDigits: 0
        }).format(safeNumber);
      }

      function formatCompactCurrencyTotal(value) {
        const number = Number(value);
        const safeNumber = Number.isFinite(number) ? number : 0;
        const absolute = Math.abs(safeNumber);

        if (absolute >= 1000000) {
          return `$${(safeNumber / 1000000).toFixed(absolute >= 10000000 ? 0 : 1).replace(/\.0$/, "")}M`;
        }

        if (absolute >= 1000) {
          return `$${(safeNumber / 1000).toFixed(absolute >= 100000 ? 0 : 1).replace(/\.0$/, "")}k`;
        }

        return formatCurrencyTotal(safeNumber);
      }

      function parseCurrencyNumber(value) {
        const number = Number(String(value || "").replace(/[^0-9.-]/g, ""));
        return Number.isFinite(number) ? number : 0;
      }

      function getPolicyDeathBenefitAmount(policy) {
        if (typeof coveragePolicyUtils.getCoverageDeathBenefitAmount === "function") {
          return coveragePolicyUtils.getCoverageDeathBenefitAmount(policy);
        }

        return parseCurrencyNumber(policy?.faceAmount);
      }

      function normalizeCoverageSummaryNumber(value) {
        const number = Number(value);
        return Number.isFinite(number) ? Math.max(0, number) : 0;
      }

      function summarizeCoveragePoliciesForProfile(policies) {
        const safePolicies = Array.isArray(policies) ? policies : [];
        if (typeof coverageSummaryList.createCoverageTotals === "function") {
          const summary = coverageSummaryList.createCoverageTotals(safePolicies) || {};
          return {
            individualCoverageTotal: normalizeCoverageSummaryNumber(summary.individualCoverageTotal),
            groupCoverageTotal: normalizeCoverageSummaryNumber(summary.groupCoverageTotal),
            unclassifiedCoverageTotal: normalizeCoverageSummaryNumber(summary.unclassifiedCoverageTotal),
            totalCoverage: normalizeCoverageSummaryNumber(summary.totalCoverage),
            policyCount: safePolicies.length
          };
        }

        if (typeof coveragePolicyUtils.summarizeCoveragePolicies === "function") {
          const summary = coveragePolicyUtils.summarizeCoveragePolicies(safePolicies) || {};
          return {
            individualCoverageTotal: normalizeCoverageSummaryNumber(summary.individualCoverageTotal),
            groupCoverageTotal: normalizeCoverageSummaryNumber(summary.groupCoverageTotal),
            unclassifiedCoverageTotal: normalizeCoverageSummaryNumber(summary.unclassifiedCoverageTotal),
            totalCoverage: normalizeCoverageSummaryNumber(summary.totalCoverage),
            policyCount: safePolicies.length
          };
        }

        return {
          individualCoverageTotal: 0,
          groupCoverageTotal: 0,
          unclassifiedCoverageTotal: 0,
          totalCoverage: safePolicies.reduce(function (sum, policy) {
            return sum + getPolicyDeathBenefitAmount(policy);
          }, 0),
          policyCount: safePolicies.length
        };
      }

      function createCoveragePolicyDisplaySummary(policy, options) {
        if (typeof coverageSummaryList.createCoveragePolicySummary === "function") {
          return coverageSummaryList.createCoveragePolicySummary(policy, options);
        }

        const normalizedPolicy = policy && typeof policy === "object" ? policy : {};
        const deathBenefitAmount = getPolicyDeathBenefitAmount(normalizedPolicy);
        const policyType = String(normalizedPolicy.policyType || "").trim();
        return {
          policy: normalizedPolicy,
          classificationLabel: policyType || "Existing Coverage",
          title: String(
            normalizedPolicy.carrierName
            || normalizedPolicy.policyCarrier
            || normalizedPolicy.employerOrPlanSponsor
            || policyType
            || options?.fallbackTitle
            || "Existing Coverage"
          ).trim(),
          insuredLabel: String(normalizedPolicy.insuredName || "").trim() || "Insured not entered",
          deathBenefitAmount,
          deathBenefitLabel: deathBenefitAmount > 0 ? formatCurrency(deathBenefitAmount) : "Death benefit not entered",
          premiumModeLabel: String(normalizedPolicy.premiumMode || "").trim() || "Premium mode not entered",
          premiumAmountLabel: parseCurrencyNumber(normalizedPolicy.premiumAmount) > 0
            ? formatCurrency(normalizedPolicy.premiumAmount)
            : "Premium amount not entered"
        };
      }

      function getCoverageProfileSummaryFields(policies) {
        const summary = summarizeCoveragePoliciesForProfile(policies);
        const totalCoverage = Math.max(0, Math.min(normalizeCoverageSummaryNumber(summary.totalCoverage), 99999999));
        return {
          currentCoverage: totalCoverage,
          coverageAmount: totalCoverage,
          policyCount: summary.policyCount
        };
      }

      function getLatestProtectionModelingPayload(record) {
        if (!record || typeof record !== "object") {
          return null;
        }

        if (record.protectionModeling && typeof record.protectionModeling === "object") {
          return record.protectionModeling;
        }

        if (Array.isArray(record.protectionModelingEntries) && record.protectionModelingEntries.length) {
          return record.protectionModelingEntries[record.protectionModelingEntries.length - 1];
        }

        return null;
      }

      function getRecordCurrentCoverageValue(record) {
        const profilePolicies = Array.isArray(record?.coveragePolicies) ? record.coveragePolicies : [];
        if (profilePolicies.length) {
          return getCoverageProfileSummaryFields(profilePolicies).currentCoverage;
        }

        const modelingPayload = getLatestProtectionModelingPayload(record);
        const modelingData = modelingPayload && modelingPayload.data && typeof modelingPayload.data === "object"
          ? modelingPayload.data
          : {};
        const modeledCoverageTotal = parseCurrencyNumber(modelingData.existingCoverageTotal)
          || (
            parseCurrencyNumber(modelingData.individualDeathBenefit)
            + parseCurrencyNumber(modelingData.groupLifeCoverage)
            + parseCurrencyNumber(modelingData.currentCoverageAmount)
            + parseCurrencyNumber(modelingData.currentLifeInsuranceCoverage)
          );
        const recordCoverage = Math.max(
          parseCurrencyNumber(record?.currentCoverage),
          parseCurrencyNumber(record?.coverageAmount)
        );
        const hasExplicitRecordCoverage = record && typeof record === "object"
          && Object.prototype.hasOwnProperty.call(record, "currentCoverage");
        return hasExplicitRecordCoverage
          ? Math.max(0, parseCurrencyNumber(record?.currentCoverage))
          : Math.max(0, modeledCoverageTotal, recordCoverage);
      }

      function getRecordModeledNeedValue(record) {
        const modelingPayload = getLatestProtectionModelingPayload(record);
        const modelingData = modelingPayload && modelingPayload.data && typeof modelingPayload.data === "object"
          ? modelingPayload.data
          : {};
        const storedModeledNeed = Math.max(
          0,
          parseCurrencyNumber(record?.modeledNeed),
          parseCurrencyNumber(record?.coverageGap)
        );
        const hasStoredModeledNeed = record && typeof record === "object"
          && Object.prototype.hasOwnProperty.call(record, "modeledNeed");

        if (hasStoredModeledNeed) {
          return Math.max(0, parseCurrencyNumber(record?.modeledNeed));
        }

        return Math.max(
          0,
          storedModeledNeed,
          parseCurrencyNumber(modelingData.totalModeledNeed),
          parseCurrencyNumber(modelingData.totalNeed),
          parseCurrencyNumber(modelingData.totalCoverageNeed),
          parseCurrencyNumber(modelingData.totalDeathBenefitNeed),
          parseCurrencyNumber(modelingData.deathBenefitNeed),
          parseCurrencyNumber(modelingData.estimatedNeed),
          parseCurrencyNumber(modelingData.coverageNeed),
          parseCurrencyNumber(modelingData.coverageTarget)
        );
      }

      function getRecordUncoveredGapValue(record) {
        const explicitUncoveredGap = parseCurrencyNumber(record?.uncoveredGap);
        const hasExplicitUncoveredGap = record && typeof record === "object"
          && Object.prototype.hasOwnProperty.call(record, "uncoveredGap");
        if (hasExplicitUncoveredGap) {
          return Math.max(0, explicitUncoveredGap);
        }

        return Math.max(0, getRecordModeledNeedValue(record) - getRecordCurrentCoverageValue(record));
      }

      function synchronizeRecordCoverageFields(record, overrides) {
        if (!record || typeof record !== "object") {
          return record;
        }

        const nextRecord = {
          ...record,
          ...(overrides && typeof overrides === "object" ? overrides : {})
        };
        const profilePolicies = Array.isArray(nextRecord.coveragePolicies) ? nextRecord.coveragePolicies : null;
        const profileCoverageSummaryFields = profilePolicies && profilePolicies.length
          ? getCoverageProfileSummaryFields(profilePolicies)
          : null;
        const currentCoverage = profileCoverageSummaryFields
          ? profileCoverageSummaryFields.currentCoverage
          : getRecordCurrentCoverageValue(nextRecord);
        const modeledNeed = getRecordModeledNeedValue(nextRecord);
        const hasExplicitCoverageFields = Object.prototype.hasOwnProperty.call(nextRecord, "currentCoverage")
          || Object.prototype.hasOwnProperty.call(nextRecord, "modeledNeed");
        const uncoveredGap = hasExplicitCoverageFields
          ? Math.max(0, modeledNeed - currentCoverage)
          : Math.max(
            0,
            parseCurrencyNumber(nextRecord.uncoveredGap),
            modeledNeed - currentCoverage
          );

        return {
          ...nextRecord,
          currentCoverage,
          modeledNeed,
          uncoveredGap,
          coverageAmount: currentCoverage,
          ...(profilePolicies ? { policyCount: profilePolicies.length } : {}),
          coverageGap: modeledNeed
        };
      }

      function getCoverageAnnualPremiumMultiplier(mode) {
        const normalized = String(mode || "").trim().toLowerCase();

        if (normalized === "monthly") {
          return 12;
        }

        if (normalized === "quarterly") {
          return 4;
        }

        if (normalized === "semi-annual") {
          return 2;
        }

        if (normalized === "annual") {
          return 1;
        }

        if (normalized === "single premium") {
          return 1;
        }

        return 0;
      }

      function getCoveragePremiumScheduleLabel(mode) {
        const normalized = String(mode || "").trim().toLowerCase();

        if (normalized === "monthly") {
          return "paid monthly";
        }

        if (normalized === "quarterly") {
          return "paid quarterly";
        }

        if (normalized === "semi-annual") {
          return "paid semi-annually";
        }

        if (normalized === "annual") {
          return "paid annually";
        }

        if (normalized === "single premium") {
          return "single premium";
        }

        if (normalized === "flexible premium") {
          return "flexible premium";
        }

        if (normalized === "graded premium") {
          return "graded premium";
        }

        if (normalized === "modified premium") {
          return "modified premium";
        }

        return "premium type pending";
      }

      function getCoveragePolicyReferenceLabel(policy, index) {
        const policyNumber = formatValue(policy && policy.policyNumber);
        if (policyNumber !== "Not provided") {
          return `Policy ${policyNumber}`;
        }

        return `Policy ${index + 1}`;
      }

      function getCoverageAnnualPremiumSummary(policies) {
        const summaryPolicies = Array.isArray(policies) ? policies : [];
        const details = summaryPolicies.map(function (policy, index) {
          const premiumAmount = parseCurrencyNumber(policy && policy.premiumAmount);
          const annualMultiplier = getCoverageAnnualPremiumMultiplier(policy && policy.premiumMode);
          const annualizedAmount = annualMultiplier > 0 ? premiumAmount * annualMultiplier : 0;

          return {
            annualizedAmount,
            hasAnnualizedAmount: annualMultiplier > 0 && premiumAmount > 0,
            scheduleLine: `${getCoveragePolicyReferenceLabel(policy, index)} ${getCoveragePremiumScheduleLabel(policy && policy.premiumMode)}`
          };
        });

        return {
          total: details.reduce(function (sum, detail) {
            return sum + detail.annualizedAmount;
          }, 0),
          hasAnnualizedAmount: details.some(function (detail) {
            return detail.hasAnnualizedAmount;
          }),
          scheduleLines: details.map(function (detail) {
            return detail.scheduleLine;
          })
        };
      }

      function addCoverageDateOffset(dateString, years, months) {
        const normalizedDate = String(dateString || "").trim();
        if (!normalizedDate) {
          return "";
        }

        const baseDate = new Date(`${normalizedDate}T00:00:00`);
        if (Number.isNaN(baseDate.getTime())) {
          return "";
        }

        const safeYears = Number(String(years || "").replace(/\D/g, "")) || 0;
        const safeMonths = Number(String(months || "").replace(/\D/g, "")) || 0;
        baseDate.setFullYear(baseDate.getFullYear() + safeYears);
        baseDate.setMonth(baseDate.getMonth() + safeMonths);

        return baseDate.toISOString().slice(0, 10);
      }

      function getCoveragePremiumTimingLabel(mode) {
        const normalized = String(mode || "").trim().toLowerCase();

        if (normalized === "monthly") {
          return "Paid monthly";
        }

        if (normalized === "quarterly") {
          return "Paid quarterly";
        }

        if (normalized === "semi-annual") {
          return "Paid semi-annually";
        }

        if (normalized === "annual") {
          return "Paid annually";
        }

        if (normalized === "single premium") {
          return "Paid once";
        }

        if (normalized === "flexible premium") {
          return "Flexible schedule";
        }

        if (normalized === "graded premium") {
          return "Graded premium";
        }

        if (normalized === "modified premium") {
          return "Modified premium";
        }

        return "Premium timing pending";
      }

      function getPremiumTimelinePolicyStatus(policy) {
        return String(policy?.effectiveDate || "").trim() ? "In-force" : "Pending";
      }

      function getCoverageApproxMonthDifference(startDateString, endDateString) {
        const startDate = new Date(`${String(startDateString || "").trim()}T00:00:00`);
        const endDate = new Date(`${String(endDateString || "").trim()}T00:00:00`);

        if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime()) || endDate <= startDate) {
          return 0;
        }

        return Math.max(1, Math.round((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24 * 30.4375)));
      }

      function getCoveragePolicyHorizonContext(policy, profileRecord) {
        const effectiveDate = String(policy?.effectiveDate || "").trim();
        const termLength = Number(String(policy?.termLength || "").replace(/\D/g, ""));

        if (isCoveragePermanentPolicyType(policy?.policyType)) {
          const profileBirthDate = String(profileRecord?.dateOfBirth || "").trim();
          const likelyEndowmentDate = profileBirthDate ? addCoverageDateOffset(profileBirthDate, "121", "0") : "";
          let totalMonths = effectiveDate && likelyEndowmentDate
            ? getCoverageApproxMonthDifference(effectiveDate, likelyEndowmentDate)
            : 0;

          if (!totalMonths) {
            const insuredAge = getAvatarAge(profileRecord?.age, profileBirthDate);
            if (insuredAge !== null && insuredAge < 121) {
              totalMonths = Math.max(12, Math.round((121 - insuredAge) * 12));
            }
          }

          if (!totalMonths) {
            totalMonths = 65 * 12;
          }

          return {
            totalMonths,
            totalYears: Math.max(1, Math.round(totalMonths / 12)),
            horizonLabel: likelyEndowmentDate ? `Likely endowment ${formatDate(likelyEndowmentDate)}` : "Likely endowment (Age 121)",
            footerLabel: effectiveDate
              ? `Issue ${formatDate(effectiveDate)} · ${likelyEndowmentDate ? `Likely endowment ${formatDate(likelyEndowmentDate)}` : "Projected to age 121"}`
              : "Effective date pending · projected to likely endowment"
          };
        }

        const totalMonths = Number.isFinite(termLength) && termLength > 0 ? termLength * 12 : 120;
        const endDate = effectiveDate && Number.isFinite(termLength) && termLength > 0
          ? addCoverageDateOffset(effectiveDate, String(termLength), "0")
          : "";

        return {
          totalMonths,
          totalYears: Math.max(1, Math.round(totalMonths / 12)),
          horizonLabel: endDate ? `Term ends ${formatDate(endDate)}` : (termLength > 0 ? `${termLength} year term` : "Coverage horizon pending"),
          footerLabel: effectiveDate
            ? `Issue ${formatDate(effectiveDate)} · ${endDate ? `Term ends ${formatDate(endDate)}` : (termLength > 0 ? `${termLength} year term` : "Term pending")}`
            : (termLength > 0 ? `${termLength} year term` : "Effective date and term pending")
        };
      }

      function getCoveragePremiumTimelineRecurringLabel(policy) {
        const premiumAmount = formatCurrency(policy?.premiumAmount);
        const normalizedMode = String(policy?.premiumMode || "").trim().toLowerCase();

        if (normalizedMode === "monthly") {
          return premiumAmount !== "Not provided" ? `${premiumAmount}/mo` : "Monthly premium";
        }

        if (normalizedMode === "quarterly") {
          return premiumAmount !== "Not provided" ? `${premiumAmount}/qtr` : "Quarterly premium";
        }

        if (normalizedMode === "semi-annual") {
          return premiumAmount !== "Not provided" ? `${premiumAmount}/6 mo` : "Semi-annual premium";
        }

        if (normalizedMode === "annual") {
          return premiumAmount !== "Not provided" ? `${premiumAmount}/yr` : "Annual premium";
        }

        if (normalizedMode === "single premium") {
          return premiumAmount !== "Not provided" ? `${premiumAmount} once` : "Single premium";
        }

        if (normalizedMode === "flexible premium") {
          return premiumAmount !== "Not provided" ? `${premiumAmount} flexible` : "Flexible premium";
        }

        return premiumAmount !== "Not provided" ? premiumAmount : "Premium pending";
      }

      function getCoveragePremiumTimelineVisual(policy, profileRecord) {
        const horizon = getCoveragePolicyHorizonContext(policy, profileRecord);
        const totalMonths = Math.max(12, horizon.totalMonths || 12);
        const paymentBands = [];
        const markers = [];
        const premiumAmount = formatCurrency(policy?.premiumAmount);
        const startingPremium = formatCurrency(policy?.startingPremium);
        const premiumScheduleDisplay = formatCoveragePremiumSchedule(policy?.premiumScheduleYears, policy?.premiumScheduleMonths);

        if (isCoverageSteppedPremiumMode(policy?.premiumMode)) {
          const stepParts = getCoveragePremiumScheduleParts(policy);
          const scheduledMonths = (Number(stepParts.years || 0) * 12) + Number(stepParts.months || 0);
          const finalPremiumStartPercent = scheduledMonths > 0
            ? Math.max(8, Math.min(92, (scheduledMonths / totalMonths) * 100))
            : 42;

          paymentBands.push({
            label: startingPremium !== "Not provided" ? `Start ${startingPremium}` : "Starting premium",
            left: 0,
            width: finalPremiumStartPercent,
            tone: "soft"
          });

          paymentBands.push({
            label: premiumAmount !== "Not provided" ? `Final ${premiumAmount}` : "Final premium",
            left: finalPremiumStartPercent,
            width: Math.max(100 - finalPremiumStartPercent, 8),
            tone: "strong"
          });

          markers.push({
            label: premiumScheduleDisplay !== "Not provided" ? `Final after ${premiumScheduleDisplay}` : "Final premium begins",
            left: finalPremiumStartPercent
          });
        } else if (String(policy?.premiumMode || "").trim().toLowerCase() === "single premium") {
          markers.push({
            label: getCoveragePremiumTimelineRecurringLabel(policy),
            left: 4
          });
        } else {
          paymentBands.push({
            label: getCoveragePremiumTimelineRecurringLabel(policy),
            left: 0,
            width: 100,
            tone: "strong"
          });
        }

        const tickPercents = horizon.totalYears >= 12 ? [0, 25, 50, 75, 100] : [0, 50, 100];
        const seenTickLabels = new Set();
        const ticks = tickPercents.map(function (percent) {
          const labelYears = Math.round((horizon.totalYears * percent) / 100);
          const normalizedLabel = percent === 100 ? horizon.totalYears : labelYears;
          return {
            left: percent,
            label: `Year ${normalizedLabel}`
          };
        }).filter(function (tick) {
          if (seenTickLabels.has(tick.label)) {
            return false;
          }
          seenTickLabels.add(tick.label);
          return true;
        });

        return {
          horizon,
          paymentBands,
          markers,
          ticks
        };
      }

      function getCoverageTimelineCurrentAge(profileRecord) {
        const derivedAge = getAvatarAge(profileRecord?.age, profileRecord?.dateOfBirth);
        if (derivedAge !== null) {
          return Math.max(0, derivedAge);
        }

        const numericAge = Number(profileRecord?.age);
        if (Number.isFinite(numericAge) && numericAge >= 0) {
          return Math.round(numericAge);
        }

        return 0;
      }

      function getCoverageTimelineDisplayName(profileRecord) {
        const fullName = [
          String(profileRecord?.preferredName || profileRecord?.firstName || "").trim(),
          String(profileRecord?.lastName || "").trim()
        ].filter(Boolean).join(" ").trim();

        return fullName || String(profileRecord?.displayName || "Client").trim() || "Client";
      }

      function getCoverageAgeAtDate(dateOfBirthValue, targetDateValue) {
        const normalizedBirthDate = String(dateOfBirthValue || "").trim();
        const normalizedTargetDate = String(targetDateValue || "").trim();
        if (!normalizedBirthDate || !normalizedTargetDate) {
          return null;
        }

        const birthDate = new Date(`${normalizedBirthDate}T00:00:00`);
        const targetDate = new Date(`${normalizedTargetDate}T00:00:00`);
        if (Number.isNaN(birthDate.getTime()) || Number.isNaN(targetDate.getTime())) {
          return null;
        }

        let age = targetDate.getFullYear() - birthDate.getFullYear();
        const monthDifference = targetDate.getMonth() - birthDate.getMonth();
        if (monthDifference < 0 || (monthDifference === 0 && targetDate.getDate() < birthDate.getDate())) {
          age -= 1;
        }

        return Number.isFinite(age) ? Math.max(0, age) : null;
      }

      function getCoverageTimelineYearLabel(profileRecord, age) {
        const birthDateValue = String(profileRecord?.dateOfBirth || "").trim();
        const birthYear = birthDateValue ? Number(birthDateValue.slice(0, 4)) : NaN;
        if (Number.isFinite(birthYear)) {
          return String(birthYear + age);
        }

        return String(new Date().getFullYear() + (age - getCoverageTimelineCurrentAge(profileRecord)));
      }

      function getCoverageTimelinePolicyWindow(policy, profileRecord, currentAge) {
        const policyType = String(policy?.policyType || "").trim();
        const effectiveDate = String(policy?.effectiveDate || "").trim();
        const startAgeFromDate = getCoverageAgeAtDate(profileRecord?.dateOfBirth, effectiveDate);
        const startAge = startAgeFromDate !== null ? startAgeFromDate : currentAge;
        const permanent = isCoveragePermanentPolicyType(policyType);
        const numericTermLength = Number(String(policy?.termLength || "").replace(/\D/g, ""));
        const endAge = permanent
          ? 121
          : (Number.isFinite(numericTermLength) && numericTermLength > 0 ? startAge + numericTermLength : startAge + 10);
        const premiumScheduleParts = getCoveragePremiumScheduleParts(policy);
        const finalPremiumAge = isCoverageSteppedPremiumMode(policy?.premiumMode)
          ? startAge + Number(premiumScheduleParts.years || 0) + (Number(premiumScheduleParts.months || 0) / 12)
          : null;

        return {
          policy,
          startAge,
          endAge,
          permanent,
          numericTermLength: Number.isFinite(numericTermLength) ? numericTermLength : 0,
          finalPremiumAge
        };
      }

      function getCoverageTimelineMonthlyValue(policyWindow, age) {
        const policy = policyWindow?.policy || {};
        const normalizedMode = String(policy.premiumMode || "").trim().toLowerCase();
        const steppedPremiumActive = isCoverageSteppedPremiumMode(policy.premiumMode)
          && policyWindow.finalPremiumAge !== null
          && age < policyWindow.finalPremiumAge
          && parseCurrencyNumber(policy.startingPremium) > 0;
        const rawAmount = steppedPremiumActive
          ? parseCurrencyNumber(policy.startingPremium)
          : parseCurrencyNumber(policy.premiumAmount);

        if (!rawAmount) {
          return 0;
        }

        if (normalizedMode === "monthly") {
          return rawAmount;
        }

        if (normalizedMode === "quarterly") {
          return rawAmount / 3;
        }

        if (normalizedMode === "semi-annual") {
          return rawAmount / 6;
        }

        if (normalizedMode === "annual") {
          return rawAmount / 12;
        }

        if (normalizedMode === "single premium") {
          return 0;
        }

        return rawAmount / 12;
      }

      function getCoverageTimelinePaymentLabel(policyWindow, age) {
        const policy = policyWindow?.policy || {};
        const normalizedMode = String(policy.premiumMode || "").trim().toLowerCase();
        const steppedPremiumActive = isCoverageSteppedPremiumMode(policy.premiumMode)
          && policyWindow.finalPremiumAge !== null
          && age < policyWindow.finalPremiumAge
          && parseCurrencyNumber(policy.startingPremium) > 0;
        const displayAmount = steppedPremiumActive
          ? formatCurrency(policy.startingPremium)
          : formatCurrency(policy.premiumAmount);

        if (normalizedMode === "monthly") {
          return displayAmount !== "Not provided" ? `${displayAmount}/mo` : "Monthly";
        }

        if (normalizedMode === "quarterly") {
          return displayAmount !== "Not provided" ? `${displayAmount}/qtr` : "Quarterly";
        }

        if (normalizedMode === "semi-annual") {
          return displayAmount !== "Not provided" ? `${displayAmount}/6 mo` : "Semi-Annual";
        }

        if (normalizedMode === "annual") {
          return displayAmount !== "Not provided" ? `${displayAmount}/yr` : "Annual";
        }

        if (normalizedMode === "single premium") {
          return displayAmount !== "Not provided" ? `${displayAmount} once` : "Single premium";
        }

        if (normalizedMode === "graded premium" || normalizedMode === "modified premium") {
          return displayAmount !== "Not provided" ? displayAmount : formatValue(policy.premiumMode);
        }

        if (normalizedMode === "flexible premium") {
          return displayAmount !== "Not provided" ? `${displayAmount} flexible` : "Flexible premium";
        }

        return displayAmount !== "Not provided" ? displayAmount : "Premium pending";
      }

      function isCoverageTimelineWindowActiveAtAge(policyWindow, age) {
        return age >= policyWindow.startAge && age <= policyWindow.endAge;
      }

      function getCoverageTimelineGapAge(policyWindows, currentAge) {
        const candidateEndAges = Array.from(new Set(policyWindows.map(function (policyWindow) {
          return Math.round(policyWindow.endAge * 100) / 100;
        }))).sort(function (a, b) {
          return a - b;
        });

        for (let index = 0; index < candidateEndAges.length; index += 1) {
          const candidateAge = candidateEndAges[index];
          if (candidateAge < currentAge) {
            continue;
          }

          const hasCoverageAfterCandidate = policyWindows.some(function (policyWindow) {
            return isCoverageTimelineWindowActiveAtAge(policyWindow, candidateAge + 0.01);
          });

          if (!hasCoverageAfterCandidate) {
            return Math.round(candidateAge);
          }
        }

        return null;
      }

      function roundCoverageTimelineAge(value, step) {
        const safeStep = Math.max(1, Number(step) || 1);
        return Math.ceil(Number(value || 0) / safeStep) * safeStep;
      }

      function addCoverageTimelineAgeCandidate(ageBucket, candidateAge, currentAge, horizonAge) {
        const roundedAge = Math.round(Number(candidateAge));
        if (!Number.isFinite(roundedAge)) {
          return;
        }

        if (roundedAge <= currentAge || roundedAge >= horizonAge) {
          return;
        }

        if (ageBucket.some(function (existingAge) {
          return Math.abs(existingAge - roundedAge) <= 3;
        })) {
          return;
        }

        ageBucket.push(roundedAge);
      }

      function getCoverageTimelineContext(policies, profileRecord) {
        const currentAge = getCoverageTimelineCurrentAge(profileRecord);
        const policyWindows = policies.map(function (policy) {
          return getCoverageTimelinePolicyWindow(policy, profileRecord, currentAge);
        });
        const hasPermanentCoverage = policyWindows.some(function (policyWindow) {
          return policyWindow.permanent;
        });
        const earliestExpiryWindow = policyWindows
          .filter(function (policyWindow) {
            return policyWindow.endAge >= currentAge;
          })
          .sort(function (a, b) {
            return a.endAge - b.endAge;
          })[0] || null;
        const gapAge = hasPermanentCoverage ? null : getCoverageTimelineGapAge(policyWindows, currentAge);
        const horizonAge = hasPermanentCoverage
          ? 121
          : roundCoverageTimelineAge(Math.max(80, (gapAge || (earliestExpiryWindow ? earliestExpiryWindow.endAge : currentAge + 15)) + 16), 5);
        const currentMonthlyOutlay = policyWindows.reduce(function (sum, policyWindow) {
          return sum + (isCoverageTimelineWindowActiveAtAge(policyWindow, currentAge)
            ? getCoverageTimelineMonthlyValue(policyWindow, currentAge)
            : 0);
        }, 0);
        const annualizedCurrentOutlay = currentMonthlyOutlay * 12;
        const maxTimelineColumns = 7;
        const timelineAges = [currentAge];
        const importantAges = [
          earliestExpiryWindow ? Math.round(earliestExpiryWindow.endAge) : null,
          gapAge
        ].filter(function (age) {
          return age !== null && age > currentAge && age < horizonAge;
        });

        importantAges.forEach(function (age) {
          addCoverageTimelineAgeCandidate(timelineAges, age, currentAge, horizonAge);
        });

        const coverageSpan = horizonAge - currentAge;
        const prioritizedAges = [
          currentAge + 5,
          currentAge + 10,
          currentAge + (coverageSpan * 0.35),
          currentAge + (coverageSpan * 0.55),
          horizonAge - 20,
          horizonAge - 10
        ];

        prioritizedAges.forEach(function (age) {
          if (timelineAges.length >= maxTimelineColumns - 1) {
            return;
          }

          addCoverageTimelineAgeCandidate(timelineAges, age, currentAge, horizonAge);
        });

        if (timelineAges.length < maxTimelineColumns - 1) {
          Array.from({ length: maxTimelineColumns - 2 }, function (_value, index) {
            return currentAge + (((horizonAge - currentAge) * (index + 1)) / (maxTimelineColumns - 1));
          }).forEach(function (age) {
            if (timelineAges.length >= maxTimelineColumns - 1) {
              return;
            }

            addCoverageTimelineAgeCandidate(timelineAges, age, currentAge, horizonAge);
          });
        }

        timelineAges.push(horizonAge);
        timelineAges.sort(function (a, b) {
          return a - b;
        });

        return {
          displayName: getCoverageTimelineDisplayName(profileRecord),
          currentAge,
          horizonAge,
          timelineAges,
          policyWindows,
          hasPermanentCoverage,
          earliestExpiryWindow,
          gapAge,
          currentMonthlyOutlay,
          annualizedCurrentOutlay
        };
      }

      function getCoverageTimelineSnapshot(age, context, profileRecord) {
        const activeWindows = context.policyWindows.filter(function (policyWindow) {
          return isCoverageTimelineWindowActiveAtAge(policyWindow, age);
        });
        const totalFaceAmount = activeWindows.reduce(function (sum, policyWindow) {
          return sum + getPolicyDeathBenefitAmount(policyWindow.policy);
        }, 0);
        const totalMonthlyOutlay = activeWindows.reduce(function (sum, policyWindow) {
          return sum + getCoverageTimelineMonthlyValue(policyWindow, age);
        }, 0);
        const expiringWindows = activeWindows.filter(function (policyWindow) {
          return Math.round(policyWindow.endAge) === age;
        });
        const status = activeWindows.length === 0
          ? "projected"
          : (age === context.currentAge
            ? "inforce"
            : (expiringWindows.length ? "expiring" : "active"));
        const primaryWindow = activeWindows[0] || null;
        const displayYear = getCoverageTimelineYearLabel(profileRecord, age);
        const title = activeWindows.length === 0
          ? "No coverage"
          : (activeWindows.length === 1
            ? `${formatValue(primaryWindow.policy.policyCarrier)} ${formatValue(primaryWindow.policy.policyType)}`
            : `${activeWindows.length} policies active`);
        const amountLabel = activeWindows.length === 0
          ? "—"
          : (activeWindows.length === 1
            ? getCoverageTimelinePaymentLabel(primaryWindow, age)
            : (totalMonthlyOutlay > 0 ? `${formatCurrencyTotal(totalMonthlyOutlay)}/mo` : "Mixed schedules"));
        const secondaryLine = activeWindows.length === 0
          ? (context.gapAge !== null && age >= context.gapAge ? "Gap period" : "Planning horizon")
          : `${formatCompactCurrencyTotal(totalFaceAmount)} face`;

        let tertiaryLine = "";
        if (activeWindows.length === 0) {
          tertiaryLine = age === context.horizonAge ? "Projected horizon" : "No active policy at this age";
        } else if (activeWindows.length === 1 && primaryWindow) {
          if (status === "expiring") {
            tertiaryLine = "Policy expires";
          } else if (primaryWindow.permanent) {
            tertiaryLine = "Permanent coverage";
          } else if (primaryWindow.numericTermLength > 0) {
            const policyYear = Math.max(1, Math.min(primaryWindow.numericTermLength, Math.round(age - primaryWindow.startAge) + 1));
            tertiaryLine = `Yr ${policyYear} of ${primaryWindow.numericTermLength}`;
          } else {
            tertiaryLine = getCoveragePremiumTimingLabel(primaryWindow.policy.premiumMode);
          }
        } else {
          tertiaryLine = `${activeWindows.length} policies active`;
        }

        const badgeText = status === "inforce"
          ? "In Force"
          : status === "expiring"
            ? "Term End"
            : status === "active"
              ? "Continuing"
              : "Projected";

        return {
          age,
          displayYear,
          isCurrent: age === context.currentAge,
          status,
          title,
          amountLabel,
          secondaryLine,
          tertiaryLine,
          badgeText
        };
      }

      function renderPremiumTimelineModalSummary(policies, profileRecord) {
        const context = getCoverageTimelineContext(policies, profileRecord);
        const coverageExpiresValue = context.hasPermanentCoverage
          ? "Age 121"
          : (context.earliestExpiryWindow ? `Age ${Math.round(context.earliestExpiryWindow.endAge)}` : "Pending");
        const coverageExpiresMeta = context.hasPermanentCoverage
          ? "Likely endowment"
          : (context.earliestExpiryWindow
            ? `${formatValue(context.earliestExpiryWindow.policy.policyCarrier)} ${formatValue(context.earliestExpiryWindow.policy.policyType)} end`
            : "No expiry date saved");
        const coverageGapValue = context.gapAge !== null ? `Age ${context.gapAge}+` : "None projected";
        const coverageGapMeta = context.gapAge !== null
          ? "No permanent coverage"
          : (context.hasPermanentCoverage ? "Protected to likely endowment" : "No immediate gap detected");

        const summaryCards = [
          {
            label: "Current Age",
            value: String(context.currentAge),
            meta: String(profileRecord?.dateOfBirth || "").trim() ? `Born ${formatDate(profileRecord.dateOfBirth)}` : "Date of birth not provided"
          },
          {
            label: "Monthly Outlay",
            value: context.currentMonthlyOutlay > 0 ? formatCurrencyTotal(context.currentMonthlyOutlay) : "Varies",
            meta: context.currentMonthlyOutlay > 0 ? `${formatCurrencyTotal(context.annualizedCurrentOutlay)} / year` : "Based on saved premium modes"
          },
          {
            label: "Coverage Expires",
            value: coverageExpiresValue,
            meta: coverageExpiresMeta
          },
          {
            label: "Coverage Gap",
            value: coverageGapValue,
            meta: coverageGapMeta
          }
        ];

        return `
          <div class="client-premium-timeline-topbar">
            <div class="client-premium-timeline-context">${escapeHtml(`${context.displayName} · Age ${context.currentAge} - ${context.horizonAge} · ${policies.length === 1 ? "1 policy" : "All policies"}`)}</div>
            <div class="client-premium-timeline-legend">
              <span class="client-premium-timeline-legend-item"><span class="client-premium-timeline-legend-dot is-inforce"></span>In force</span>
              <span class="client-premium-timeline-legend-item"><span class="client-premium-timeline-legend-dot is-active"></span>Active</span>
              <span class="client-premium-timeline-legend-item"><span class="client-premium-timeline-legend-dot is-expiring"></span>Expiring</span>
              <span class="client-premium-timeline-legend-item"><span class="client-premium-timeline-legend-dot is-projected"></span>Projected</span>
            </div>
          </div>
          <div class="client-premium-timeline-summary-grid">
            ${summaryCards.map(function (card) {
              return `
                <div class="client-premium-timeline-summary-card">
                  <span class="client-premium-timeline-summary-label">${escapeHtml(card.label)}</span>
                  <strong class="client-premium-timeline-summary-value">${escapeHtml(card.value)}</strong>
                  <span class="client-premium-timeline-summary-meta">${escapeHtml(card.meta)}</span>
                </div>
              `;
            }).join("")}
          </div>
        `;
      }

      function renderPremiumTimelineModalBody(policies, profileRecord) {
        const context = getCoverageTimelineContext(policies, profileRecord);
        const snapshots = context.timelineAges.map(function (age) {
          return getCoverageTimelineSnapshot(age, context, profileRecord);
        });
        const alertTitle = context.gapAge !== null
          ? `Coverage gap detected at age ${context.gapAge}`
          : "Coverage continues through the timeline";
        const alertCopy = context.gapAge !== null
          ? "Placed coverage ends without permanent protection in force. Consider adding permanent coverage before the renewal window closes."
          : (context.hasPermanentCoverage
            ? "Permanent coverage is in place, so the protection timeline runs through likely endowment."
            : "No immediate coverage gap is projected from the policies saved on this profile.");

        return `
          <div class="client-premium-timeline-board-shell">
            <div class="client-premium-timeline-board" style="--timeline-columns:${snapshots.length};">
              <div class="client-premium-timeline-age-row">
                ${snapshots.map(function (snapshot) {
                  return `<span class="client-premium-timeline-age-label">${escapeHtml(`Age ${snapshot.age}${snapshot.isCurrent ? " · Today" : ""}`)}</span>`;
                }).join("")}
              </div>
              <div class="client-premium-timeline-node-row">
                ${snapshots.map(function (snapshot) {
                  return `<span class="client-premium-timeline-node is-${snapshot.status}" aria-hidden="true"></span>`;
                }).join("")}
              </div>
              <div class="client-premium-timeline-card-row">
                ${snapshots.map(function (snapshot) {
                  return `
                    <article class="client-premium-timeline-snapshot-card is-${snapshot.status}">
                      <span class="client-premium-timeline-snapshot-age">${escapeHtml(`${snapshot.displayYear} · Age ${snapshot.age}`)}</span>
                      <strong class="client-premium-timeline-snapshot-title">${escapeHtml(snapshot.title)}</strong>
                      <strong class="client-premium-timeline-snapshot-amount">${escapeHtml(snapshot.amountLabel)}</strong>
                      <span class="client-premium-timeline-snapshot-meta">${escapeHtml(snapshot.secondaryLine)}</span>
                      <span class="client-premium-timeline-snapshot-detail">${escapeHtml(snapshot.tertiaryLine)}</span>
                      <span class="client-premium-timeline-snapshot-status">${escapeHtml(snapshot.badgeText)}</span>
                    </article>
                  `;
                }).join("")}
              </div>
            </div>
          </div>
          <section class="client-premium-timeline-alert${context.gapAge !== null ? " is-gap" : ""}">
            <span class="client-premium-timeline-alert-icon" aria-hidden="true"></span>
            <div class="client-premium-timeline-alert-copy">
              <strong>${escapeHtml(alertTitle)}</strong>
              <span>${escapeHtml(alertCopy)}</span>
            </div>
          </section>
        `;
      }

      function formatValue(value) {
        if (value === null || value === undefined) {
          return "Not provided";
        }

        const normalized = String(value).trim();
        return normalized || "Not provided";
      }

      function formatTitleCaseValue(value) {
        const normalized = formatValue(value);
        if (normalized === "Not provided") {
          return normalized;
        }
        return normalized
          .split(/[\s/-]+/)
          .map(function (part) {
            return part ? part.charAt(0).toUpperCase() + part.slice(1).toLowerCase() : part;
          })
          .join(" ");
      }

      function isCoverageSteppedPremiumMode(mode) {
        const normalized = String(mode || "").trim().toLowerCase();
        return normalized === "graded premium" || normalized === "modified premium";
      }

      function getCoveragePremiumAmountLabel(mode) {
        return isCoverageSteppedPremiumMode(mode) ? "Final Premium" : "Premium Amount";
      }

      function formatCoveragePremiumSchedule(years, months) {
        const safeYears = String(years || "").replace(/\D/g, "");
        const safeMonths = String(months || "").replace(/\D/g, "");
        if (!safeYears && !safeMonths) {
          return "Not provided";
        }

        const parts = [];
        if (safeYears) {
          const yearCount = Number(safeYears);
          parts.push(`${yearCount} year${yearCount === 1 ? "" : "s"}`);
        }
        if (safeMonths) {
          const monthCount = Number(safeMonths);
          parts.push(`${monthCount} month${monthCount === 1 ? "" : "s"}`);
        }

        return parts.join(" ");
      }

      function getCoveragePremiumScheduleParts(policyLike) {
        const currentPolicy = policyLike || {};
        const explicitYears = String(currentPolicy.premiumScheduleYears || "").replace(/\D/g, "");
        const explicitMonths = String(currentPolicy.premiumScheduleMonths || "").replace(/\D/g, "");

        if (explicitYears || explicitMonths) {
          const safeYears = explicitYears ? String(Math.max(0, Math.round(Number(explicitYears)))) : "";
          const safeMonths = explicitMonths ? String(Math.min(11, Math.max(0, Math.round(Number(explicitMonths))))) : "";
          const combined = !safeYears && !safeMonths
            ? ""
            : (Number(safeYears || 0) + (Number(safeMonths || 0) / 12)).toFixed(2).replace(/\.00$/, "");
          return {
            years: safeYears,
            months: safeMonths,
            combined
          };
        }

        const combinedValue = Number(String(currentPolicy.premiumScheduleDuration || "").replace(/[^0-9.]/g, ""));
        if (!Number.isFinite(combinedValue) || combinedValue <= 0) {
          return {
            years: "",
            months: "",
            combined: ""
          };
        }

        let wholeYears = Math.floor(combinedValue);
        let remainingMonths = Math.round((combinedValue - wholeYears) * 12);
        if (remainingMonths >= 12) {
          wholeYears += 1;
          remainingMonths = 0;
        }

        return {
          years: wholeYears ? String(wholeYears) : "",
          months: remainingMonths ? String(remainingMonths) : "",
          combined: combinedValue.toFixed(2).replace(/\.00$/, "")
        };
      }

      function normalizeCoverageCurrencyValue(value) {
        const normalized = String(value || "").replace(/[^0-9.]/g, "");
        const firstDot = normalized.indexOf(".");
        const cleaned = firstDot === -1
          ? normalized
          : `${normalized.slice(0, firstDot + 1)}${normalized.slice(firstDot + 1).replace(/\./g, "")}`;

        if (!cleaned) {
          return "";
        }

        const numericValue = Number(cleaned);
        if (!Number.isFinite(numericValue)) {
          return "";
        }

        return numericValue.toFixed(2);
      }

      function formatCoverageCurrencyInput(value) {
        const normalized = normalizeCoverageCurrencyValue(value);
        if (!normalized) {
          return "";
        }

        return new Intl.NumberFormat("en-US", {
          style: "currency",
          currency: "USD",
          minimumFractionDigits: 2,
          maximumFractionDigits: 2
        }).format(Number(normalized));
      }

      function formatCoverageCurrencyEditingInput(value) {
        const normalized = String(value || "").replace(/[^0-9.]/g, "");
        const firstDot = normalized.indexOf(".");
        const cleaned = firstDot === -1
          ? normalized
          : `${normalized.slice(0, firstDot + 1)}${normalized.slice(firstDot + 1).replace(/\./g, "")}`;

        if (!cleaned) {
          return "";
        }

        const hasDecimal = cleaned.includes(".");
        const parts = cleaned.split(".");
        const integerDigits = (parts[0] || "").replace(/^0+(?=\d)/, "") || "0";
        const decimalDigits = hasDecimal ? String(parts[1] || "").slice(0, 2) : "";
        const formattedInteger = new Intl.NumberFormat("en-US", {
          maximumFractionDigits: 0
        }).format(Number(integerDigits));

        return `$${formattedInteger}${hasDecimal ? `.${decimalDigits}` : ""}`;
      }

      function getLastInitial(value) {
        return String(value || "").trim().charAt(0).toUpperCase();
      }

      function getInitials(value, viewType, lastName) {
        if (viewType === "households") {
          const householdLastInitial = getLastInitial(lastName);
          if (householdLastInitial) {
            return householdLastInitial;
          }

          const trimmed = String(value || "").trim().replace(/\s+Household$/i, "");
          const parts = trimmed.split(/\s+/).filter(Boolean);
          const fallbackLastName = parts.length ? parts[parts.length - 1] : "";
          return fallbackLastName.charAt(0).toUpperCase() || "H";
        }

        const words = String(value || "").trim().split(/\s+/).filter(Boolean);
        if (!words.length) {
          return "CL";
        }
        return words.slice(0, 2).map(function (word) {
          return word.charAt(0).toUpperCase();
        }).join("");
      }

      function getAvatarAge(ageValue, dateOfBirthValue) {
        const numericAge = Number(ageValue);
        if (Number.isFinite(numericAge) && numericAge > 0) {
          return Math.max(0, Math.min(100, numericAge));
        }

        const birthDateValue = String(dateOfBirthValue || "").trim();
        if (!birthDateValue) {
          return null;
        }

        const birthDate = new Date(`${birthDateValue}T00:00:00`);
        if (Number.isNaN(birthDate.getTime())) {
          return null;
        }

        const today = new Date();
        let calculatedAge = today.getFullYear() - birthDate.getFullYear();
        const monthDifference = today.getMonth() - birthDate.getMonth();
        if (monthDifference < 0 || (monthDifference === 0 && today.getDate() < birthDate.getDate())) {
          calculatedAge -= 1;
        }

        return Number.isFinite(calculatedAge) ? Math.max(0, Math.min(100, calculatedAge)) : null;
      }

      function calculateDisplayAgeFromBirthDate(dateOfBirthValue) {
        const normalizedBirthDate = String(dateOfBirthValue || "").trim();
        const match = normalizedBirthDate.match(/^(\d{4})-(\d{2})-(\d{2})$/);
        if (!match) {
          return null;
        }

        const birthYear = Number(match[1]);
        const birthMonth = Number(match[2]);
        const birthDay = Number(match[3]);
        const birthDate = new Date(birthYear, birthMonth - 1, birthDay);
        if (
          Number.isNaN(birthDate.getTime())
          || birthDate.getFullYear() !== birthYear
          || birthDate.getMonth() !== birthMonth - 1
          || birthDate.getDate() !== birthDay
        ) {
          return null;
        }

        const today = new Date();
        const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
        if (birthDate > todayStart) {
          return null;
        }

        let calculatedAge = today.getFullYear() - birthYear;
        const monthDifference = today.getMonth() - (birthMonth - 1);
        if (monthDifference < 0 || (monthDifference === 0 && today.getDate() < birthDay)) {
          calculatedAge -= 1;
        }

        return Number.isFinite(calculatedAge) && calculatedAge >= 0 ? calculatedAge : null;
      }

      function getDependentDetails(record) {
        if (Array.isArray(record?.dependentDetails)) {
          return record.dependentDetails;
        }

        if (typeof record?.dependentDetails === "string") {
          try {
            const parsedDetails = JSON.parse(record.dependentDetails);
            return Array.isArray(parsedDetails) ? parsedDetails : [];
          } catch (_error) {
            return [];
          }
        }

        return [];
      }

      function deriveDependentAgesFromDetails(record) {
        const ages = getDependentDetails(record)
          .map(function (dependent) {
            return calculateDisplayAgeFromBirthDate(dependent?.dateOfBirth);
          })
          .filter(function (age) {
            return Number.isFinite(age);
          });

        return ages.length ? ages.join(", ") : "Birthdates not entered";
      }

      function interpolateNumber(start, end, progress) {
        return start + ((end - start) * progress);
      }

      function getAvatarHue(ageValue, dateOfBirthValue) {
        const age = getAvatarAge(ageValue, dateOfBirthValue);
        if (age === null) {
          return 210;
        }

        if (age <= 18) {
          return interpolateNumber(48, 60, age / 18);
        }

        if (age <= 30) {
          return interpolateNumber(60, 210, (age - 18) / 12);
        }

        if (age <= 65) {
          return interpolateNumber(210, 280, (age - 30) / 35);
        }

        return interpolateNumber(280, 360, (age - 65) / 35);
      }

      function prefersSoftAvatars() {
        const settings = loadJson(localStorage, getAccessibilitySettingsStorageKey());
        return Boolean(settings && settings["soft-avatars"]);
      }

      function getAvatarPresentation(ageValue, dateOfBirthValue) {
        const hue = getAvatarHue(ageValue, dateOfBirthValue);
        if (prefersSoftAvatars()) {
          return {
            background: `hsl(${hue} 62% 88%)`,
            color: `hsl(${hue} 46% 36%)`,
            boxShadow: "none"
          };
        }

        const highlightHue = hue;
        const shadowHue = (hue + 22) % 360;
        return {
          background: `linear-gradient(135deg, hsl(${highlightHue} 72% 66%), hsl(${shadowHue} 68% 44%))`,
          color: "#ffffff",
          boxShadow: 'inset 0 0 0 2px rgba(255, 255, 255, 0.75)'
        };
      }

      function getAccountMilestones(record) {
        const hasProfile = Boolean(String(record.id || "").trim());
        const hasPreliminary = Boolean(record.preliminaryUnderwritingCompleted);
        const hasPmi = Boolean(record.pmiCompleted);
        const hasAnalysis = Boolean(record.analysisCompleted) || record.statusGroup === "coverage-placed" || record.statusGroup === "closed";
        const hasCoveragePlaced = (Array.isArray(record.coveragePolicies) && record.coveragePolicies.length > 0)
          || record.statusGroup === "coverage-placed"
          || record.statusGroup === "closed";

        return [
          { label: "Profile Created", complete: hasProfile, color: "#2f5d46" },
          { label: "Preliminary Underwriting", complete: hasPreliminary, color: "#9a7b5f" },
          { label: "PMI", complete: hasPmi, color: "#7c5cff" },
          { label: "Analysis Complete", complete: hasAnalysis, color: "#1f2937" },
          { label: "Coverage Placed", complete: hasCoveragePlaced, color: "#d97f6f" }
        ];
      }

      function calculateProfileCompletion(record) {
        const milestones = getAccountMilestones(record);
        const completed = milestones.filter(function (milestone) {
          return milestone.complete;
        }).length;
        return Math.round((completed / milestones.length) * 100);
      }

      function polarToCartesian(centerX, centerY, radius, angleInDegrees) {
        const angleInRadians = (angleInDegrees - 90) * Math.PI / 180;
        return {
          x: centerX + (radius * Math.cos(angleInRadians)),
          y: centerY + (radius * Math.sin(angleInRadians))
        };
      }

      function describeArc(centerX, centerY, radius, startAngle, endAngle) {
        const start = polarToCartesian(centerX, centerY, radius, endAngle);
        const end = polarToCartesian(centerX, centerY, radius, startAngle);
        const largeArcFlag = endAngle - startAngle <= 180 ? "0" : "1";
        return `M ${start.x} ${start.y} A ${radius} ${radius} 0 ${largeArcFlag} 0 ${end.x} ${end.y}`;
      }

      const CLOSE_INDEX_GAUGE_SEGMENTS = [
        {
          start: 0,
          end: 20,
          color: "#f6d1d0",
          borderColor: "#8a2d2a"
        },
        {
          start: 20,
          end: 40,
          color: "#f8e8b4",
          borderColor: "#7f5a12"
        },
        {
          start: 40,
          end: 70,
          color: "#e4edf7",
          borderColor: "#556a85"
        },
        {
          start: 70,
          end: 100,
          color: "#dff0c8",
          borderColor: "#506f25"
        }
      ];
      const CLOSE_INDEX_DISPLAY_BANDS = Object.freeze([
        Object.freeze({ tier: "is-risk", label: "Low", nextLabel: "Average", nextThreshold: 21 }),
        Object.freeze({ tier: "is-caution", label: "Average", nextLabel: "High", nextThreshold: 41 }),
        Object.freeze({ tier: "is-building", label: "High", nextLabel: "Excellent", nextThreshold: 71 }),
        Object.freeze({ tier: "is-premium", label: "Excellent", nextLabel: "", nextThreshold: null })
      ]);

      function getCloseIndexDisplayBand(score, tier) {
        const normalizedTier = String(tier || "").trim();
        if (normalizedTier) {
          const tierMatch = CLOSE_INDEX_DISPLAY_BANDS.find(function (band) {
            return band.tier === normalizedTier;
          });
          if (tierMatch) {
            return tierMatch;
          }
        }

        const safeScore = Number.isFinite(score) ? score : 0;
        if (safeScore > 70) {
          return CLOSE_INDEX_DISPLAY_BANDS[3];
        }
        if (safeScore >= 41) {
          return CLOSE_INDEX_DISPLAY_BANDS[2];
        }
        if (safeScore >= 21) {
          return CLOSE_INDEX_DISPLAY_BANDS[1];
        }
        return CLOSE_INDEX_DISPLAY_BANDS[0];
      }

      function renderCloseIndexGauge(closeIndex) {
        const score = closeIndex && Number.isFinite(closeIndex.score)
          ? Math.max(0, Math.min(100, closeIndex.score))
          : null;
        const tier = String(closeIndex?.tier || (
          score !== null
            && window.LipOpportunityScore
            && typeof window.LipOpportunityScore.getScoreTier === "function"
            ? window.LipOpportunityScore.getScoreTier(score)
            : ""
        ) || "").trim();
        const band = getCloseIndexDisplayBand(score, tier);
        const markerPosition = score === null ? 50 : Math.max(0, Math.min(100, score));

        return `
          <div class="client-overview-close-index-visual ${escapeHtml(band.tier)}" aria-label="Close Index ${score === null ? "not available" : score}">
            <span class="client-overview-close-index-heading">Close Index - Close Probability</span>
            <div class="client-overview-close-index-score-row">
              <span class="client-overview-close-index-number">${score === null ? "--" : escapeHtml(String(score))}</span>
              <span class="client-overview-close-index-pill ${escapeHtml(band.tier)}">${escapeHtml(band.label)}</span>
            </div>
            <div class="client-overview-close-index-bar-shell">
              <div class="client-overview-close-index-bar" aria-hidden="true">
                ${CLOSE_INDEX_GAUGE_SEGMENTS.map(function (segment) {
                  return `
                    <span
                      class="client-overview-close-index-segment"
                      style="--close-index-segment-span:${segment.end - segment.start};--close-index-segment-fill:${segment.color};"
                    ></span>
                  `;
                }).join("")}
              </div>
              ${score === null ? "" : `<span class="client-overview-close-index-marker" style="--close-index-marker-target:${markerPosition}%;left:var(--close-index-marker-target);"></span>`}
              <div class="client-overview-close-index-scale" aria-hidden="true">
                <span>0</span>
                <span>100</span>
              </div>
            </div>
            <span class="client-overview-close-index-divider" aria-hidden="true"></span>
          </div>
        `;
      }

      function normalizeProbabilityPercent(value, fallback) {
        const safeValue = Number.isFinite(value) ? value : fallback;
        return Math.max(0, Math.min(100, Math.round(safeValue)));
      }

      function getOverviewCloseProbabilityPrediction(workflowState, closeIndex) {
        const currentKey = String(workflowState?.currentKey || "").trim();
        const steps = Array.isArray(workflowState?.steps) ? workflowState.steps : [];
        const workflowComplete = steps.length > 0 && steps.every(function (step) { return step.complete; });
        const completedWorkflowKey = steps.length && steps.every(function (step) { return step.complete; })
          ? String(steps[steps.length - 1]?.key || "").trim()
          : "";
        const activeKey = currentKey || completedWorkflowKey || "default";
        const basePrediction = OVERVIEW_CLOSE_PROBABILITY_PREDICTIONS[activeKey]
          || OVERVIEW_CLOSE_PROBABILITY_PREDICTIONS.default;
        const baseCurrent = normalizeProbabilityPercent(basePrediction.current, OVERVIEW_CLOSE_PROBABILITY_PREDICTIONS.default.current);
        const baseProjected = normalizeProbabilityPercent(basePrediction.projected, OVERVIEW_CLOSE_PROBABILITY_PREDICTIONS.default.projected);
        const current = Number.isFinite(closeIndex?.score)
          ? normalizeProbabilityPercent(closeIndex.score, baseCurrent)
          : baseCurrent;
        const projectedGain = Math.max(0, baseProjected - baseCurrent);
        const projected = workflowComplete
          ? current
          : normalizeProbabilityPercent(current + projectedGain, baseProjected);

        return Object.freeze({
          current,
          projected,
          qualifier: workflowComplete
            ? "Workflow Completed"
            : String(basePrediction.qualifier || OVERVIEW_CLOSE_PROBABILITY_PREDICTIONS.default.qualifier).trim(),
          notes: Object.freeze([])
        });
      }

      function renderOverviewCloseProbabilityPrediction(prediction) {
        const current = Number.isFinite(prediction?.current) ? prediction.current : OVERVIEW_CLOSE_PROBABILITY_PREDICTIONS.default.current;
        const projected = Number.isFinite(prediction?.projected) ? prediction.projected : OVERVIEW_CLOSE_PROBABILITY_PREDICTIONS.default.projected;
        const qualifier = String(prediction?.qualifier || OVERVIEW_CLOSE_PROBABILITY_PREDICTIONS.default.qualifier).trim();
        const notes = Array.isArray(prediction?.notes)
          ? prediction.notes.filter(function (note) {
              return note && String(note.label || "").trim() && String(note.value || "").trim();
            }).slice(0, 2)
          : [];

        return `
          <section class="client-overview-probability-prediction" aria-label="Close Probability Prediction">
            <span class="client-summary-label">Increase Close Probability</span>
            <div class="client-overview-probability-content">
              <div class="client-overview-probability-metric-stack">
                <div class="client-overview-probability-prediction-row">
                  <strong class="client-overview-probability-current">${escapeHtml(`${current}%`)}</strong>
                  <span class="client-overview-probability-arrow" aria-hidden="true"></span>
                  <strong class="client-overview-probability-projected">${escapeHtml(`${projected}%`)}</strong>
                </div>
                <span class="client-overview-probability-qualifier">${escapeHtml(qualifier)}</span>
              </div>
            </div>
            ${notes.length ? `
              <div class="client-overview-probability-notes" aria-label="Close Probability Notes">
                ${notes.map(function (note) {
                  return `
                    <div class="client-overview-probability-note">
                      <span class="client-overview-probability-note-label">${escapeHtml(note.label)}</span>
                      <span class="client-overview-probability-note-value">${escapeHtml(note.value)}</span>
                    </div>
                  `;
                }).join("")}
              </div>
            ` : ""}
          </section>
        `;
      }


      function getRecord() {
        const params = getClientDetailRequestParams();
        const recordId = String(params.get("id") || "").trim();
        const caseRef = String(params.get("caseRef") || "").trim().toUpperCase();

        if (mergePendingClientRecords) {
          mergePendingClientRecords();
        }

        if (getClientRecordByReference) {
          const matchedRecord = getClientRecordByReference(recordId, caseRef);
          return matchedRecord ? synchronizeRecordCoverageFields(matchedRecord) : null;
        }

        const records = loadJson(localStorage, getRecordsStorageKey());
        if (!Array.isArray(records)) {
          return null;
        }

        if (recordId) {
          const matchedById = records.find(function (item) {
            return String(item?.id || "").trim() === recordId;
          }) || null;
          if (matchedById) {
            return synchronizeRecordCoverageFields(matchedById);
          }
        }

        if (caseRef) {
          const matchedByCaseRef = records.find(function (item) {
            return String(item?.caseRef || "").trim().toUpperCase() === caseRef;
          }) || null;
          return matchedByCaseRef ? synchronizeRecordCoverageFields(matchedByCaseRef) : null;
        }

        return null;
      }

      function markRecordViewed(currentRecord) {
        if (!currentRecord || !String(currentRecord.id || "").trim()) {
          return currentRecord;
        }

        const records = loadJson(localStorage, getRecordsStorageKey());
        if (!Array.isArray(records)) {
          return currentRecord;
        }

        const recordIndex = records.findIndex(function (item) {
          return String(item?.id || "").trim() === String(currentRecord.id || "").trim();
        });
        if (recordIndex === -1) {
          return currentRecord;
        }

        const viewedAt = new Date().toISOString();
        records[recordIndex] = {
          ...records[recordIndex],
          lastViewedAt: viewedAt
        };

        localStorage.setItem(getRecordsStorageKey(), JSON.stringify(records));
        currentRecord.lastViewedAt = viewedAt;
        return currentRecord;
      }

      function getLatestRecordSnapshot() {
        const records = loadJson(localStorage, getRecordsStorageKey());
        if (!Array.isArray(records)) {
          return record;
        }

        const matched = records.find(function (item) {
          return String(item?.id || "").trim() === String(record?.id || "").trim();
        });

        return synchronizeRecordCoverageFields(matched || record);
      }

      const POLICY_DOCUMENT_DB_NAME = "lipPlannerPolicyDocuments";
      const POLICY_DOCUMENT_STORE_NAME = "policyDocuments";
      let policyDocumentDbPromise = null;

      function openPolicyDocumentDb() {
        if (!("indexedDB" in window)) {
          return Promise.resolve(null);
        }

        if (policyDocumentDbPromise) {
          return policyDocumentDbPromise;
        }

        policyDocumentDbPromise = new Promise(function (resolve, reject) {
          const request = window.indexedDB.open(POLICY_DOCUMENT_DB_NAME, 1);

          request.onupgradeneeded = function () {
            const db = request.result;
            if (!db.objectStoreNames.contains(POLICY_DOCUMENT_STORE_NAME)) {
              db.createObjectStore(POLICY_DOCUMENT_STORE_NAME, { keyPath: "id" });
            }
          };

          request.onsuccess = function () {
            resolve(request.result);
          };

          request.onerror = function () {
            reject(request.error || new Error("Unable to open policy document storage."));
          };
        });

        return policyDocumentDbPromise;
      }

      function buildPolicyDocumentKey(recordId, policyId) {
        return `${String(recordId || "").trim()}::${String(policyId || "").trim()}`;
      }

      function formatFileSize(bytes) {
        const size = Number(bytes);
        if (!Number.isFinite(size) || size <= 0) {
          return "0 KB";
        }

        if (size < 1024 * 1024) {
          return `${Math.max(1, Math.round(size / 1024))} KB`;
        }

        return `${(size / (1024 * 1024)).toFixed(1)} MB`;
      }

      function getPolicyDocumentEntries(policyLike) {
        const documents = Array.isArray(policyLike?.documents)
          ? policyLike.documents.map(function (entry) {
              return {
                name: String(entry?.name || "").trim(),
                type: String(entry?.type || "").trim(),
                size: Number(entry?.size || 0),
                savedAt: String(entry?.savedAt || "").trim()
              };
            }).filter(function (entry) {
              return Boolean(entry.name);
            })
          : [];

        if (documents.length) {
          return documents;
        }

        const legacyName = String(policyLike?.documentName || "").trim();
        if (!legacyName) {
          return [];
        }

        return [{
          name: legacyName,
          type: String(policyLike?.documentType || "").trim(),
          size: Number(policyLike?.documentSize || 0),
          savedAt: String(policyLike?.documentSavedAt || "").trim()
        }];
      }

      function getStoredPolicyDocumentFiles(entry) {
        if (Array.isArray(entry?.files)) {
          return entry.files.map(function (item) {
            return {
              file: item?.file || null,
              name: String(item?.name || item?.file?.name || "").trim(),
              type: String(item?.type || item?.file?.type || "").trim(),
              size: Number(item?.size || item?.file?.size || 0),
              savedAt: String(item?.savedAt || "").trim()
            };
          }).filter(function (item) {
            return item.file && item.name;
          });
        }

        if (entry?.file) {
          return [{
            file: entry.file,
            name: String(entry?.name || entry.file?.name || "").trim(),
            type: String(entry?.type || entry.file?.type || "").trim(),
            size: Number(entry?.size || entry.file?.size || 0),
            savedAt: String(entry?.savedAt || "").trim()
          }];
        }

        return [];
      }

      function savePolicyDocumentFiles(recordId, policyId, files, options) {
        return openPolicyDocumentDb().then(function (db) {
          const nextFiles = Array.from(files || []).filter(Boolean);
          if (!nextFiles.length) {
            return false;
          }

          if (!db) {
            throw new Error("Policy document storage is not available in this browser.");
          }

          return new Promise(function (resolve, reject) {
            const transaction = db.transaction(POLICY_DOCUMENT_STORE_NAME, "readwrite");
            const store = transaction.objectStore(POLICY_DOCUMENT_STORE_NAME);
            const documentKey = buildPolicyDocumentKey(recordId, policyId);
            const getRequest = store.get(documentKey);

            getRequest.onsuccess = function () {
              const existingFiles = options?.append === false ? [] : getStoredPolicyDocumentFiles(getRequest.result);
              const timestamp = new Date().toISOString();
              const mergedFiles = existingFiles.concat(nextFiles.map(function (file) {
                return {
                  file,
                  name: String(file.name || "").trim(),
                  type: String(file.type || "").trim(),
                  size: Number(file.size || 0),
                  savedAt: timestamp
                };
              }));

              const putRequest = store.put({
                id: documentKey,
                recordId: String(recordId || "").trim(),
                policyId: String(policyId || "").trim(),
                files: mergedFiles,
                savedAt: timestamp
              });

              putRequest.onsuccess = function () {
                resolve(true);
              };

              putRequest.onerror = function () {
                reject(putRequest.error || new Error("Unable to save the policy documents."));
              };
            };

            getRequest.onerror = function () {
              reject(getRequest.error || new Error("Unable to read existing policy documents."));
            };
          });
        });
      }

      function getPolicyDocumentFiles(recordId, policyId) {
        return openPolicyDocumentDb().then(function (db) {
          if (!db) {
            return null;
          }

          return new Promise(function (resolve, reject) {
            const transaction = db.transaction(POLICY_DOCUMENT_STORE_NAME, "readonly");
            const store = transaction.objectStore(POLICY_DOCUMENT_STORE_NAME);
            const request = store.get(buildPolicyDocumentKey(recordId, policyId));

            request.onsuccess = function () {
              const files = getStoredPolicyDocumentFiles(request.result);
              if (!files.length) {
                resolve(null);
                return;
              }

              resolve({
                id: buildPolicyDocumentKey(recordId, policyId),
                recordId: String(recordId || "").trim(),
                policyId: String(policyId || "").trim(),
                files,
                savedAt: String(request.result?.savedAt || "").trim()
              });
            };

            request.onerror = function () {
              reject(request.error || new Error("Unable to read the policy documents."));
            };
          });
        });
      }

      function deletePolicyDocumentFile(recordId, policyId) {
        return openPolicyDocumentDb().then(function (db) {
          if (!db) {
            return false;
          }

          return new Promise(function (resolve, reject) {
            const transaction = db.transaction(POLICY_DOCUMENT_STORE_NAME, "readwrite");
            const store = transaction.objectStore(POLICY_DOCUMENT_STORE_NAME);
            const request = store.delete(buildPolicyDocumentKey(recordId, policyId));

            request.onsuccess = function () {
              resolve(true);
            };

            request.onerror = function () {
              reject(request.error || new Error("Unable to delete the policy document."));
            };
          });
        });
      }

      function updateStoredPolicyDocumentFiles(recordId, policyId, updater) {
        return openPolicyDocumentDb().then(function (db) {
          if (!db) {
            throw new Error("Policy document storage is not available in this browser.");
          }

          return new Promise(function (resolve, reject) {
            const transaction = db.transaction(POLICY_DOCUMENT_STORE_NAME, "readwrite");
            const store = transaction.objectStore(POLICY_DOCUMENT_STORE_NAME);
            const documentKey = buildPolicyDocumentKey(recordId, policyId);
            const getRequest = store.get(documentKey);

            getRequest.onsuccess = function () {
              const existingFiles = getStoredPolicyDocumentFiles(getRequest.result);
              const updatedFiles = updater(existingFiles);
              const nextFiles = Array.isArray(updatedFiles) ? updatedFiles : [];
              if (!nextFiles.length) {
                const deleteRequest = store.delete(documentKey);
                deleteRequest.onsuccess = function () {
                  resolve([]);
                };
                deleteRequest.onerror = function () {
                  reject(deleteRequest.error || new Error("Unable to update the policy documents."));
                };
                return;
              }

              const timestamp = new Date().toISOString();
              const putRequest = store.put({
                id: documentKey,
                recordId: String(recordId || "").trim(),
                policyId: String(policyId || "").trim(),
                files: nextFiles.map(function (item) {
                  return {
                    file: item.file,
                    name: String(item.name || item.file?.name || "").trim(),
                    type: String(item.type || item.file?.type || "").trim(),
                    size: Number(item.size || item.file?.size || 0),
                    savedAt: String(item.savedAt || timestamp).trim()
                  };
                }),
                savedAt: timestamp
              });

              putRequest.onsuccess = function () {
                resolve(nextFiles);
              };

              putRequest.onerror = function () {
                reject(putRequest.error || new Error("Unable to update the policy documents."));
              };
            };

            getRequest.onerror = function () {
              reject(getRequest.error || new Error("Unable to read the policy documents."));
            };
          });
        });
      }

      function syncPolicyDocumentMetadata(recordId, policyId, files) {
        const records = loadJson(localStorage, getRecordsStorageKey());
        if (!Array.isArray(records)) {
          return false;
        }

        const recordIndex = records.findIndex(function (item) {
          return String(item?.id || "").trim() === String(recordId || "").trim();
        });
        if (recordIndex === -1) {
          return false;
        }

        const currentRecord = synchronizeRecordCoverageFields(records[recordIndex]);
        const policies = Array.isArray(currentRecord.coveragePolicies) ? currentRecord.coveragePolicies.slice() : [];
        const policyIndex = policies.findIndex(function (policy) {
          return String(policy?.id || "").trim() === String(policyId || "").trim();
        });
        if (policyIndex === -1) {
          return false;
        }

        const normalizedFiles = Array.from(files || []).map(function (item) {
          return {
            name: String(item?.name || "").trim(),
            type: String(item?.type || "").trim(),
            size: Number(item?.size || 0),
            savedAt: String(item?.savedAt || "").trim()
          };
        }).filter(function (item) {
          return Boolean(item.name);
        });

        const nextPolicy = {
          ...policies[policyIndex],
          documents: normalizedFiles,
          documentName: String(normalizedFiles[0]?.name || "").trim(),
          documentType: String(normalizedFiles[0]?.type || "").trim(),
          documentSize: Number(normalizedFiles[0]?.size || 0),
          documentSavedAt: String(normalizedFiles[0]?.savedAt || "").trim()
        };

        policies[policyIndex] = nextPolicy;

        const today = new Date().toISOString().slice(0, 10);
        const nextRecord = {
          ...currentRecord,
          coveragePolicies: policies,
          lastUpdatedDate: today,
          lastReview: today
        };

        records[recordIndex] = nextRecord;
        localStorage.setItem(getRecordsStorageKey(), JSON.stringify(records));
        Object.assign(record, nextRecord);
        return true;
      }

      function normalizePolicyDocumentName(nextName, currentName) {
        const trimmed = String(nextName || "").trim();
        if (!trimmed) {
          return "";
        }

        const hasExtension = /\.[^.\s]+$/.test(trimmed);
        if (hasExtension) {
          return trimmed;
        }

        const currentExtensionMatch = String(currentName || "").match(/\.[^.\s]+$/);
        return currentExtensionMatch ? `${trimmed}${currentExtensionMatch[0]}` : trimmed;
      }

      function getPrimaryLinkedClientForHousehold(householdRecord) {
        const householdId = String(householdRecord?.id || "").trim();
        if (!householdId) {
          return null;
        }

        const records = loadJson(localStorage, getRecordsStorageKey());
        if (!Array.isArray(records)) {
          return null;
        }

        const linkedIndividuals = records.filter(function (item) {
          return String(item?.viewType || "").trim() === "individuals"
            && String(item?.householdId || "").trim() === householdId;
        });

        if (!linkedIndividuals.length) {
          return null;
        }

        return linkedIndividuals.find(function (item) {
          return String(item?.householdRole || "").trim().toLowerCase() === "primary client";
        }) || linkedIndividuals[0] || null;
      }

      function getLinkedIndividualsForHousehold(householdRecord) {
        const householdId = String(householdRecord?.id || "").trim();
        if (!householdId) {
          return [];
        }

        const records = loadJson(localStorage, getRecordsStorageKey());
        if (!Array.isArray(records)) {
          return [];
        }

        return records.filter(function (item) {
          return String(item?.viewType || "").trim() === "individuals"
            && String(item?.householdId || "").trim() === householdId;
        });
      }

      function getRequestedTab() {
        const params = getClientDetailRequestParams();
        const requestedTab = String(params.get("tab") || "").trim().toLowerCase();
        return ["overview", "planning", "household", "notes"].includes(requestedTab)
          ? requestedTab
          : "overview";
      }

      // CODE NOTE: These defaults keep the grouped profile sidebar aligned with
      // the broader profile tabs and the sticky detail header summary.
      const CLIENT_PROFILE_DEFAULT_NAV_BY_TAB = {
        overview: "overview",
        planning: "modeling-inputs",
        household: "household",
        notes: "notes"
      };

      // CODE NOTE: The hybrid sidebar + progress system is driven from this
      // shared workflow sequence so the left nav, checklist card, and primary
      // Continue CTA all stay aligned to the same case progression model.
      const CLIENT_PROFILE_WORKFLOW_SEQUENCE = [
        { key: "overview", label: "Overview", tab: "overview", target: "overview" },
        { key: "modeling-inputs", label: "Modeling Inputs", tab: "planning", target: "modeling-inputs", parent: "analysis" },
        { key: "needs-analysis", label: "Needs Analysis", tab: "planning", target: "needs-analysis", parent: "analysis" },
        { key: "recommendation", label: "Recommendation", tab: "overview", target: "recommendation", parent: "analysis" },
        { key: "underwriting", label: "Underwriting", tab: "planning", target: "underwriting" },
        { key: "placement", label: "Placement", tab: "overview", target: "placement" }
      ];

      // CODE NOTE: Overview close-probability forecast copy is centralized
      // here so stage targets stay easy to tune while the rendered notes come
      // from the live workflow state below.
      const OVERVIEW_CLOSE_PROBABILITY_PREDICTIONS = Object.freeze({
        default: Object.freeze({
          current: 49,
          projected: 72,
          qualifier: "If Primary Advisor Action Completed"
        }),
        "modeling-inputs": Object.freeze({
          current: 49,
          projected: 72,
          qualifier: "If Primary Advisor Action Completed"
        }),
        "needs-analysis": Object.freeze({
          current: 58,
          projected: 76,
          qualifier: "If Needs Analysis Completed"
        }),
        recommendation: Object.freeze({
          current: 67,
          projected: 83,
          qualifier: "If Recommendation Finalized"
        }),
        underwriting: Object.freeze({
          current: 74,
          projected: 88,
          qualifier: "If Underwriting Started"
        }),
        placement: Object.freeze({
          current: 82,
          projected: 94,
          qualifier: "If Placement Secured"
        })
      });
      const CLIENT_PROFILE_ANALYSIS_CHILD_KEYS = ["modeling-inputs", "needs-analysis", "recommendation"];

      function renderClientProfileSideTabs() {
        return "";
      }

      function getClientWorkspaceSidebarTitle(profileRecord) {
        const preferredFullName = [
          String(profileRecord?.preferredName || profileRecord?.firstName || "").trim(),
          String(profileRecord?.lastName || "").trim()
        ].filter(Boolean).join(" ").trim();
        const displayName = String(profileRecord?.displayName || "").trim();
        return displayName || preferredFullName || "Client Workspace";
      }

      function renderClientProfileSidebar(record, subtitleParts) {
        const clientName = getClientWorkspaceSidebarTitle(record);
        const isHouseholdAvatar = record?.viewType === "households";
        const avatarPresentation = isHouseholdAvatar ? null : getAvatarPresentation(record?.age, record?.dateOfBirth);
        const avatarStyle = isHouseholdAvatar
          ? ""
          : ` style="background:${escapeHtml(avatarPresentation?.background || "")};color:${escapeHtml(avatarPresentation?.color || "")};box-shadow:${escapeHtml(avatarPresentation?.boxShadow || "")};"`;
        const householdAssignment = formatValue(record.householdName);
        const householdAssignmentValue = householdAssignment === "Not provided"
          ? "No household linked"
          : householdAssignment;
        const currentDependentCount = getCurrentDependentCount(record);
        const dependentsValue = `${currentDependentCount} dependent${currentDependentCount === 1 ? "" : "s"}`;
        return `
          <section class="client-detail-card client-detail-card-compact client-profile-sidebar-card">
            <div class="client-profile-avatar-wrap">
              <span class="client-avatar client-profile-sidebar-avatar${isHouseholdAvatar ? " client-avatar-household" : ""}" aria-hidden="true"${avatarStyle}>${escapeHtml(getInitials(clientName, record?.viewType, record?.lastName))}</span>
            </div>
            <div class="client-profile-sidebar-copy">
              <span class="client-profile-sidebar-overline">Client Details</span>
              <strong class="client-profile-sidebar-name">${escapeHtml(clientName)}</strong>
              <p>${escapeHtml([
                formatValue(record.age),
                formatValue(record.insuranceRatingSex),
                formatValue(record.city),
                formatValue(record.state)
              ].filter(function (value) { return value !== "Not provided"; }).join(" | ") || subtitleParts.join(" | "))}</p>
            </div>
            <div class="client-profile-contact-list">
              <div class="client-profile-contact-item">
                <span class="client-profile-contact-label"><span class="client-profile-contact-icon" aria-hidden="true"><svg viewBox="0 0 16 16" fill="none"><path d="M5.1 2.9 3.9 4.1a1.25 1.25 0 0 0-.29 1.4c.63 1.42 1.57 2.76 2.82 4.01 1.25 1.25 2.59 2.19 4.01 2.82a1.25 1.25 0 0 0 1.4-.29l1.2-1.2a.88.88 0 0 0-.08-1.31L11.6 8.47a.9.9 0 0 0-1.02-.08l-.7.42a.6.6 0 0 1-.63.03 7.2 7.2 0 0 1-1.38-1.12 7.2 7.2 0 0 1-1.12-1.38.6.6 0 0 1 .03-.63l.42-.7a.9.9 0 0 0-.08-1.02L6.35 2.97a.88.88 0 0 0-1.25-.07Z" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/></svg></span></span>
                <div class="client-profile-contact-copy">
                  <span class="client-profile-contact-key">Phone</span>
                  <strong>${escapeHtml(formatValue(record.phoneNumber))}</strong>
                </div>
              </div>
              <div class="client-profile-contact-item">
                <span class="client-profile-contact-label"><span class="client-profile-contact-icon" aria-hidden="true"><svg viewBox="0 0 16 16" fill="none"><rect x="2.4" y="3.4" width="11.2" height="9.2" rx="1.7" stroke="currentColor" stroke-width="1.2"/><path d="M3.4 4.8 8 8.1l4.6-3.3" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/></svg></span></span>
                <div class="client-profile-contact-copy">
                  <span class="client-profile-contact-key">Email</span>
                  <strong>${escapeHtml(formatValue(record.emailAddress))}</strong>
                </div>
              </div>
              <div class="client-profile-contact-item">
                <span class="client-profile-contact-label"><span class="client-profile-contact-icon" aria-hidden="true"><svg viewBox="0 0 16 16" fill="none"><circle cx="8" cy="5.2" r="2.15" stroke="currentColor" stroke-width="1.2"/><path d="M4.15 12.45a3.85 3.85 0 0 1 7.7 0" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg></span></span>
                <div class="client-profile-contact-copy">
                  <span class="client-profile-contact-key">Advisor</span>
                  <strong>${escapeHtml(formatValue(record.advisorName))}</strong>
                </div>
              </div>
              <div class="client-profile-contact-item">
                <span class="client-profile-contact-label"><span class="client-profile-contact-icon" aria-hidden="true"><svg viewBox="0 0 16 16" fill="none"><path d="M6.15 2.55 5 13.45M10.95 2.55 9.8 13.45M2.95 6.15h10.1M2.2 9.85H12.3" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg></span></span>
                <div class="client-profile-contact-copy">
                  <span class="client-profile-contact-key">Case Ref</span>
                  <div class="client-profile-contact-value-shell">
                    <strong>${escapeHtml(formatValue(record.caseRef))}</strong>
                    <button class="client-profile-copy-button" type="button" data-case-ref-copy="${escapeHtml(formatValue(record.caseRef))}" aria-label="Copy case ref">
                      <span class="client-profile-copy-icon" aria-hidden="true"></span>
                    </button>
                  </div>
                </div>
              </div>
              <div class="client-profile-contact-item client-profile-contact-item--assignment">
                <span class="client-profile-contact-label"><span class="client-profile-contact-icon" aria-hidden="true"><svg viewBox="0 0 16 16" fill="none"><path d="M8 2.4 2.9 5.25V13.1h10.2V5.25L8 2.4Z" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/><path d="M6.2 13.1V9.2h3.6v3.9" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/></svg></span></span>
                <div class="client-profile-contact-copy">
                  <span class="client-profile-contact-key">Household Assignment</span>
                  <strong>${escapeHtml(householdAssignmentValue)}</strong>
                </div>
              </div>
              <div class="client-profile-contact-item">
                <span class="client-profile-contact-label"><span class="client-profile-contact-icon" aria-hidden="true"><svg viewBox="0 0 16 16" fill="none"><path d="M8 12.6 3.4 8.45a2.55 2.55 0 0 1 3.56-3.66L8 5.8l1.04-1.01a2.55 2.55 0 1 1 3.56 3.66L8 12.6Z" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/></svg></span></span>
                <div class="client-profile-contact-copy">
                  <span class="client-profile-contact-key">Marital Status</span>
                  <strong>${escapeHtml(formatValue(record.maritalStatus))}</strong>
                </div>
              </div>
              <div class="client-profile-contact-item">
                <span class="client-profile-contact-label"><span class="client-profile-contact-icon" aria-hidden="true"><svg viewBox="0 0 16 16" fill="none"><circle cx="5.3" cy="5.45" r="1.65" stroke="currentColor" stroke-width="1.2"/><circle cx="10.9" cy="6.1" r="1.45" stroke="currentColor" stroke-width="1.2"/><path d="M2.95 12.35a2.85 2.85 0 0 1 4.7-2.15" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/><path d="M8.55 12.35a2.4 2.4 0 0 1 3.95-1.82" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg></span></span>
                <div class="client-profile-contact-copy">
                  <span class="client-profile-contact-key">Dependents</span>
                  <strong>${escapeHtml(dependentsValue)}</strong>
                </div>
              </div>
            </div>
          </section>
        `;
      }

      function renderSection(sectionTitle, fields, options) {
        const sectionClassName = String(options?.className || "").trim();
        return `
          <section class="client-detail-card${sectionClassName ? ` ${escapeHtml(sectionClassName)}` : ""}">
            <div class="client-detail-card-header">
              <h2>${escapeHtml(sectionTitle)}</h2>
            </div>
            <div class="client-detail-grid">
              ${fields.map(function (field) {
                return `
                  <div class="client-detail-field">
                    <span class="client-detail-label">${escapeHtml(field.label)}</span>
                    <span class="client-detail-value">${escapeHtml(field.value)}</span>
                  </div>
                `;
              }).join("")}
            </div>
          </section>
        `;
      }

      function renderSummaryCard(title, items) {
        return `
          <section class="client-detail-card client-detail-card-compact">
            <div class="client-detail-card-header">
              <h2>${escapeHtml(title)}</h2>
            </div>
            <div class="client-summary-list">
              ${items.map(function (item) {
                return `
                  <div class="client-summary-item">
                    <span class="client-summary-label">${escapeHtml(item.label)}</span>
                    <span class="client-summary-value">${escapeHtml(item.value)}</span>
                  </div>
                `;
              }).join("")}
            </div>
          </section>
        `;
      }

      function renderSplitSummaryCard(title, leftItems, rightItems, options) {
        const cardClassName = String(options?.cardClassName || "").trim();
        const footerAction = String(options?.footerAction || "").trim();
        const isCollapsible = Boolean(options?.collapsible);
        const defaultOpen = Boolean(options?.defaultOpen);
        const bodyMarkup = `
          <div class="client-summary-split">
            <div class="client-summary-list">
              ${leftItems.map(function (item) {
                return `
                  <div class="client-summary-item">
                    <span class="client-summary-label">${escapeHtml(item.label)}</span>
                    <span class="client-summary-value">${escapeHtml(item.value)}</span>
                  </div>
                `;
              }).join("")}
            </div>
            <div class="client-summary-list client-summary-list-secondary">
              ${rightItems.map(function (item) {
                return `
                  <div class="client-summary-item">
                    <span class="client-summary-label">${escapeHtml(item.label)}</span>
                    <span class="client-summary-value">${escapeHtml(item.value)}</span>
                  </div>
                `;
              }).join("")}
            </div>
          </div>
          ${footerAction ? `<div class="client-summary-footer">${footerAction}</div>` : ""}
        `;
        return `
          <section class="client-detail-card client-detail-card-compact client-detail-card-split${cardClassName ? ` ${escapeHtml(cardClassName)}` : ""}">
            ${isCollapsible ? `
              <details class="client-summary-details"${defaultOpen ? " open" : ""}>
                <summary class="client-detail-card-header client-summary-toggle">
                  <h2>${escapeHtml(title)}</h2>
                  <span class="client-summary-toggle-icon" aria-hidden="true"></span>
                </summary>
                <div class="client-summary-details-body">
                  ${bodyMarkup}
                </div>
              </details>
            ` : `
              <div class="client-detail-card-header">
                <h2>${escapeHtml(title)}</h2>
              </div>
              ${bodyMarkup}
            `}
          </section>
        `;
      }

      function renderBlankCard() {
        return `
          <section class="client-detail-card client-detail-card-compact client-detail-card-blank" aria-hidden="true"></section>
        `;
      }

      function renderCoverageBreakdownCard(record) {
        const policies = Array.isArray(record.coveragePolicies) ? record.coveragePolicies : [];
        const totalFaceAmount = summarizeCoveragePoliciesForProfile(policies).totalCoverage;
        const totalPremium = policies.reduce(function (sum, policy) {
          return sum + parseCurrencyNumber(policy.premiumAmount);
        }, 0);
        const latestEffectiveDate = policies.reduce(function (latest, policy) {
          const value = new Date(policy.effectiveDate || "").getTime();
          return Number.isFinite(value) && value > latest ? value : latest;
        }, 0);
        const typeCounts = new Map();
        const modeCounts = new Map();

        policies.forEach(function (policy) {
          const policyType = formatValue(policy.policyType);
          const premiumMode = formatValue(policy.premiumMode);

          if (policyType !== "Not provided") {
            typeCounts.set(policyType, (typeCounts.get(policyType) || 0) + 1);
          }

          if (premiumMode !== "Not provided") {
            modeCounts.set(premiumMode, (modeCounts.get(premiumMode) || 0) + 1);
          }
        });

        const typeSummary = Array.from(typeCounts.entries())
          .sort(function (a, b) { return b[1] - a[1]; })
          .slice(0, 3)
          .map(function (entry) { return `${entry[0]} ${entry[1]}`; })
          .join(" | ") || "Not provided";

        const modeSummary = Array.from(modeCounts.entries())
          .sort(function (a, b) { return b[1] - a[1]; })
          .slice(0, 3)
          .map(function (entry) { return `${entry[0]} ${entry[1]}`; })
          .join(" | ") || "Not provided";

        const sortedModeEntries = Array.from(modeCounts.entries()).sort(function (a, b) {
          return b[1] - a[1];
        });
        const featuredPolicyIndex = policies.length ? policies.length - 1 : -1;
        const featuredPolicy = featuredPolicyIndex >= 0 ? policies[featuredPolicyIndex] : null;
        const featuredSummary = featuredPolicy
          ? createCoveragePolicyDisplaySummary(featuredPolicy, { fallbackTitle: `Policy ${featuredPolicyIndex + 1}` })
          : null;
        const featuredCarrier = featuredSummary ? featuredSummary.title : formatValue(featuredPolicy?.policyCarrier);
        const featuredType = featuredSummary ? featuredSummary.classificationLabel : formatValue(featuredPolicy?.policyType);
        const featuredPolicyNumber = featuredPolicy ? formatValue(featuredPolicy.policyNumber || `#${featuredPolicyIndex + 1}`) : "Not provided";
        const featuredMetaParts = [];
        const latestEffectiveDateDisplay = latestEffectiveDate
          ? formatDate(new Date(latestEffectiveDate).toISOString().slice(0, 10))
          : "Not provided";
        const primaryModeLabel = sortedModeEntries.length ? sortedModeEntries[0][0] : "";
        const summaryTitle = policies.length ? "Coverage mix on file" : "Coverage summary incomplete";
        const summaryCopy = policies.length
          ? (latestEffectiveDateDisplay !== "Not provided"
              ? `Latest effective ${latestEffectiveDateDisplay}`
              : (primaryModeLabel ? `${primaryModeLabel} mode on file` : "Coverage details saved to this record."))
          : "Add the first placed policy to populate this summary.";
        const canAddPolicy = policies.length < 30;
        const canViewAll = policies.length > 0;

        if (featuredType !== "Not provided") {
          featuredMetaParts.push(featuredType);
        }

        if (featuredPolicyNumber !== "Not provided") {
          featuredMetaParts.push(`Policy ${featuredPolicyNumber}`);
        }

        const featuredMeta = featuredMetaParts.join(" · ") || "Saved coverage record";
        const coverageChips = [
          policies.length ? `${policies.length} ${policies.length === 1 ? "policy" : "policies"} placed` : "",
          primaryModeLabel ? `${primaryModeLabel} mode` : "",
          latestEffectiveDateDisplay !== "Not provided" ? `Eff. ${latestEffectiveDateDisplay}` : ""
        ].filter(Boolean);

        return `
          <section class="client-detail-card client-detail-card-compact client-coverage-breakdown-card" data-coverage-breakdown-card>
            <div class="client-coverage-breakdown-shell">
              <div class="client-detail-card-header client-coverage-breakdown-header">
                <h2>Coverage Breakdown Summary</h2>
                <button
                  class="client-coverage-breakdown-add${canAddPolicy ? "" : " is-disabled"}"
                  type="button"
                  data-coverage-add-open
                  ${canAddPolicy ? "" : "disabled"}
                >${escapeHtml(canAddPolicy ? "+ Add Policy" : "Policy Limit Reached")}</button>
              </div>
              <div class="client-coverage-breakdown-metrics">
                <div class="client-coverage-breakdown-metric">
                  <span class="client-coverage-breakdown-metric-label">Total Face Amount</span>
                  <strong class="client-coverage-breakdown-metric-value">${escapeHtml(formatCompactCurrencyTotal(totalFaceAmount))}</strong>
                  <span class="client-coverage-breakdown-metric-meta">${escapeHtml(policies.length ? `${policies.length} ${policies.length === 1 ? "policy" : "policies"} in force` : "No policies in force")}</span>
                </div>
                <div class="client-coverage-breakdown-metric">
                  <span class="client-coverage-breakdown-metric-label">Total Premium</span>
                  <strong class="client-coverage-breakdown-metric-value">${escapeHtml(formatCurrencyTotal(totalPremium))}</strong>
                  <span class="client-coverage-breakdown-metric-meta">${escapeHtml(primaryModeLabel ? `${primaryModeLabel} mode` : "Premium mode pending")}</span>
                </div>
              </div>
              <div class="client-coverage-breakdown-content">
                <div class="client-coverage-breakdown-section-heading">Policies Placed</div>
                ${featuredPolicy ? `
                  <button
                    class="client-coverage-breakdown-feature"
                    type="button"
                    data-coverage-policy-card
                    data-policy-index="${featuredPolicyIndex}"
                    aria-label="Open ${escapeHtml(featuredCarrier)} policy details"
                  >
                    <div class="client-coverage-breakdown-feature-copy">
                      <div class="client-coverage-breakdown-feature-title">
                        <span class="client-coverage-breakdown-feature-dot" aria-hidden="true"></span>
                        <strong>${escapeHtml(featuredCarrier)}</strong>
                      </div>
                      <span>${escapeHtml(featuredMeta)}</span>
                    </div>
                    <span class="client-coverage-breakdown-feature-value">${escapeHtml(featuredSummary?.deathBenefitLabel || formatCurrency(getPolicyDeathBenefitAmount(featuredPolicy)))}</span>
                  </button>
                ` : `
                  <div class="client-coverage-breakdown-empty">
                    No placed policies saved to this profile yet.
                  </div>
                `}
                ${coverageChips.length ? `
                  <div class="client-coverage-breakdown-chip-row">
                    ${coverageChips.map(function (chip) {
                      return `<span class="client-coverage-breakdown-chip">${escapeHtml(chip)}</span>`;
                    }).join("")}
                  </div>
                ` : ""}
                <div class="client-coverage-breakdown-status${policies.length ? "" : " is-empty"}">
                  <span class="client-coverage-breakdown-status-icon" aria-hidden="true"></span>
                  <div class="client-coverage-breakdown-status-copy">
                    <strong>${escapeHtml(summaryTitle)}</strong>
                    <span>${escapeHtml(summaryCopy)}</span>
                  </div>
                </div>
              </div>
            </div>
            <button
              class="client-coverage-breakdown-view-all${canViewAll ? " is-active" : ""}"
              type="button"
              data-view-all-policies
              ${canViewAll ? "" : "disabled"}
            >View all coverage <span aria-hidden="true">?</span></button>
          </section>
        `;
      }

      function formatListValue(value) {
        if (Array.isArray(value)) {
          const normalized = value.map(function (item) {
            return String(item || "").trim();
          }).filter(Boolean);
          return normalized.length ? normalized.join(", ") : "Not provided";
        }

        return formatValue(value);
      }

      function getPlanningStatus(record) {
        const hasPreliminary = Boolean(record.preliminaryUnderwritingCompleted);
        const hasPmi = Boolean(record.pmiCompleted);
        const hasAnalysis = Boolean(record.analysisCompleted) || record.statusGroup === "coverage-placed" || record.statusGroup === "closed";

        if (hasAnalysis) {
          return "Analysis Complete";
        }

        if (hasPreliminary && hasPmi) {
          return "Ready for Analysis";
        }

        if (hasPreliminary || hasPmi) {
          return "Planning In Progress";
        }

        return "Planning Not Started";
      }

      function getPlanningNextStep(record) {
        if (!record.preliminaryUnderwritingCompleted) {
          return "Complete preliminary underwriting";
        }

        if (!record.pmiCompleted) {
          return "Finish protection modeling inputs";
        }

        if (!(Boolean(record.analysisCompleted) || record.statusGroup === "coverage-placed" || record.statusGroup === "closed")) {
          return "Complete analysis review";
        }

        return "Review placed coverage";
      }

      function getRiskSummary(record) {
        const data = record.preliminaryUnderwriting?.data || {};
        const bmi = Number(data.bodyMassIndex || 0);
        const conditions = Array.isArray(data.majorMedicalConditions)
          ? data.majorMedicalConditions.filter(Boolean)
          : (String(data.majorMedicalConditions || "").trim() ? [String(data.majorMedicalConditions || "").trim()] : []);
        const nicotineStatus = String(data.nicotineUseStatus || "").trim().toLowerCase();

        if (!record.preliminaryUnderwritingCompleted) {
          return "Awaiting preliminary underwriting";
        }

        if (nicotineStatus.includes("current") || conditions.length >= 3 || bmi >= 35) {
          return "Elevated risk";
        }

        if (nicotineStatus.includes("former") || conditions.length >= 1 || bmi >= 30) {
          return "Moderate risk";
        }

        return "Lower apparent risk";
      }

      function getLatestProtectionModelingData(record) {
        const modelingEntries = Array.isArray(record.protectionModelingEntries) && record.protectionModelingEntries.length
          ? record.protectionModelingEntries
          : (record.protectionModeling ? [record.protectionModeling] : []);
        const latestModeling = modelingEntries[modelingEntries.length - 1] || {};
        return latestModeling.data || {};
      }

      function getProfileHealthRating(record) {
        const policies = Array.isArray(record.coveragePolicies) ? record.coveragePolicies : [];
        const latestRatedPolicy = policies.slice().reverse().find(function (policy) {
          return Boolean(String(policy?.underwritingClass || "").trim());
        });
        if (latestRatedPolicy) {
          return formatValue(latestRatedPolicy.underwritingClass);
        }
        return getRiskSummary(record);
      }

      function getProfileSmokerStatus(record) {
        if (!record.preliminaryUnderwritingCompleted) {
          return "Awaiting underwriting";
        }

        const nicotineStatus = String(record.preliminaryUnderwriting?.data?.nicotineUseStatus || "").trim();
        if (!nicotineStatus) {
          return "Not modeled";
        }

        const normalized = nicotineStatus.toLowerCase();
        if (normalized.includes("former")) {
          return "Former smoker";
        }
        if (normalized.includes("current")) {
          return "Current smoker";
        }
        if (normalized.includes("never") || normalized.includes("non") || normalized === "no") {
          return "Non-smoker";
        }
        return formatValue(nicotineStatus);
      }

      function getEstimatedAnnualPremiumCapacity(record) {
        const modelingData = getLatestProtectionModelingData(record);
        const annualIncome = parseCurrencyNumber(modelingData.annualIncome || modelingData.householdIncome || 0);
        if (!annualIncome) {
          return "Not modeled";
        }

        return formatCurrency(Math.round(annualIncome * 0.05));
      }

      function filterSnapshotItems(items) {
        return items.filter(function (item) {
          return String(item?.value || "").trim() !== "Not provided";
        });
      }

      const RESOURCE_CALENDAR_PREVIEW_EVENTS = [
        { date: "2026-04-13", time: "9:00 AM", title: "Protection Modeling Office Hours", type: "training", detail: "Walk through new modeling assumptions with the advisor team." },
        { date: "2026-04-14", time: "1:30 PM", title: "Case Review Block", type: "review", detail: "Review active coverage gap cases before client outreach." },
        { date: "2026-04-16", time: "10:00 AM", title: "Carrier Product Update", type: "training", detail: "New term conversion updates and underwriting notes." },
        { date: "2026-04-18", time: "All Day", title: "Quarterly Planning Deadline", type: "deadline", detail: "Finalize open planning workflows before the quarter close." },
        { date: "2026-04-21", time: "11:00 AM", title: "Client Review Prep", type: "review", detail: "Prepare analysis and placed-policy summary for upcoming reviews." },
        { date: "2026-04-22", time: "2:00 PM", title: "Advisor Calendar Sync", type: "team", detail: "Weekly internal scheduling and workload alignment." },
        { date: "2026-04-24", time: "8:30 AM", title: "Underwriting Roundtable", type: "training", detail: "Discuss recent underwriting outcomes and positioning notes." },
        { date: "2026-04-28", time: "3:00 PM", title: "Placement Follow-Up Window", type: "deadline", detail: "Confirm policy delivery updates and pending docs." },
        { date: "2026-05-05", time: "9:00 AM", title: "May Kickoff Planning Session", type: "team", detail: "Set review cadence and planning priorities for the new month." },
        { date: "2026-05-08", time: "12:30 PM", title: "Client Review Day", type: "review", detail: "Reserved day for policy review and adequacy conversations." }
      ];

      function formatResourceCalendarPreviewDateKey(date) {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, "0");
        const day = String(date.getDate()).padStart(2, "0");
        return `${year}-${month}-${day}`;
      }

      function getResourceCalendarPreviewUpcomingEvent(events, todayKey) {
        return events
          .slice()
          .sort(function (a, b) {
            return new Date(`${a.date}T12:00:00`).getTime() - new Date(`${b.date}T12:00:00`).getTime();
          })
          .find(function (event) {
            return event.date >= todayKey;
          }) || events[0] || null;
      }

      function renderResourceCalendarPreviewCard() {
        const today = new Date();
        const todayKey = formatResourceCalendarPreviewDateKey(today);
        const activeMonth = new Date(today.getFullYear(), today.getMonth(), 1);
        const monthLabel = new Intl.DateTimeFormat("en-US", {
          month: "long",
          year: "numeric"
        }).format(activeMonth);
        const calendarStart = new Date(activeMonth);
        calendarStart.setDate(calendarStart.getDate() - calendarStart.getDay());
        const upcomingEvent = getResourceCalendarPreviewUpcomingEvent(RESOURCE_CALENDAR_PREVIEW_EVENTS, todayKey);

        return `
          <section class="client-detail-card client-detail-card-compact client-profile-calendar-card">
            <details class="client-summary-details client-profile-calendar-details">
              <summary class="client-detail-card-header client-summary-toggle client-profile-calendar-summary">
                <h2>Calendar Preview</h2>
                <span class="client-summary-toggle-icon" aria-hidden="true"></span>
              </summary>
              <div class="client-summary-details-body client-profile-calendar-details-body">
                <div class="client-profile-calendar-month-bar">
                  <span class="client-profile-calendar-kicker">Resources</span>
                  <div class="client-profile-calendar-month-actions">
                    <strong>${escapeHtml(monthLabel)}</strong>
                  </div>
                </div>
                <div class="client-profile-calendar-weekdays" aria-hidden="true">
                  <span>Su</span>
                  <span>Mo</span>
                  <span>Tu</span>
                  <span>We</span>
                  <span>Th</span>
                  <span>Fr</span>
                  <span>Sa</span>
                </div>
                <div class="client-profile-calendar-grid">
                  ${Array.from({ length: 42 }, function (_, index) {
                    const date = new Date(calendarStart);
                    date.setDate(calendarStart.getDate() + index);
                    const dateKey = formatResourceCalendarPreviewDateKey(date);
                    const dayEvents = RESOURCE_CALENDAR_PREVIEW_EVENTS.filter(function (event) {
                      return event.date === dateKey;
                    });
                    const isToday = dateKey === todayKey;
                    const isOutsideMonth = date.getMonth() !== activeMonth.getMonth();

                    return `
                      <div class="client-profile-calendar-day${isOutsideMonth ? " is-outside-month" : ""}${isToday ? " is-today" : ""}${dayEvents.length ? " has-events" : ""}">
                        <span class="client-profile-calendar-day-number">${date.getDate()}</span>
                        <span class="client-profile-calendar-day-dots">
                          ${dayEvents.slice(0, 3).map(function (event) {
                            return `<span class="client-profile-calendar-dot is-${escapeHtml(event.type)}"></span>`;
                          }).join("")}
                        </span>
                      </div>
                    `;
                  }).join("")}
                </div>
                <div class="client-profile-calendar-preview-footer">
                  ${upcomingEvent ? `
                    <div class="client-profile-calendar-preview-event">
                      <span class="client-profile-calendar-preview-label">Next resource event</span>
                      <strong>${escapeHtml(upcomingEvent.title)}</strong>
                      <span>${escapeHtml(`${new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(new Date(`${upcomingEvent.date}T12:00:00`))} · ${upcomingEvent.time}`)}</span>
                    </div>
                  ` : `
                    <div class="client-profile-calendar-preview-event is-empty">
                      <span class="client-profile-calendar-preview-label">Next resource event</span>
                      <strong>No events scheduled</strong>
                      <span>No shared calendar events are scheduled.</span>
                    </div>
                  `}
                </div>
              </div>
            </details>
          </section>
        `;
      }

      function renderPlanningCard(title, items, className, options) {
        const sectionTargets = String(options?.sectionTargets || "").trim();
        return `
          <section class="client-detail-card client-detail-card-compact client-planning-card${className ? ` ${className}` : ""}"${sectionTargets ? ` data-client-nav-section="${escapeHtml(sectionTargets)}"` : ""}>
            <div class="client-detail-card-header">
              <h2>${escapeHtml(title)}</h2>
            </div>
            <div class="client-summary-list">
              ${items.map(function (item) {
                return `
                  <div class="client-summary-item">
                    <span class="client-summary-label">${escapeHtml(item.label)}</span>
                    <span class="client-summary-value">${escapeHtml(item.value)}</span>
                  </div>
                `;
              }).join("")}
            </div>
          </section>
        `;
      }

      function renderAnalysisPreviewCard(record) {
        const planningStatus = getPlanningStatus(record);
        const nextStep = getPlanningNextStep(record);
        const coverageFields = synchronizeRecordCoverageFields(record);
        const latestPlanningDate = formatDate(
          record.analysisCompletedDate
          || record.protectionModeling?.savedAt
          || record.preliminaryUnderwriting?.savedAt
          || record.lastUpdatedDate
          || record.dateProfileCreated
        );

        return renderPlanningCard("Analysis Preview", [
          { label: "Planning Status", value: planningStatus },
          { label: "Coverage Adequacy", value: `${getCoverageAdequacy(record)}%` },
          { label: "Current Coverage", value: formatCoverageCardCurrency(coverageFields.currentCoverage) },
          { label: "Modeled Need", value: formatCoverageCardCurrency(coverageFields.modeledNeed) },
          { label: "Last Planning Update", value: latestPlanningDate },
          { label: "Next Planning Move", value: nextStep }
        ], "client-planning-card-wide", { sectionTargets: "needs-analysis" });
      }

      function renderOverviewSummaryCard(record) {
        const coverageFields = synchronizeRecordCoverageFields(record);
        const closeIndex = window.LipOpportunityScore && typeof window.LipOpportunityScore.calculate === "function"
          ? window.LipOpportunityScore.calculate(record, { now: new Date() })
          : null;
        const workflowState = getClientWorkflowProgressState(record);
        const closeProbabilityPrediction = getOverviewCloseProbabilityPrediction(workflowState, closeIndex);

        return `
          <section class="client-detail-card client-detail-card-compact client-planning-card client-planning-card-wide client-overview-summary-card" data-client-nav-section="overview">
            <div class="client-overview-summary-tab">Overview</div>
            <div class="client-overview-summary-body">
              <div class="client-overview-glance">
                <div class="client-overview-glance-header">
                  <span class="client-overview-glance-title">
                    Coverage at a Glance
                    <span class="client-overview-glance-icon" aria-hidden="true">
                      <svg viewBox="0 0 16 16" fill="none">
                        <circle cx="8" cy="8" r="6.25" stroke="currentColor" stroke-width="1.1"/>
                        <path d="M8 6.6v3.65" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/>
                        <circle cx="8" cy="4.55" r=".7" fill="currentColor"/>
                      </svg>
                    </span>
                  </span>
                  <span class="client-overview-glance-why">
                    <span class="client-overview-glance-icon" aria-hidden="true">
                      <svg viewBox="0 0 16 16" fill="none">
                        <circle cx="8" cy="8" r="6.25" stroke="currentColor" stroke-width="1.1"/>
                        <path d="M8 6.6v3.65" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/>
                        <circle cx="8" cy="4.55" r=".7" fill="currentColor"/>
                      </svg>
                    </span>
                    Why this matters
                  </span>
                </div>
                <div class="client-profile-stats client-profile-stats--overview-glance">
                  ${renderStatCard("Current Coverage", formatCoverageCardCurrency(coverageFields.currentCoverage), "", {
                    editable: true,
                    fieldName: "currentCoverage",
                    rawValue: String(coverageFields.currentCoverage || "0")
                  })}
                  ${renderStatCard("Modeled Need", formatCoverageCardCurrency(coverageFields.modeledNeed), "", {
                    editable: true,
                    fieldName: "modeledNeed",
                    rawValue: String(coverageFields.modeledNeed || "0")
                  })}
                  ${renderStatCard("Coverage Gap", formatCoverageCardCurrency(coverageFields.uncoveredGap), "", {
                    fieldName: "coverageGap",
                    rawValue: String(coverageFields.uncoveredGap || "0"),
                    displayStateClass: coverageFields.uncoveredGap > 0 ? "has-gap" : "is-zero"
                  })}
                </div>
              </div>
              <div class="client-overview-close-index-hero">
                <div class="client-overview-close-index-panel">
                  ${renderCloseIndexGauge(closeIndex)}
                </div>
                ${renderOverviewCloseProbabilityPrediction(closeProbabilityPrediction)}
              </div>
              <section class="client-overview-commission-section" aria-label="Expected Commission">
                <span class="client-overview-commission-title">Expected Commission</span>
              </section>
            </div>
          </section>
        `;
      }

      function renderStatusControlPanel(record) {
        const workflowState = getClientWorkflowProgressState(record);
        const lifecycleStatus = getClientStatusDisplay(record);
        const planningStatus = getPlanningStatus(record);
        const priorityLever = getPriorityDisplay(normalizePriority(record.priority));
        const currentStep = workflowState.currentStep ? workflowState.currentStep.label : "Placement";
        const stepDetail = workflowState.currentStep
          ? String(workflowState.currentStep.detail || "").trim()
          : "All workflow milestones completed";
        const progressLabel = `${workflowState.completedCount} of ${workflowState.steps.length} complete`;

        return `
          <section class="client-detail-card client-detail-card-compact client-detail-card-tabbed client-status-control-card" data-status-control-panel>
            <div class="client-detail-card-tab">Status Control Panel</div>
            <div class="client-detail-card-header">
              <h2 class="sr-only">Status Control Panel</h2>
            </div>
            <div class="client-status-control-grid">
              <div class="client-status-control-item">
                <span class="client-summary-label">Client Status</span>
                <span class="client-summary-value">${escapeHtml(lifecycleStatus)}</span>
              </div>
              <div class="client-status-control-item">
                <span class="client-summary-label">Planning Status</span>
                <span class="client-summary-value">${escapeHtml(planningStatus)}</span>
              </div>
              <div class="client-status-control-item">
                <span class="client-summary-label">Current Step</span>
                <span class="client-summary-value">${escapeHtml(currentStep)}</span>
              </div>
              <div class="client-status-control-item">
                <span class="client-summary-label">Priority Lever</span>
                <span class="client-summary-value">${escapeHtml(priorityLever)}</span>
              </div>
            </div>
            <div class="client-status-control-detail">
              <span class="client-summary-label">Workflow Detail</span>
              <span class="client-summary-value">${escapeHtml(stepDetail)}</span>
            </div>
            <div class="client-status-control-progress">
              <span class="client-summary-label">Progress</span>
              <span class="client-summary-value">${escapeHtml(progressLabel)}</span>
            </div>
          </section>
        `;
      }

      function renderPmiEntryCard(record) {
        const modelingEntries = Array.isArray(record.protectionModelingEntries) && record.protectionModelingEntries.length
          ? record.protectionModelingEntries
          : (record.protectionModeling ? [record.protectionModeling] : []);
        const latestModeling = modelingEntries[modelingEntries.length - 1] || {};
        const modelingData = latestModeling.data || {};
        return `
            <section class="client-detail-card client-detail-card-compact client-planning-card client-planning-card-pmi" data-client-nav-section="modeling-inputs financials">
              <div class="client-detail-card-header">
                <h2>Protection Modeling Inputs</h2>
              </div>
            <div class="client-summary-list">
              ${[
                { label: "Status", value: record.pmiCompleted ? "Completed" : "Not started" },
                { label: "Forms Saved", value: String(modelingEntries.length || 0) },
                { label: "Latest Saved At", value: record.pmiCompleted ? formatDate(latestModeling.savedAt) : "Not provided" },
                { label: "Linked Case Ref", value: formatValue(latestModeling.linkedCaseRef || record.caseRef) },
                { label: "Latest Entry Variant", value: formatValue(latestModeling.variant) },
                { label: "Current Coverage", value: formatCurrency(modelingData.currentCoverageAmount || modelingData.currentLifeInsuranceCoverage || 0) },
                { label: "Income Input", value: formatCurrency(modelingData.annualIncome || modelingData.householdIncome || 0) }
              ].map(function (item) {
                return `
                  <div class="client-summary-item">
                    <span class="client-summary-label">${escapeHtml(item.label)}</span>
                    <span class="client-summary-value">${escapeHtml(item.value)}</span>
                  </div>
                `;
              }).join("")}
            </div>
            <button class="client-planning-view-all" type="button" data-pmi-detail-open>
              <span>View All</span>
              <span class="client-planning-view-all-icon" aria-hidden="true"></span>
            </button>
          </section>
        `;
      }

      function formatPlanningDetailValue(value) {
        if (Array.isArray(value)) {
          const normalized = value.map(function (item) {
            return String(item || "").trim();
          }).filter(Boolean);
          return normalized.length ? normalized.join(", ") : "Not provided";
        }

        if (value === null || value === undefined || value === "") {
          return "Not provided";
        }

        return String(value).trim() || "Not provided";
      }

      function humanizePlanningKey(key) {
        return String(key || "")
          .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
          .replace(/[_-]+/g, " ")
          .replace(/\s+/g, " ")
          .trim()
          .replace(/\b\w/g, function (letter) { return letter.toUpperCase(); });
      }

      function renderPmiDetailModalBody(record) {
        const modelingEntries = Array.isArray(record.protectionModelingEntries) && record.protectionModelingEntries.length
          ? record.protectionModelingEntries
          : (record.protectionModeling ? [record.protectionModeling] : []);

        if (!modelingEntries.length) {
          return `
            <div class="client-policy-modal-grid">
              <div class="client-policy-modal-field">
                <span class="client-policy-modal-label">Status</span>
                <span class="client-policy-modal-value">Not started</span>
              </div>
            </div>
          `;
        }

        return modelingEntries.map(function (modeling, index) {
          const modelingData = modeling.data || {};
          const detailFields = [
            ["Form", String(index + 1)],
            ["Saved At", formatDate(modeling.savedAt)],
            ["Linked Case Ref", formatValue(modeling.linkedCaseRef || record.caseRef)],
            ["Entry Variant", formatValue(modeling.variant)],
            ["Page", formatValue(modeling.page)]
          ];

          Object.entries(modelingData).forEach(function (entry) {
            detailFields.push([humanizePlanningKey(entry[0]), formatPlanningDetailValue(entry[1])]);
          });

          return `
            <div class="client-policy-modal-grid">
              ${detailFields.map(function (field) {
                return `
                  <div class="client-policy-modal-field">
                    <span class="client-policy-modal-label">${escapeHtml(field[0])}</span>
                    <span class="client-policy-modal-value">${escapeHtml(field[1])}</span>
                  </div>
                `;
              }).join("")}
            </div>
          `;
        }).join('<div class="client-policy-modal-divider"></div>');
      }

      function getClientWorkflowProgressState(record) {
        const coverageFields = synchronizeRecordCoverageFields(record);
        const policies = Array.isArray(record?.coveragePolicies) ? record.coveragePolicies : [];
        const activityEntries = Array.isArray(record?.activityLog) ? record.activityLog : [];
        const statusGroup = String(record?.statusGroup || "").trim().toLowerCase();
        const deliveredIndex = getLatestActivityIndexByType(activityEntries, "policy-delivered");
        const hasProfileCreated = Boolean(String(record?.id || "").trim());
        const hasPlacementComplete = policies.length > 0
          || deliveredIndex !== -1
          || statusGroup === "coverage-placed"
          || statusGroup === "closed";
        const hasRecommendationReady = Boolean(record?.analysisCompleted)
          || statusGroup === "in-review"
          || statusGroup === "coverage-placed"
          || statusGroup === "closed"
          || hasPlacementComplete;
        const hasNeedsAnalysis = coverageFields.modeledNeed > 0
          || Boolean(record?.analysisCompleted)
          || hasRecommendationReady;
        const hasUnderwritingReady = Boolean(record?.preliminaryUnderwritingCompleted)
          || statusGroup === "in-review"
          || statusGroup === "coverage-placed"
          || statusGroup === "closed"
          || hasPlacementComplete;
        const overviewDetail = hasProfileCreated
          ? `Saved ${formatDate(record?.dateProfileCreated || record?.lastUpdatedDate)}`
          : "Profile not started";
        const modelingDetail = record?.pmiCompleted
          ? `Saved ${formatDate(record?.protectionModeling?.savedAt)}`
          : "PMI inputs pending";
        const needsDetail = hasNeedsAnalysis
          ? (coverageFields.modeledNeed > 0
              ? `${formatCoverageCardCurrency(coverageFields.modeledNeed)} modeled need on file`
              : "Needs analysis saved")
          : "Modeled need not ready";
        const recommendationDetail = hasRecommendationReady
          ? `Updated ${formatDate(record?.analysisCompletedDate || record?.lastUpdatedDate)}`
          : "Recommendation not finalized";
        const underwritingDetail = hasUnderwritingReady
          ? (record?.preliminaryUnderwritingCompleted
              ? `Saved ${formatDate(record?.preliminaryUnderwriting?.savedAt)}`
              : (statusGroup === "in-review" ? "In underwriting review" : "Ready for underwriting"))
          : "Underwriting not started";
        const placementDetail = hasPlacementComplete
          ? (policies.length
              ? `${policies.length} ${policies.length === 1 ? "policy" : "policies"} placed`
              : "Placement recorded")
          : "No placed policy on file";

        const steps = CLIENT_PROFILE_WORKFLOW_SEQUENCE.map(function (step) {
          if (step.key === "overview") {
            return { ...step, complete: hasProfileCreated, detail: overviewDetail };
          }
          if (step.key === "modeling-inputs") {
            return { ...step, complete: Boolean(record?.pmiCompleted), detail: modelingDetail };
          }
          if (step.key === "needs-analysis") {
            return { ...step, complete: hasNeedsAnalysis, detail: needsDetail };
          }
          if (step.key === "recommendation") {
            return { ...step, complete: hasRecommendationReady, detail: recommendationDetail };
          }
          if (step.key === "underwriting") {
            return { ...step, complete: hasUnderwritingReady, detail: underwritingDetail };
          }
          if (step.key === "placement") {
            return { ...step, complete: hasPlacementComplete, detail: placementDetail };
          }
          return { ...step, complete: false, detail: "Pending" };
        });

        const currentStep = steps.find(function (step) {
          return !step.complete;
        }) || null;

        return {
          steps,
          currentStep,
          currentKey: currentStep ? currentStep.key : "",
          completedCount: steps.filter(function (step) { return step.complete; }).length
        };
      }

      function getChecklistAction(record, item) {
        if (!record || !item || item.complete) {
          return null;
        }

        const navKey = String(item.navKey || item.key || "").trim();
        if (navKey) {
          return {
            type: "nav",
            navKey,
            label: item.actionLabel || "Continue"
          };
        }

        return null;
      }

      function getClientWorkflowToolAction(record, item) {
        if (!record || !item) {
          return null;
        }

        const caseRef = String(record.caseRef || "").trim();
        const encodedCaseRef = encodeURIComponent(caseRef);
        const recordId = String(record.id || "").trim();
        const encodedRecordId = encodeURIComponent(recordId);
        const navKey = String(item.navKey || item.key || "").trim();

        if (!caseRef) {
          return null;
        }

        if (navKey === "modeling-inputs") {
          return {
            href: `protection-modeling-linked.html?caseRef=${encodedCaseRef}`,
            label: "Open Inputs"
          };
        }

        if (navKey === "needs-analysis" || navKey === "recommendation") {
          return {
            href: `analysis-estimate.html?caseRef=${encodedCaseRef}`,
            label: navKey === "recommendation" ? "Open Recommendation" : "Open Analysis"
          };
        }

        if (navKey === "underwriting") {
          return {
            href: `preliminary-linked.html?caseRef=${encodedCaseRef}&id=${encodedRecordId}`,
            label: "Open Underwriting"
          };
        }

        return null;
      }

      function getDashboardChecklistItems(record) {
        const workflowState = getClientWorkflowProgressState(record);
        return workflowState.steps.map(function (step) {
          return {
            key: step.key,
            navKey: step.key,
            label: step.label,
            complete: step.complete,
            detail: step.detail,
            actionLabel: step.key === "placement" ? "Review Step" : "Continue"
          };
        });
      }

      function getPrimaryActionButtonLabel(nextItem) {
        if (!nextItem) {
          return "";
        }

        if (nextItem.key === "modeling-inputs" || nextItem.key === "needs-analysis" || nextItem.key === "recommendation") {
          return "Continue Analysis";
        }

        if (nextItem.key === "underwriting") {
          return "Continue Underwriting";
        }

        if (nextItem.key === "placement") {
          return "Review Placement";
        }

        return "Continue";
      }

      function renderPrimaryActionPanel(record, checklistItems) {
        const items = Array.isArray(checklistItems) ? checklistItems : [];
        const nextItem = items.find(function (item) { return !item.complete; }) || null;
        const nextAction = nextItem ? getChecklistAction(record, nextItem) : null;
        const toolAction = nextItem ? getClientWorkflowToolAction(record, nextItem) : null;
        const coverageFields = synchronizeRecordCoverageFields(record);
        const coverageGap = coverageFields.uncoveredGap;
        const coverageAmount = coverageFields.currentCoverage;
        const adequacy = getCoverageAdequacy(record);
        const policies = Array.isArray(record?.coveragePolicies) ? record.coveragePolicies : [];
        const hasCoverageView = policies.length > 0 || coverageAmount > 0 || coverageFields.modeledNeed > 0;
        const nextStepDisplay = nextItem ? nextItem.label : "Protection Review";
        let headline = "";
        let problemText = "";

        if (coverageGap > 0) {
          headline = `${formatCompactCoverageCardCurrency(coverageGap)} uncovered protection need`;
          problemText = adequacy > 0
            ? `Current coverage only addresses ${adequacy}% of the modeled protection need.`
            : "No effective coverage is currently mapped against the modeled protection need.";
        } else if (!coverageAmount && nextItem) {
          headline = "Protection need not fully modeled";
          problemText = "The case still needs planning inputs before a reliable recommendation can be finalized.";
        } else if (!coverageAmount) {
          headline = "No placed coverage on file";
          problemText = "No active policies are currently recorded on this profile.";
        } else if (adequacy < 100) {
          headline = `${adequacy}% of modeled need covered`;
          problemText = "Placed coverage is on file, but the protection need is not fully covered yet.";
        } else {
          headline = "Coverage aligned with modeled need";
          problemText = "Placed coverage currently meets the modeled protection target based on saved planning inputs.";
        }

        return `
          <section class="client-primary-action-panel" data-primary-action-panel>
            <div class="client-primary-action-shell">
              <div class="client-primary-action-copy">
                <span class="client-primary-action-eyebrow">Primary Advisor Action</span>
                <h2>${escapeHtml(headline)}</h2>
                <p class="client-primary-action-problem">${escapeHtml(problemText)}</p>
                ${renderCoverageAdequacyBar(record, { className: "client-primary-action-coverage-adequacy", showIncomeGap: false, showGap: false })}
              </div>
              <div class="client-primary-action-recommendation">
                <span class="client-primary-action-recommendation-label">Next step</span>
                <strong>${escapeHtml(nextStepDisplay)}</strong>
                <div class="client-primary-action-actions">
                  ${nextAction && nextAction.type === "nav" ? `
                    <button
                      class="client-primary-action-button is-primary"
                      type="button"
                      data-client-workflow-nav="${escapeHtml(nextAction.navKey)}"
                    >${escapeHtml(getPrimaryActionButtonLabel(nextItem))}</button>
                  ` : hasCoverageView ? `
                    <button class="client-primary-action-button is-primary" type="button" data-scroll-to-coverage>View Coverage</button>
                  ` : `
                    <button class="client-primary-action-button is-primary" type="button" data-coverage-add-open>Add Policy</button>
                  `}
                  ${toolAction ? `
                    <a
                      class="client-primary-action-button is-secondary"
                      href="${escapeHtml(toolAction.href)}"
                      data-linked-case-ref="${escapeHtml(String(record?.caseRef || "").trim())}"
                      data-linked-record-id="${escapeHtml(String(record?.id || "").trim())}"
                    >${escapeHtml(toolAction.label)}</a>
                  ` : nextAction && nextAction.type === "nav" && hasCoverageView ? `
                    <button class="client-primary-action-button is-secondary" type="button" data-scroll-to-coverage>View Coverage</button>
                  ` : ""}
                </div>
              </div>
            </div>
          </section>
        `;
      }

      function renderRiskAnalysisCard(record) {
        const data = record.preliminaryUnderwriting?.data || {};
        const conditions = formatListValue(data.majorMedicalConditions);
        return renderPlanningCard("Risk Analysis", [
          { label: "Risk View", value: getRiskSummary(record) },
          { label: "Nicotine Use", value: formatValue(data.nicotineUseStatus) },
          { label: "Diabetes Status", value: formatValue(data.diabetesStatus) },
          { label: "Major Conditions", value: conditions },
          { label: "Occupation Risk", value: formatValue(data.occupationRiskLevel) },
          { label: "Travel Outside US", value: formatValue(data.plannedTravelOutsideUs) }
        ], "", { sectionTargets: "underwriting" });
      }

      function renderPreliminaryResultsCard(record) {
        const data = record.preliminaryUnderwriting?.data || {};
        const treatmentCategories = Array.isArray(data.treatmentCategories)
          ? data.treatmentCategories
          : (Array.isArray(data.selectedTreatmentCategories)
            ? data.selectedTreatmentCategories
            : String(data.treatmentCategories || data.selectedTreatmentCategoriesDisplay || data.selectedTreatmentCategories || "")
              .split("|")
              .map(function (item) { return String(item || "").trim(); })
              .filter(Boolean));
        return renderPlanningCard("Preliminary Results", [
          { label: "Status", value: record.preliminaryUnderwritingCompleted ? "Completed" : "Not started" },
          { label: "Saved At", value: record.preliminaryUnderwritingCompleted ? formatDate(record.preliminaryUnderwriting?.savedAt) : "Not provided" },
          { label: "Linked Case Ref", value: record.preliminaryUnderwritingCompleted ? formatValue(record.preliminaryUnderwriting?.linkedCaseRef || record.caseRef) : "Not provided" },
          { label: "Height", value: `${formatValue(data.heightFeet)} ft ${formatValue(data.heightInches)} in`.replace("Not provided ft Not provided in", "Not provided") },
          { label: "Weight", value: data.weight ? `${String(data.weight).trim()} lbs` : "Not provided" },
          { label: "BMI", value: formatValue(data.bodyMassIndex) },
          { label: "Treatment Categories", value: formatListValue(treatmentCategories) }
        ]);
      }

      function renderProfileWorkspaceSection(options) {
        const config = options && typeof options === "object" ? options : {};
        const sectionTargets = String(config.sectionTargets || "").trim();
        const sectionClassName = String(config.sectionClassName || "").trim();
        const bodyClassName = String(config.bodyClassName || "").trim();
        const eyebrow = String(config.eyebrow || "").trim();
        const title = String(config.title || "").trim();
        const description = String(config.description || "").trim();
        const hasHeaderCopy = Boolean(eyebrow || title || description);

        return `
          <section class="client-profile-workspace-section${sectionClassName ? ` ${escapeHtml(sectionClassName)}` : ""}"${sectionTargets ? ` data-client-nav-section="${escapeHtml(sectionTargets)}"` : ""}>
            ${hasHeaderCopy ? `
              <div class="client-profile-workspace-section-header">
                <div class="client-profile-workspace-section-copy">
                  ${eyebrow ? `<span class="client-profile-workspace-section-eyebrow">${escapeHtml(eyebrow)}</span>` : ""}
                  ${title ? `<h2>${escapeHtml(title)}</h2>` : ""}
                  ${description ? `<p>${escapeHtml(description)}</p>` : ""}
                </div>
              </div>
            ` : ""}
            <div class="client-profile-workspace-section-body${bodyClassName ? ` ${escapeHtml(bodyClassName)}` : ""}">
              ${String(config.body || "")}
            </div>
          </section>
        `;
      }

      function getRecommendationBasisLabel(record) {
        const modeledNeedSource = String(record?.modeledNeedSource || "").trim().toLowerCase();
        if (modeledNeedSource === "custom-amount") {
          return "Custom Amount";
        }

        const modelingPayload = getLatestProtectionModelingPayload(record);
        const modelingData = modelingPayload && modelingPayload.data && typeof modelingPayload.data === "object"
          ? modelingPayload.data
          : {};
        const rawMethod = String(
          modelingPayload?.method
          || modelingPayload?.variant
          || modelingData.recommendationMethod
          || modelingData.analysisMethod
          || modelingData.modelType
          || modelingData.coverageMethod
          || ""
        ).trim().toLowerCase();

        if (rawMethod.includes("lens")) {
          return "LENS Modeled";
        }
        if (rawMethod.includes("dime")) {
          return "DIME Modeled";
        }
        if (rawMethod.includes("hlv")) {
          return "HLV Modeled";
        }
        if (rawMethod.includes("need")) {
          return "Needs Modeled";
        }

        return modelingPayload ? "Protection Modeled" : "Not modeled";
      }

      function renderRecommendationSummaryCard(record) {
        const coverageFields = synchronizeRecordCoverageFields(record);
        const workflowState = getClientWorkflowProgressState(record);
        const nextStep = workflowState.currentStep ? workflowState.currentStep.label : "Placement";
        const recommendationStatus = record.analysisCompleted
          ? "Ready for advisor review"
          : coverageFields.modeledNeed > 0
            ? "Modeled amount available"
            : "Recommendation pending";

        return renderPlanningCard("Recommendation", [
          { label: "Status", value: recommendationStatus },
          { label: "Recommendation Basis", value: getRecommendationBasisLabel(record) },
          { label: "Modeled Need", value: formatCoverageCardCurrency(coverageFields.modeledNeed) },
          { label: "Current Coverage", value: formatCoverageCardCurrency(coverageFields.currentCoverage) },
          { label: "Uncovered Need", value: formatCoverageCardCurrency(coverageFields.uncoveredGap) },
          { label: "Next Workflow Step", value: nextStep }
        ], "", { sectionTargets: "recommendation" });
      }

      function getFinancialSnapshotSummary(record) {
        const modelingPayload = getLatestProtectionModelingPayload(record);
        const modelingData = modelingPayload && modelingPayload.data && typeof modelingPayload.data === "object"
          ? modelingPayload.data
          : {};
        const annualIncome = parseCurrencyNumber(modelingData.netAnnualIncome)
          || parseCurrencyNumber(modelingData.annualIncome)
          || parseCurrencyNumber(modelingData.householdIncome)
          || parseCurrencyNumber(modelingData.grossAnnualIncome);
        const spouseIncome = parseCurrencyNumber(modelingData.spouseIncome);
        const monthlySpending = parseCurrencyNumber(modelingData.currentTotalMonthlySpending)
          || parseCurrencyNumber(modelingData.monthlySpending)
          || parseCurrencyNumber(modelingData.householdMonthlySpending);
        const totalDebt = parseCurrencyNumber(modelingData.totalDebtBalance)
          || parseCurrencyNumber(modelingData.totalDebts)
          || (
            parseCurrencyNumber(modelingData.mortgageBalance)
            + parseCurrencyNumber(modelingData.consumerDebtBalance)
            + parseCurrencyNumber(modelingData.studentLoanBalance)
          );
        const survivorIncome = parseCurrencyNumber(modelingData.survivorNetAnnualIncome)
          || parseCurrencyNumber(modelingData.survivorIncome);

        return {
          annualIncome,
          spouseIncome,
          monthlySpending,
          totalDebt,
          survivorIncome,
          latestSavedAt: record.pmiCompleted ? formatDate(modelingPayload?.savedAt) : "Not provided"
        };
      }

      function renderFinancialSnapshotCard(record) {
        const financialSummary = getFinancialSnapshotSummary(record);

        return renderPlanningCard("Financial Snapshot", [
          { label: "Household Income", value: formatCoverageCardCurrency(financialSummary.annualIncome) },
          { label: "Spouse / Partner Income", value: formatCoverageCardCurrency(financialSummary.spouseIncome) },
          { label: "Monthly Spending", value: formatCoverageCardCurrency(financialSummary.monthlySpending) },
          { label: "Debt on File", value: formatCoverageCardCurrency(financialSummary.totalDebt) },
          { label: "Survivor Income", value: formatCoverageCardCurrency(financialSummary.survivorIncome) },
          { label: "Latest Inputs Saved", value: financialSummary.latestSavedAt }
        ], "client-planning-card-wide", { sectionTargets: "financial-snapshot financials" });
      }

      function renderHouseholdInsightCard(record, householdDisplay, priority) {
        return renderSummaryCard("Household Insight", [
          { label: "Household Name", value: householdDisplay },
          { label: "Household Role", value: formatValue(record.householdRole) },
          { label: "Marital Status", value: formatValue(record.maritalStatus) },
          { label: "Assignment Type", value: formatTitleCaseValue(record.profileGroupType) },
          { label: "Preferred Contact", value: formatValue(record.preferredContactMethod) },
          { label: "Priority", value: priority }
        ]);
      }

      function renderPlacementSummaryCard(record) {
        const policies = Array.isArray(record.coveragePolicies) ? record.coveragePolicies : [];
        const totalFaceAmount = summarizeCoveragePoliciesForProfile(policies).totalCoverage;
        const policiesWithDocuments = policies.reduce(function (count, policy) {
          return count + (getPolicyDocumentEntries(policy).length ? 1 : 0);
        }, 0);
        const annualPremiumSummary = getCoverageAnnualPremiumSummary(policies);
        const placementStatus = policies.length
          ? `${policies.length} placed ${policies.length === 1 ? "policy" : "policies"}`
          : "No placed coverage yet";

        return renderPlanningCard("Placement Snapshot", [
          { label: "Status", value: placementStatus },
          { label: "Policies on File", value: String(policies.length || 0) },
          { label: "Total Face Amount", value: formatCompactCurrencyTotal(totalFaceAmount) },
          { label: "Annual Premium", value: annualPremiumSummary.hasAnnualizedAmount ? formatCurrencyTotal(annualPremiumSummary.total) : "Not available" },
          { label: "Policies with Docs", value: `${policiesWithDocuments} of ${policies.length || 0}` },
          { label: "Next Placement Move", value: policies.length ? "Review coverage and confirm delivery details" : "Add the first placed policy" }
        ], "", { sectionTargets: "placement" });
      }

      function renderNotesSummaryCard(record) {
        return renderSummaryCard("Notes", [
          { label: "Client Notes", value: formatValue(record.clientNotes) },
          { label: "Last Review", value: formatDate(record.lastReview || record.lastUpdatedDate || record.dateProfileCreated) },
          { label: "Last Updated", value: formatDate(record.lastUpdatedDate || record.dateProfileCreated) }
        ]);
      }

      function renderDocumentsSummaryCard(record) {
        const policies = Array.isArray(record.coveragePolicies) ? record.coveragePolicies : [];
        const illustrations = getIllustrationEntries(record);
        const documentCounts = policies.reduce(function (summary, policy) {
          const documentTotal = getPolicyDocumentEntries(policy).length;
          if (documentTotal > 0) {
            summary.withDocuments += 1;
            summary.totalDocuments += documentTotal;
          } else {
            summary.missingDocuments += 1;
          }
          return summary;
        }, {
          withDocuments: 0,
          missingDocuments: 0,
          totalDocuments: 0
        });

        return renderSummaryCard("Documents", [
          { label: "Saved Policy Files", value: String(documentCounts.totalDocuments || 0) },
          { label: "Policies with Files", value: `${documentCounts.withDocuments} of ${policies.length || 0}` },
          { label: "Policies Missing Files", value: String(documentCounts.missingDocuments || 0) },
          { label: "Illustrations Queued", value: String(illustrations.length || 0) }
        ]);
      }

      function truncateSidebarPreview(value, maxLength) {
        const text = String(value || "").trim();
        const limit = Number(maxLength) || 96;
        if (!text) {
          return "";
        }
        if (text.length <= limit) {
          return text;
        }
        return `${text.slice(0, Math.max(0, limit - 1)).trimEnd()}…`;
      }

      function getUpcomingReminderItems(record) {
        const entries = Array.isArray(record.activityLog) ? record.activityLog : [];
        const today = new Date();
        const todayValue = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();

        const upcoming = entries
          .filter(function (entry) {
            return entry && (entry.type === "reminder" || entry.type === "schedule");
          })
          .map(function (entry) {
            const rawDate = String(entry.date || "").trim();
            const date = rawDate ? new Date(`${rawDate}T00:00:00`) : null;
            const dateValue = date && !Number.isNaN(date.getTime())
              ? new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()
              : null;
            const type = entry.type === "schedule" ? "Meeting" : "Reminder";
            const title = String(entry.subject || "").trim() || (entry.type === "schedule" ? "Scheduled Meeting" : "Follow-Up Reminder");
            const detail = String(entry.detailRemainder || "").trim();
            return {
              type,
              title,
              detail,
              rawDate,
              sortDate: dateValue,
              isOverdue: dateValue !== null && dateValue < todayValue
            };
          })
          .filter(function (entry) {
            return entry.sortDate !== null;
          })
          .sort(function (a, b) {
            if (a.isOverdue !== b.isOverdue) {
              return a.isOverdue ? 1 : -1;
            }
            return a.sortDate - b.sortDate;
          });

        return upcoming.slice(0, 3);
      }

      function renderFooterBar(record) {
        const upcomingItems = getUpcomingReminderItems(record);
        return `
          <section class="client-detail-card client-detail-card-compact client-footer-strip client-reminders-strip" data-reminders-strip>
            <details class="client-summary-details client-reminders-details">
              <summary class="client-detail-card-header client-summary-toggle client-reminders-strip-header">
                <h2>Upcoming Reminders</h2>
                <span class="client-summary-toggle-icon" aria-hidden="true"></span>
              </summary>
              <div class="client-summary-details-body client-reminders-details-body">
                ${upcomingItems.length ? `
                  <div class="client-reminders-strip-list">
                    ${upcomingItems.map(function (item) {
                      return `
                        <article class="client-reminders-strip-item${item.isOverdue ? " is-overdue" : ""}">
                          <div class="client-reminders-strip-item-top">
                            <span class="client-reminders-strip-badge">${escapeHtml(item.type)}</span>
                            <strong>${escapeHtml(formatDate(item.rawDate))}</strong>
                          </div>
                          <div class="client-reminders-strip-item-copy">
                            <span>${escapeHtml(item.title)}</span>
                            <small>${escapeHtml(item.detail || (item.isOverdue ? "Needs attention" : "Scheduled"))}</small>
                          </div>
                        </article>
                      `;
                    }).join("")}
                  </div>
                ` : `
                  <div class="client-reminders-strip-empty">
                    No upcoming reminders or scheduled meetings yet.
                  </div>
                `}
              </div>
            </details>
          </section>
        `;
      }

      function getIllustrationEntries(record) {
        return (Array.isArray(record?.activityLog) ? record.activityLog : [])
          .map(function (entry, entryIndex) {
            const type = String(entry?.type || "").trim().toLowerCase();
            if (type !== "illustration-requested") {
              return null;
            }
            const rawDate = String(entry?.date || "").trim();
            const sortValue = rawDate ? new Date(`${rawDate}T00:00:00`).getTime() : 0;
            return {
              entryIndex,
              rawDate,
              sortValue: Number.isFinite(sortValue) ? sortValue : 0,
              subject: String(entry?.subject || "").trim() || "Illustration Request",
              detail: String(entry?.detailRemainder || entry?.summary || "").trim()
            };
          })
          .filter(Boolean)
          .sort(function (a, b) {
            return b.sortValue - a.sortValue;
          });
      }

      function renderIllustrationsCard(record) {
        const illustrations = getIllustrationEntries(record);
        const previewIllustrations = illustrations.slice(0, 2);
        const remainingIllustrations = Math.max(0, illustrations.length - previewIllustrations.length);
        const queuedCopy = illustrations.length
          ? `${illustrations.length} saved for client review`
          : "Start a review queue for the next client meeting";
        const latestIllustration = illustrations[0];

        return `
          <section class="client-detail-card client-detail-card-compact client-illustrations-card" data-illustrations-card>
            <div class="client-detail-card-header client-illustrations-header">
              <div class="client-illustrations-heading">
                <h2>Illustrations</h2>
                <span class="client-illustrations-count">${illustrations.length} queued</span>
              </div>
            </div>
            <div class="client-illustrations-hero">
              <span class="client-illustrations-icon-shell" aria-hidden="true">
                ${renderActivityIcon("illustration-requested", "client-illustrations-icon-image")}
              </span>
              <div class="client-illustrations-hero-copy">
                <strong>${illustrations.length ? "Ready for review" : "Build the review queue"}</strong>
                <span>${escapeHtml(queuedCopy)}${latestIllustration?.rawDate ? ` • Latest ${escapeHtml(formatDate(latestIllustration.rawDate))}` : ""}</span>
              </div>
              <button type="button" class="client-illustrations-add" data-illustration-quick-add>Add Illustration</button>
            </div>
            <div class="client-illustrations-queue">
              <div class="client-illustrations-list-label">Client Review Queue</div>
              ${previewIllustrations.length ? `
                <div class="client-illustrations-list">
                  ${previewIllustrations.map(function (item) {
                    return `
                      <button type="button" class="client-illustrations-item" data-activity-entry-open="${item.entryIndex}">
                        <div class="client-illustrations-item-copy">
                          <strong>${escapeHtml(item.subject)}</strong>
                          <small>${escapeHtml(item.detail || "Saved for client review.")}</small>
                        </div>
                        <div class="client-illustrations-item-meta">
                          <span class="client-illustrations-item-date">${escapeHtml(item.rawDate ? formatDate(item.rawDate) : "No date")}</span>
                        </div>
                      </button>
                    `;
                  }).join("")}
                </div>
                ${remainingIllustrations ? `
                  <div class="client-illustrations-more">+${remainingIllustrations} more saved in activity</div>
                ` : ``}
              ` : `
                <div class="client-illustrations-empty">
                  No illustrations saved for review yet.
                </div>
              `}
            </div>
          </section>
        `;
      }

      function getActivityRelativeTime(value) {
        if (!value) {
          return "";
        }

        const date = new Date(`${value}T00:00:00`);
        if (Number.isNaN(date.getTime())) {
          return "";
        }

        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const target = new Date(date.getFullYear(), date.getMonth(), date.getDate());
        const diffDays = Math.max(0, Math.round((today.getTime() - target.getTime()) / 86400000));

        if (diffDays === 0) {
          return "Today";
        }
        if (diffDays === 1) {
          return "1 day ago";
        }
        if (diffDays < 15) {
          return `${diffDays} days ago`;
        }
        return formatDate(value);
      }

      function getActivityAgeInDays(value) {
        if (!value) {
          return null;
        }

        const date = new Date(`${value}T00:00:00`);
        if (Number.isNaN(date.getTime())) {
          return null;
        }

        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const target = new Date(date.getFullYear(), date.getMonth(), date.getDate());
        return Math.max(0, Math.round((today.getTime() - target.getTime()) / 86400000));
      }

      function getActivityDirection(entry) {
        return String(entry?.direction || "").trim().toLowerCase();
      }

      function isActivityInLastDays(entry, days) {
        const age = getActivityAgeInDays(String(entry?.date || "").trim());
        return age !== null && age <= days;
      }

      function isOutboundActivity(entry) {
        const type = String(entry?.type || "").trim().toLowerCase();
        const direction = getActivityDirection(entry);
        return (type === "phone" || type === "email" || type === "text") && direction === "outbound"
          || type === "schedule"
          || type === "illustration-requested"
          || type === "application-submitted";
      }

      function isResponseActivity(entry) {
        const type = String(entry?.type || "").trim().toLowerCase();
        const direction = getActivityDirection(entry);
        return (type === "phone" || type === "email" || type === "text") && direction === "inbound"
          || type === "meeting"
          || type === "face"
          || type === "document-received"
          || type === "policy-delivered";
      }

      function getResponseRateSummary(activityEntries) {
        const recentEntries = activityEntries.filter(function (entry) {
          return isActivityInLastDays(entry, 30);
        });
        const outboundCount = recentEntries.filter(isOutboundActivity).length;
        const responseCount = recentEntries.filter(isResponseActivity).length;

        if (!outboundCount) {
          return {
            label: responseCount ? "Needs Response" : "Unknown",
            ratio: null
          };
        }

        const ratio = responseCount / outboundCount;
        if (ratio >= 0.7) {
          return { label: "High", ratio };
        }
        if (ratio >= 0.4) {
          return { label: "Moderate", ratio };
        }
        if (ratio > 0) {
          return { label: "Low", ratio };
        }
        return { label: "Awaiting Response", ratio: 0 };
      }

      function getLatestActivityIndexByType(activityEntries, type) {
        return activityEntries.findIndex(function (entry) {
          return String(entry?.type || "").trim().toLowerCase() === String(type || "").trim().toLowerCase();
        });
      }

      function getActivityTrackerSummary(record) {
        const activityEntries = Array.isArray(record.activityLog) ? record.activityLog : [];
        const latestActivityDate = activityEntries.length
          ? String(activityEntries[0]?.date || "").trim()
          : String(record.lastContactDate || record.lastUpdatedDate || record.dateProfileCreated || "").trim();
        const relativeContact = getActivityRelativeTime(latestActivityDate);
        const latestActivityAge = getActivityAgeInDays(latestActivityDate);
        const responseRate = getResponseRateSummary(activityEntries);
        const isHousehold = String(record.viewType || "").trim() === "households";
        const linkedMembers = isHousehold ? getLinkedIndividualsForHousehold(record) : [];
        const policies = Array.isArray(record.coveragePolicies) ? record.coveragePolicies : [];
        const hasPolicies = policies.length > 0
          || record.statusGroup === "coverage-placed"
          || record.statusGroup === "closed";
        const hasPmi = Boolean(record.pmiCompleted);
        const hasAnalysis = Boolean(record.analysisCompleted)
          || record.statusGroup === "coverage-placed"
          || record.statusGroup === "closed";
        const illustrationIndex = getLatestActivityIndexByType(activityEntries, "illustration-requested");
        const applicationIndex = getLatestActivityIndexByType(activityEntries, "application-submitted");
        const documentIndex = getLatestActivityIndexByType(activityEntries, "document-received");
        const deliveredIndex = getLatestActivityIndexByType(activityEntries, "policy-delivered");
        const hasProjectedDependents = Number(record.projectedDependentsCount || 0) > 0;
        const hasDependents = getCurrentDependentCount(record) > 0;

        let status = "On Track";
        let statusTone = "good";
        let alertCopy = "Recent activity is being tracked consistently.";
        let nextAction = "Keep client outreach moving.";
        let quickActionLabel = "Log Follow-Up";

        if (!activityEntries.length) {
          status = "No Activity";
          statusTone = "warn";
          alertCopy = "No activity has been logged on this profile yet.";
          nextAction = "Log the first client touchpoint.";
          quickActionLabel = "Log First Activity";
        } else if (latestActivityAge !== null && latestActivityAge >= 28) {
          status = "Inactive";
          statusTone = "inactive";
          alertCopy = "No activity has been logged for 4 weeks or longer.";
          nextAction = "Reconnect with the client.";
          quickActionLabel = "Log Reconnect";
        } else if (latestActivityAge !== null && latestActivityAge > 7) {
          status = "At Risk";
          statusTone = "risk";
          alertCopy = "The last recorded activity is more than 1 week old.";
          nextAction = "Follow up with the client.";
          quickActionLabel = "Log Follow-Up Call";
        } else if (latestActivityAge !== null && latestActivityAge <= 7) {
          status = "Active";
          statusTone = "good";
          alertCopy = "A recent activity was logged within the last week.";
          nextAction = "Keep the next client follow-up moving.";
          quickActionLabel = "Log Meeting";
        }

        if (!activityEntries.length) {
          // Keep the initial-touchpoint guidance as the highest-priority action.
        } else if (latestActivityAge !== null && latestActivityAge >= 28) {
          // Keep the reconnect action above all case-state prompts when the account is inactive.
        } else if (isHousehold && linkedMembers.length === 0) {
          nextAction = "Reach out about the household member.";
          quickActionLabel = "Log Client Follow-Up";
        } else if (isHousehold && !hasDependents && hasProjectedDependents) {
          nextAction = "Reach out about projected dependents.";
          quickActionLabel = "Log Client Follow-Up";
        } else if (!hasPmi) {
          nextAction = "Reach out about modeling inputs.";
          quickActionLabel = "Log Client Call";
        } else if (!hasAnalysis) {
          nextAction = "Reach out to review the analysis.";
          quickActionLabel = "Log Client Review";
        } else if (illustrationIndex !== -1 && (applicationIndex === -1 || applicationIndex > illustrationIndex)) {
          nextAction = "Reach out about moving to application.";
          quickActionLabel = "Log Application Follow-Up";
        } else if (applicationIndex !== -1 && (documentIndex === -1 || documentIndex > applicationIndex)) {
          nextAction = "Reach out about underwriting documents.";
          quickActionLabel = "Log Document Follow-Up";
        } else if (documentIndex !== -1 && (deliveredIndex === -1 || deliveredIndex > documentIndex)) {
          nextAction = "Reach out about underwriting progress.";
          quickActionLabel = "Log Underwriting Follow-Up";
        } else if (!hasPolicies) {
          nextAction = "Reach out about placed coverage.";
          quickActionLabel = "Log Placement Follow-Up";
        } else if (deliveredIndex !== -1) {
          nextAction = "Reach out to schedule policy review.";
          quickActionLabel = "Log Review Meeting";
        } else if (responseRate.label === "Needs Response") {
          nextAction = "Respond to latest client activity.";
          quickActionLabel = "Log Follow-Up";
        } else if (responseRate.label === "Awaiting Response") {
          nextAction = "Follow up on recent outreach.";
          quickActionLabel = "Log Follow-Up Call";
        }

        return {
          lastContactDisplay: formatDate(latestActivityDate),
          relativeContact: relativeContact || "Not provided",
          status,
          statusTone,
          responseRate: responseRate.label,
          alertCopy,
          nextAction,
          quickActionLabel
        };
      }

      function getActivityIconSrc(type) {
        if (type === "phone") {
          return "../Images/logcall.svg";
        }
        if (type === "text") {
          return "../Images/textmessage.svg";
        }
        if (type === "meeting") {
          return "../Images/addmeeting.svg";
        }
        if (type === "schedule") {
          return "../Images/schedulemeeting.svg";
        }
        if (type === "face") {
          return "../Images/facetoface.svg";
        }
        if (type === "document-received") {
          return "../Images/documentrecieve.svg";
        }
        if (type === "illustration-requested") {
          return "../Images/illistration.svg";
        }
        if (type === "application-submitted") {
          return "../Images/applicationsubmitted.svg";
        }
        if (type === "policy-delivered") {
          return "../Images/policydelivered.svg";
        }
        if (type === "email") {
          return "../Images/email.svg";
        }
        if (type === "reminder") {
          return "../Images/reminder.svg";
        }
        return "../Images/notes.svg";
      }

      function getActivityIconClass(type) {
        if (type === "phone") {
          return "is-blue";
        }
        if (type === "text") {
          return "is-sky";
        }
        if (type === "meeting" || type === "schedule") {
          return "is-indigo";
        }
        if (type === "face") {
          return "is-emerald";
        }
        if (type === "document-received") {
          return "is-gold";
        }
        if (type === "illustration-requested") {
          return "is-violet";
        }
        if (type === "application-submitted") {
          return "is-navy";
        }
        if (type === "policy-delivered") {
          return "is-rose";
        }
        if (type === "email") {
          return "is-teal";
        }
        if (type === "reminder") {
          return "is-amber";
        }
        return "is-slate";
      }

      function renderActivityIcon(type, imageClass) {
        return `<span class="${imageClass}" style="--activity-icon: url('${escapeHtml(getActivityIconSrc(type))}');" aria-hidden="true"></span>`;
      }

      function renderActivityOptionButton(type, title, copy) {
        const normalizedType = String(type || "").trim().toLowerCase();
        return `
          <button type="button" class="client-activity-option" data-activity-option="${escapeHtml(normalizedType)}">
            <span class="client-activity-option-icon ${getActivityIconClass(normalizedType)}" aria-hidden="true">${renderActivityIcon(normalizedType, "client-activity-option-icon-image")}</span>
            <span class="client-activity-option-text">
              <span class="client-activity-option-title">${escapeHtml(title)}</span>
              <span class="client-activity-option-copy">${escapeHtml(copy)}</span>
            </span>
          </button>
        `;
      }

      function renderActivityPreview(record) {
        const activityEntries = Array.isArray(record.activityLog) ? record.activityLog : [];
        const fallbackNotes = String(record.clientNotes || "").trim()
          ? String(record.clientNotes || "").trim().split(/\r?\n+/).map(function (line) { return line.trim(); }).filter(Boolean).slice(0, 3)
          : [];
        const previewItems = activityEntries.length
          ? activityEntries.map(function (entry, index) {
              const preview = getActivityPreviewParts(entry);
              if (!preview.label && !preview.subject && !preview.detail) {
                return "";
              }
              const stamp = entry?.date ? getActivityRelativeTime(entry.date) : "";
              return `
                <button type="button" class="client-activity-entry-card is-clickable" data-activity-entry-open="${index}">
                  <span class="client-activity-entry-icon ${getActivityIconClass(String(entry?.type || "").trim().toLowerCase())}" aria-hidden="true">${renderActivityIcon(String(entry?.type || "").trim().toLowerCase(), "client-activity-entry-icon-image")}</span>
                  <div class="client-activity-entry-copy">
                    <div class="client-activity-entry-title-row">
                      <div class="client-activity-entry-title"><span class="client-notes-widget-kind">${escapeHtml(preview.label || "Activity")}:</span>${preview.subject ? ` <strong class="client-notes-widget-subject">${escapeHtml(preview.subject)}</strong>` : ""}</div>
                      <span class="client-activity-entry-date">${escapeHtml(stamp)}</span>
                    </div>
                  </div>
                </button>
              `;
            }).filter(Boolean)
          : fallbackNotes.map(function (line) {
              return `
                <article class="client-activity-entry-card">
                  <span class="client-activity-entry-icon is-slate" aria-hidden="true">${renderActivityIcon("note", "client-activity-entry-icon-image")}</span>
                  <div class="client-activity-entry-copy">
                    <div class="client-activity-entry-title-row">
                      <div class="client-activity-entry-title"><span class="client-notes-widget-kind">Note:</span> <strong class="client-notes-widget-subject">${escapeHtml(line)}</strong></div>
                    </div>
                  </div>
                </article>
              `;
            });

        if (!previewItems.length) {
          return `
            <div class="client-notes-widget-list is-empty">
              <p class="client-notes-widget-empty">No activity logged yet.</p>
            </div>
          `;
        }

        return `
          <div class="client-notes-widget-list">
            ${previewItems.join("")}
          </div>
        `;
      }

      function getActivityPreviewLabel(entry) {
        const type = String(entry?.type || "").trim().toLowerCase();
        if (type === "note") {
          return "Note";
        }
        if (type === "email") {
          return "Email";
        }
        if (type === "phone") {
          return "Phone Call";
        }
        if (type === "text") {
          return "Text Message";
        }
        if (type === "schedule") {
          return "Scheduled Meeting";
        }
        if (type === "meeting") {
          return "Meeting";
        }
        if (type === "face") {
          return "Face-to-Face";
        }
        if (type === "document-received") {
          return "Document Received";
        }
        if (type === "illustration-requested") {
          return "Illustration Requested";
        }
        if (type === "application-submitted") {
          return "Application Submitted";
        }
        if (type === "policy-delivered") {
          return "Policy Delivered";
        }
        if (type === "reminder") {
          return "Reminder";
        }
        return "";
      }

      function getActivityPreviewParts(entry) {
        const label = getActivityPreviewLabel(entry);
        const subject = String(entry?.subject || "").trim();
        const detail = String(entry?.detailRemainder || "").trim();

        if (subject || detail) {
          return { label, subject, detail };
        }

        const summary = String(entry?.summary || "").trim();
        if (!summary) {
          return { label, subject: "", detail: "" };
        }

        const normalized = summary
          .replace(/^Note:\s*/i, "")
          .replace(/^Email\b[\s:]*/i, "")
          .replace(/^Phone Call\b[\s:]*/i, "")
          .replace(/^Scheduled\b[\s:]*/i, "")
          .replace(/^Reminder\b[\s:]*/i, "")
          .trim();

        const splitters = [" - ", ": ", ", "];
        for (let index = 0; index < splitters.length; index += 1) {
          const splitter = splitters[index];
          const splitIndex = normalized.indexOf(splitter);
          if (splitIndex > -1) {
            return {
              label,
              subject: normalized.slice(0, splitIndex).trim(),
              detail: normalized.slice(splitIndex + splitter.length).trim()
            };
          }
        }

        return { label, subject: normalized, detail: "" };
      }

      function renderNotesWidget(record, title, sectionTargets) {
        const widgetTitle = String(title || "Activity Tracker");
        const widgetTargets = String(sectionTargets || "activity-log").trim();

        return `
          <section class="client-detail-card client-detail-card-compact client-notes-widget-card client-detail-card-tabbed"${widgetTargets ? ` data-client-nav-section="${escapeHtml(widgetTargets)}"` : ""}>
            <div class="client-detail-card-tab">${escapeHtml(widgetTitle)}</div>
            <div class="client-notes-widget-topline">
              <h2 class="client-notes-widget-title">${escapeHtml(widgetTitle)}</h2>
            </div>
            <div class="client-notes-widget-body">
              <div data-activity-overview>
                ${renderActivityOverviewCard(record)}
              </div>
              <div class="client-notes-widget-paper">
                <div class="client-activity-section-title">
                  <span>Recent Activity</span>
                </div>
                <div data-activity-preview>
                  ${renderActivityPreview(record)}
                </div>
              </div>
              <div class="client-notes-widget-actions">
                <button type="button" class="client-notes-widget-action client-notes-widget-action-primary" data-activity-log-open>Log Activity</button>
                <div class="client-activity-drawer" data-activity-modal hidden>
                  <div class="client-activity-drawer-panel" role="dialog" aria-modal="false" aria-labelledby="client-activity-modal-title">
                    <div class="client-activity-menu" data-activity-menu>
                      <div class="client-activity-modal-header">
                        <div class="client-activity-modal-heading">
                          <h2 id="client-activity-modal-title">Log Activity</h2>
                          <p>Choose the activity you want to add to this profile.</p>
                        </div>
                        <button class="client-activity-modal-close" type="button" data-activity-modal-close aria-label="Close activity options">×</button>
                      </div>
                      <div class="client-activity-modal-grid">
                        ${renderActivityOptionButton("note", "Add Note", "Capture a quick written update.")}
                        ${renderActivityOptionButton("reminder", "Set Reminder", "Create a follow-up reminder.")}
                        ${renderActivityOptionButton("phone", "Log Phone Call", "Track a call outcome or callback.")}
                        ${renderActivityOptionButton("schedule", "Schedule Meeting", "Add an upcoming meeting touchpoint.")}
                        ${renderActivityOptionButton("text", "Log Text Message", "Record a text message touchpoint.")}
                        ${renderActivityOptionButton("meeting", "Add Meeting", "Log a meeting that already happened.")}
                        ${renderActivityOptionButton("email", "Log Email", "Record a sent or received email.")}
                        ${renderActivityOptionButton("face", "Log Face-to-Face Interaction", "Capture an in-person client interaction.")}
                        ${renderActivityOptionButton("document-received", "Log Document Received", "Record receipt of required client documents.")}
                        ${renderActivityOptionButton("illustration-requested", "Log Illustration Requested", "Track an illustration request milestone.")}
                        ${renderActivityOptionButton("application-submitted", "Log Application Submitted", "Capture application submission progress.")}
                        ${renderActivityOptionButton("policy-delivered", "Log Policy Delivered", "Record when the policy has been delivered.")}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>
        `;
      }

      function renderActivityOverviewCard(record) {
        const summary = getActivityTrackerSummary(record);
        return `
          <div class="client-activity-overview-card">
            <div class="client-activity-summary-top">
              <span class="client-activity-status-badge is-${escapeHtml(summary.statusTone)}">${escapeHtml(summary.status)}</span>
              <span class="client-activity-summary-metric">Last Contact: ${escapeHtml(summary.relativeContact)}</span>
              <span class="client-activity-summary-metric">Response Rate: <strong>${escapeHtml(summary.responseRate)}</strong></span>
            </div>
            <div class="client-activity-overview-bottom">
              <div class="client-activity-next-best-copy">
              <span class="client-activity-next-best-label">Suggested Activity</span>
                <strong>${escapeHtml(summary.nextAction)}</strong>
              </div>
              <button type="button" class="client-activity-next-best-button" data-activity-log-open>
                <span>${escapeHtml(summary.quickActionLabel)}</span>
                <span aria-hidden="true">›</span>
              </button>
            </div>
          </div>
        `;
      }

      function renderActivityDetailModalBody(entry) {
        if (!entry) {
          return "";
        }
        const isEditing = Boolean(activeActivityEditMode);
        const preview = getActivityPreviewParts(entry);
        const typeLabel = getActivityPreviewLabel(entry);
        const direction = getActivityDirection(entry);
        const savedDate = String(entry?.date || "").trim() || "";
        const summary = String(entry?.summary || "").trim();
        const detailText = preview.detail || summary || "";
        return `
          <form class="client-activity-detail-form" data-activity-detail-form>
          <div class="client-activity-field-grid">
            <label class="client-activity-field">
              <span>Activity</span>
              <input class="client-activity-input" type="text" value="${escapeHtml(typeLabel || "Activity")}" readonly>
            </label>
            <label class="client-activity-field">
              <span>Date</span>
              <input class="client-activity-input" type="date" name="date" value="${escapeHtml(savedDate)}" ${isEditing ? "" : "readonly"}>
            </label>
            ${direction ? `
              <label class="client-activity-field">
                <span>Direction</span>
                ${isEditing ? `
                  <select class="client-activity-select" name="direction">
                    <option value="Outbound" ${direction === "Outbound" ? "selected" : ""}>Outbound</option>
                    <option value="Inbound" ${direction === "Inbound" ? "selected" : ""}>Inbound</option>
                  </select>
                ` : `
                  <input class="client-activity-input" type="text" value="${escapeHtml(direction)}" readonly>
                `}
              </label>
            ` : ""}
            ${preview.subject ? `
              <label class="client-activity-field">
                <span>Subject</span>
                <input class="client-activity-input" type="text" name="subject" value="${escapeHtml(preview.subject)}" ${isEditing ? "" : "readonly"}>
              </label>
            ` : ""}
          </div>
          <label class="client-activity-field">
            <span>Details</span>
            <textarea class="client-activity-textarea client-activity-detail-textarea" name="detail" rows="8" ${isEditing ? "" : "readonly"}>${escapeHtml(detailText)}</textarea>
          </label>
          <div class="client-activity-detail-footer">
            <button class="client-activity-detail-edit ${isEditing ? "is-saving" : "is-editing"}" type="${isEditing ? "submit" : "button"}" data-activity-detail-edit-toggle>${isEditing ? "Save" : "Edit"}</button>
            <button class="client-policy-delete-button client-activity-delete-button" type="button" data-activity-delete-toggle aria-label="Delete activity">
              <span class="client-activity-delete-image" aria-hidden="true"></span>
            </button>
          </div>
          </form>
        `;
      }

      function renderChecklistCard(title, items, record) {
        const completedCount = items.filter(function (item) { return item.complete; }).length;
        const activeIndex = items.findIndex(function (item) { return !item.complete; });

        return `
          <section class="client-detail-card client-detail-card-compact client-detail-card-checklist client-detail-card-tabbed" data-checklist-card>
            <div class="client-detail-card-tab">${escapeHtml(title)}</div>
            <div class="client-detail-card-header client-detail-card-header-checklist">
              <div class="client-checklist-heading-copy">
                <h2 class="sr-only">${escapeHtml(title)}</h2>
              </div>
              <span class="client-checklist-progress-pill">${completedCount} of ${items.length} complete</span>
            </div>
            <div class="client-checklist-list">
              ${items.map(function (item, index) {
                const action = getChecklistAction(record, item);
                const rowState = item.complete ? "is-complete" : index === activeIndex ? "is-active" : "is-upcoming";
                const isLocked = !item.complete && activeIndex !== -1 && index > activeIndex + 1;
                const stateLabel = item.complete ? "Completed" : index === activeIndex ? "Current Step" : isLocked ? "Locked" : "Ready";
                const detailText = String(item.detail || "").trim();
                const actionLabel = index === activeIndex && action && action.type === "nav" ? "Start" : (action?.label || "");
                return `
                  <div class="client-checklist-row ${rowState}">
                    <div class="client-checklist-step-indicator" aria-hidden="true">
                      <span class="client-checklist-step-indicator-badge">${item.complete ? '<span class="client-checklist-check-icon" aria-hidden="true"></span>' : index + 1}</span>
                      ${index < items.length - 1 ? '<span class="client-checklist-step-connector"></span>' : ""}
                    </div>
                    <div class="client-checklist-row-copy">
                      <strong>${escapeHtml(item.label)}</strong>
                      ${detailText && !item.complete ? `<span>${escapeHtml(detailText)}</span>` : ""}
                    </div>
                    ${item.complete ? `
                      <span class="client-checklist-status">Completed</span>
                    ` : index === activeIndex && action && action.type === "nav" ? `
                      <button class="client-checklist-action" type="button" data-client-workflow-nav="${escapeHtml(action.navKey)}">
                        ${escapeHtml(actionLabel)}
                      </button>
                    ` : `
                      <span class="client-checklist-status">${escapeHtml(stateLabel)}</span>
                    `}
                  </div>
                `;
              }).join("")}
            </div>
          </section>
        `;
      }

      function renderCoverageCard(record) {
        const policies = Array.isArray(record.coveragePolicies) ? record.coveragePolicies : [];
        const previewPolicies = policies
          .map(function (policy, index) {
            return { policy, index };
          })
          .slice(-2)
          .reverse();
        const totalFaceAmount = summarizeCoveragePoliciesForProfile(policies).totalCoverage;
        const annualPremiumSummary = getCoverageAnnualPremiumSummary(policies);
        const illustrations = getIllustrationEntries(record);
        const previewIllustrations = illustrations.slice(0, 2);
        const remainingIllustrations = Math.max(0, illustrations.length - previewIllustrations.length);
        const actionLabel = policies.length ? "Add Another Policy" : "Add Policy";
        const canAddPolicy = policies.length < 30;
        const canViewAll = policies.length > 0;
        const premiumSchedulePreviewLines = annualPremiumSummary.scheduleLines.slice(0, 2);
        const activePolicyCount = policies.reduce(function (count, policy) {
          return count + (String(policy.effectiveDate || "").trim() ? 1 : 0);
        }, 0);
        const hasDocumentsForEveryPolicy = policies.every(function (policy) {
          return getPolicyDocumentEntries(policy).length > 0;
        });

        if (annualPremiumSummary.scheduleLines.length > 2 && premiumSchedulePreviewLines.length) {
          premiumSchedulePreviewLines[premiumSchedulePreviewLines.length - 1] = `${premiumSchedulePreviewLines[premiumSchedulePreviewLines.length - 1]} +${annualPremiumSummary.scheduleLines.length - 2} more`;
        }
        const coverageChips = [
          policies.length ? `${policies.length} ${policies.length === 1 ? "Policy" : "Policies"} Placed` : "",
          policies.length ? (activePolicyCount === policies.length ? "All Active" : "Mixed Status") : "",
          policies.length ? (hasDocumentsForEveryPolicy ? "Docs Complete" : "Docs Missing") : ""
        ].filter(Boolean);

          return `
            <section class="client-detail-card client-detail-card-compact client-coverage-card" data-coverage-card>
              <div class="client-coverage-card-header">
                <div class="client-coverage-card-heading">
                  <h2>Policies</h2>
              </div>
              <div class="client-coverage-card-actions">
                <button
                  class="client-coverage-add-button${canAddPolicy ? "" : " is-disabled"}"
                  type="button"
                  data-coverage-add-open
                  ${canAddPolicy ? "" : "disabled"}
                >${escapeHtml(canAddPolicy ? actionLabel : "Policy Limit Reached")}</button>
              </div>
            </div>
            <div class="client-coverage-card-summary">
              <div class="client-coverage-card-stat">
                <span class="client-coverage-card-stat-label">Total Face Amount</span>
                <strong class="client-coverage-card-stat-value">${escapeHtml(formatCompactCurrencyTotal(totalFaceAmount))}</strong>
                <span class="client-coverage-card-stat-meta">${escapeHtml(policies.length ? `${policies.length} ${policies.length === 1 ? "policy" : "policies"} in force` : "No policies in force")}</span>
              </div>
              <div class="client-coverage-card-stat">
                <span class="client-coverage-card-stat-label">Total Annual Premium</span>
                <strong class="client-coverage-card-stat-value">${escapeHtml(annualPremiumSummary.hasAnnualizedAmount ? formatCurrencyTotal(annualPremiumSummary.total) : "Not available")}</strong>
                <span class="client-coverage-card-stat-meta">${escapeHtml(policies.length ? "Across placed policies" : "No policies in force")}</span>
              </div>
            </div>
            ${premiumSchedulePreviewLines.length ? `
              <div class="client-coverage-card-premium-strip">
                ${premiumSchedulePreviewLines.map(function (line) {
                  return `<span class="client-coverage-card-premium-line">${escapeHtml(line)}</span>`;
                }).join("")}
              </div>
            ` : ""}
            <div class="client-coverage-card-sections">
              <section class="client-coverage-card-section">
                <div class="client-coverage-card-section-head">
                  <span class="client-coverage-card-section-label">Coverage Placed</span>
                  <span class="client-coverage-card-section-meta">${escapeHtml(policies.length ? `${policies.length} total` : "None saved")}</span>
                </div>
                ${policies.length ? `
                  <div class="client-coverage-policy-list">
                  ${previewPolicies.map(function (item) {
                    const policy = item.policy;
                    const policySummary = createCoveragePolicyDisplaySummary(policy, { fallbackTitle: `Policy ${item.index + 1}` });
                    return `
                      <article
                        class="client-coverage-policy-item"
                        data-coverage-policy-card
                        data-policy-index="${item.index}"
                        tabindex="0"
                        role="button"
                        aria-label="Open ${escapeHtml(policySummary.title)} policy details"
                      >
                        <div class="client-coverage-policy-topline">
                          <strong>${escapeHtml(policySummary.title)}</strong>
                          <span>${escapeHtml(policySummary.deathBenefitLabel)}</span>
                        </div>
                        <div class="client-coverage-policy-meta">
                          <span>${escapeHtml(policySummary.classificationLabel)}</span>
                          <span>${escapeHtml(policySummary.insuredLabel)}</span>
                        </div>
                        <div class="client-coverage-policy-meta">
                          <span>Policy ${escapeHtml(formatValue(policy.policyNumber || `#${item.index + 1}`))}</span>
                          <span>Effective ${escapeHtml(formatDate(policy.effectiveDate))}</span>
                        </div>
                      </article>
                    `;
                  }).join("")}
                  </div>
                  ${coverageChips.length ? `
                    <div class="client-coverage-card-chip-row">
                      ${coverageChips.map(function (chip) {
                        return `<span class="client-coverage-card-chip">${escapeHtml(chip)}</span>`;
                      }).join("")}
                    </div>
                  ` : ""}
                ` : `
                  <div class="client-coverage-card-empty">
                    <p class="client-coverage-empty">No policies saved to this profile yet.</p>
                  </div>
                `}
              </section>
              <button
                class="client-coverage-view-all-button${canViewAll ? " is-active" : ""}"
                type="button"
                data-view-all-policies
                ${canViewAll ? "" : "disabled"}
              >View All Coverage</button>
              <button
                class="client-coverage-view-all-button client-coverage-horizon-button${policies.length ? " is-active" : ""}"
                type="button"
                data-coverage-premium-timeline-open
                ${policies.length ? "" : "disabled"}
                aria-label="Open coverage horizon"
              >View Coverage Horizon</button>
              <section class="client-coverage-card-section client-coverage-card-section-illustrations">
                <div class="client-coverage-card-section-heading-block">
                  <div class="client-coverage-card-section-head">
                    <h3 class="client-coverage-card-section-title">Illustrations</h3>
                    <div class="client-coverage-card-section-actions">
                      <span class="client-coverage-card-section-meta">${escapeHtml(illustrations.length ? `${illustrations.length} queued` : "None queued")}</span>
                      <button type="button" class="client-coverage-inline-action" data-illustration-quick-add>Add Illustration</button>
                    </div>
                  </div>
                </div>
                ${previewIllustrations.length ? `
                  <div class="client-coverage-card-illustrations">
                    ${previewIllustrations.map(function (item) {
                      return `
                        <button type="button" class="client-coverage-card-illustration-item" data-activity-entry-open="${item.entryIndex}">
                          <div class="client-coverage-card-illustration-copy">
                            <strong>${escapeHtml(item.subject)}</strong>
                            <small>${escapeHtml(item.rawDate ? formatDate(item.rawDate) : "No date")}</small>
                          </div>
                          <span class="client-coverage-card-illustration-arrow" aria-hidden="true">?</span>
                        </button>
                      `;
                    }).join("")}
                  </div>
                  ${remainingIllustrations ? `
                    <div class="client-coverage-card-more">+${remainingIllustrations} more saved in activity</div>
                  ` : ""}
                ` : `
                  <div class="client-coverage-card-empty client-coverage-card-empty-illustrations">
                    <p class="client-coverage-empty">No illustrations saved for review yet.</p>
                  </div>
                `}
              </section>
            </div>
          </section>
        `;
      }

      function renderStatCard(title, value, meta, options) {
        const isEditable = Boolean(options?.editable);
        const fieldName = String(options?.fieldName || "").trim();
        const rawValue = String(options?.rawValue || "").trim();
        const overline = String(options?.overline || "").trim();
        const showMeta = String(meta || "").trim().length > 0;
        const fullDisplayValue = String(value || "").trim();
        const legacyFieldClass = fieldName === "currentCoverage"
          ? " client-detail-stat-card-coverageAmount"
          : "";
        const isResponsiveCoverageStat = fieldName === "currentCoverage"
          || fieldName === "modeledNeed"
          || fieldName === "coverageAmount"
          || fieldName === "coverageGap";
        const displayStateClass = options?.displayStateClass === "is-zero" || options?.displayStateClass === "has-gap"
          ? ` ${options.displayStateClass}`
          : "";

        const fieldClass = fieldName ? ` client-detail-stat-card-${escapeHtml(fieldName)}${legacyFieldClass}` : "";
        return `
          <section class="client-detail-card client-detail-stat-card${isEditable ? " is-editable" : ""}${fieldClass}">
            <div class="client-detail-stat-header">
              <div class="client-detail-stat-heading">
                ${overline ? `<small class="client-detail-stat-overline">${escapeHtml(overline)}</small>` : ""}
                <span class="client-detail-stat-title">${escapeHtml(title)}</span>
              </div>
              ${isEditable ? `
                <div class="client-detail-stat-display${displayStateClass}">
                  <strong
                    data-stat-display="${escapeHtml(fieldName)}"
                    ${isResponsiveCoverageStat ? `data-stat-full-value="${escapeHtml(fullDisplayValue)}" data-stat-raw-value="${escapeHtml(rawValue)}"` : ""}
                  >${escapeHtml(value)}</strong>
                  <button
                    class="client-detail-stat-edit-button"
                    type="button"
                    data-stat-edit-toggle="${escapeHtml(fieldName)}"
                    aria-label="Edit ${escapeHtml(title)}"
                  >
                    <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
                      <path d="M3.1 11.8 11.2 3.7a1.3 1.3 0 0 1 1.84 1.84l-8.1 8.1-2.38.54.54-2.38Z" stroke="currentColor" stroke-width="1.15" stroke-linecap="round" stroke-linejoin="round"/>
                      <path d="M10.35 4.55 12.2 6.4" stroke="currentColor" stroke-width="1.15" stroke-linecap="round"/>
                    </svg>
                  </button>
                </div>
              ` : `<strong>${escapeHtml(value)}</strong>`}
            </div>
            ${showMeta ? `<p>${escapeHtml(meta)}</p>` : ""}
          </section>
        `;
      }

      function getCoverageAdequacy(record) {
        const coverageFields = synchronizeRecordCoverageFields(record);
        const totalNeed = coverageFields.modeledNeed;

        if (totalNeed <= 0) {
          return 0;
        }

        return Math.max(0, Math.min(100, Math.round((coverageFields.currentCoverage / totalNeed) * 100)));
      }

      function getCoverageAdequacyTone(adequacy) {
        const value = Number(adequacy);
        if (!Number.isFinite(value)) {
          return "risk";
        }

        if (value > 90) {
          return "premium";
        }

        if (value >= 70) {
          return "building";
        }

        if (value >= 40) {
          return "caution";
        }

        return "risk";
      }

      function getCoverageGapMarkerPosition(adequacy) {
        const safeAdequacy = Math.max(0, Math.min(100, Number(adequacy) || 0));
        const emptySegment = Math.max(0, 100 - safeAdequacy);
        const markerPosition = safeAdequacy + (emptySegment * 0.52);
        return Math.max(8, Math.min(92, markerPosition));
      }

      function getCoverageAdequacyGapDetails(record, adequacyValue) {
        const adequacy = Math.max(0, Math.min(100, Number(adequacyValue) || 0));
        const coverageFields = synchronizeRecordCoverageFields(record);
        const financialSummary = getFinancialSnapshotSummary(record);
        const annualIncome = Math.max(0, Number(financialSummary?.annualIncome) || 0);
        const survivorIncome = Math.max(0, Number(financialSummary?.survivorIncome) || 0);
        const coverageGap = Math.max(0, Number(coverageFields?.uncoveredGap) || 0);
        const incomeGap = Math.max(0, annualIncome - survivorIncome);
        return {
          coverageGap,
          incomeGap,
          hasCoverageGap: coverageGap > 0 && adequacy < 100,
          markerPosition: getCoverageGapMarkerPosition(adequacy)
        };
      }

      function renderCoverageAdequacyBar(record, options) {
        const adequacy = getCoverageAdequacy(record);
        const tone = getCoverageAdequacyTone(adequacy);
        const gapDetails = getCoverageAdequacyGapDetails(record, adequacy);
        const className = String(options?.className || "").trim();
        const showIncomeGap = options?.showIncomeGap !== false;
        const showGap = options?.showGap !== false;
        return `
          <section class="client-coverage-adequacy${className ? ` ${escapeHtml(className)}` : ""}" data-coverage-adequacy data-coverage-adequacy-tone="${escapeHtml(tone)}" data-coverage-has-gap="${showGap && gapDetails.hasCoverageGap ? "true" : "false"}">
            <div class="client-coverage-adequacy-header">
              <span>Coverage Adequacy</span>
              <strong data-coverage-adequacy-percent data-coverage-adequacy-tone="${escapeHtml(tone)}">${adequacy}%</strong>
            </div>
            <div class="client-coverage-adequacy-track" aria-hidden="true">
              <div class="client-coverage-adequacy-fill" data-coverage-adequacy-fill data-coverage-adequacy-tone="${escapeHtml(tone)}" style="width: ${adequacy}%;"></div>
              ${showGap ? `
                <div class="client-coverage-adequacy-gap-marker" data-coverage-gap-marker style="left: ${gapDetails.markerPosition}%;">
                  <span></span>
                  <span></span>
                </div>
              ` : ""}
            </div>
            ${showGap ? `
              <div class="client-coverage-adequacy-gap-summary" data-coverage-gap-summary style="--coverage-gap-marker-position: ${gapDetails.markerPosition}%;">
                <div class="client-coverage-adequacy-gap-note">
                  <span class="client-coverage-adequacy-gap-label">Coverage Gap</span>
                  <strong class="client-coverage-adequacy-gap-value" data-coverage-gap-value>${escapeHtml(formatCoverageCardCurrency(gapDetails.coverageGap))}</strong>
                </div>
                ${showIncomeGap ? `
                  <div class="client-coverage-adequacy-income-row">
                    <span class="client-coverage-adequacy-income-label">Income Gap</span>
                    <strong class="client-coverage-adequacy-income-value" data-income-gap-value>${escapeHtml(formatCoverageCardCurrency(gapDetails.incomeGap))}</strong>
                  </div>
                ` : ""}
              </div>
            ` : ""}
          </section>
        `;
      }

      function renderProfile(record) {
        const status = getClientStatusDisplay(record);
        const priority = getPriorityDisplay(normalizePriority(record.priority));
        const isHousehold = String(record.viewType || "").trim() === "households";
        const householdName = formatValue(record.householdName);
        const subtitleParts = [status, formatValue(record.caseRef)];
        const householdDisplay = householdName === "Not provided" ? "No household linked" : householdName;
        const dependentAgesDisplay = deriveDependentAgesFromDetails(record);
        const currentDependentCount = getCurrentDependentCount(record);
        const policies = Array.isArray(record.coveragePolicies) ? record.coveragePolicies : [];
        const policyCount = policies.length || Number(record.policyCount || 0);
        const monthlyPremiumTotal = policies.reduce(function (sum, policy) {
          return sum + parseCurrencyNumber(policy.premiumAmount);
        }, 0);
        const membersCount = Number(record.insured || 0);
        const createdDateDisplay = formatDate(record.dateProfileCreated || record.lastUpdatedDate);
        const primaryLinkedClient = isHousehold ? getPrimaryLinkedClientForHousehold(record) : null;
        const linkedHouseholdMembers = isHousehold ? getLinkedIndividualsForHousehold(record) : [];
        const householdLeadName = formatValue(
          primaryLinkedClient?.displayName
          || `${String(record.preferredName || record.firstName || "").trim()} ${String(record.lastName || "").trim()}`.trim()
          || String(record.displayName || "").replace(/\s+Household$/i, "").trim()
        );
        const completion = calculateProfileCompletion(record);
        const checklistItems = getDashboardChecklistItems(record);
        const coverageFields = synchronizeRecordCoverageFields(record);

        if (isHousehold) {
          const membersLabel = `${Number.isFinite(membersCount) && membersCount > 0 ? membersCount : 0} member${Number.isFinite(membersCount) && membersCount === 1 ? "" : "s"}`;
          const dependentsLabel = `${currentDependentCount} dependent${currentDependentCount === 1 ? "" : "s"}`;
          const coverageSummaryLabel = coverageFields.currentCoverage > 0 ? "Coverage in force" : "No coverage";
          const adequacyPercent = getCoverageAdequacy(record);
          const totalCoveragePercent = adequacyPercent;
          const householdMemberButtons = linkedHouseholdMembers.length
            ? linkedHouseholdMembers.map(function (member) {
              const avatarPresentation = getAvatarPresentation(member.age, member.dateOfBirth);
              return `
                <${isOverlayViewer ? "button" : "a"} class="client-household-member-button"${isOverlayViewer ? ` type="button" data-overlay-record-open="${escapeHtml(String(member.id || "").trim())}"` : ` href="clients.html?profileId=${encodeURIComponent(String(member.id || "").trim())}"`}>
                  <span class="client-household-member-avatar" style="background:${escapeHtml(avatarPresentation.background)};color:${escapeHtml(avatarPresentation.color)};box-shadow:${escapeHtml(avatarPresentation.boxShadow)};">${escapeHtml(getInitials(formatValue(member.displayName)))}</span>
                  <span class="client-household-member-button-copy">
                    <strong>${escapeHtml(formatValue(member.displayName))}</strong>
                    <em>${escapeHtml(formatValue(member.caseRef))}</em>
                  </span>
                  <span class="client-household-member-button-role">${escapeHtml(formatValue(member.householdRole))}</span>
                </${isOverlayViewer ? "button" : "a"}>
              `;
            }).join("")
            : `
              <button class="client-household-member-button is-placeholder" type="button">
                <span class="client-household-member-avatar is-placeholder">--</span>
                <span class="client-household-member-button-copy">
                  <strong>No linked members yet</strong>
                  <em>Profile links will appear here</em>
                </span>
                <span class="client-household-member-button-role">Pending</span>
              </button>
            `;
          return `
            <div class="client-profile-shell client-profile-shell-household">
              <section class="client-profile-main client-profile-main-household client-profile-main-household-single">
                <${isOverlayViewer ? "button" : "a"} class="client-profile-backlink client-profile-backlink-household"${isOverlayViewer ? ' type="button" data-overlay-viewer-close' : ' href="clients.html"'}>
                  <span>Return to Client Directory</span>
                </${isOverlayViewer ? "button" : "a"}>
                <section class="client-detail-card client-household-top-card">
                  <div class="client-household-top-card-copy">
                    <h2 class="client-profile-household-title">
                      <span>${escapeHtml(formatValue(record.displayName))}</span>
                    </h2>
                    <p>${escapeHtml(`${membersLabel} · ${dependentsLabel} · ${coverageSummaryLabel}`)}</p>
                  </div>
                  <div class="client-household-top-card-meta">
                    <span># Case Ref&nbsp;&nbsp;${escapeHtml(formatValue(record.caseRef))}</span>
                    <span>Advisor ${escapeHtml(formatValue(record.advisorName))}</span>
                    <span>Created ${escapeHtml(createdDateDisplay)}</span>
                  </div>
                </section>

                <div class="client-profile-tab-panels">
                  <section class="client-profile-tab-panel is-active client-profile-tab-panel-household" data-client-panel="overview">
                    <div class="client-household-dashboard">
                      <section class="client-detail-card client-household-panel client-household-panel-overview">
                        <div class="client-detail-card-header">
                          <h2>${escapeHtml(String(record.lastName || record.displayName || "").replace(/\s+Household$/i, "").trim() || "Household")} Overview</h2>
                        </div>
                        <div class="client-household-overview-shell">
                          <div class="client-household-kpi-row">
                            <div class="client-household-kpi">
                              <span class="client-household-kpi-label">Members</span>
                              <strong>${escapeHtml(String(Number.isFinite(membersCount) && membersCount > 0 ? membersCount : 0))}</strong>
                            </div>
                            <div class="client-household-kpi">
                              <span class="client-household-kpi-label">Dependents</span>
                              <strong>${escapeHtml(String(currentDependentCount))}</strong>
                            </div>
                            <div class="client-household-kpi">
                              <span class="client-household-kpi-label">Policies</span>
                              <strong>${escapeHtml(String(Number.isFinite(policyCount) ? policyCount : 0))}</strong>
                            </div>
                          </div>

                          <div class="client-household-primary-panel">
                            <div class="client-household-primary-topline">Primary Client</div>
                            <div class="client-household-earner-row">
                              <span class="client-household-mini-avatar">${escapeHtml(getInitials(householdLeadName))}</span>
                              <div class="client-household-primary-copy">
                                <strong class="client-household-primary-name">${escapeHtml(householdLeadName)}</strong>
                                <span>${escapeHtml(formatValue(primaryLinkedClient?.householdRole || "Primary Client"))}</span>
                              </div>
                              <span class="client-household-role-pill">Primary</span>
                            </div>
                          </div>

                          <div class="client-household-contact-panel">
                            <div class="client-household-subcard-title">Contact Details</div>
                            <div class="client-household-contact-list">
                              <div class="client-household-contact-row">
                                <span>Phone</span>
                                <strong>${escapeHtml(formatValue(primaryLinkedClient?.phoneNumber || record.phoneNumber))}</strong>
                              </div>
                              <div class="client-household-contact-row">
                                <span>Email</span>
                                <strong>${escapeHtml(formatValue(primaryLinkedClient?.emailAddress || record.emailAddress))}</strong>
                              </div>
                              <div class="client-household-contact-row">
                                <span>Preferred Contact</span>
                                <strong>${escapeHtml(formatValue(primaryLinkedClient?.preferredContactMethod || record.preferredContactMethod))}</strong>
                              </div>
                            </div>
                          </div>

                          <div class="client-household-facts-panel">
                            <div class="client-household-subcard-title">Household Facts</div>
                            <div class="client-household-facts-grid">
                              <div class="client-household-fact">
                                <span>Marital Status</span>
                                <strong>${escapeHtml(formatValue(primaryLinkedClient?.maritalStatus || record.maritalStatus))}</strong>
                              </div>
                              <div class="client-household-fact">
                                <span>Children Ages</span>
                                <strong>${escapeHtml(dependentAgesDisplay)}</strong>
                              </div>
                              <div class="client-household-fact">
                                <span>Advisor</span>
                                <strong>${escapeHtml(formatValue(record.advisorName))}</strong>
                              </div>
                              <div class="client-household-fact">
                                <span>Created</span>
                                <strong>${escapeHtml(createdDateDisplay)}</strong>
                              </div>
                            </div>
                          </div>
                        </div>
                      </section>

                      <div class="client-household-right-rail">
                        <div class="client-household-top-rail">
                          <div class="client-household-members-column">
                            <section class="client-detail-card client-household-panel client-household-coverage-panel-wide">
                              <div class="client-detail-card-header">
                                <h2>Household Policy Summary</h2>
                              </div>
                              <div class="client-household-policy-stats">
                                <div class="client-household-policy-stat">
                                  <span class="client-household-policy-stat-label">Monthly Premiums</span>
                                  <strong>${escapeHtml(formatCoverageCardCurrency(monthlyPremiumTotal))}</strong>
                                </div>
                                <div class="client-household-policy-stat">
                                  <span class="client-household-policy-stat-label">Active Policies</span>
                                  <strong>${escapeHtml(String(Number.isFinite(policyCount) ? policyCount : 0))}</strong>
                                </div>
                                <div class="client-household-policy-stat">
                                  <span class="client-household-policy-stat-label">Total Coverage</span>
                                  <strong>${escapeHtml(formatCoverageCardCurrency(record.coverageAmount))}</strong>
                                </div>
                              </div>
                            </section>

                            <section class="client-detail-card client-household-panel client-household-members-panel">
                              <div class="client-detail-card-header client-household-card-header-action">
                                <h2>Household Members</h2>
                                <button class="client-household-header-action" type="button">+ Add New</button>
                              </div>
                              <div class="client-household-member-list">
                                ${householdMemberButtons}
                              </div>
                            </section>

                          </div>

                          <section class="client-detail-card client-household-panel client-household-actions-panel">
                            <div class="client-detail-card-header">
                              <h2>Quick Actions</h2>
                            </div>
                            <div class="client-household-action-list">
                                <button class="client-household-quick-action" type="button">
                                  <span class="client-household-quick-icon is-purple">¦</span>
                                  <span><strong>Add Dependent</strong></span>
                                  <span aria-hidden="true">›</span>
                                </button>
                                <button class="client-household-quick-action" type="button">
                                  <span class="client-household-quick-icon is-purple">+</span>
                                  <span><strong>Add Spouse / Partner</strong></span>
                                  <span aria-hidden="true">›</span>
                                </button>
                                <button class="client-household-quick-action" type="button">
                                  <span class="client-household-quick-icon is-gold">?</span>
                                  <span><strong>Add Policy</strong></span>
                                  <span aria-hidden="true">›</span>
                                </button>
                                <button class="client-household-quick-action" type="button">
                                  <span class="client-household-quick-icon is-gold">?</span>
                                  <span><strong>Open PMI</strong></span>
                                  <span aria-hidden="true">›</span>
                                </button>
                                <button class="client-household-quick-action" type="button">
                                  <span class="client-household-quick-icon is-green">?</span>
                                  <span><strong>Open Analysis</strong></span>
                                  <span aria-hidden="true">›</span>
                                </button>
                              </div>
                          </section>
                        </div>

                        ${renderNotesWidget(record, "Household Activity Tracker")}
                      </div>
                    </div>
                  </section>

                  <section class="client-profile-tab-panel client-profile-tab-panel-household" data-client-panel="household" hidden>
                    <div class="client-profile-dashboard client-profile-dashboard-household">
                      <div class="client-profile-dashboard-main">
                        ${renderSummaryCard("Household Members", [
                          { label: "Adults in Household", value: Number.isFinite(membersCount) && membersCount > 0 ? String(membersCount) : "0" },
                          { label: "Marital Status", value: formatValue(record.maritalStatus) },
                          { label: "Spouse / Partner Age", value: formatValue(record.spouseAge) },
                          { label: "Preferred Contact", value: formatValue(record.preferredContactMethod) }
                        ])}
                        ${renderSummaryCard("Dependents", [
                          { label: "Dependents / Children", value: formatValue(record.hasDependents) },
                          { label: "Current Dependents Count", value: String(currentDependentCount) },
                          { label: "Current Children Ages", value: dependentAgesDisplay },
                          { label: "Projected Dependents", value: formatValue(record.projectedDependents) },
                          { label: "Projected Dependents Count", value: formatValue(record.projectedDependentsCount) }
                        ])}
                      </div>
                      <div class="client-profile-dashboard-side">
                        ${renderSummaryCard("Household Advisory", [
                          { label: "Household Role", value: formatValue(record.householdRole) },
                          { label: "Assignment Name", value: householdDisplay },
                          { label: "Assignment Type", value: formatValue(record.profileGroupType) },
                          { label: "Source", value: formatValue(record.source) },
                          { label: "Priority", value: priority }
                        ])}
                      </div>
                    </div>
                  </section>

                  <section class="client-profile-tab-panel client-profile-tab-panel-household" data-client-panel="planning" hidden>
                    <div class="client-profile-dashboard client-profile-dashboard-household">
                      ${renderAnalysisPreviewCard(record)}
                      <div class="client-profile-dashboard-main">
                        ${renderPmiEntryCard(record)}
                        ${renderPreliminaryResultsCard(record)}
                      </div>
                      <div class="client-profile-dashboard-side">
                        ${renderRiskAnalysisCard(record)}
                      </div>
                    </div>
                  </section>

                  <section class="client-profile-tab-panel client-profile-tab-panel-household" data-client-panel="notes" hidden>
                    <div class="client-profile-dashboard client-profile-dashboard-household">
                      <div class="client-profile-dashboard-main">
                        ${renderSummaryCard("Household Notes", [
                          { label: "Client Notes", value: formatValue(record.clientNotes) },
                          { label: "Source", value: formatValue(record.source) },
                          { label: "Last Review", value: formatDate(record.lastReview || record.lastUpdatedDate || record.dateProfileCreated) }
                        ])}
                        ${renderNotesWidget(record)}
                      </div>
                    </div>
                  </section>
                </div>

                <div class="client-detail-stat-modal" data-stat-modal hidden>
                  <div class="client-detail-stat-modal-backdrop" data-stat-modal-close></div>
                  <div class="client-detail-stat-modal-panel" role="dialog" aria-modal="true" aria-labelledby="client-detail-stat-modal-title">
                    <h2 id="client-detail-stat-modal-title" data-stat-modal-title>Edit Value</h2>
                    <label class="client-detail-stat-editor-label client-detail-stat-modal-label">
                      <span data-stat-modal-label>Edit Value</span>
                      <input
                        class="client-detail-stat-editor-input"
                        type="text"
                        inputmode="decimal"
                        value="0"
                        data-stat-modal-input
                      >
                    </label>
                    <div class="client-detail-stat-editor-actions">
                      <button class="client-detail-stat-editor-cancel" type="button" data-stat-modal-cancel>Cancel</button>
                      <button class="client-detail-stat-editor-save" type="button" data-stat-modal-save>Save</button>
                    </div>
                  </div>
                </div>
              </section>
            </div>
          `;
        }

        return `
          <div class="client-profile-shell client-profile-shell--viewer${document.body.classList.contains("workspace-side-nav-collapsed") ? " is-collapsed" : ""}" data-client-sidebar-layout>
            <section class="client-profile-main client-profile-main--viewer">
              <div class="client-profile-viewer-shell">
                <div class="client-profile-viewer-header" data-client-profile-sticky-header>
                  <div class="client-profile-viewer-header-blank" aria-hidden="true"></div>
                </div>
                <div class="client-profile-viewer-body">
                  <div class="client-profile-viewer-main" data-client-profile-scroll-pane data-client-profile-workspace>
                    <div class="client-profile-workspace-action-row client-profile-workspace-action-row--viewer" data-primary-action-panel-host>
                      ${renderPrimaryActionPanel(record, checklistItems)}
                    </div>
                    <div class="client-profile-viewer-top-band">
                      <div class="client-profile-viewer-top-panel client-profile-viewer-top-panel--overview">
                        ${renderOverviewSummaryCard(record)}
                      </div>
                      <div class="client-profile-viewer-top-panel client-profile-viewer-top-panel--details">
                        ${renderClientProfileSidebar(record, subtitleParts)}
                      </div>
                    </div>
                    <div class="client-profile-workspace-main client-profile-workspace-main--sections">
                      <div class="client-profile-workspace">
                      <div class="client-profile-viewer-secondary-grid client-profile-viewer-secondary-grid--workspace">
                        <div class="client-profile-viewer-secondary-card client-profile-viewer-secondary-card--workflow">
                          ${renderChecklistCard("Planning Workflow", checklistItems, record)}
                        </div>
                        <div class="client-profile-viewer-secondary-card client-profile-viewer-secondary-card--status">
                          ${renderStatusControlPanel(record)}
                        </div>
                      </div>

                      ${renderProfileWorkspaceSection({
                        sectionTargets: "analysis",
                        sectionClassName: "client-profile-workspace-section--analysis",
                        eyebrow: "Case Progression",
                        title: "Analysis",
                        description: "Use this as the main planning workspace for inputs, modeled need, and advisor recommendation.",
                        body: `
                          <div class="client-profile-analysis-grid">
                            <div class="client-profile-analysis-subsection" data-client-nav-section="modeling-inputs">
                              ${renderPmiEntryCard(record)}
                            </div>
                            <div class="client-profile-analysis-subsection" data-client-nav-section="needs-analysis">
                              ${renderAnalysisPreviewCard(record)}
                            </div>
                            <div class="client-profile-analysis-subsection" data-client-nav-section="recommendation">
                              ${renderRecommendationSummaryCard(record)}
                            </div>
                          </div>
                        `
                      })}

                      ${renderProfileWorkspaceSection({
                        sectionTargets: "underwriting",
                        sectionClassName: "client-profile-workspace-section--underwriting",
                        eyebrow: "Case Progression",
                        title: "Underwriting",
                        description: "Track risk inputs and preliminary underwriting details without leaving the case workspace.",
                        body: `
                          <div class="client-profile-section-grid">
                            <div class="client-profile-section-grid-main">
                              ${renderRiskAnalysisCard(record)}
                            </div>
                            <div class="client-profile-section-grid-side">
                              ${renderPreliminaryResultsCard(record)}
                            </div>
                          </div>
                        `
                      })}

                      ${renderProfileWorkspaceSection({
                        sectionTargets: "placement",
                        sectionClassName: "client-profile-workspace-section--placement",
                        eyebrow: "Case Progression",
                        title: "Placement",
                        description: "Keep delivery moving by reviewing placed coverage, premium detail, and missing final records.",
                        body: `<div data-placement-summary-card>${renderPlacementSummaryCard(record)}</div>`
                      })}

                      ${renderProfileWorkspaceSection({
                        sectionTargets: "household",
                        sectionClassName: "client-profile-workspace-section--client-data",
                        eyebrow: "Client Data",
                        title: "Household",
                        description: "Reference the household context, assignment, and advisory positioning behind the case.",
                        body: renderHouseholdInsightCard(record, householdDisplay, priority)
                      })}

                      ${renderProfileWorkspaceSection({
                        sectionTargets: "financial-snapshot",
                        sectionClassName: "client-profile-workspace-section--client-data",
                        eyebrow: "Client Data",
                        title: "Financial Snapshot",
                        description: "Review the latest saved income, spending, and debt inputs supporting the analysis.",
                        body: renderFinancialSnapshotCard(record)
                      })}

                      ${renderProfileWorkspaceSection({
                        sectionTargets: "policies",
                        sectionClassName: "client-profile-workspace-section--client-data",
                        eyebrow: "Client Data",
                        title: "Policies",
                        description: "Review the live policy inventory, premium view, and coverage details on file.",
                        body: renderCoverageCard(record)
                      })}

                      ${renderProfileWorkspaceSection({
                        sectionTargets: "notes",
                        sectionClassName: "client-profile-workspace-section--support",
                        eyebrow: "Activity / Support",
                        title: "Notes",
                        description: "Keep advisor notes visible as part of the case workspace instead of hiding them on a separate page.",
                        body: `<div data-notes-summary-card>${renderNotesSummaryCard(record)}</div>`
                      })}

                      ${renderProfileWorkspaceSection({
                        sectionTargets: "documents",
                        sectionClassName: "client-profile-workspace-section--support",
                        eyebrow: "Activity / Support",
                        title: "Documents",
                        description: "Review document coverage and illustration support without leaving the profile workspace.",
                        body: `<div data-documents-summary-card>${renderDocumentsSummaryCard(record)}</div>`
                      })}
                      </div>
                    </div>
                  </div>
                  <aside class="client-profile-viewer-activity-rail">
                    ${renderNotesWidget(record, "Activity", "activity activity-log")}
                  </aside>
                </div>
              </div>

              <div class="client-detail-stat-modal" data-stat-modal hidden>
                <div class="client-detail-stat-modal-backdrop" data-stat-modal-close></div>
                <div class="client-detail-stat-modal-panel" role="dialog" aria-modal="true" aria-labelledby="client-detail-stat-modal-title">
                  <h2 id="client-detail-stat-modal-title" data-stat-modal-title>Edit Value</h2>
                  <label class="client-detail-stat-editor-label client-detail-stat-modal-label">
                    <span data-stat-modal-label>Edit Value</span>
                    <input
                      class="client-detail-stat-editor-input"
                      type="text"
                      inputmode="decimal"
                      value="0"
                      data-stat-modal-input
                      aria-label="Edit value"
                    >
                  </label>
                  <div class="client-detail-stat-editor-actions">
                    <button class="client-detail-stat-editor-cancel" type="button" data-stat-modal-cancel>Cancel</button>
                    <button class="client-detail-stat-editor-save" type="button" data-stat-modal-save>Save</button>
                  </div>
                </div>
              </div>

            </section>
          </div>
          <div class="client-policy-modal" data-policy-modal hidden>
            <div class="client-policy-modal-backdrop" data-policy-modal-close></div>
            <div class="client-policy-modal-panel client-policy-detail-modal-panel" role="dialog" aria-modal="true" aria-labelledby="client-policy-modal-title">
              <div class="client-policy-modal-hero">
                <div class="client-policy-modal-header client-policy-detail-modal-header">
                  <div class="client-policy-modal-hero-copy">
                    <span class="client-policy-modal-badge" data-policy-modal-badge>Coverage Record</span>
                    <h2 id="client-policy-modal-title" data-policy-modal-title>Policy Details</h2>
                    <p class="client-policy-modal-subtitle" data-policy-modal-subtitle>Review the saved coverage details for this policy.</p>
                  </div>
                  <div class="client-policy-modal-header-actions">
                    <button class="client-policy-modal-close" type="button" data-policy-modal-close aria-label="Close policy details">×</button>
                  </div>
                </div>
                <div class="client-policy-modal-metrics" data-policy-modal-metrics></div>
              </div>
              <div class="client-policy-modal-status" data-policy-modal-status></div>
              <div class="client-policy-modal-body" data-policy-modal-body></div>
              <div class="client-policy-modal-footer">
                <button class="client-policy-delete-button" type="button" data-policy-delete-toggle aria-label="Delete policy">
                  <span class="client-policy-delete-icon" aria-hidden="true"></span>
                </button>
                <button class="client-policy-edit-button" type="button" data-policy-edit-toggle>Edit</button>
              </div>
              <div class="client-policy-document-menu" data-policy-document-menu hidden>
                <button class="client-policy-document-menu-item" type="button" data-policy-document-action="open">Open file</button>
                <button class="client-policy-document-menu-item" type="button" data-policy-document-action="add-file">Add file</button>
                <button class="client-policy-document-menu-item" type="button" data-policy-document-action="rename">Rename file</button>
                <button class="client-policy-document-menu-item" type="button" data-policy-document-action="share">Share file</button>
                <button class="client-policy-document-menu-item is-danger" type="button" data-policy-document-action="delete">Delete file</button>
              </div>
              <input
                class="client-policy-document-add-input"
                type="file"
                data-policy-document-add-input
                accept=".pdf,.zip,.png,.jpg,.jpeg,.doc,.docx,.heic,.webp"
                multiple
                hidden
                tabindex="-1"
                aria-hidden="true"
              >
            </div>
          </div>
          <div class="client-policy-modal client-policy-rename-modal" data-policy-document-rename-modal hidden>
            <div class="client-policy-modal-backdrop" data-policy-document-rename-close></div>
            <form class="client-policy-modal-panel client-policy-rename-modal-panel" data-policy-document-rename-form role="dialog" aria-modal="true" aria-labelledby="client-policy-document-rename-title" novalidate>
              <h2 id="client-policy-document-rename-title">Rename File</h2>
              <p class="client-policy-rename-copy" data-policy-document-rename-copy>Rename this saved file.</p>
              <label class="client-policy-rename-field">
                <span>File Name</span>
                <input class="client-policy-rename-input" type="text" data-policy-document-rename-input maxlength="240" autocomplete="off">
              </label>
              <div class="client-policy-delete-actions">
                <button class="client-policy-delete-cancel" type="button" data-policy-document-rename-close>Cancel</button>
                <button class="client-policy-rename-save" type="submit">Save</button>
              </div>
            </form>
          </div>
          <div class="client-policy-modal client-policy-delete-modal" data-policy-document-delete-modal hidden>
            <div class="client-policy-modal-backdrop" data-policy-document-delete-close></div>
            <div class="client-policy-modal-panel client-policy-delete-modal-panel" role="dialog" aria-modal="true" aria-labelledby="client-policy-document-delete-title">
              <h2 id="client-policy-document-delete-title">Delete File?</h2>
              <p class="client-policy-delete-copy" data-policy-document-delete-copy>Are you sure you want to delete this saved file?</p>
              <div class="client-policy-delete-actions">
                <button class="client-policy-delete-cancel" type="button" data-policy-document-delete-close>No</button>
                <button class="client-policy-delete-confirm" type="button" data-policy-document-delete-confirm>Yes, Delete</button>
              </div>
            </div>
          </div>
          <div class="client-policy-modal client-policy-list-modal" data-policy-list-modal hidden>
            <div class="client-policy-modal-backdrop" data-policy-list-modal-close></div>
            <div class="client-policy-modal-panel client-policy-list-modal-panel" role="dialog" aria-modal="true" aria-labelledby="client-policy-list-modal-title">
              <div class="client-policy-modal-header">
                <div></div>
                <button class="client-policy-modal-close" type="button" data-policy-list-modal-close aria-label="Close policy list">×</button>
              </div>
              <h2 id="client-policy-list-modal-title">All Policies</h2>
              <div class="client-policy-list-modal-body" data-policy-list-modal-body></div>
            </div>
          </div>
          <div class="client-policy-modal client-premium-timeline-modal" data-premium-timeline-modal hidden>
            <div class="client-policy-modal-backdrop" data-premium-timeline-modal-close></div>
            <div class="client-policy-modal-panel client-premium-timeline-modal-panel" role="dialog" aria-modal="true" aria-labelledby="client-premium-timeline-modal-title">
              <div class="client-policy-modal-header client-premium-timeline-modal-header">
                <div class="client-premium-timeline-heading">
                  <span class="client-premium-timeline-badge">Coverage Horizon</span>
                  <h2 id="client-premium-timeline-modal-title">Coverage Horizon</h2>
                  <p>See when each policy begins, how premiums are structured, and where coverage runs over its life.</p>
                </div>
                <button class="client-policy-modal-close" type="button" data-premium-timeline-modal-close aria-label="Close coverage horizon">×</button>
              </div>
              <div class="client-premium-timeline-summary" data-premium-timeline-modal-summary></div>
              <div class="client-premium-timeline-body" data-premium-timeline-modal-body></div>
            </div>
          </div>
          <div class="client-policy-modal client-policy-delete-modal" data-policy-delete-modal hidden>
            <div class="client-policy-modal-backdrop" data-policy-delete-modal-close></div>
            <div class="client-policy-modal-panel client-policy-delete-modal-panel" role="dialog" aria-modal="true" aria-labelledby="client-policy-delete-modal-title">
              <h2 id="client-policy-delete-modal-title">Delete Policy?</h2>
              <p class="client-policy-delete-copy">Are you sure you want to delete this policy? This will remove it from the profile and update the total coverage amount.</p>
              <div class="client-policy-delete-actions">
                <button class="client-policy-delete-cancel" type="button" data-policy-delete-modal-close>No</button>
                <button class="client-policy-delete-confirm" type="button" data-policy-delete-confirm>Yes, Delete</button>
              </div>
            </div>
          </div>
          <div class="client-activity-widget-modal client-coverage-widget-modal" data-coverage-widget-modal hidden>
            <div class="client-activity-widget-modal-backdrop" data-coverage-widget-close></div>
            <form class="client-activity-widget-modal-panel client-activity-widget client-coverage-widget" data-coverage-widget role="dialog" aria-modal="true" aria-labelledby="client-coverage-widget-title" novalidate>
              <div class="client-activity-widget-header">
                <button class="client-activity-modal-close" type="button" data-coverage-widget-close aria-label="Close coverage widget">×</button>
              </div>
              <div class="client-activity-widget-heading">
                <h2 id="client-coverage-widget-title" data-coverage-widget-title>Add Coverage</h2>
                <p data-coverage-widget-copy>Save policy details to this profile.</p>
              </div>
              <div class="client-coverage-widget-progress" data-coverage-widget-progress></div>
              <div class="client-activity-widget-body client-coverage-widget-body" data-coverage-widget-body></div>
              <p class="coverage-form-feedback client-coverage-widget-feedback" data-coverage-widget-feedback aria-live="polite"></p>
              <div class="client-activity-widget-actions client-coverage-widget-actions">
                <button type="button" class="client-activity-widget-back" data-coverage-widget-back hidden>Back</button>
                <button type="submit" class="client-activity-widget-save" data-coverage-widget-save>Save Policy</button>
              </div>
            </form>
          </div>
          <div class="client-policy-modal client-policy-delete-modal" data-profile-delete-modal hidden>
            <div class="client-policy-modal-backdrop" data-profile-delete-modal-close></div>
            <div class="client-policy-modal-panel client-policy-delete-modal-panel" role="dialog" aria-modal="true" aria-labelledby="client-profile-delete-modal-title">
              <h2 id="client-profile-delete-modal-title">Delete Profile?</h2>
              <p class="client-policy-delete-copy">Are you sure you want to delete this profile? This action cannot be undone.</p>
              <div class="client-policy-delete-actions">
                <button class="client-policy-delete-cancel" type="button" data-profile-delete-modal-close>No</button>
                <button class="client-policy-delete-confirm" type="button" data-profile-delete-confirm>Yes, Delete</button>
              </div>
            </div>
          </div>
          <div class="client-policy-modal client-activity-widget-modal client-activity-detail-modal" data-activity-detail-modal hidden>
            <div class="client-activity-widget-modal-backdrop" data-activity-detail-close></div>
            <div class="client-activity-widget-modal-panel client-activity-detail-modal-panel" role="dialog" aria-modal="true" aria-labelledby="client-activity-detail-modal-title">
              <div class="client-activity-widget-header client-activity-detail-header">
                <button type="button" class="client-activity-widget-back client-activity-detail-back" data-activity-detail-close>Back</button>
                <button class="client-activity-modal-close" type="button" data-activity-detail-close aria-label="Close activity preview">×</button>
              </div>
              <div class="client-activity-widget-heading client-activity-detail-modal-heading">
                <h2 id="client-activity-detail-modal-title" data-activity-detail-title>Saved Activity</h2>
                <p>Review the saved activity details for this profile.</p>
              </div>
              <div class="client-activity-widget-body client-activity-detail-body" data-activity-detail-body></div>
            </div>
          </div>
          <div class="client-policy-modal client-policy-delete-modal" data-activity-delete-modal hidden>
            <div class="client-policy-modal-backdrop" data-activity-delete-close></div>
            <div class="client-policy-modal-panel client-policy-delete-modal-panel" role="dialog" aria-modal="true" aria-labelledby="client-activity-delete-modal-title">
              <h2 id="client-activity-delete-modal-title">Delete Activity?</h2>
              <p class="client-policy-delete-copy">Are you sure you want to delete this activity? This will remove it from the tracker and saved activity history.</p>
              <div class="client-policy-delete-actions">
                <button class="client-policy-delete-cancel" type="button" data-activity-delete-close>No</button>
                <button class="client-policy-delete-confirm" type="button" data-activity-delete-confirm>Yes, Delete</button>
              </div>
            </div>
          </div>
          <div class="client-policy-modal" data-pmi-detail-modal hidden>
            <div class="client-policy-modal-backdrop" data-pmi-detail-close></div>
            <div class="client-policy-modal-panel client-pmi-detail-modal-panel" role="dialog" aria-modal="true" aria-labelledby="client-pmi-detail-modal-title">
              <div class="client-policy-modal-header">
                <div></div>
                <button class="client-policy-modal-close" type="button" data-pmi-detail-close aria-label="Close protection modeling inputs">×</button>
              </div>
              <h2 id="client-pmi-detail-modal-title">Protection Modeling Inputs</h2>
              <div class="client-policy-modal-body" data-pmi-detail-body></div>
            </div>
          </div>
          <div class="client-activity-widget-modal" data-activity-widget-modal hidden>
            <div class="client-activity-widget-modal-backdrop" data-activity-widget-close></div>
            <form class="client-activity-widget-modal-panel client-activity-widget" data-activity-widget role="dialog" aria-modal="true" aria-labelledby="client-activity-widget-title">
              <div class="client-activity-widget-header">
                <button type="button" class="client-activity-widget-back" data-activity-widget-back>Back</button>
                <button class="client-activity-modal-close" type="button" data-activity-widget-close aria-label="Close activity widget">×</button>
              </div>
              <div class="client-activity-widget-heading">
                <h2 id="client-activity-widget-title" data-activity-widget-title>Activity</h2>
                <p data-activity-widget-copy>Complete the activity details.</p>
              </div>
              <div class="client-activity-widget-body" data-activity-widget-body></div>
              <div class="client-activity-widget-actions">
                <button type="button" class="client-activity-widget-cancel" data-activity-widget-cancel>Cancel</button>
                <button type="submit" class="client-activity-widget-save">Save Activity</button>
              </div>
            </form>
          </div>
        `;
      }

      const record = markRecordViewed(getRecord());

      if (!record) {
        host.innerHTML = `
          <section class="client-detail-card">
            <p class="client-detail-empty">No saved client matched this record id.</p>
          </section>
        `;
        return createViewerMountCleanup();
      }

      const clientWorkspaceSidebarTitle = getClientWorkspaceSidebarTitle(record);
      host.innerHTML = renderProfile(record);

      function saveRecordField(fieldName, nextValue) {
        const records = loadJson(localStorage, getRecordsStorageKey());
        if (!Array.isArray(records)) {
          return;
        }

        const recordIndex = records.findIndex(function (item) {
          return String(item?.id || "").trim() === String(record.id || "").trim();
        });

        if (recordIndex === -1) {
          return;
        }

        const normalizedFieldName = fieldName === "coverageAmount"
          ? "currentCoverage"
          : fieldName === "coverageGap"
            ? "modeledNeed"
            : fieldName;
        const normalizedValue = normalizedFieldName === "currentCoverage" || normalizedFieldName === "modeledNeed"
          ? parseCurrencyNumber(nextValue)
          : nextValue;
        const fieldOverrides = normalizedFieldName === "modeledNeed"
          ? { modeledNeedSource: "custom-amount" }
          : {};
        const nextRecord = synchronizeRecordCoverageFields({
          ...records[recordIndex],
          ...fieldOverrides,
          [normalizedFieldName]: normalizedValue,
          lastUpdatedDate: new Date().toISOString().slice(0, 10)
        });

        records[recordIndex] = nextRecord;
        localStorage.setItem(getRecordsStorageKey(), JSON.stringify(records));
        Object.assign(record, nextRecord);
      }

      function normalizeCurrencyInput(value) {
        const normalized = String(value || "").replace(/[^0-9.]/g, "");
        const firstDot = normalized.indexOf(".");

        if (firstDot === -1) {
          return normalized;
        }

        const integerPart = normalized.slice(0, firstDot + 1);
        const decimalPart = normalized.slice(firstDot + 1).replace(/\./g, "");
        return integerPart + decimalPart;
      }

      function clampStatValue(fieldName, value) {
        const numericValue = Number(String(value || "").replace(/,/g, ""));
        if (!Number.isFinite(numericValue)) {
          return "";
        }

        if (fieldName === "currentCoverage") {
          return String(Math.min(numericValue, 99999999));
        }

        return String(numericValue);
      }

      function formatEditableCurrency(value) {
        const number = Number(String(value || "").replace(/,/g, ""));
        if (!number) {
          return "0";
        }

        return new Intl.NumberFormat("en-US", {
          maximumFractionDigits: 2
        }).format(number);
      }

      function formatCoverageCardCurrency(value) {
        const number = Number(String(value || "").replace(/,/g, ""));
        return new Intl.NumberFormat("en-US", {
          style: "currency",
          currency: "USD",
          maximumFractionDigits: 0
        }).format(Number.isFinite(number) ? number : 0);
      }

      function trimCompactNumber(value) {
        return String(value).replace(/\.0$/, "");
      }

      function formatCompactCoverageCardCurrency(value, ultraCompact) {
        const number = Number(String(value || "").replace(/,/g, ""));
        const safeNumber = Number.isFinite(number) ? number : 0;
        const absoluteValue = Math.abs(safeNumber);
        const sign = safeNumber < 0 ? "-" : "";

        if (absoluteValue >= 1000000) {
          const millions = absoluteValue / 1000000;
          const roundedMillions = millions >= 100
            ? Math.round(millions)
            : Math.round(millions * 10) / 10;
          return `${sign}$${trimCompactNumber(roundedMillions)}M`;
        }

        if (absoluteValue >= 1000) {
          const thousands = absoluteValue / 1000;
          const roundedThousands = thousands >= 100
            ? Math.round(thousands)
            : Math.round(thousands * 10) / 10;
          return `${sign}$${trimCompactNumber(roundedThousands)}k`;
        }

        return formatCoverageCardCurrency(safeNumber);
      }

      const profileNavButtons = document.querySelectorAll("[data-client-nav-tab]");
      const profileNavAnalysisToggle = document.querySelector('[data-client-nav-branch-toggle="analysis"]');
      const profileNavAnalysisPanel = document.querySelector('[data-client-nav-branch-panel="analysis"]');
      const profilePanels = host.querySelectorAll("[data-client-panel]");
      const isContinuousProfileWorkspace = Boolean(host.querySelector("[data-client-profile-workspace]"));
      const profileScrollContainer = host.querySelector("[data-client-profile-scroll-pane]");
      const profileSidebarHost = host.closest("[data-workspace-side-nav-host]");
      const profileSidebarLayout = host.querySelector("[data-client-sidebar-layout]");
      const profileSidebarToggle = document.querySelector("[data-client-side-tabs-toggle]");
      const policyModal = host.querySelector("[data-policy-modal]");
      const policyModalPanel = host.querySelector(".client-policy-detail-modal-panel");
      const policyModalBody = host.querySelector("[data-policy-modal-body]");
      const policyModalTitle = host.querySelector("[data-policy-modal-title]");
      const policyModalBadge = host.querySelector("[data-policy-modal-badge]");
      const policyModalSubtitle = host.querySelector("[data-policy-modal-subtitle]");
      const policyModalMetrics = host.querySelector("[data-policy-modal-metrics]");
      const policyModalStatus = host.querySelector("[data-policy-modal-status]");
      const policyDocumentMenu = host.querySelector("[data-policy-document-menu]");
      const policyDocumentRenameModal = host.querySelector("[data-policy-document-rename-modal]");
      const policyDocumentRenameForm = host.querySelector("[data-policy-document-rename-form]");
      const policyDocumentRenameCopy = host.querySelector("[data-policy-document-rename-copy]");
      const policyDocumentRenameInput = host.querySelector("[data-policy-document-rename-input]");
      const policyDocumentRenameCloseButtons = host.querySelectorAll("[data-policy-document-rename-close]");
      const policyDocumentDeleteModal = host.querySelector("[data-policy-document-delete-modal]");
      const policyDocumentDeleteCopy = host.querySelector("[data-policy-document-delete-copy]");
      const policyDocumentDeleteCloseButtons = host.querySelectorAll("[data-policy-document-delete-close]");
      const policyDocumentDeleteConfirm = host.querySelector("[data-policy-document-delete-confirm]");
      const policyDocumentAddInput = host.querySelector("[data-policy-document-add-input]");
      const policyModalCloseButtons = host.querySelectorAll("[data-policy-modal-close]");
      const policyEditToggle = host.querySelector("[data-policy-edit-toggle]");
      const policyDeleteToggle = host.querySelector("[data-policy-delete-toggle]");
      const policyListModal = host.querySelector("[data-policy-list-modal]");
      const policyListModalBody = host.querySelector("[data-policy-list-modal-body]");
      const policyListModalCloseButtons = host.querySelectorAll("[data-policy-list-modal-close]");
      const premiumTimelineModal = host.querySelector("[data-premium-timeline-modal]");
      const premiumTimelineModalSummary = host.querySelector("[data-premium-timeline-modal-summary]");
      const premiumTimelineModalBody = host.querySelector("[data-premium-timeline-modal-body]");
      const premiumTimelineModalCloseButtons = host.querySelectorAll("[data-premium-timeline-modal-close]");
      const policyDeleteModal = host.querySelector("[data-policy-delete-modal]");
      const policyDeleteModalCloseButtons = host.querySelectorAll("[data-policy-delete-modal-close]");
      const policyDeleteConfirm = host.querySelector("[data-policy-delete-confirm]");
      const coverageWidgetModal = host.querySelector("[data-coverage-widget-modal]");
      const coverageWidget = host.querySelector("[data-coverage-widget]");
      const coverageWidgetBody = host.querySelector("[data-coverage-widget-body]");
      const coverageWidgetTitle = host.querySelector("[data-coverage-widget-title]");
      const coverageWidgetCopy = host.querySelector("[data-coverage-widget-copy]");
      const coverageWidgetProgress = host.querySelector("[data-coverage-widget-progress]");
      const coverageWidgetBack = host.querySelector("[data-coverage-widget-back]");
      const coverageWidgetCancel = host.querySelector("[data-coverage-widget-cancel]");
      const coverageWidgetSave = host.querySelector("[data-coverage-widget-save]");
      const coverageWidgetCloseButtons = host.querySelectorAll("[data-coverage-widget-close]");
      const coverageWidgetFeedback = host.querySelector("[data-coverage-widget-feedback]");
      let coverageStatSyncFrame = 0;
      let coverageStatResizeObserver = null;

      function syncResponsiveCoverageStatDisplays() {
        host.querySelectorAll('[data-stat-display="currentCoverage"], [data-stat-display="modeledNeed"]').forEach(function (display) {
          const rawValue = String(display.dataset.statRawValue || "").trim();
          const fullValue = String(display.dataset.statFullValue || formatCoverageCardCurrency(rawValue)).trim();
          const displayShell = display.closest(".client-detail-stat-display");
          const header = display.closest(".client-detail-stat-header");

          display.textContent = fullValue;
          display.setAttribute("title", fullValue);

          if (!displayShell || !header) {
            return;
          }

          function valueHitsMidpoint() {
            const headerRect = header.getBoundingClientRect();
            const valueRect = display.getBoundingClientRect();

            if (headerRect.width <= 0 || valueRect.width <= 0) {
              return false;
            }

            const dividerX = headerRect.left + (headerRect.width / 2);
            return valueRect.left <= dividerX;
          }

          if (!valueHitsMidpoint()) {
            return;
          }

          display.textContent = formatCompactCoverageCardCurrency(rawValue, false);

          if (!valueHitsMidpoint()) {
            return;
          }

          display.textContent = formatCompactCoverageCardCurrency(rawValue, true);
        });
      }

      function scheduleResponsiveCoverageStatDisplaySync() {
        if (coverageStatSyncFrame) {
          window.cancelAnimationFrame(coverageStatSyncFrame);
        }

        coverageStatSyncFrame = window.requestAnimationFrame(function () {
          coverageStatSyncFrame = 0;
          syncResponsiveCoverageStatDisplays();
        });
      }

      function refreshCoverageStatDisplays() {
        const coverageFields = synchronizeRecordCoverageFields(record);
        const statDisplayMap = [
          {
            fieldName: "currentCoverage",
            value: coverageFields.currentCoverage,
            stateClass: ""
          },
          {
            fieldName: "modeledNeed",
            value: coverageFields.modeledNeed,
            stateClass: coverageFields.uncoveredGap > 0 ? "has-gap" : "is-zero"
          }
        ];

        statDisplayMap.forEach(function (entry) {
          const display = host.querySelector(`[data-stat-display="${entry.fieldName}"]`);
          if (!display) {
            return;
          }

          const fullDisplayValue = formatCoverageCardCurrency(entry.value);
          display.dataset.statRawValue = String(entry.value || 0);
          display.dataset.statFullValue = fullDisplayValue;
          display.textContent = fullDisplayValue;
          const displayShell = display.closest(".client-detail-stat-display");
          if (displayShell) {
            displayShell.classList.toggle("is-zero", entry.stateClass === "is-zero");
            displayShell.classList.toggle("has-gap", entry.stateClass === "has-gap");
          }
        });
      }

      if (typeof window.ResizeObserver === "function") {
        coverageStatResizeObserver = new window.ResizeObserver(function () {
          scheduleResponsiveCoverageStatDisplaySync();
        });

        host.querySelectorAll(".client-profile-stats, .client-detail-stat-card-currentCoverage, .client-detail-stat-card-modeledNeed").forEach(function (node) {
          coverageStatResizeObserver.observe(node);
        });
      }

      const handleProfileSidebarHostTransitionEnd = function () {
        scheduleResponsiveCoverageStatDisplaySync();
      };
      if (profileSidebarHost) {
        profileSidebarHost.addEventListener("transitionend", handleProfileSidebarHostTransitionEnd);
      }

      const handleProfileSidebarLayoutTransitionEnd = function () {
        scheduleResponsiveCoverageStatDisplaySync();
      };
      if (profileSidebarLayout) {
        profileSidebarLayout.addEventListener("transitionend", handleProfileSidebarLayoutTransitionEnd);
      }

      const profileDeleteModal = host.querySelector("[data-profile-delete-modal]");
      const profileDeleteModalCloseButtons = host.querySelectorAll("[data-profile-delete-modal-close]");
      const profileDeleteConfirm = host.querySelector("[data-profile-delete-confirm]");
      const activityDetailModal = host.querySelector("[data-activity-detail-modal]");
      const activityDetailBody = host.querySelector("[data-activity-detail-body]");
      const activityDetailTitle = host.querySelector("[data-activity-detail-title]");
      const activityDeleteModal = host.querySelector("[data-activity-delete-modal]");
      const activityDeleteCloseButtons = host.querySelectorAll("[data-activity-delete-close]");
      const activityDeleteConfirm = host.querySelector("[data-activity-delete-confirm]");
      const pmiDetailModal = host.querySelector("[data-pmi-detail-modal]");
      const pmiDetailModalBody = host.querySelector("[data-pmi-detail-body]");
      const pmiDetailOpen = host.querySelector("[data-pmi-detail-open]");
      const pmiDetailCloseButtons = host.querySelectorAll("[data-pmi-detail-close]");
      const statModal = host.querySelector("[data-stat-modal]");
      const statModalTitle = host.querySelector("[data-stat-modal-title]");
      const statModalLabel = host.querySelector("[data-stat-modal-label]");
      const statModalInput = host.querySelector("[data-stat-modal-input]");
      const statModalCancel = host.querySelector("[data-stat-modal-cancel]");
      const statModalSave = host.querySelector("[data-stat-modal-save]");
      const statModalClose = host.querySelector("[data-stat-modal-close]");
      const activityModalOpens = host.querySelectorAll("[data-activity-log-open]");
      const activityModalCloseButtons = host.querySelectorAll("[data-activity-modal-close]");
      const activityMenu = host.querySelector("[data-activity-menu]");
      const activityWidgetModal = host.querySelector("[data-activity-widget-modal]");
      const activityWidget = host.querySelector("[data-activity-widget]");
      const activityWidgetBody = host.querySelector("[data-activity-widget-body]");
      const activityWidgetTitle = host.querySelector("[data-activity-widget-title]");
      const activityWidgetCopy = host.querySelector("[data-activity-widget-copy]");
      const activityWidgetBack = host.querySelector("[data-activity-widget-back]");
      const activityWidgetCancel = host.querySelector("[data-activity-widget-cancel]");
      const activityWidgetCloseButtons = host.querySelectorAll("[data-activity-widget-close]");
      const activityOptionButtons = host.querySelectorAll("[data-activity-option]");
      const primaryActionPanelHosts = host.querySelectorAll("[data-primary-action-panel-host]");
      const activityOverviewContainers = host.querySelectorAll("[data-activity-overview]");
      const activityPreviewContainers = host.querySelectorAll("[data-activity-preview]");
      const activityLastContactLabels = host.querySelectorAll("[data-activity-last-contact]");
      const caseRefCopyButton = host.querySelector("[data-case-ref-copy]");
      const coverageAdequacyPercent = host.querySelector("[data-coverage-adequacy-percent]");
      const coverageAdequacyFill = host.querySelector("[data-coverage-adequacy-fill]");
      const coverageGapMarker = host.querySelector("[data-coverage-gap-marker]");
      const coverageGapSummary = host.querySelector("[data-coverage-gap-summary]");
      const coverageGapValue = host.querySelector("[data-coverage-gap-value]");
      const incomeGapValue = host.querySelector("[data-income-gap-value]");
      let activeStatField = "";
      let activeStatTitle = "";
      let activePolicyIndex = -1;
      let activeCoveragePolicyIndex = -1;
      let coverageAdequacyAnimationFrame = 0;
      let activeActivityType = "";
      let activeActivityIndex = -1;
      let activeActivityEditMode = false;
      let activeActivityModal = null;
      let activeActivityTrigger = null;
      let activityWidgetSourceTrigger = null;
      let coverageWidgetReturnIndex = -1;
      let activeCoverageStep = 0;
      let activeCoverageDraft = null;
      let activeCoverageDocumentFiles = [];
      let activePolicyDocumentIndex = -1;
      let coverageWidgetFeedbackTimeout = null;
      let coverageWidgetFeedbackFadeTimeout = null;
      let profileNavAnalysisExpanded = false;
      let activeProfileNavKey = "";
      let profileScrollSpyFrame = 0;
      let bannerCoverageSummaryVisible = false;

      function syncModalLock() {
        const anyModalOpen = policyModal?.hidden === false || policyDocumentRenameModal?.hidden === false || policyDocumentDeleteModal?.hidden === false || policyListModal?.hidden === false || premiumTimelineModal?.hidden === false || policyDeleteModal?.hidden === false || coverageWidgetModal?.hidden === false || profileDeleteModal?.hidden === false || activityDetailModal?.hidden === false || activityDeleteModal?.hidden === false || pmiDetailModal?.hidden === false || statModal?.hidden === false || activityWidgetModal?.hidden === false;
        document.body.classList.toggle("is-modal-open", anyModalOpen);
      }

      function openActivityModal(triggerButton) {
        const localTrigger = triggerButton || activeActivityTrigger;
        const localModal = localTrigger?.closest(".client-notes-widget-card")?.querySelector("[data-activity-modal]");
        if (!localTrigger || !localModal) {
          return;
        }
        activeActivityTrigger = localTrigger;
        activeActivityModal = localModal;
        localModal.hidden = false;
        localTrigger.classList.add("is-open");
        window.requestAnimationFrame(function () {
          localModal.classList.add("is-open");
        });
      }

      function closeActivityModal() {
        const modal = activeActivityModal;
        const trigger = activeActivityTrigger;
        if (!modal) {
          return;
        }
        modal.classList.remove("is-open");
        if (trigger) {
          trigger.classList.remove("is-open");
        }
        window.setTimeout(function () {
          if (!modal.classList.contains("is-open")) {
            modal.hidden = true;
            syncModalLock();
          }
        }, 180);
        activeActivityModal = null;
        activeActivityTrigger = null;
      }

      function getActivityDefaultDate() {
        return new Date().toISOString().slice(0, 10);
      }

      function getActivityTypeConfig(type) {
        const configs = {
          note: {
            title: "Add Note",
            copy: "Capture a quick written update for this profile.",
            fields: `
              <label class="client-activity-field">
                <span>Note Title</span>
                <input class="client-activity-input" type="text" name="title" maxlength="120" placeholder="Quarterly review">
              </label>
              <label class="client-activity-field">
                <span>Note</span>
                <textarea class="client-activity-textarea" name="body" rows="5" placeholder="Add the key update or takeaway." required></textarea>
              </label>
            `
          },
          email: {
            title: "Log Email",
            copy: "Record the main details of an email touchpoint.",
            fields: `
              <div class="client-activity-field-grid">
                <label class="client-activity-field">
                  <span>Direction</span>
                  <select class="client-activity-select" name="direction">
                    <option value="Outbound">Outbound</option>
                    <option value="Inbound">Inbound</option>
                  </select>
                </label>
                <label class="client-activity-field">
                  <span>Date</span>
                  <input class="client-activity-input" type="date" name="date" value="${getActivityDefaultDate()}">
                </label>
              </div>
              <label class="client-activity-field">
                <span>Subject</span>
                <input class="client-activity-input" type="text" name="subject" maxlength="140" placeholder="Follow-up on protection review" required>
              </label>
              <label class="client-activity-field">
                <span>Summary</span>
                <textarea class="client-activity-textarea" name="summary" rows="4" placeholder="Brief summary of the email." required></textarea>
              </label>
            `
          },
          phone: {
            title: "Add Phone Call",
            copy: "Track the call details and outcome.",
            fields: `
              <div class="client-activity-field-grid">
                <label class="client-activity-field">
                  <span>Direction</span>
                  <select class="client-activity-select" name="direction">
                    <option value="Outbound">Outbound</option>
                    <option value="Inbound">Inbound</option>
                  </select>
                </label>
                <label class="client-activity-field">
                  <span>Date</span>
                  <input class="client-activity-input" type="date" name="date" value="${getActivityDefaultDate()}">
                </label>
              </div>
              <label class="client-activity-field">
                <span>Outcome</span>
                <input class="client-activity-input" type="text" name="outcome" maxlength="140" placeholder="Left voicemail">
              </label>
              <label class="client-activity-field">
                <span>Call Notes</span>
                <textarea class="client-activity-textarea" name="summary" rows="4" placeholder="Add the call summary." required></textarea>
              </label>
            `
          },
          text: {
            title: "Log Text Message",
            copy: "Track a text message and the client response.",
            fields: `
              <div class="client-activity-field-grid">
                <label class="client-activity-field">
                  <span>Direction</span>
                  <select class="client-activity-select" name="direction">
                    <option value="Outbound">Outbound</option>
                    <option value="Inbound">Inbound</option>
                  </select>
                </label>
                <label class="client-activity-field">
                  <span>Date</span>
                  <input class="client-activity-input" type="date" name="date" value="${getActivityDefaultDate()}">
                </label>
              </div>
              <label class="client-activity-field">
                <span>Subject</span>
                <input class="client-activity-input" type="text" name="subject" maxlength="140" placeholder="Quick premium follow-up">
              </label>
              <label class="client-activity-field">
                <span>Summary</span>
                <textarea class="client-activity-textarea" name="summary" rows="4" placeholder="Add the text message details." required></textarea>
              </label>
            `
          },
          schedule: {
            title: "Schedule Meeting",
            copy: "Set the details for an upcoming meeting touchpoint.",
            fields: `
              <div class="client-activity-field-grid client-activity-field-grid-three">
                <label class="client-activity-field">
                  <span>Date</span>
                  <input class="client-activity-input" type="date" name="date" value="${getActivityDefaultDate()}" required>
                </label>
                <label class="client-activity-field">
                  <span>Time</span>
                  <input class="client-activity-input" type="time" name="time">
                </label>
                <label class="client-activity-field">
                  <span>Meeting Type</span>
                  <select class="client-activity-select" name="meetingType">
                    <option value="Review">Review</option>
                    <option value="Discovery">Discovery</option>
                    <option value="Planning">Planning</option>
                    <option value="Presentation">Presentation</option>
                  </select>
                </label>
              </div>
              <label class="client-activity-field">
                <span>Location</span>
                <input class="client-activity-input" type="text" name="location" maxlength="140" placeholder="Zoom or office">
              </label>
              <label class="client-activity-field">
                <span>Agenda</span>
                <textarea class="client-activity-textarea" name="agenda" rows="4" placeholder="What is this meeting for?" required></textarea>
              </label>
            `
          },
          meeting: {
            title: "Add Meeting",
            copy: "Log a meeting that already happened.",
            fields: `
              <div class="client-activity-field-grid client-activity-field-grid-three">
                <label class="client-activity-field">
                  <span>Date</span>
                  <input class="client-activity-input" type="date" name="date" value="${getActivityDefaultDate()}" required>
                </label>
                <label class="client-activity-field">
                  <span>Time</span>
                  <input class="client-activity-input" type="time" name="time">
                </label>
                <label class="client-activity-field">
                  <span>Meeting Type</span>
                  <select class="client-activity-select" name="meetingType">
                    <option value="Review">Review</option>
                    <option value="Discovery">Discovery</option>
                    <option value="Planning">Planning</option>
                    <option value="Presentation">Presentation</option>
                  </select>
                </label>
              </div>
              <label class="client-activity-field">
                <span>Attendees</span>
                <input class="client-activity-input" type="text" name="attendees" maxlength="180" placeholder="Client and spouse">
              </label>
              <label class="client-activity-field">
                <span>Summary</span>
                <textarea class="client-activity-textarea" name="summary" rows="4" placeholder="Add the meeting outcome." required></textarea>
              </label>
            `
          },
          face: {
            title: "Log Face-to-Face Interaction",
            copy: "Capture an in-person interaction with the client.",
            fields: `
              <div class="client-activity-field-grid client-activity-field-grid-three">
                <label class="client-activity-field">
                  <span>Date</span>
                  <input class="client-activity-input" type="date" name="date" value="${getActivityDefaultDate()}" required>
                </label>
                <label class="client-activity-field">
                  <span>Time</span>
                  <input class="client-activity-input" type="time" name="time">
                </label>
                <label class="client-activity-field">
                  <span>Interaction Type</span>
                  <select class="client-activity-select" name="interactionType">
                    <option value="Office Visit">Office Visit</option>
                    <option value="Home Visit">Home Visit</option>
                    <option value="Event Conversation">Event Conversation</option>
                    <option value="Coffee Meeting">Coffee Meeting</option>
                  </select>
                </label>
              </div>
              <label class="client-activity-field">
                <span>Location</span>
                <input class="client-activity-input" type="text" name="location" maxlength="140" placeholder="Office or event venue">
              </label>
              <label class="client-activity-field">
                <span>Summary</span>
                <textarea class="client-activity-textarea" name="summary" rows="4" placeholder="Add the interaction summary." required></textarea>
              </label>
            `
          },
          "document-received": {
            title: "Log Document Received",
            copy: "Record a received document and what it covered.",
            fields: `
              <div class="client-activity-field-grid">
                <label class="client-activity-field">
                  <span>Date</span>
                  <input class="client-activity-input" type="date" name="date" value="${getActivityDefaultDate()}" required>
                </label>
                <label class="client-activity-field">
                  <span>Document Type</span>
                  <input class="client-activity-input" type="text" name="documentType" maxlength="140" placeholder="APS or income verification">
                </label>
              </div>
              <label class="client-activity-field">
                <span>Summary</span>
                <textarea class="client-activity-textarea" name="summary" rows="4" placeholder="Add what was received." required></textarea>
              </label>
            `
          },
          "illustration-requested": {
            title: "Log Illustration Requested",
            copy: "Track an illustration request and what was needed.",
            fields: `
              <div class="client-activity-field-grid">
                <label class="client-activity-field">
                  <span>Date</span>
                  <input class="client-activity-input" type="date" name="date" value="${getActivityDefaultDate()}" required>
                </label>
                <label class="client-activity-field">
                  <span>Illustration Type</span>
                  <input class="client-activity-input" type="text" name="illustrationType" maxlength="140" placeholder="Term or indexed universal life">
                </label>
              </div>
              <label class="client-activity-field">
                <span>Summary</span>
                <textarea class="client-activity-textarea" name="summary" rows="4" placeholder="Add the request details." required></textarea>
              </label>
            `
          },
          "application-submitted": {
            title: "Log Application Submitted",
            copy: "Record application submission details.",
            fields: `
              <div class="client-activity-field-grid">
                <label class="client-activity-field">
                  <span>Date</span>
                  <input class="client-activity-input" type="date" name="date" value="${getActivityDefaultDate()}" required>
                </label>
                <label class="client-activity-field">
                  <span>Carrier / Product</span>
                  <input class="client-activity-input" type="text" name="carrier" maxlength="140" placeholder="Carrier and product">
                </label>
              </div>
              <label class="client-activity-field">
                <span>Summary</span>
                <textarea class="client-activity-textarea" name="summary" rows="4" placeholder="Add submission details." required></textarea>
              </label>
            `
          },
          "policy-delivered": {
            title: "Log Policy Delivered",
            copy: "Capture policy delivery details and outcome.",
            fields: `
              <div class="client-activity-field-grid">
                <label class="client-activity-field">
                  <span>Date</span>
                  <input class="client-activity-input" type="date" name="date" value="${getActivityDefaultDate()}" required>
                </label>
                <label class="client-activity-field">
                  <span>Carrier / Policy</span>
                  <input class="client-activity-input" type="text" name="carrier" maxlength="140" placeholder="Carrier or policy delivered">
                </label>
              </div>
              <label class="client-activity-field">
                <span>Summary</span>
                <textarea class="client-activity-textarea" name="summary" rows="4" placeholder="Add delivery details." required></textarea>
              </label>
            `
          },
          reminder: {
            title: "Set Reminder",
            copy: "Create a follow-up reminder for this account.",
            fields: `
              <div class="client-activity-field-grid">
                <label class="client-activity-field">
                  <span>Due Date</span>
                  <input class="client-activity-input" type="date" name="date" value="${getActivityDefaultDate()}" required>
                </label>
                <label class="client-activity-field">
                  <span>Category</span>
                  <select class="client-activity-select" name="category">
                    <option value="Follow-Up">Follow-Up</option>
                    <option value="Document Request">Document Request</option>
                    <option value="Meeting Prep">Meeting Prep</option>
                    <option value="Service">Service</option>
                  </select>
                </label>
              </div>
              <label class="client-activity-field">
                <span>Reminder</span>
                <textarea class="client-activity-textarea" name="summary" rows="4" placeholder="Add the reminder details." required></textarea>
              </label>
            `
          }
        };

        return configs[type] || null;
      }

      function resetActivityWidget() {
        activeActivityType = "";
        if (activityWidget) {
          activityWidget.reset();
        }
        if (activityWidgetBody) {
          activityWidgetBody.innerHTML = "";
        }
      }

      function openActivityWidget(type) {
        const config = getActivityTypeConfig(type);
        if (!config || !activityWidgetModal || !activityWidget || !activityWidgetBody || !activityWidgetTitle || !activityWidgetCopy) {
          return;
        }

        activeActivityType = type;
        activityWidgetSourceTrigger = activeActivityTrigger;
        closeActivityModal();
        activityWidgetModal.hidden = false;
        activityWidgetTitle.textContent = config.title;
        activityWidgetCopy.textContent = config.copy;
        activityWidgetBody.innerHTML = config.fields;
        syncModalLock();
        window.requestAnimationFrame(function () {
          activityWidgetModal.classList.add("is-open");
        });
      }

      function closeActivityWidget() {
        if (!activityWidgetModal) {
          return;
        }
        activityWidgetModal.classList.remove("is-open");
        window.setTimeout(function () {
          if (!activityWidgetModal.classList.contains("is-open")) {
            activityWidgetModal.hidden = true;
            resetActivityWidget();
            activityWidgetSourceTrigger = null;
            syncModalLock();
          }
        }, 180);
      }

      function renderCoverageTypeOptions(selectedValue) {
        const selected = String(selectedValue || "").trim();
        return [
          "",
          "Term",
          "Whole Life",
          "Universal Life",
          "Indexed Universal Life",
          "Variable Universal Life",
          "Final Expense",
          "Group Life",
          "Other"
        ].map(function (option) {
          const label = option || "Select policy type";
          return `<option value="${escapeHtml(option)}"${option === selected ? " selected" : ""}>${escapeHtml(label)}</option>`;
        }).join("");
      }

      function renderCoverageModeButtons(selectedValue) {
        const selected = String(selectedValue || "").trim();
        return [
          "Monthly",
          "Quarterly",
          "Semi-Annual",
          "Annual",
          "Single Premium",
          "Flexible Premium",
          "Graded Premium",
          "Modified Premium"
        ].map(function (mode) {
          return `
            <button
              type="button"
              class="coverage-mode-button${mode === selected ? " is-active" : ""}"
              data-coverage-mode="${escapeHtml(mode)}"
            >${escapeHtml(mode)}</button>
          `;
        }).join("");
      }

      function renderUnderwritingClassOptions(selectedValue) {
        const selected = String(selectedValue || "").trim();
        return [
          "",
          "Preferred Plus",
          "Preferred",
          "Standard Plus",
          "Standard",
          "Table Rated",
          "Substandard",
          "Simplified Issue",
          "Guaranteed Issue",
          "Other"
        ].map(function (option) {
          const label = option || "Select underwriting class";
          return `<option value="${escapeHtml(option)}"${option === selected ? " selected" : ""}>${escapeHtml(label)}</option>`;
        }).join("");
      }

      function isCoveragePermanentPolicyType(value) {
        const normalized = String(value || "").trim();
        return [
          "Whole Life",
          "Universal Life",
          "Indexed Universal Life",
          "Variable Universal Life",
          "Final Expense"
        ].includes(normalized);
      }

      const COVERAGE_WIDGET_STEPS = [
        { label: "Basics", title: "Policy Basics" },
        { label: "Terms", title: "Terms & Parties" },
        { label: "Documents", title: "Notes & File" }
      ];

      const COVERAGE_WIDGET_STEP_FIELDS = [
        [
          { name: "premiumMode", focusSelector: "[data-coverage-mode]" },
          { name: "policyCarrier" },
          { name: "policyType" },
          { name: "insuredName" },
          { name: "ownerName" },
          { name: "faceAmount", message: "Enter the face amount before continuing." }
        ],
        [
          { name: "premiumAmount" },
          { name: "termLength" },
          { name: "effectiveDate" },
          { name: "underwritingClass" },
          { name: "beneficiaryName" }
        ],
        [
          { name: "policyNumber" },
          { name: "policyNotes" },
          { name: "policyDocument" }
        ]
      ];

      function normalizePolicyForClientDetailStorage(policy, existingPolicy, shapeSourcePolicy) {
        const source = policy && typeof policy === "object" ? policy : {};
        const base = existingPolicy && typeof existingPolicy === "object" ? existingPolicy : {};
        const shapeSource = shapeSourcePolicy && typeof shapeSourcePolicy === "object" ? shapeSourcePolicy : source;
        const normalized = typeof coveragePolicyUtils.normalizeCoveragePolicyRecord === "function"
          ? coveragePolicyUtils.normalizeCoveragePolicyRecord({
              ...base,
              ...source
            })
          : {
              ...base,
              ...source
            };
        const documents = getPolicyDocumentEntries(normalized);
        const firstDocument = documents[0] || null;
        const nextPolicy = {
          ...base,
          id: String(normalized.id || base.id || source.id || `policy-${Date.now()}`).trim(),
          savedAt: String(normalized.savedAt || base.savedAt || source.savedAt || new Date().toISOString().slice(0, 10)).trim(),
          policyCarrier: String(normalized.policyCarrier || "").trim(),
          policyType: String(normalized.policyType || "").trim(),
          insuredName: String(normalized.insuredName || "").trim(),
          ownerName: String(normalized.ownerName || "").trim(),
          faceAmount: normalizeCoverageCurrencyValue(normalized.faceAmount),
          startingPremium: normalizeCoverageCurrencyValue(normalized.startingPremium),
          premiumAmount: normalizeCoverageCurrencyValue(normalized.premiumAmount),
          premiumMode: String(normalized.premiumMode || "").trim(),
          premiumScheduleYears: String(normalized.premiumScheduleYears || "").trim(),
          premiumScheduleMonths: String(normalized.premiumScheduleMonths || "").trim(),
          premiumScheduleDuration: String(normalized.premiumScheduleDuration || "").trim(),
          termLength: String(normalized.termLength || "").trim(),
          policyNumber: String(normalized.policyNumber || "").trim(),
          effectiveDate: String(normalized.effectiveDate || "").trim(),
          underwritingClass: String(normalized.underwritingClass || "").trim(),
          beneficiaryName: String(normalized.beneficiaryName || "").trim(),
          policyNotes: String(normalized.policyNotes || "").trim(),
          documents,
          documentName: String(firstDocument?.name || "").trim(),
          documentType: String(firstDocument?.type || "").trim(),
          documentSize: Number(firstDocument?.size || 0),
          documentSavedAt: String(firstDocument?.savedAt || "").trim()
        };

        if (Object.prototype.hasOwnProperty.call(base, "entryMode") || Object.prototype.hasOwnProperty.call(shapeSource, "entryMode")) {
          nextPolicy.entryMode = String(normalized.entryMode || base.entryMode || shapeSource.entryMode || "").trim();
        }

        if (Object.prototype.hasOwnProperty.call(base, "coverageSource") || Object.prototype.hasOwnProperty.call(shapeSource, "coverageSource")) {
          nextPolicy.coverageSource = String(normalized.coverageSource || base.coverageSource || shapeSource.coverageSource || "").trim();
        }

        return nextPolicy;
      }

      function buildFullCoverageStoragePolicy(input, existingPolicy) {
        const source = input && typeof input === "object" ? input : {};
        if (typeof coveragePolicyUtils.buildFullCoveragePolicy === "function") {
          return normalizePolicyForClientDetailStorage(
            coveragePolicyUtils.buildFullCoveragePolicy(source, existingPolicy),
            existingPolicy,
            source
          );
        }

        return normalizePolicyForClientDetailStorage(source, existingPolicy, source);
      }

      function buildCoverageWidgetDraft(policy) {
        const currentPolicy = policy || {};
        const premiumSchedule = getCoveragePremiumScheduleParts(currentPolicy);
        const policyType = String(currentPolicy.policyType || "").trim();
        const savedTermLength = String(currentPolicy.termLength || "").trim();
        const documents = getPolicyDocumentEntries(currentPolicy);
        return {
          policyCarrier: String(currentPolicy.policyCarrier || "").trim(),
          policyType,
          insuredName: String(currentPolicy.insuredName || "").trim(),
          ownerName: String(currentPolicy.ownerName || "").trim(),
          faceAmount: normalizeCoverageCurrencyValue(currentPolicy.faceAmount),
          startingPremium: normalizeCoverageCurrencyValue(currentPolicy.startingPremium),
          premiumAmount: normalizeCoverageCurrencyValue(currentPolicy.premiumAmount),
          premiumMode: String(currentPolicy.premiumMode || "").trim(),
          premiumScheduleYears: premiumSchedule.years,
          premiumScheduleMonths: premiumSchedule.months,
          premiumScheduleDuration: premiumSchedule.combined,
          termLength: isCoveragePermanentPolicyType(policyType) ? "Permanent Coverage" : savedTermLength,
          policyNumber: String(currentPolicy.policyNumber || "").trim(),
          effectiveDate: String(currentPolicy.effectiveDate || "").trim(),
          underwritingClass: String(currentPolicy.underwritingClass || "").trim(),
          beneficiaryName: String(currentPolicy.beneficiaryName || "").trim(),
          policyNotes: String(currentPolicy.policyNotes || "").trim(),
          documents,
          documentName: String(documents[0]?.name || currentPolicy.documentName || "").trim(),
          documentType: String(documents[0]?.type || currentPolicy.documentType || "").trim(),
          documentSize: Number(documents[0]?.size || currentPolicy.documentSize || 0),
          documentSavedAt: String(documents[0]?.savedAt || currentPolicy.documentSavedAt || "").trim()
        };
      }

      function getCoverageInsuredNameSuggestion() {
        const householdPrimary = getPrimaryLinkedClientForHousehold(record);
        const fallbackName = [
          String(record.preferredName || record.firstName || "").trim(),
          String(record.lastName || "").trim()
        ].filter(Boolean).join(" ");
        const rawSuggestion = String(
          householdPrimary?.displayName
          || record.displayName
          || fallbackName
          || ""
        ).replace(/\s+Household$/i, "").trim();
        return rawSuggestion ? formatTitleCaseValue(rawSuggestion) : "";
      }

      function renderCoverageInsuredGhostMarkup(currentValue) {
        const suggestion = getCoverageInsuredNameSuggestion();
        const typedValue = String(currentValue || "");
        if (!suggestion) {
          return "";
        }

        const normalizedSuggestion = suggestion.toLowerCase();
        const normalizedTyped = typedValue.toLowerCase();
        if (typedValue && !normalizedSuggestion.startsWith(normalizedTyped)) {
          return "";
        }

        if (typedValue.length >= suggestion.length) {
          return "";
        }

        return `${typedValue ? `<span class="client-coverage-suggest-match">${escapeHtml(suggestion.slice(0, typedValue.length))}</span>` : ""}<span>${escapeHtml(suggestion.slice(typedValue.length))}</span>`;
      }

      function refreshCoverageInsuredSuggestion() {
        if (!coverageWidget) {
          return;
        }

        const insuredInput = coverageWidget.querySelector("[data-coverage-insured-input]");
        const insuredGhost = coverageWidget.querySelector("[data-coverage-insured-ghost]");
        if (!(insuredInput instanceof HTMLInputElement) || !insuredGhost) {
          return;
        }

        const ghostMarkup = renderCoverageInsuredGhostMarkup(insuredInput.value);
        insuredGhost.innerHTML = ghostMarkup;
        insuredGhost.classList.toggle("is-hidden", !ghostMarkup);
      }

      function syncCoveragePremiumScheduleDraft() {
        if (!activeCoverageDraft) {
          return;
        }

        const yearsInput = coverageWidget?.querySelector('input[name="premiumScheduleYears"]');
        const monthsInput = coverageWidget?.querySelector('input[name="premiumScheduleMonths"]');
        const durationInput = coverageWidget?.querySelector('input[name="premiumScheduleDuration"]');

        const rawYears = String(
          yearsInput instanceof HTMLInputElement ? yearsInput.value : activeCoverageDraft.premiumScheduleYears || ""
        ).replace(/\D/g, "");
        const rawMonths = String(
          monthsInput instanceof HTMLInputElement ? monthsInput.value : activeCoverageDraft.premiumScheduleMonths || ""
        ).replace(/\D/g, "");

        const years = Math.max(0, Math.round(Number(rawYears || 0)));
        const months = Math.min(11, Math.max(0, Math.round(Number(rawMonths || 0))));
        const nextYears = rawYears === "" && !years ? "" : String(years);
        const nextMonths = rawMonths === "" && !months ? "" : String(months);
        const combined = !years && !months
          ? ""
          : (years + (months / 12)).toFixed(2).replace(/\.00$/, "");

        activeCoverageDraft.premiumScheduleYears = nextYears;
        activeCoverageDraft.premiumScheduleMonths = nextMonths;
        activeCoverageDraft.premiumScheduleDuration = combined;

        if (yearsInput instanceof HTMLInputElement) {
          yearsInput.value = nextYears;
        }
        if (monthsInput instanceof HTMLInputElement) {
          monthsInput.value = nextMonths;
        }
        if (durationInput instanceof HTMLInputElement) {
          durationInput.value = combined;
        }
      }

      function syncCoverageTermLengthForPolicyType(nextPolicyType) {
        if (!activeCoverageDraft) {
          return;
        }

        const normalizedPolicyType = String(nextPolicyType || "").trim();
        const nextTermLength = isCoveragePermanentPolicyType(normalizedPolicyType)
          ? "Permanent Coverage"
          : (String(activeCoverageDraft.termLength || "").trim() === "Permanent Coverage"
            ? ""
            : String(activeCoverageDraft.termLength || "").trim());

        activeCoverageDraft.termLength = nextTermLength;

        const termLengthField = coverageWidget?.querySelector('input[name="termLength"]');
        if (termLengthField instanceof HTMLInputElement) {
          termLengthField.value = nextTermLength;
        }
      }

      function acceptCoverageInsuredSuggestion() {
        if (!coverageWidget) {
          return false;
        }

        const insuredInput = coverageWidget.querySelector("[data-coverage-insured-input]");
        if (!(insuredInput instanceof HTMLInputElement)) {
          return false;
        }

        const suggestion = getCoverageInsuredNameSuggestion();
        const ghostMarkup = renderCoverageInsuredGhostMarkup(insuredInput.value);
        if (!suggestion || !ghostMarkup) {
          return false;
        }

        insuredInput.value = suggestion;
        syncCoverageDraftFromField(insuredInput);
        refreshCoverageInsuredSuggestion();
        refreshCoverageWidgetProgress();
        return true;
      }

      function renderCoverageWidgetStepTrack() {
        const stepCount = COVERAGE_WIDGET_STEPS.length;
        const ratio = stepCount > 1 ? activeCoverageStep / (stepCount - 1) : 0;

        return `
          <div class="step-track client-coverage-step-track" style="--step-count:${stepCount};--progress-ratio:${ratio.toFixed(4)};">
            ${COVERAGE_WIDGET_STEPS.map(function (step, index) {
              let stateClass = "";
              if (index < activeCoverageStep) {
                stateClass = "is-complete";
              } else if (index === activeCoverageStep) {
                stateClass = "is-current";
              }

              return `
                <button
                  type="button"
                  class="step-item client-coverage-step-item ${stateClass}"
                  data-coverage-step-target="${index}"
                  aria-current="${index === activeCoverageStep ? "step" : "false"}"
                >
                  <span class="step-number">${index + 1}</span>
                  <span class="step-title">${escapeHtml(step.label)}</span>
                </button>
              `;
            }).join("")}
          </div>
        `;
      }

      function renderCoverageWidgetFields(policy) {
        const currentPolicy = policy || {};
        const selectedPremiumMode = String(currentPolicy.premiumMode || "").trim();
        const selectedPolicyType = String(currentPolicy.policyType || "").trim();
        const termPolicyType = selectedPolicyType === "Term";
        const permanentPolicyType = isCoveragePermanentPolicyType(selectedPolicyType);
        const steppedPremiumMode = isCoverageSteppedPremiumMode(selectedPremiumMode);
        const premiumSchedule = getCoveragePremiumScheduleParts(currentPolicy);
        const premiumAmountDisabled = !selectedPremiumMode;
        const savedDocuments = getPolicyDocumentEntries(currentPolicy);
        const latestSavedDocument = savedDocuments[0] || null;
        const documentName = String(latestSavedDocument?.name || "").trim();
        const documentSize = formatFileSize(latestSavedDocument?.size || 0);
        const currentStep = COVERAGE_WIDGET_STEPS[activeCoverageStep] || COVERAGE_WIDGET_STEPS[0];
        const renderedTermLength = permanentPolicyType
          ? "Permanent Coverage"
          : String(currentPolicy.termLength || "");
        const existingDocumentMeta = documentName
          ? (savedDocuments.length > 1
            ? `${savedDocuments.length} files attached`
            : (documentSize ? `${escapeHtml(documentSize)} saved` : "Saved policy document"))
          : "";
        const sharedPremiumModeField = `
          <label class="client-activity-field client-coverage-widget-field-full">
            <span>Premium Mode</span>
            <input type="hidden" name="premiumMode" value="${escapeHtml(selectedPremiumMode)}">
            <div class="coverage-mode-shell" data-coverage-mode-shell>
              <div class="coverage-mode-buttons" role="group" aria-label="Premium Mode">
                ${renderCoverageModeButtons(selectedPremiumMode)}
              </div>
            </div>
          </label>
        `;

        let stepFields = "";

        if (activeCoverageStep === 0) {
          stepFields = `
            ${sharedPremiumModeField}
            <label class="client-activity-field">
              <span>Policy Carrier</span>
              <input class="client-activity-input" type="text" name="policyCarrier" value="${escapeHtml(String(currentPolicy.policyCarrier || ""))}" maxlength="140" required>
            </label>
            <label class="client-activity-field">
              <span>Policy Type</span>
              <select class="client-activity-select" name="policyType" required>
                ${renderCoverageTypeOptions(currentPolicy.policyType)}
              </select>
            </label>
            <label class="client-activity-field">
              <span>Insured Name</span>
              <div class="client-coverage-suggest-shell">
                <div class="client-coverage-suggest-ghost${renderCoverageInsuredGhostMarkup(currentPolicy.insuredName) ? "" : " is-hidden"}" data-coverage-insured-ghost aria-hidden="true">${renderCoverageInsuredGhostMarkup(currentPolicy.insuredName)}</div>
                <input class="client-activity-input client-coverage-suggest-input" type="text" name="insuredName" value="${escapeHtml(String(currentPolicy.insuredName || ""))}" maxlength="160" required data-coverage-insured-input>
              </div>
            </label>
            <label class="client-activity-field">
              <span>Policy Owner</span>
              <input class="client-activity-input" type="text" name="ownerName" value="${escapeHtml(String(currentPolicy.ownerName || ""))}" maxlength="160" required>
            </label>
            <label class="client-activity-field client-coverage-widget-field-full">
              <span>Face Amount</span>
              <input class="client-activity-input" type="text" name="faceAmount" value="${escapeHtml(formatCoverageCurrencyInput(currentPolicy.faceAmount))}" inputmode="decimal" required>
            </label>
          `;
        } else if (activeCoverageStep === 1) {
          stepFields = `
            <label class="client-activity-field">
              <span>Premium Mode</span>
              <input class="client-activity-input client-coverage-readonly-input" type="text" value="${escapeHtml(selectedPremiumMode || "Not selected")}" readonly tabindex="-1" aria-readonly="true">
            </label>
            <label class="client-activity-field${premiumAmountDisabled ? " is-disabled" : ""}" data-premium-amount-group>
              <span>${escapeHtml(getCoveragePremiumAmountLabel(selectedPremiumMode))}</span>
              <input class="client-activity-input" type="text" name="premiumAmount" value="${escapeHtml(formatCoverageCurrencyInput(currentPolicy.premiumAmount))}" inputmode="decimal"${premiumAmountDisabled ? " disabled" : ""}>
            </label>
            ${steppedPremiumMode ? `
              <label class="client-activity-field">
                <span>Starting Premium (Optional)</span>
                <input class="client-activity-input" type="text" name="startingPremium" value="${escapeHtml(formatCoverageCurrencyInput(currentPolicy.startingPremium))}" inputmode="decimal" placeholder="Optional">
              </label>
            ` : ""}
            ${steppedPremiumMode ? `
              <div class="client-activity-field client-coverage-duration-group">
                <span>Time to Final Premium (Optional)</span>
                <div class="client-coverage-duration-row">
                  <div class="client-coverage-inline-duration">
                    <div class="client-coverage-inline-unit-field">
                      <input class="client-activity-input client-coverage-inline-unit-input" type="text" name="premiumScheduleYears" value="${escapeHtml(premiumSchedule.years)}" inputmode="numeric" maxlength="3" placeholder="0">
                      <span class="client-coverage-inline-unit">Years</span>
                    </div>
                    <div class="client-coverage-inline-unit-field">
                      <input class="client-activity-input client-coverage-inline-unit-input" type="text" name="premiumScheduleMonths" value="${escapeHtml(premiumSchedule.months)}" inputmode="numeric" maxlength="2" placeholder="0">
                      <span class="client-coverage-inline-unit">Months</span>
                    </div>
                    <input type="hidden" name="premiumScheduleDuration" value="${escapeHtml(premiumSchedule.combined)}">
                  </div>
                </div>
              </div>
            ` : ""}
            ${termPolicyType ? `
              <label class="client-activity-field">
                <span>Term Length</span>
                <div class="client-coverage-duration-row">
                  <div class="client-coverage-inline-unit-field">
                    <input class="client-activity-input client-coverage-inline-unit-input" type="text" name="termLength" value="${escapeHtml(renderedTermLength)}" inputmode="numeric" maxlength="3" placeholder="0">
                    <span class="client-coverage-inline-unit">Years</span>
                  </div>
                </div>
              </label>
            ` : `
              <label class="client-activity-field">
                <span>Term Length</span>
                <input
                  class="client-activity-input${permanentPolicyType ? " client-coverage-readonly-input" : ""}"
                  type="text"
                  name="termLength"
                  value="${escapeHtml(renderedTermLength)}"
                  ${permanentPolicyType ? 'readonly tabindex="-1" aria-readonly="true"' : 'inputmode="numeric"'}
                >
              </label>
            `}
            <label class="client-activity-field">
              <span>Effective Date</span>
              <input class="client-activity-input" type="date" name="effectiveDate" value="${escapeHtml(String(currentPolicy.effectiveDate || ""))}">
            </label>
            <label class="client-activity-field">
              <span>Underwriting Class</span>
              <select class="client-activity-select" name="underwritingClass">
                ${renderUnderwritingClassOptions(currentPolicy.underwritingClass)}
              </select>
            </label>
            <label class="client-activity-field">
              <span>Primary Beneficiary</span>
              <input class="client-activity-input" type="text" name="beneficiaryName" value="${escapeHtml(String(currentPolicy.beneficiaryName || ""))}" maxlength="160">
            </label>
          `;
        } else {
          stepFields = `
            <label class="client-activity-field">
              <span>Policy Number</span>
              <input class="client-activity-input" type="text" name="policyNumber" value="${escapeHtml(String(currentPolicy.policyNumber || ""))}" maxlength="120">
            </label>
            <label class="client-activity-field client-coverage-widget-field-full">
              <span>Policy Notes</span>
              <textarea class="client-activity-textarea" name="policyNotes" rows="4" placeholder="Add any policy notes.">${escapeHtml(String(currentPolicy.policyNotes || ""))}</textarea>
            </label>
            <label class="client-activity-field client-coverage-widget-field-full">
              <span>Policy File</span>
              <div class="client-coverage-document-shell">
                ${documentName ? `
                  <div class="client-coverage-document-current" data-coverage-document-current>
                    <strong data-coverage-document-title>${escapeHtml(savedDocuments.length > 1 ? `${savedDocuments.length} files attached` : documentName)}</strong>
                    <span data-coverage-document-meta>${existingDocumentMeta}</span>
                  </div>
                ` : `
                  <div class="client-coverage-document-current is-empty" data-coverage-document-current>
                    <strong data-coverage-document-title>No policy files uploaded yet.</strong>
                    <span data-coverage-document-meta>Add one or more policy files to keep them with this coverage record.</span>
                  </div>
                `}
                <input
                  class="client-activity-input client-coverage-document-input"
                  type="file"
                  name="policyDocument"
                  accept=".pdf,.zip,.png,.jpg,.jpeg,.doc,.docx,.heic,.webp"
                  multiple
                >
                <p class="client-coverage-document-help">${documentName ? "Choose one or more files to add to this policy record." : "PDF, ZIP, image, or Word document supported. You can upload multiple files."}</p>
              </div>
            </label>
          `;
        }

        return `
          <div class="client-coverage-widget-step-shell" data-coverage-step-shell>
            <div class="client-coverage-widget-step-copy">
              <span>Step ${activeCoverageStep + 1} of ${COVERAGE_WIDGET_STEPS.length}</span>
              <h3>${escapeHtml(currentStep.title)}</h3>
            </div>
            <div class="client-coverage-widget-grid">
              ${stepFields}
            </div>
          </div>
        `;
      }

      function resetCoverageWidget() {
        activeCoverageStep = 0;
        activeCoverageDraft = null;
        activeCoverageDocumentFiles = [];
        activeCoveragePolicyIndex = -1;
        coverageWidgetReturnIndex = -1;
        if (coverageWidget) {
          coverageWidget.reset();
        }
        if (coverageWidgetProgress) {
          coverageWidgetProgress.innerHTML = "";
        }
        if (coverageWidgetBody) {
          coverageWidgetBody.innerHTML = "";
        }
        clearCoverageWidgetFeedback({ instant: true });
        if (coverageWidgetBack) {
          coverageWidgetBack.hidden = true;
        }
        if (coverageWidgetSave) {
          coverageWidgetSave.textContent = "Save Policy";
        }
      }

      function setCoverageWidgetPremiumMode(nextValue) {
        if (!coverageWidget) {
          return;
        }

        const normalized = String(nextValue || "").trim();
        const steppedPremiumMode = isCoverageSteppedPremiumMode(normalized);
        const premiumModeField = coverageWidget.querySelector('input[name="premiumMode"]');
        const premiumModeButtons = coverageWidget.querySelectorAll("[data-coverage-mode]");
        const premiumAmountField = coverageWidget.querySelector('input[name="premiumAmount"]');
        const premiumAmountGroup = coverageWidget.querySelector("[data-premium-amount-group]");

        if (premiumModeField) {
          premiumModeField.value = normalized;
        }

        if (activeCoverageDraft) {
          activeCoverageDraft.premiumMode = normalized;
          if (!steppedPremiumMode) {
            activeCoverageDraft.startingPremium = "";
            activeCoverageDraft.premiumScheduleYears = "";
            activeCoverageDraft.premiumScheduleMonths = "";
            activeCoverageDraft.premiumScheduleDuration = "";
          }
        }

        if (premiumAmountField) {
          premiumAmountField.disabled = !normalized;
          premiumAmountGroup?.classList.toggle("is-disabled", !normalized);
          if (!normalized) {
            premiumAmountField.value = "";
            if (activeCoverageDraft) {
              activeCoverageDraft.premiumAmount = "";
            }
          }
        }

        premiumModeButtons.forEach(function (button) {
          button.classList.toggle("is-active", String(button.getAttribute("data-coverage-mode") || "").trim() === normalized);
        });
      }

      function refreshCoverageWidgetActions() {
        if (coverageWidgetBack) {
          coverageWidgetBack.hidden = activeCoverageStep === 0;
          coverageWidgetBack.textContent = "Back";
        }

        if (coverageWidgetSave) {
          const finalStepIndex = COVERAGE_WIDGET_STEPS.length - 1;
          coverageWidgetSave.textContent = activeCoverageStep >= finalStepIndex ? "Save Policy" : "Next";
        }
      }

      function renderCoverageWidgetStep() {
        if (!coverageWidgetBody || !coverageWidgetProgress || !activeCoverageDraft) {
          return;
        }

        syncCoverageTermLengthForPolicyType(activeCoverageDraft.policyType);
        coverageWidgetProgress.innerHTML = renderCoverageWidgetStepTrack();
        coverageWidgetBody.innerHTML = renderCoverageWidgetFields(activeCoverageDraft);
        setCoverageWidgetPremiumMode(String(activeCoverageDraft.premiumMode || "").trim());
        refreshCoverageWidgetDocumentPreview();
        refreshCoverageInsuredSuggestion();
        refreshCoverageWidgetProgress();
        refreshCoverageWidgetActions();
      }

      function goToCoverageWidgetStep(nextStep, options) {
        const safeStep = Math.max(0, Math.min(COVERAGE_WIDGET_STEPS.length - 1, Number(nextStep) || 0));
        activeCoverageStep = safeStep;
        renderCoverageWidgetStep();

        if (options?.clearFeedback !== false) {
          clearCoverageWidgetFeedback({ instant: true });
        }
      }

      function syncCoverageDraftFromField(field) {
        if (!activeCoverageDraft || !field) {
          return;
        }

        const fieldName = String(field.name || "").trim();
        if (!fieldName) {
          return;
        }

        if (field instanceof HTMLInputElement && field.type === "file") {
          const nextFiles = Array.from(field.files || []).filter(Boolean);
          if (nextFiles.length) {
            activeCoverageDocumentFiles = nextFiles;
          }
          return;
        }

        let nextValue = String(field.value || "");
        if (field instanceof HTMLInputElement && field.inputMode === "decimal") {
          nextValue = normalizeCoverageCurrencyValue(nextValue);
        }

        if (field instanceof HTMLInputElement && field.inputMode === "numeric") {
          nextValue = nextValue.replace(/\D/g, "");
        }

        activeCoverageDraft[fieldName] = nextValue;
        if (fieldName === "policyType") {
          syncCoverageTermLengthForPolicyType(nextValue);
        }
        if (fieldName === "premiumScheduleYears" || fieldName === "premiumScheduleMonths") {
          syncCoveragePremiumScheduleDraft();
        }
      }

      function syncCoverageDraftFromForm() {
        if (!coverageWidget) {
          return;
        }

        coverageWidget.querySelectorAll("input[name], select[name], textarea[name]").forEach(function (field) {
          if (field instanceof HTMLInputElement || field instanceof HTMLSelectElement || field instanceof HTMLTextAreaElement) {
            syncCoverageDraftFromField(field);
          }
        });
      }

      function isCoverageStepFieldComplete(fieldName) {
        if (!activeCoverageDraft) {
          return false;
        }

        if (fieldName === "policyDocument") {
          return activeCoverageDocumentFiles.length > 0 || getPolicyDocumentEntries(activeCoverageDraft).length > 0;
        }

        return Boolean(String(activeCoverageDraft[fieldName] || "").trim());
      }

      function getCoverageStepCompletion(stepIndex) {
        const stepFields = Array.isArray(COVERAGE_WIDGET_STEP_FIELDS[stepIndex]) ? COVERAGE_WIDGET_STEP_FIELDS[stepIndex] : [];
        if (!stepFields.length) {
          return 0;
        }

        const completedCount = stepFields.filter(function (field) {
          return isCoverageStepFieldComplete(field.name);
        }).length;

        return completedCount / stepFields.length;
      }

      function refreshCoverageWidgetDocumentPreview() {
        if (!coverageWidget) {
          return;
        }

        const currentShell = coverageWidget.querySelector("[data-coverage-document-current]");
        const title = currentShell?.querySelector("[data-coverage-document-title]");
        const meta = currentShell?.querySelector("[data-coverage-document-meta]");
        const fileInput = coverageWidget.querySelector('input[name="policyDocument"]');
        const selectedFiles = activeCoverageDocumentFiles.length
          ? activeCoverageDocumentFiles
          : Array.from(fileInput?.files || []).filter(Boolean);
        const savedDocuments = getPolicyDocumentEntries(activeCoverageDraft);

        if (!currentShell || !title || !meta) {
          return;
        }

        if (selectedFiles.length) {
          const totalSize = selectedFiles.reduce(function (sum, file) {
            return sum + Number(file?.size || 0);
          }, 0);
          currentShell.classList.remove("is-empty");
          title.textContent = selectedFiles.length === 1
            ? (String(selectedFiles[0]?.name || "").trim() || "Selected policy file")
            : `${selectedFiles.length} files selected`;
          meta.textContent = `${formatFileSize(totalSize)} ready to save`;
          return;
        }

        if (savedDocuments.length) {
          const totalSavedSize = savedDocuments.reduce(function (sum, file) {
            return sum + Number(file?.size || 0);
          }, 0);
          currentShell.classList.remove("is-empty");
          title.textContent = savedDocuments.length === 1
            ? savedDocuments[0].name
            : `${savedDocuments.length} files attached`;
          meta.textContent = totalSavedSize
            ? `${formatFileSize(totalSavedSize)} saved`
            : "Saved policy documents";
          return;
        }

        currentShell.classList.add("is-empty");
        title.textContent = "No policy files uploaded yet.";
        meta.textContent = "Add one or more policy files to keep them with this coverage record.";
      }

      function getCoverageDraftValidationError(stepIndex) {
        if (!activeCoverageDraft) {
          return null;
        }

        const stepsToCheck = typeof stepIndex === "number"
          ? [stepIndex]
          : COVERAGE_WIDGET_STEP_FIELDS.map(function (_, index) { return index; });

        for (const currentStepIndex of stepsToCheck) {
          const requiredFields = Array.isArray(COVERAGE_WIDGET_STEP_FIELDS[currentStepIndex])
            ? COVERAGE_WIDGET_STEP_FIELDS[currentStepIndex]
            : [];

          const missingField = requiredFields.find(function (field) {
            return field.message && !isCoverageStepFieldComplete(field.name);
          });

          if (missingField) {
            return {
              fieldName: missingField.name,
              focusSelector: missingField.focusSelector || `[name="${missingField.name}"]`,
              stepIndex: currentStepIndex,
              message: missingField.message
            };
          }
        }

        return null;
      }

      function getCoverageWidgetValidationMessage(validationError) {
        if (!validationError) {
          return "";
        }

        return validationError.message || "Complete the required field before continuing.";
      }

      function clearCoverageWidgetFeedback(options) {
        if (coverageWidgetFeedbackTimeout) {
          window.clearTimeout(coverageWidgetFeedbackTimeout);
          coverageWidgetFeedbackTimeout = null;
        }

        if (coverageWidgetFeedbackFadeTimeout) {
          window.clearTimeout(coverageWidgetFeedbackFadeTimeout);
          coverageWidgetFeedbackFadeTimeout = null;
        }

        if (!coverageWidgetFeedback) {
          return;
        }

        if (options?.instant) {
          coverageWidgetFeedback.classList.remove("is-visible");
          coverageWidgetFeedback.textContent = "";
          return;
        }

        coverageWidgetFeedback.classList.remove("is-visible");
        coverageWidgetFeedbackFadeTimeout = window.setTimeout(function () {
          if (!coverageWidgetFeedback?.classList.contains("is-visible")) {
            coverageWidgetFeedback.textContent = "";
          }
          coverageWidgetFeedbackFadeTimeout = null;
        }, 260);
      }

      function showCoverageWidgetFeedback(message) {
        const normalizedMessage = String(message || "").trim();
        if (!normalizedMessage) {
          clearCoverageWidgetFeedback({ instant: true });
          return;
        }

        clearCoverageWidgetFeedback({ instant: true });
        if (!coverageWidgetFeedback) {
          return;
        }

        coverageWidgetFeedback.textContent = normalizedMessage;
        window.requestAnimationFrame(function () {
          coverageWidgetFeedback?.classList.add("is-visible");
        });

        coverageWidgetFeedbackTimeout = window.setTimeout(function () {
          clearCoverageWidgetFeedback();
          coverageWidgetFeedbackTimeout = null;
        }, 10000);
      }

      function refreshCoverageWidgetProgress() {
        if (!coverageWidgetProgress) {
          return;
        }

        const track = coverageWidgetProgress.querySelector(".step-track");
        if (!track) {
          return;
        }

        const segmentCount = Math.max(COVERAGE_WIDGET_STEPS.length - 1, 1);
        const completionWithinStep = activeCoverageStep < segmentCount
          ? getCoverageStepCompletion(activeCoverageStep)
          : 1;
        const ratio = Math.min(
          1,
          (Math.max(0, activeCoverageStep) + Math.max(0, Math.min(completionWithinStep, 1))) / segmentCount
        );
        track.style.setProperty("--progress-ratio", ratio.toFixed(4));
      }

      function openCoverageWidget(policyIndex, returnToPolicyModal) {
        const policies = getCoveragePolicies();
        const safePolicyIndex = Number.isInteger(policyIndex) ? policyIndex : -1;
        const currentPolicy = safePolicyIndex >= 0 ? policies[safePolicyIndex] : null;

        if (!coverageWidgetModal || !coverageWidget || !coverageWidgetBody || !coverageWidgetTitle || !coverageWidgetCopy) {
          return;
        }

        activeCoveragePolicyIndex = currentPolicy ? safePolicyIndex : -1;
        coverageWidgetReturnIndex = returnToPolicyModal && currentPolicy ? safePolicyIndex : -1;
        activeCoverageStep = 0;
        activeCoverageDraft = buildCoverageWidgetDraft(currentPolicy);
        activeCoverageDocumentFiles = [];

        clearCoverageWidgetFeedback({ instant: true });

        if (returnToPolicyModal && currentPolicy) {
          closePolicyModal();
        }

        coverageWidgetTitle.textContent = currentPolicy ? "Edit Coverage" : "Add Coverage";
        coverageWidgetCopy.textContent = currentPolicy
          ? "Update the policy details and save them back to this profile."
          : "Save a new policy directly to this profile.";
        renderCoverageWidgetStep();
        coverageWidgetModal.hidden = false;
        syncModalLock();
        window.requestAnimationFrame(function () {
          coverageWidgetModal.classList.add("is-open");
        });
      }

      function closeCoverageWidget(options) {
        if (!coverageWidgetModal || coverageWidgetModal.hidden) {
          return;
        }

        const shouldReopenPolicy = Boolean(options?.reopenPolicy) && coverageWidgetReturnIndex >= 0;
        const reopenIndex = shouldReopenPolicy ? coverageWidgetReturnIndex : -1;

        coverageWidgetModal.classList.remove("is-open");
        window.setTimeout(function () {
          if (!coverageWidgetModal.classList.contains("is-open")) {
            coverageWidgetModal.hidden = true;
            resetCoverageWidget();
            syncModalLock();
            if (reopenIndex >= 0) {
              openPolicyModal(reopenIndex);
            }
          }
        }, 180);
      }

      async function saveCoveragePolicy(recordId, policy, policyIndex, policyDocumentFiles) {
        const records = loadJson(localStorage, getRecordsStorageKey());
        if (!Array.isArray(records)) {
          return null;
        }

        const index = records.findIndex(function (item) {
          return String(item?.id || "").trim() === String(recordId || "").trim();
        });

        if (index === -1) {
          return null;
        }

        const currentRecord = synchronizeRecordCoverageFields(records[index]);
        const existingPolicies = Array.isArray(currentRecord.coveragePolicies) ? currentRecord.coveragePolicies : [];
        if (policyIndex < 0 && existingPolicies.length >= 30) {
          return { error: "A maximum of 30 policies can be saved to one profile." };
        }

        const today = new Date().toISOString().slice(0, 10);
        const nextPolicies = existingPolicies.slice();
        const existingPolicy = policyIndex >= 0 ? nextPolicies[policyIndex] : null;
        const existingDocuments = getPolicyDocumentEntries(existingPolicy);
        const selectedDocuments = Array.from(policyDocumentFiles || []).filter(Boolean);
        const normalizedRecordId = String(recordId || "").trim();
        const mergedDocuments = selectedDocuments.length
          ? existingDocuments.concat(selectedDocuments.map(function (file) {
              return {
                name: String(file.name || "").trim(),
                type: String(file.type || "").trim(),
                size: Number(file.size || 0),
                savedAt: today
              };
            }))
          : existingDocuments;

        const nextPolicy = buildFullCoverageStoragePolicy({
          ...policy,
          id: existingPolicy?.id || `policy-${Date.now()}`,
          savedAt: existingPolicy?.savedAt || today,
          documents: mergedDocuments,
          documentName: String(mergedDocuments[0]?.name || "").trim(),
          documentType: String(mergedDocuments[0]?.type || "").trim(),
          documentSize: Number(mergedDocuments[0]?.size || 0),
          documentSavedAt: String(mergedDocuments[0]?.savedAt || "").trim()
        }, existingPolicy);

        if (policyIndex >= 0 && policyIndex < nextPolicies.length) {
          nextPolicies[policyIndex] = nextPolicy;
        } else {
          nextPolicies.push(nextPolicy);
        }

        if (selectedDocuments.length) {
          await savePolicyDocumentFiles(normalizedRecordId, nextPolicy.id, selectedDocuments);
        }

        const coverageSummaryFields = getCoverageProfileSummaryFields(nextPolicies);
        const nextRecord = {
          ...currentRecord,
          coveragePolicies: nextPolicies,
          ...coverageSummaryFields,
          lastUpdatedDate: today,
          lastReview: today
        };

        const syncedNextRecord = synchronizeRecordCoverageFields(nextRecord);

        records[index] = syncedNextRecord;
        localStorage.setItem(getRecordsStorageKey(), JSON.stringify(records));
        Object.assign(record, syncedNextRecord);

        return {
          record: syncedNextRecord,
          policyIndex: policyIndex >= 0 && policyIndex < nextPolicies.length ? policyIndex : nextPolicies.length - 1
        };
      }

      function refreshCoverageUi() {
        const latestRecord = getLatestRecordSnapshot();
        if (latestRecord && latestRecord !== record) {
          Object.assign(record, latestRecord);
        }

        const currentCoverageCard = host.querySelector("[data-coverage-card]");
        if (currentCoverageCard) {
          currentCoverageCard.outerHTML = renderCoverageCard(record);
        }

        const needsAnalysisSection = host.querySelector('.client-profile-analysis-subsection[data-client-nav-section="needs-analysis"]');
        if (needsAnalysisSection) {
          needsAnalysisSection.innerHTML = renderAnalysisPreviewCard(record);
        }

        const recommendationSection = host.querySelector('.client-profile-analysis-subsection[data-client-nav-section="recommendation"]');
        if (recommendationSection) {
          recommendationSection.innerHTML = renderRecommendationSummaryCard(record);
        }

        refreshCoverageStatDisplays();

        scheduleResponsiveCoverageStatDisplaySync();
        refreshCoverageAdequacy();
        refreshActivityTracker();
        dispatchClientDetailShellStateChange();
      }

      function buildActivityEntry(type, formData) {
        const toValue = function (key) {
          return String(formData.get(key) || "").trim();
        };

        if (type === "note") {
          const title = toValue("title");
          const body = toValue("body");
          const subject = title || body;
          const detailRemainder = title && body ? body : "";
          return {
            type: "note",
            date: getActivityDefaultDate(),
            subject,
            detailRemainder,
            noteLine: title ? `Note: ${title} - ${body}` : `Note: ${body}`,
            lastContactDate: getActivityDefaultDate()
          };
        }

        if (type === "email") {
          const direction = toValue("direction") || "Outbound";
          const subject = toValue("subject");
          const summary = toValue("summary");
          const date = toValue("date") || getActivityDefaultDate();
          return {
            type: "email",
            date,
            direction,
            subject: subject || direction,
            detailRemainder: `${direction}${subject ? "" : ""}${summary ? ` - ${summary}` : ""}`.replace(/^ - /, "").trim(),
            noteLine: `Email (${direction}): ${subject}${summary ? ` - ${summary}` : ""}`,
            lastContactDate: date
          };
        }

        if (type === "phone") {
          const direction = toValue("direction") || "Outbound";
          const outcome = toValue("outcome");
          const summary = toValue("summary");
          const date = toValue("date") || getActivityDefaultDate();
          return {
            type: "phone",
            date,
            direction,
            subject: outcome || `${direction} Call`,
            detailRemainder: `${direction}${summary ? ` - ${summary}` : ""}`.trim(),
            noteLine: `Phone Call (${direction})${outcome ? `: ${outcome}` : ""}${summary ? ` - ${summary}` : ""}`,
            lastContactDate: date
          };
        }

        if (type === "text") {
          const direction = toValue("direction") || "Outbound";
          const subject = toValue("subject");
          const summary = toValue("summary");
          const date = toValue("date") || getActivityDefaultDate();
          return {
            type: "text",
            date,
            direction,
            subject: subject || `${direction} Text`,
            detailRemainder: `${direction}${summary ? ` - ${summary}` : ""}`.trim(),
            noteLine: `Text Message (${direction})${subject ? `: ${subject}` : ""}${summary ? ` - ${summary}` : ""}`,
            lastContactDate: date
          };
        }

        if (type === "schedule") {
          const date = toValue("date") || getActivityDefaultDate();
          const time = toValue("time");
          const meetingType = toValue("meetingType") || "Meeting";
          const location = toValue("location");
          const agenda = toValue("agenda");
          return {
            type: "schedule",
            date,
            subject: meetingType,
            detailRemainder: `${time ? `at ${time}` : ""}${location ? `${time ? ", " : ""}${location}` : ""}${agenda ? ` - ${agenda}` : ""}`.trim(),
            noteLine: `Scheduled ${meetingType}${time ? ` at ${time}` : ""}${location ? `, ${location}` : ""} - ${agenda}`,
            lastReview: date
          };
        }

        if (type === "meeting") {
          const date = toValue("date") || getActivityDefaultDate();
          const time = toValue("time");
          const meetingType = toValue("meetingType") || "Meeting";
          const attendees = toValue("attendees");
          const summary = toValue("summary");
          return {
            type: "meeting",
            date,
            subject: meetingType,
            detailRemainder: `${time ? `at ${time}` : ""}${attendees ? `${time ? " " : ""}with ${attendees}` : ""}${summary ? ` - ${summary}` : ""}`.trim(),
            noteLine: `${meetingType}${time ? ` at ${time}` : ""}${attendees ? ` with ${attendees}` : ""} - ${summary}`,
            lastContactDate: date
          };
        }

        if (type === "face") {
          const date = toValue("date") || getActivityDefaultDate();
          const time = toValue("time");
          const interactionType = toValue("interactionType") || "In-Person";
          const location = toValue("location");
          const summary = toValue("summary");
          return {
            type: "face",
            date,
            subject: interactionType,
            detailRemainder: `${time ? `at ${time}` : ""}${location ? `${time ? ", " : ""}${location}` : ""}${summary ? ` - ${summary}` : ""}`.trim(),
            noteLine: `Face-to-Face (${interactionType})${time ? ` at ${time}` : ""}${location ? `, ${location}` : ""}${summary ? ` - ${summary}` : ""}`,
            lastContactDate: date
          };
        }

        if (type === "document-received") {
          const date = toValue("date") || getActivityDefaultDate();
          const documentType = toValue("documentType") || "Documents";
          const summary = toValue("summary");
          return {
            type: "document-received",
            date,
            subject: documentType,
            detailRemainder: summary,
            noteLine: `Document Received: ${documentType}${summary ? ` - ${summary}` : ""}`,
            lastContactDate: date
          };
        }

        if (type === "illustration-requested") {
          const date = toValue("date") || getActivityDefaultDate();
          const illustrationType = toValue("illustrationType") || "Illustration";
          const summary = toValue("summary");
          return {
            type: "illustration-requested",
            date,
            subject: illustrationType,
            detailRemainder: summary,
            noteLine: `Illustration Requested: ${illustrationType}${summary ? ` - ${summary}` : ""}`,
            lastContactDate: date
          };
        }

        if (type === "application-submitted") {
          const date = toValue("date") || getActivityDefaultDate();
          const carrier = toValue("carrier") || "Application";
          const summary = toValue("summary");
          return {
            type: "application-submitted",
            date,
            subject: carrier,
            detailRemainder: summary,
            noteLine: `Application Submitted: ${carrier}${summary ? ` - ${summary}` : ""}`,
            lastContactDate: date
          };
        }

        if (type === "policy-delivered") {
          const date = toValue("date") || getActivityDefaultDate();
          const carrier = toValue("carrier") || "Policy";
          const summary = toValue("summary");
          return {
            type: "policy-delivered",
            date,
            subject: carrier,
            detailRemainder: summary,
            noteLine: `Policy Delivered: ${carrier}${summary ? ` - ${summary}` : ""}`,
            lastContactDate: date
          };
        }

        if (type === "reminder") {
          const date = toValue("date") || getActivityDefaultDate();
          const category = toValue("category") || "Follow-Up";
          const summary = toValue("summary");
          return {
            type: "reminder",
            date,
            subject: category,
            detailRemainder: `${date}${summary ? ` - ${summary}` : ""}`.trim(),
            noteLine: `Reminder (${category}) for ${date} - ${summary}`,
            lastReview: date
          };
        }

        return null;
      }

      async function copyTextToClipboard(text) {
        if (!text) {
          return false;
        }

        if (navigator.clipboard && window.isSecureContext) {
          try {
            await navigator.clipboard.writeText(text);
            return true;
          } catch (error) {
            return false;
          }
        }

        const textarea = document.createElement("textarea");
        textarea.value = text;
        textarea.setAttribute("readonly", "");
        textarea.style.position = "fixed";
        textarea.style.top = "-9999px";
        document.body.appendChild(textarea);
        textarea.select();

        let copied = false;
        try {
          copied = document.execCommand("copy");
        } catch (error) {
          copied = false;
        }

        document.body.removeChild(textarea);
        return copied;
      }

      function saveActivityEntry(entry) {
        if (!entry) {
          return false;
        }

        const existingLog = Array.isArray(record.activityLog) ? record.activityLog.slice() : [];
        existingLog.unshift({
          type: entry.type,
          date: entry.date,
          direction: entry.direction || "",
          summary: entry.noteLine,
          subject: entry.subject || "",
          detailRemainder: entry.detailRemainder || ""
        });

        const existingNotes = String(record.clientNotes || "").trim();
        const nextNotes = [entry.noteLine, existingNotes].filter(Boolean).join("\n");
        const nextFields = {
          activityLog: existingLog,
          clientNotes: nextNotes,
          lastContactDate: entry.date || getActivityDefaultDate()
        };

        if (entry.lastReview) {
          nextFields.lastReview = entry.lastReview;
        }

        const records = loadJson(localStorage, getRecordsStorageKey());
        if (!Array.isArray(records)) {
          return false;
        }

        const recordIndex = records.findIndex(function (item) {
          return String(item?.id || "").trim() === String(record.id || "").trim();
        });

        if (recordIndex === -1) {
          return false;
        }

        records[recordIndex] = {
          ...records[recordIndex],
          ...nextFields,
          lastUpdatedDate: new Date().toISOString().slice(0, 10)
        };

        localStorage.setItem(getRecordsStorageKey(), JSON.stringify(records));
        Object.assign(record, nextFields);
        return true;
      }

      function refreshPrimaryActionPanel() {
        const latestRecord = getLatestRecordSnapshot();
        if (latestRecord && latestRecord !== record) {
          Object.assign(record, latestRecord);
        }

        const checklistItems = getDashboardChecklistItems(record);
        primaryActionPanelHosts.forEach(function (container) {
          container.innerHTML = renderPrimaryActionPanel(record, checklistItems);
        });

        const currentChecklistCard = host.querySelector("[data-checklist-card]");
        if (currentChecklistCard) {
          currentChecklistCard.outerHTML = renderChecklistCard("Planning Workflow", checklistItems, record);
        }

        const activeNavKey = getActiveProfileNavKey() || getRequestedProfileNavKey();
        setActiveProfileNavState(activeNavKey);
        scheduleProfileScrollspySync();
      }

      // CODE NOTE: The continuous profile workspace now includes section-level
      // summary cards outside the old tab panels, so refresh these in place
      // whenever activity or coverage changes instead of leaving stale content
      // behind the new sticky/scrolling workflow shell.
      function refreshProfileWorkspaceSupportCards() {
        const placementSummaryCard = host.querySelector("[data-placement-summary-card]");
        if (placementSummaryCard) {
          placementSummaryCard.innerHTML = renderPlacementSummaryCard(record);
        }

        const notesSummaryCard = host.querySelector("[data-notes-summary-card]");
        if (notesSummaryCard) {
          notesSummaryCard.innerHTML = renderNotesSummaryCard(record);
        }

        const documentsSummaryCard = host.querySelector("[data-documents-summary-card]");
        if (documentsSummaryCard) {
          documentsSummaryCard.innerHTML = renderDocumentsSummaryCard(record);
        }

      }

      function refreshActivityTracker() {
        const latestRecord = getLatestRecordSnapshot();
        if (latestRecord && latestRecord !== record) {
          Object.assign(record, latestRecord);
        }

        refreshPrimaryActionPanel();

        activityPreviewContainers.forEach(function (container) {
          container.innerHTML = renderActivityPreview(record);
        });

        activityOverviewContainers.forEach(function (container) {
          container.innerHTML = renderActivityOverviewCard(record);
        });

        const currentRemindersStrip = host.querySelector("[data-reminders-strip]");
        if (currentRemindersStrip) {
          currentRemindersStrip.outerHTML = renderFooterBar(record);
        }

        const currentCoverageCard = host.querySelector("[data-coverage-card]");
        if (currentCoverageCard) {
          currentCoverageCard.outerHTML = renderCoverageCard(record);
        }

        refreshProfileWorkspaceSupportCards();

        const latestActivityDate = Array.isArray(record.activityLog) && record.activityLog.length
          ? String(record.activityLog[0]?.date || "").trim()
          : String(record.lastContactDate || record.lastUpdatedDate || record.dateProfileCreated || "").trim();
        const lastContact = formatDate(latestActivityDate);
        activityLastContactLabels.forEach(function (label) {
          label.textContent = `Last Contact ${lastContact}`;
        });

        if (activityDetailModal && activityDetailModal.hidden === false) {
          const entries = Array.isArray(record.activityLog) ? record.activityLog : [];
          if (activeActivityIndex < 0 || activeActivityIndex >= entries.length) {
            closeActivityDetailModal();
          } else if (activityDetailBody) {
            const activeEntry = entries[activeActivityIndex];
            if (activityDetailTitle) {
              activityDetailTitle.textContent = `${getActivityPreviewLabel(activeEntry)} Activity`;
            }
            activityDetailBody.innerHTML = renderActivityDetailModalBody(activeEntry);
          }
        }

        scheduleProfileScrollspySync();
      }

      function refreshCoverageAdequacy(animateFromZero) {
        const adequacy = getCoverageAdequacy(record);
        const gapDetails = getCoverageAdequacyGapDetails(record, adequacy);
        if (!coverageAdequacyPercent || !coverageAdequacyFill) {
          return;
        }
        const tone = getCoverageAdequacyTone(adequacy);
        const adequacySection = coverageAdequacyFill.closest("[data-coverage-adequacy]");

        coverageAdequacyPercent.setAttribute("data-coverage-adequacy-tone", tone);
        coverageAdequacyFill.setAttribute("data-coverage-adequacy-tone", tone);
        if (adequacySection instanceof HTMLElement) {
          adequacySection.setAttribute("data-coverage-adequacy-tone", tone);
          adequacySection.setAttribute("data-coverage-has-gap", gapDetails.hasCoverageGap ? "true" : "false");
        }
        if (coverageGapSummary instanceof HTMLElement) {
          coverageGapSummary.style.setProperty("--coverage-gap-marker-position", `${gapDetails.markerPosition}%`);
        }
        if (coverageGapMarker instanceof HTMLElement) {
          coverageGapMarker.style.left = `${gapDetails.markerPosition}%`;
        }
        if (coverageGapValue) {
          coverageGapValue.textContent = formatCoverageCardCurrency(gapDetails.coverageGap);
        }
        if (incomeGapValue) {
          incomeGapValue.textContent = formatCoverageCardCurrency(gapDetails.incomeGap);
        }

        if (coverageAdequacyAnimationFrame) {
          window.cancelAnimationFrame(coverageAdequacyAnimationFrame);
          coverageAdequacyAnimationFrame = 0;
        }

        if (!animateFromZero) {
          coverageAdequacyPercent.textContent = `${adequacy}%`;
          coverageAdequacyFill.style.width = `${adequacy}%`;
          return;
        }

        const duration = 1800;
        const startValue = 0;
        const targetValue = adequacy;
        const startTime = window.performance.now();

        coverageAdequacyPercent.textContent = "0%";
        coverageAdequacyFill.style.width = "0%";

        function easeOutQuart(progress) {
          return 1 - Math.pow(1 - progress, 4);
        }

        function step(now) {
          const elapsed = now - startTime;
          const progress = Math.min(elapsed / duration, 1);
          const easedProgress = easeOutQuart(progress);
          const currentValue = startValue + ((targetValue - startValue) * easedProgress);
          const currentMarkerPosition = getCoverageGapMarkerPosition(currentValue);
          const displayValue = progress < 1
            ? Math.max(0, Math.round(currentValue))
            : targetValue;

          coverageAdequacyPercent.textContent = `${Math.max(0, displayValue)}%`;
          coverageAdequacyFill.style.width = `${Math.max(0, displayValue)}%`;
          if (coverageGapSummary instanceof HTMLElement) {
            coverageGapSummary.style.setProperty("--coverage-gap-marker-position", `${currentMarkerPosition}%`);
          }
          if (coverageGapMarker instanceof HTMLElement) {
            coverageGapMarker.style.left = `${currentMarkerPosition}%`;
          }

          if (progress < 1) {
            coverageAdequacyAnimationFrame = window.requestAnimationFrame(step);
            return;
          }

          coverageAdequacyPercent.textContent = `${targetValue}%`;
          coverageAdequacyFill.style.width = `${targetValue}%`;
          coverageAdequacyAnimationFrame = 0;
        }

        coverageAdequacyAnimationFrame = window.requestAnimationFrame(step);
      }

      refreshCoverageAdequacy(true);
      scheduleResponsiveCoverageStatDisplaySync();

      const clientDetailSidebarStorageKey = `workspaceSideNavCollapsed:${getStorageIdentity()}`;

      function setClientDetailSidebarCollapsed(isCollapsed) {
        if (!profileSidebarLayout || !profileSidebarToggle || !profileSidebarHost) {
          return;
        }

        document.body.classList.toggle("workspace-side-nav-collapsed", isCollapsed);
        profileSidebarHost.classList.toggle("is-collapsed", isCollapsed);
        profileSidebarLayout.classList.toggle("is-collapsed", isCollapsed);
        profileSidebarToggle.setAttribute("aria-expanded", isCollapsed ? "false" : "true");
        profileSidebarToggle.setAttribute("aria-label", isCollapsed ? "Expand section navigation" : "Collapse section navigation");
        profileSidebarToggle.setAttribute("title", isCollapsed ? "Expand section navigation" : "Collapse section navigation");
        scheduleResponsiveCoverageStatDisplaySync();
      }

      if (profileSidebarLayout && profileSidebarToggle) {
        let isSidebarCollapsed = false;

        try {
          isSidebarCollapsed = window.localStorage.getItem(clientDetailSidebarStorageKey) === "1";
        } catch (error) {
          isSidebarCollapsed = false;
        }

        setClientDetailSidebarCollapsed(isSidebarCollapsed);

        profileSidebarToggle.addEventListener("click", function () {
          const nextCollapsed = !profileSidebarLayout.classList.contains("is-collapsed");
          setClientDetailSidebarCollapsed(nextCollapsed);

          try {
            window.localStorage.setItem(clientDetailSidebarStorageKey, nextCollapsed ? "1" : "0");
          } catch (error) {
            // Ignore persistence issues and keep the in-memory state.
          }
        });
      }

      const handleWindowResize = function () {
        scheduleResponsiveCoverageStatDisplaySync();
        scheduleProfileScrollspySync();
      };
      window.addEventListener("resize", handleWindowResize);

      function getActiveProfilePanel() {
        return Array.from(profilePanels).find(function (panel) {
          return panel.classList.contains("is-active") && !panel.hidden;
        }) || Array.from(profilePanels).find(function (panel) {
          return !panel.hidden;
        }) || null;
      }

      function getRequestedProfileNavKey() {
        return String(CLIENT_PROFILE_DEFAULT_NAV_BY_TAB[getRequestedTab()] || "overview").trim() || "overview";
      }

      function getActiveProfileNavKey() {
        return String(activeProfileNavKey || Array.from(profileNavButtons).find(function (button) {
          return button.classList.contains("is-active");
        })?.dataset.clientNavKey || "").trim();
      }

      function getClientDetailBannerGroupFromNavKey(navKey) {
        const normalizedNavKey = String(navKey || "").trim();
        if (!normalizedNavKey) {
          return "overview";
        }

        if (["household", "financial-snapshot", "policies"].includes(normalizedNavKey)) {
          return "client-data";
        }

        if (["activity", "notes", "documents"].includes(normalizedNavKey)) {
          return "activity";
        }

        if (["modeling-inputs", "needs-analysis", "recommendation", "underwriting", "placement", "analysis"].includes(normalizedNavKey)) {
          return "workflow";
        }

        return "overview";
      }

      function getClientDetailBannerNavTarget(tabKey) {
        const normalizedTabKey = String(tabKey || "").trim();
        if (normalizedTabKey === "workflow") {
          return "analysis";
        }
        if (normalizedTabKey === "client-data") {
          return "household";
        }
        if (normalizedTabKey === "activity") {
          return "activity";
        }
        return "overview";
      }

      function shouldShowBannerCoverageSummary() {
        const statsRow = host.querySelector(".client-profile-stats");
        if (!(statsRow instanceof HTMLElement)) {
          return false;
        }

        if (hasInternalProfileScrollContainer()) {
          const containerRect = profileScrollContainer.getBoundingClientRect();
          const statsRect = statsRow.getBoundingClientRect();
          return (statsRect.bottom - containerRect.top) <= (getProfileScrollOffset() + 8);
        }

        // CODE NOTE: Once the top coverage stat row has moved above the sticky
        // header stack, mirror those values into the auxiliary banner so
        // current coverage and modeled need stay visible while scrolling.
        return statsRow.getBoundingClientRect().bottom <= (getProfileScrollOffset() + 8);
      }

      function getClientDetailShellState() {
        const activeNav = getActiveProfileNavKey() || getRequestedProfileNavKey();
        const coverageFields = synchronizeRecordCoverageFields(record);
        const isHouseholdAvatar = record?.viewType === "households";
        const avatarPresentation = isHouseholdAvatar ? null : getAvatarPresentation(record?.age, record?.dateOfBirth);
        const avatarName = String(record?.displayName || clientWorkspaceSidebarTitle || "").trim() || clientWorkspaceSidebarTitle;
        return {
          title: clientWorkspaceSidebarTitle,
          sideNavTitle: "Client Board",
          activeTab: getClientDetailBannerGroupFromNavKey(activeNav),
          activeNav: activeNav,
          recordId: String(record?.id || "").trim(),
          caseRef: String(record?.caseRef || "").trim(),
          currentCoverage: coverageFields.currentCoverage,
          modeledNeed: coverageFields.modeledNeed,
          showCoverageSummaryInBanner: bannerCoverageSummaryVisible,
          avatar: {
            initials: getInitials(avatarName, record?.viewType, record?.lastName),
            isHousehold: isHouseholdAvatar,
            background: avatarPresentation?.background || "",
            color: avatarPresentation?.color || "",
            boxShadow: avatarPresentation?.boxShadow || ""
          }
        };
      }

      function dispatchClientDetailShellStateChange() {
        window.dispatchEvent(new CustomEvent("client-detail-shell-statechange", {
          detail: getClientDetailShellState()
        }));
      }

      function getAnalysisWorkflowBranchState(workflowState) {
        const analysisSteps = Array.isArray(workflowState?.steps)
          ? workflowState.steps.filter(function (step) {
              return CLIENT_PROFILE_ANALYSIS_CHILD_KEYS.includes(String(step?.key || "").trim());
            })
          : [];
        const currentKey = String(workflowState?.currentKey || "").trim();
        return {
          isComplete: analysisSteps.length > 0 && analysisSteps.every(function (step) { return Boolean(step.complete); }),
          isCurrent: CLIENT_PROFILE_ANALYSIS_CHILD_KEYS.includes(currentKey),
          hasAnyComplete: analysisSteps.some(function (step) { return Boolean(step.complete); })
        };
      }

      function setActiveProfileNavState(navKey) {
        const normalizedNavKey = String(navKey || "").trim();
        if (!normalizedNavKey) {
          return false;
        }

        activeProfileNavKey = normalizedNavKey;

        const workflowState = getClientWorkflowProgressState(record);
        const workflowStepMap = new Map(workflowState.steps.map(function (step) {
          return [String(step.key || "").trim(), step];
        }));
        let foundMatch = false;

        profileNavButtons.forEach(function (button) {
          const buttonNavKey = String(button.dataset.clientNavKey || "").trim();
          const navKind = String(button.dataset.clientNavKind || "").trim();
          const workflowStep = workflowStepMap.get(buttonNavKey);
          const isActive = buttonNavKey === normalizedNavKey;
          const isWorkflow = navKind === "workflow" && Boolean(workflowStep);
          const isCurrent = isWorkflow && !workflowStep.complete && workflowState.currentKey === buttonNavKey;
          const isComplete = isWorkflow && Boolean(workflowStep.complete);
          const isFuture = isWorkflow && !workflowStep.complete && workflowState.currentKey !== buttonNavKey;
          button.classList.toggle("is-active", isActive);
          button.classList.toggle("is-current", isCurrent);
          button.classList.toggle("is-complete", isComplete);
          button.classList.toggle("is-future", isFuture);
          button.classList.toggle("is-muted", navKind !== "workflow" && !isActive);
          button.setAttribute("aria-selected", isActive ? "true" : "false");
          button.setAttribute("data-client-nav-status", isComplete ? "complete" : isCurrent ? "current" : isFuture ? "future" : (navKind === "workflow" ? "active" : "support"));

          if (isActive) {
            foundMatch = true;
          }
        });

        if (profileNavAnalysisToggle instanceof HTMLButtonElement && profileNavAnalysisPanel instanceof HTMLElement) {
          const branchState = getAnalysisWorkflowBranchState(workflowState);
          const isAnalysisActive = normalizedNavKey === "analysis" || CLIENT_PROFILE_ANALYSIS_CHILD_KEYS.includes(normalizedNavKey);
          const isAnalysisForcedOpen = isAnalysisActive || branchState.isCurrent;
          const isAnalysisExpanded = isAnalysisForcedOpen || profileNavAnalysisExpanded;
          profileNavAnalysisPanel.hidden = !isAnalysisExpanded;
          profileNavAnalysisToggle.classList.toggle("is-active", isAnalysisActive);
          profileNavAnalysisToggle.classList.toggle("is-current", branchState.isCurrent);
          profileNavAnalysisToggle.classList.toggle("is-complete", branchState.isComplete);
          profileNavAnalysisToggle.classList.toggle("is-future", !branchState.isComplete && !branchState.isCurrent && !branchState.hasAnyComplete);
          profileNavAnalysisToggle.classList.toggle("is-expanded", isAnalysisExpanded);
          profileNavAnalysisToggle.setAttribute("aria-expanded", isAnalysisExpanded ? "true" : "false");

          if (isAnalysisActive) {
            foundMatch = true;
          }
        }

        dispatchClientDetailShellStateChange();
        return foundMatch;
      }

      function findProfileNavSection(targetKey) {
        const normalizedTarget = String(targetKey || "").trim();
        if (!normalizedTarget) {
          return null;
        }

        if (!isContinuousProfileWorkspace) {
          const activePanel = getActiveProfilePanel();
          if (!(activePanel instanceof HTMLElement)) {
            return null;
          }

          const panelTargets = String(activePanel.getAttribute("data-client-nav-section") || "")
            .split(/\s+/)
            .filter(Boolean);
          if (panelTargets.includes(normalizedTarget)) {
            return activePanel;
          }

          return Array.from(activePanel.querySelectorAll("[data-client-nav-section]")).find(function (section) {
            return String(section.getAttribute("data-client-nav-section") || "")
              .split(/\s+/)
              .filter(Boolean)
              .includes(normalizedTarget);
          }) || null;
        }

        return Array.from(host.querySelectorAll("[data-client-nav-section]")).find(function (section) {
          return String(section.getAttribute("data-client-nav-section") || "")
            .split(/\s+/)
            .filter(Boolean)
            .includes(normalizedTarget);
        }) || null;
      }

      function hasInternalProfileScrollContainer() {
        return profileScrollContainer instanceof HTMLElement;
      }

      function getProfileScrollOffset() {
        if (hasInternalProfileScrollContainer()) {
          return 16;
        }

        let offset = 18;
        const topbar = document.querySelector(".workspace-page-topbar");
        if (topbar instanceof HTMLElement) {
          offset += topbar.getBoundingClientRect().height;
        }

        const detailBanner = document.querySelector("[data-studio-native-client-detail-banner]");
        if (detailBanner instanceof HTMLElement) {
          offset += detailBanner.getBoundingClientRect().height;
        }

        return offset;
      }

      function getProfileScrollTop() {
        return hasInternalProfileScrollContainer()
          ? profileScrollContainer.scrollTop
          : window.scrollY;
      }

      function getProfileScrollViewportHeight() {
        return hasInternalProfileScrollContainer()
          ? profileScrollContainer.clientHeight
          : window.innerHeight;
      }

      function getProfileScrollHeight() {
        return hasInternalProfileScrollContainer()
          ? profileScrollContainer.scrollHeight
          : document.documentElement.scrollHeight;
      }

      function getProfileSectionAbsoluteTop(targetSection) {
        if (!(targetSection instanceof HTMLElement)) {
          return 0;
        }

        if (hasInternalProfileScrollContainer()) {
          if (!profileScrollContainer.contains(targetSection)) {
            return profileScrollContainer.scrollTop;
          }
          const containerRect = profileScrollContainer.getBoundingClientRect();
          return profileScrollContainer.scrollTop
            + (targetSection.getBoundingClientRect().top - containerRect.top);
        }

        return window.scrollY + targetSection.getBoundingClientRect().top;
      }

      // CODE NOTE: Sidebar workflow items now scroll within one continuous
      // profile workspace, so the landing offset must account for the sticky
      // page header and any sticky detail banner.
      function scrollToProfileNavTarget(targetKey, options) {
        const normalizedTarget = String(targetKey || "").trim();
        if (!normalizedTarget) {
          return false;
        }

        const targetSection = findProfileNavSection(normalizedTarget);
        if (!(targetSection instanceof HTMLElement)) {
          return false;
        }

        const absoluteTop = getProfileSectionAbsoluteTop(targetSection) - getProfileScrollOffset();
        const nextTop = Math.max(0, absoluteTop);

        if (hasInternalProfileScrollContainer()) {
          profileScrollContainer.scrollTo({
            top: nextTop,
            behavior: String(options?.behavior || "smooth")
          });
          return true;
        }

        window.scrollTo({
          top: nextTop,
          behavior: String(options?.behavior || "smooth")
        });
        return true;
      }

      function getProfileScrollspySections() {
        const seen = new Set();
        const sections = [];

        const analysisSection = findProfileNavSection("analysis");
        if (
          analysisSection instanceof HTMLElement
          && (!hasInternalProfileScrollContainer() || profileScrollContainer.contains(analysisSection))
        ) {
          sections.push({
            navKey: "analysis",
            targetKey: "analysis",
            element: analysisSection
          });
          seen.add("analysis");
        }

        Array.from(profileNavButtons).forEach(function (button) {
          const navKey = String(button.dataset.clientNavKey || "").trim();
          const targetKey = String(button.dataset.clientNavTarget || navKey).trim();
          const section = findProfileNavSection(targetKey);
          if (
            !navKey
            || !(section instanceof HTMLElement)
            || seen.has(navKey)
            || (hasInternalProfileScrollContainer() && !profileScrollContainer.contains(section))
          ) {
            return;
          }

          seen.add(navKey);
          sections.push({
            navKey,
            targetKey,
            element: section
          });
        });

        return sections.sort(function (left, right) {
          return left.element.getBoundingClientRect().top - right.element.getBoundingClientRect().top;
        });
      }

      function resolveActiveProfileNavFromScroll() {
        const sections = getProfileScrollspySections();
        if (!sections.length) {
          return getRequestedProfileNavKey();
        }

        const activationLine = getProfileScrollOffset() + 42;
        let activeNav = sections[0].navKey;

        if (hasInternalProfileScrollContainer()) {
          const containerRect = profileScrollContainer.getBoundingClientRect();
          sections.forEach(function (section) {
            const rect = section.element.getBoundingClientRect();
            const relativeTop = rect.top - containerRect.top;
            if (relativeTop <= activationLine) {
              activeNav = section.navKey;
            }
          });
        } else {
          sections.forEach(function (section) {
            const rect = section.element.getBoundingClientRect();
            if (rect.top <= activationLine) {
              activeNav = section.navKey;
            }
          });
        }

        if ((getProfileScrollViewportHeight() + getProfileScrollTop()) >= (getProfileScrollHeight() - 8)) {
          return sections[sections.length - 1].navKey;
        }

        return activeNav;
      }

      function syncProfileScrollspy(force) {
        const nextNavKey = resolveActiveProfileNavFromScroll();
        const nextBannerCoverageSummaryVisible = shouldShowBannerCoverageSummary();
        const navChanged = Boolean(nextNavKey) && (force || nextNavKey !== getActiveProfileNavKey());
        const bannerVisibilityChanged = force || nextBannerCoverageSummaryVisible !== bannerCoverageSummaryVisible;

        if (navChanged) {
          bannerCoverageSummaryVisible = nextBannerCoverageSummaryVisible;
          setActiveProfileNavState(nextNavKey);
          return;
        }

        if (bannerVisibilityChanged) {
          bannerCoverageSummaryVisible = nextBannerCoverageSummaryVisible;
          dispatchClientDetailShellStateChange();
        }
      }

      function scheduleProfileScrollspySync() {
        if (profileScrollSpyFrame) {
          return;
        }

        profileScrollSpyFrame = window.requestAnimationFrame(function () {
          profileScrollSpyFrame = 0;
          syncProfileScrollspy();
        });
      }

      function setActiveProfileTab(tabKey, options) {
        const normalizedTabKey = String(tabKey || "").trim();
        if (!normalizedTabKey) {
          return false;
        }

        if (!isContinuousProfileWorkspace) {
          const matchingPanel = Array.from(profilePanels).find(function (panel) {
            return String(panel.dataset.clientPanel || "").trim() === normalizedTabKey;
          });

          if (!(matchingPanel instanceof HTMLElement)) {
            return false;
          }

          profilePanels.forEach(function (panel) {
            const isActive = String(panel.dataset.clientPanel || "").trim() === normalizedTabKey;
            panel.classList.toggle("is-active", isActive);
            panel.hidden = !isActive;
          });
        }

        const defaultNavKey = String(options?.navKey || CLIENT_PROFILE_DEFAULT_NAV_BY_TAB[normalizedTabKey] || getClientDetailBannerNavTarget(normalizedTabKey) || normalizedTabKey).trim();
        setActiveProfileNavState(defaultNavKey);
        scheduleResponsiveCoverageStatDisplaySync();

        if (options?.scroll && isContinuousProfileWorkspace) {
          const targetKey = String(options?.targetKey || defaultNavKey).trim();
          window.requestAnimationFrame(function () {
            scrollToProfileNavTarget(targetKey, { behavior: options?.behavior || "smooth" });
          });
        }

        return true;
      }

      function setActiveProfileNav(navKey, options) {
        const normalizedNavKey = String(navKey || "").trim();
        if (!normalizedNavKey) {
          return false;
        }

        const navButton = Array.from(profileNavButtons).find(function (button) {
          return String(button.dataset.clientNavKey || "").trim() === normalizedNavKey;
        });
        const targetKey = String(options?.targetKey || navButton?.dataset.clientNavTarget || normalizedNavKey).trim();
        const tabKey = String(options?.tabKey || navButton?.dataset.clientNavTab || "").trim();

        if (tabKey && !isContinuousProfileWorkspace) {
          return setActiveProfileTab(tabKey, {
            navKey: normalizedNavKey,
            targetKey: targetKey,
            scroll: true,
            behavior: options?.behavior || "smooth"
          });
        }

        if (!findProfileNavSection(targetKey) && normalizedNavKey !== "analysis") {
          return false;
        }

        setActiveProfileNavState(normalizedNavKey);
        if (options?.scroll !== false) {
          window.requestAnimationFrame(function () {
            scrollToProfileNavTarget(targetKey, { behavior: options?.behavior || "smooth" });
          });
        }
        return true;
      }

      const requestedTab = getRequestedTab();
      const requestedNavKey = getRequestedProfileNavKey();
      setActiveProfileNavState(requestedNavKey);
      if (requestedTab !== "overview") {
        window.requestAnimationFrame(function () {
          scrollToProfileNavTarget(requestedNavKey, { behavior: "auto" });
          scheduleProfileScrollspySync();
        });
      } else {
        scheduleProfileScrollspySync();
      }

      profileNavButtons.forEach(function (tab) {
        tab.addEventListener("click", function () {
          const nextNavKey = String(tab.dataset.clientNavKey || "").trim();
          if (!nextNavKey) {
            return;
          }

          setActiveProfileNav(nextNavKey);
        });
      });

      if (profileNavAnalysisToggle instanceof HTMLButtonElement) {
        profileNavAnalysisToggle.addEventListener("click", function () {
          const activeNavKey = getActiveProfileNavKey();
          const workflowState = getClientWorkflowProgressState(record);
          if (CLIENT_PROFILE_ANALYSIS_CHILD_KEYS.includes(activeNavKey) || CLIENT_PROFILE_ANALYSIS_CHILD_KEYS.includes(workflowState.currentKey)) {
            return;
          }

          profileNavAnalysisExpanded = !profileNavAnalysisExpanded;
          setActiveProfileNavState(activeNavKey || getRequestedProfileNavKey());
        });
      }

      const handleWindowScroll = function () {
        scheduleProfileScrollspySync();
      };
      if (hasInternalProfileScrollContainer()) {
        profileScrollContainer.addEventListener("scroll", handleWindowScroll, { passive: true });
      } else {
        window.addEventListener("scroll", handleWindowScroll, { passive: true });
      }

      host.addEventListener("click", function (event) {
        const profileDeleteTrigger = event.target.closest("[data-profile-delete-toggle]");
        if (profileDeleteTrigger && host.contains(profileDeleteTrigger)) {
          event.preventDefault();
          openProfileDeleteModal();
          return;
        }

        const workflowButton = event.target.closest("[data-client-workflow-nav]");
        if (!(workflowButton instanceof HTMLButtonElement)) {
          return;
        }

        const nextNavKey = String(workflowButton.getAttribute("data-client-workflow-nav") || "").trim();
        if (!nextNavKey) {
          return;
        }

        event.preventDefault();
        setActiveProfileNav(nextNavKey);
      });

      function getCoveragePolicies() {
        return Array.isArray(record.coveragePolicies) ? record.coveragePolicies : [];
      }

      function getPolicyTermLengthDisplay(policy) {
        return formatValue(
          isCoveragePermanentPolicyType(policy.policyType)
            ? (policy.termLength || "Permanent Coverage")
            : (String(policy.policyType || "").trim() === "Term" && String(policy.termLength || "").trim()
              ? `${String(policy.termLength || "").trim()} Years`
              : policy.termLength)
        );
      }

      function getPolicyModalTitleText(policy) {
        return formatValue(policy.policyCarrier) === "Not provided"
          ? "Policy Details"
          : `${policy.policyCarrier} Policy`;
      }

      function getPolicyModalBadgeText(policy) {
        const badgeParts = [];
        const type = formatValue(policy.policyType);
        const premiumMode = formatValue(policy.premiumMode);
        if (type !== "Not provided") {
          badgeParts.push(type.toUpperCase());
        }
        if (premiumMode !== "Not provided") {
          badgeParts.push(premiumMode.toUpperCase());
        }
        return badgeParts.length ? badgeParts.join(" · ") : "COVERAGE RECORD";
      }

      function getPolicyModalSubtitleText(policy) {
        return `Insured: ${formatValue(policy.insuredName)} · Owner: ${formatValue(policy.ownerName)}`;
      }

      function renderPolicyModalMetrics(policy) {
        const metricCards = [
          {
            label: "Face Amount",
            value: formatCurrency(getPolicyDeathBenefitAmount(policy)),
            meta: "Death benefit"
          },
          {
            label: isCoverageSteppedPremiumMode(policy.premiumMode) ? "Final Premium" : "Premium",
            value: formatCurrency(policy.premiumAmount),
            meta: isCoverageSteppedPremiumMode(policy.premiumMode)
              ? `${formatValue(policy.premiumMode)} · Final`
              : formatValue(policy.premiumMode)
          },
          {
            label: "Term Length",
            value: getPolicyTermLengthDisplay(policy),
            meta: formatValue(policy.policyCarrier)
          }
        ];

        return metricCards.map(function (card) {
          return `
            <div class="client-policy-modal-metric-card">
              <span class="client-policy-modal-metric-label">${escapeHtml(card.label)}</span>
              <strong class="client-policy-modal-metric-value">${escapeHtml(card.value)}</strong>
              <span class="client-policy-modal-metric-meta">${escapeHtml(card.meta)}</span>
            </div>
          `;
        }).join("");
      }

      function renderPolicyModalStatus(policy) {
        const hasEffectiveDate = Boolean(String(policy.effectiveDate || "").trim());
        return `
          <span class="client-policy-modal-status-chip is-${hasEffectiveDate ? "active" : "pending"}">
            <span class="client-policy-modal-status-dot" aria-hidden="true"></span>
            ${escapeHtml(hasEffectiveDate ? "In-force" : "Pending")}
          </span>
          <span class="client-policy-modal-status-meta">Effective date ${escapeHtml(formatDate(policy.effectiveDate))}</span>
          <span class="client-policy-modal-status-meta">Policy No. ${escapeHtml(formatValue(policy.policyNumber))}</span>
        `;
      }

      function renderPolicyModalBody(policy) {
        const policyDocuments = getPolicyDocumentEntries(policy);
        const isRecordComplete = Boolean(String(policy.effectiveDate || "").trim())
          && Boolean(String(policy.beneficiaryName || "").trim())
          && policyDocuments.length > 0;
        const readinessTitle = isRecordComplete ? "Coverage record complete" : "Coverage record in progress";
        const readinessCopy = isRecordComplete
          ? "Policy details, beneficiary, and supporting files are saved to this record."
          : "Add the missing beneficiary, effective date, or files from Edit to finish this coverage record.";
        const premiumFields = isCoverageSteppedPremiumMode(policy.premiumMode)
          ? [
              ["Starting Premium", formatCurrency(policy.startingPremium)],
              ["Final Premium", formatCurrency(policy.premiumAmount)],
              ["Time to Final Premium", formatCoveragePremiumSchedule(policy.premiumScheduleYears, policy.premiumScheduleMonths)]
            ]
          : [
              ["Premium Amount", formatCurrency(policy.premiumAmount)]
            ];
        const detailFields = [
          ["Carrier", formatValue(policy.policyCarrier)],
          ["Policy Type", formatValue(policy.policyType)],
          ["Premium Mode", formatValue(policy.premiumMode)],
          ["Effective Date", formatDate(policy.effectiveDate)],
          ["Underwriting Class", formatValue(policy.underwritingClass)],
          ["Primary Beneficiary", formatValue(policy.beneficiaryName)],
          ["Term Length", getPolicyTermLengthDisplay(policy)],
          ...premiumFields
        ].map(function (field) {
          return `
            <div class="client-policy-modal-field">
              <span class="client-policy-modal-label">${escapeHtml(field[0])}</span>
              <span class="client-policy-modal-value">${escapeHtml(field[1])}</span>
            </div>
          `;
        }).join("");

        return `
          <section class="client-policy-modal-section">
            <div class="client-policy-modal-section-heading">
              <span class="client-policy-modal-section-label">Coverage Details</span>
            </div>
            <div class="client-policy-modal-grid">
              ${detailFields}
            </div>
          </section>
          <section class="client-policy-modal-section">
            <div class="client-policy-modal-section-heading">
              <span class="client-policy-modal-section-label">${policyDocuments.length > 1 ? `Policy Files (${policyDocuments.length})` : "Policy Files"}</span>
            </div>
            <div class="client-policy-document-list">
              ${policyDocuments.length ? policyDocuments.map(function (document, documentIndex) {
                return `
                  <div class="client-policy-document-row" data-policy-document-entry data-policy-document-index="${documentIndex}">
                    <div class="client-policy-document-meta">
                      <span class="client-policy-document-icon" aria-hidden="true"></span>
                      <div class="client-policy-document-copy">
                        <strong>${escapeHtml(document.name)}</strong>
                        <span>${escapeHtml(`${formatFileSize(document.size)}${document.type ? ` · ${document.type.split("/").pop().toUpperCase()}` : ""}`)}</span>
                      </div>
                    </div>
                    <button class="client-policy-document-button" type="button" data-policy-document-open data-policy-document-index="${documentIndex}">Open file</button>
                  </div>
                `;
              }).join("") : `
                <div class="client-policy-document-row is-empty">
                  <div class="client-policy-document-meta">
                    <span class="client-policy-document-icon" aria-hidden="true"></span>
                    <div class="client-policy-document-copy">
                      <strong>No policy files uploaded yet.</strong>
                      <span>Add supporting files from Edit to keep them with this coverage record.</span>
                    </div>
                  </div>
                </div>
              `}
            </div>
          </section>
          ${String(policy.policyNotes || "").trim() ? `
            <section class="client-policy-modal-note-card">
              <span class="client-policy-modal-section-label">Policy Notes</span>
              <p class="client-policy-modal-note-copy">${escapeHtml(formatValue(policy.policyNotes))}</p>
            </section>
          ` : ""}
          <section class="client-policy-modal-summary-card">
            <div class="client-policy-modal-summary-icon" aria-hidden="true"></div>
            <div class="client-policy-modal-summary-copy">
              <strong>${escapeHtml(readinessTitle)}</strong>
              <span>${escapeHtml(readinessCopy)}</span>
            </div>
          </section>
        `;
      }

      function renderPolicyListModalBody(policies) {
        return `
          <div class="client-policy-list-grid">
            ${policies.map(function (policy, index) {
              const policySummary = createCoveragePolicyDisplaySummary(policy, { fallbackTitle: `Policy ${index + 1}` });
              return `
                <article
                  class="client-coverage-policy-item"
                  data-policy-list-card
                  data-policy-index="${index}"
                  tabindex="0"
                  role="button"
                  aria-label="Open ${escapeHtml(policySummary.title)} policy details"
                >
                  <div class="client-coverage-policy-topline">
                    <strong>${escapeHtml(policySummary.title)}</strong>
                    <span>${escapeHtml(policySummary.deathBenefitLabel)}</span>
                  </div>
                  <div class="client-coverage-policy-meta">
                    <span>${escapeHtml(policySummary.classificationLabel)}</span>
                    <span>${escapeHtml(policySummary.insuredLabel)}</span>
                  </div>
                  <div class="client-coverage-policy-meta">
                    <span>Policy ${escapeHtml(formatValue(policy.policyNumber || `#${index + 1}`))}</span>
                    <span>Effective ${escapeHtml(formatDate(policy.effectiveDate))}</span>
                  </div>
                </article>
              `;
            }).join("")}
          </div>
        `;
      }

      function closePolicyModal() {
        if (!policyModal) {
          return;
        }
        closePolicyDocumentMenu();
        closePolicyDocumentRenameModal();
        closePolicyDocumentDeleteModal();
        policyModal.hidden = true;
        activePolicyIndex = -1;
        syncModalLock();
      }

      function openPolicyModal(index) {
        const policies = getCoveragePolicies();
        const policy = policies[index];
        if (!policyModal || !policyModalBody || !policy || !policyModalTitle) {
          return;
        }

        activePolicyIndex = index;
        closePolicyDocumentMenu();
        policyModalTitle.textContent = getPolicyModalTitleText(policy);
        if (policyModalBadge) {
          policyModalBadge.textContent = getPolicyModalBadgeText(policy);
        }
        if (policyModalSubtitle) {
          policyModalSubtitle.textContent = getPolicyModalSubtitleText(policy);
        }
        if (policyModalMetrics) {
          policyModalMetrics.innerHTML = renderPolicyModalMetrics(policy);
        }
        if (policyModalStatus) {
          policyModalStatus.innerHTML = renderPolicyModalStatus(policy);
        }
        policyModalBody.innerHTML = renderPolicyModalBody(policy);
        policyModal.hidden = false;
        syncModalLock();
      }

      function closePolicyDocumentMenu() {
        if (!policyDocumentMenu) {
          return;
        }
        policyDocumentMenu.hidden = true;
        policyDocumentMenu.style.left = "";
        policyDocumentMenu.style.top = "";
        activePolicyDocumentIndex = -1;
      }

      function openPolicyDocumentMenu(documentIndex, x, y) {
        if (!policyDocumentMenu || !policyModalPanel || activePolicyIndex < 0 || documentIndex < 0) {
          return;
        }

        activePolicyDocumentIndex = documentIndex;
        policyDocumentMenu.hidden = false;
        const panelRect = policyModalPanel.getBoundingClientRect();
        const menuRect = policyDocumentMenu.getBoundingClientRect();
        const horizontalInset = 12;
        const verticalInset = 12;
        const safeLeft = Math.max(
          horizontalInset,
          Math.min(x - panelRect.left, panelRect.width - menuRect.width - horizontalInset)
        );
        const safeTop = Math.max(
          verticalInset,
          Math.min(y - panelRect.top, panelRect.height - menuRect.height - verticalInset)
        );
        policyDocumentMenu.style.left = `${safeLeft}px`;
        policyDocumentMenu.style.top = `${safeTop}px`;
      }

      async function openPolicyDocumentRenameModal(policyIndex, documentIndex) {
        const selection = await getStoredPolicyDocumentSelection(policyIndex, documentIndex);
        if (!selection || !policyDocumentRenameModal || !policyDocumentRenameInput) {
          if (!selection) {
            window.alert("No saved policy file was found for this policy.");
          }
          return false;
        }

        activePolicyDocumentIndex = selection.documentIndex;
        policyDocumentRenameInput.value = selection.documentName;
        policyDocumentRenameInput.dataset.currentPolicyDocumentName = selection.documentName;
        if (policyDocumentRenameCopy) {
          policyDocumentRenameCopy.textContent = `Rename "${selection.documentName}"?`;
        }
        policyDocumentRenameModal.hidden = false;
        syncModalLock();
        window.requestAnimationFrame(function () {
          policyDocumentRenameInput.focus();
          policyDocumentRenameInput.select();
        });
        return true;
      }

      function closePolicyDocumentRenameModal() {
        if (!policyDocumentRenameModal) {
          return;
        }
        policyDocumentRenameModal.hidden = true;
        if (policyDocumentRenameInput) {
          policyDocumentRenameInput.value = "";
          policyDocumentRenameInput.dataset.currentPolicyDocumentName = "";
        }
        syncModalLock();
      }

      async function openPolicyDocumentDeleteModal(policyIndex, documentIndex) {
        const selection = await getStoredPolicyDocumentSelection(policyIndex, documentIndex);
        if (!selection || !policyDocumentDeleteModal) {
          if (!selection) {
            window.alert("No saved policy file was found for this policy.");
          }
          return false;
        }

        activePolicyDocumentIndex = selection.documentIndex;
        if (policyDocumentDeleteCopy) {
          policyDocumentDeleteCopy.textContent = `Delete "${selection.documentName}" from this policy? This will remove it from the saved policy files.`;
        }
        policyDocumentDeleteModal.hidden = false;
        syncModalLock();
        return true;
      }

      function closePolicyDocumentDeleteModal() {
        if (!policyDocumentDeleteModal) {
          return;
        }
        policyDocumentDeleteModal.hidden = true;
        syncModalLock();
      }

      async function getStoredPolicyDocumentSelection(policyIndex, documentIndex) {
        const policies = getCoveragePolicies();
        const policy = policies[policyIndex];
        const policyDocuments = getPolicyDocumentEntries(policy);
        if (!policy?.id || !policyDocuments.length) {
          return null;
        }

        const savedDocuments = await getPolicyDocumentFiles(String(record.id || "").trim(), policy.id);
        const storedFiles = Array.isArray(savedDocuments?.files) ? savedDocuments.files : [];
        const safeDocumentIndex = Math.max(0, Math.min(storedFiles.length - 1, Number(documentIndex) || 0));
        const selectedDocument = storedFiles[safeDocumentIndex];
        if (!selectedDocument?.file) {
          return null;
        }

        return {
          policy,
          policyIndex,
          documentIndex: safeDocumentIndex,
          documentName: selectedDocument.name || policyDocuments[safeDocumentIndex]?.name || "policy-file",
          fileEntry: selectedDocument
        };
      }

      async function renamePolicyDocument(policyIndex, documentIndex, nextNameInput) {
        const selection = await getStoredPolicyDocumentSelection(policyIndex, documentIndex);
        if (!selection) {
          window.alert("No saved policy file was found for this policy.");
          return false;
        }

        const normalizedName = normalizePolicyDocumentName(nextNameInput, selection.documentName);
        if (!normalizedName || normalizedName === selection.documentName) {
          return false;
        }

        const updatedFiles = await updateStoredPolicyDocumentFiles(String(record.id || "").trim(), selection.policy.id, function (existingFiles) {
          return existingFiles.map(function (item, index) {
            if (index !== selection.documentIndex) {
              return item;
            }
            return {
              ...item,
              name: normalizedName
            };
          });
        });

        syncPolicyDocumentMetadata(String(record.id || "").trim(), selection.policy.id, updatedFiles);
        openPolicyModal(policyIndex);
        return true;
      }

      async function deletePolicyDocumentEntry(policyIndex, documentIndex) {
        const selection = await getStoredPolicyDocumentSelection(policyIndex, documentIndex);
        if (!selection) {
          window.alert("No saved policy file was found for this policy.");
          return false;
        }

        const updatedFiles = await updateStoredPolicyDocumentFiles(String(record.id || "").trim(), selection.policy.id, function (existingFiles) {
          return existingFiles.filter(function (_item, index) {
            return index !== selection.documentIndex;
          });
        });

        syncPolicyDocumentMetadata(String(record.id || "").trim(), selection.policy.id, updatedFiles);
        openPolicyModal(policyIndex);
        return true;
      }

      async function sharePolicyDocument(policyIndex, documentIndex) {
        const selection = await getStoredPolicyDocumentSelection(policyIndex, documentIndex);
        if (!selection) {
          window.alert("No saved policy file was found for this policy.");
          return false;
        }

        const fileBlob = selection.fileEntry.file;
        const fileName = selection.documentName;
        const fileType = String(selection.fileEntry.type || fileBlob?.type || "").trim();
        const shareFile = fileBlob instanceof File
          ? fileBlob
          : new File([fileBlob], fileName, { type: fileType || "application/octet-stream" });

        if (navigator.share) {
          try {
            if (typeof navigator.canShare !== "function" || navigator.canShare({ files: [shareFile] })) {
              await navigator.share({
                files: [shareFile],
                title: fileName,
                text: fileName
              });
              return true;
            }
          } catch (error) {
            if (error?.name === "AbortError") {
              return false;
            }
          }
        }

        window.alert("Sharing isn't supported in this browser for saved policy files yet.");
        return false;
      }

      async function addPolicyDocuments(policyIndex, files) {
        const policies = getCoveragePolicies();
        const policy = policies[policyIndex];
        const nextFiles = Array.from(files || []).filter(Boolean);
        if (!policy?.id || !nextFiles.length) {
          return false;
        }

        try {
          await savePolicyDocumentFiles(String(record.id || "").trim(), policy.id, nextFiles, {
            append: true
          });
          const savedDocuments = await getPolicyDocumentFiles(String(record.id || "").trim(), policy.id);
          const updatedFiles = Array.isArray(savedDocuments?.files) ? savedDocuments.files : [];
          syncPolicyDocumentMetadata(String(record.id || "").trim(), policy.id, updatedFiles);
          openPolicyModal(policyIndex);
          return true;
        } catch (error) {
          window.alert("Unable to add files to this policy right now.");
          return false;
        }
      }

      function closePolicyListModal() {
        if (!policyListModal) {
          return;
        }
        policyListModal.hidden = true;
        syncModalLock();
      }

      function openPremiumTimelineModal() {
        const policies = getCoveragePolicies();
        if (!premiumTimelineModal || !premiumTimelineModalBody || !premiumTimelineModalSummary || !policies.length) {
          return;
        }

        premiumTimelineModalSummary.innerHTML = renderPremiumTimelineModalSummary(policies);
        premiumTimelineModalBody.innerHTML = renderPremiumTimelineModalBody(policies, record);
        premiumTimelineModal.hidden = false;
        syncModalLock();
      }

      function closePremiumTimelineModal() {
        if (!premiumTimelineModal) {
          return;
        }

        premiumTimelineModal.hidden = true;
        syncModalLock();
      }

      function openPmiDetailModal() {
        if (!pmiDetailModal || !pmiDetailModalBody) {
          return;
        }

        pmiDetailModalBody.innerHTML = renderPmiDetailModalBody(record);
        pmiDetailModal.hidden = false;
        syncModalLock();
      }

      function closePmiDetailModal() {
        if (!pmiDetailModal) {
          return;
        }
        pmiDetailModal.hidden = true;
        syncModalLock();
      }

      function openPolicyDeleteModal() {
        if (!policyDeleteModal || activePolicyIndex < 0) {
          return;
        }
        policyDeleteModal.hidden = false;
        syncModalLock();
      }

      function closePolicyDeleteModal() {
        if (!policyDeleteModal) {
          return;
        }
        policyDeleteModal.hidden = true;
        syncModalLock();
      }

      function openProfileDeleteModal() {
        if (!profileDeleteModal) {
          return;
        }
        profileDeleteModal.hidden = false;
        syncModalLock();
      }

      function closeProfileDeleteModal() {
        if (!profileDeleteModal) {
          return;
        }
        profileDeleteModal.hidden = true;
        syncModalLock();
      }

      function openActivityDetailModal(index) {
        const entries = Array.isArray(record.activityLog) ? record.activityLog : [];
        const entry = entries[index];
        if (!activityDetailModal || !activityDetailBody || !entry) {
          return;
        }
        activeActivityIndex = index;
        activeActivityEditMode = false;
        if (activityDetailTitle) {
          activityDetailTitle.textContent = `${getActivityPreviewLabel(entry)} Activity`;
        }
        activityDetailBody.innerHTML = renderActivityDetailModalBody(entry);
        activityDetailModal.hidden = false;
        window.requestAnimationFrame(function () {
          activityDetailModal.classList.add("is-open");
        });
        syncModalLock();
      }

      function closeActivityDetailModal() {
        if (!activityDetailModal) {
          return;
        }
        activityDetailModal.classList.remove("is-open");
        window.setTimeout(function () {
          if (!activityDetailModal.classList.contains("is-open")) {
            activityDetailModal.hidden = true;
            syncModalLock();
          }
        }, 180);
        if (!activityDeleteModal || activityDeleteModal.hidden) {
          activeActivityIndex = -1;
          activeActivityEditMode = false;
        }
        syncModalLock();
      }

      function openActivityDeleteModal() {
        if (!activityDeleteModal || activeActivityIndex < 0) {
          return;
        }
        activityDeleteModal.hidden = false;
        syncModalLock();
      }

      function closeActivityDeleteModal() {
        if (!activityDeleteModal) {
          return;
        }
        activityDeleteModal.hidden = true;
        syncModalLock();
      }

      function removeFirstMatchingNoteLine(notes, targetLine) {
        const normalizedTarget = String(targetLine || "").trim();
        const noteLines = String(notes || "").split(/\r?\n+/);
        let removed = false;
        return noteLines.filter(function (line) {
          const normalizedLine = String(line || "").trim();
          if (!removed && normalizedTarget && normalizedLine === normalizedTarget) {
            removed = true;
            return false;
          }
          return Boolean(normalizedLine);
        }).join("\n");
      }

      function replaceFirstMatchingNoteLine(notes, oldLine, nextLine) {
        const normalizedOld = String(oldLine || "").trim();
        const normalizedNext = String(nextLine || "").trim();
        const noteLines = String(notes || "").split(/\r?\n+/);
        let replaced = false;
        const nextLines = noteLines.map(function (line) {
          const normalizedLine = String(line || "").trim();
          if (!replaced && normalizedOld && normalizedLine === normalizedOld) {
            replaced = true;
            return normalizedNext;
          }
          return normalizedLine;
        }).filter(Boolean);
        if (!replaced && normalizedNext) {
          nextLines.unshift(normalizedNext);
        }
        return nextLines.join("\n");
      }

      function buildEditedActivityEntry(originalEntry, formData) {
        const toValue = function (key) {
          return String(formData.get(key) || "").trim();
        };
        const type = String(originalEntry?.type || "").trim().toLowerCase();
        const subject = toValue("subject") || String(originalEntry?.subject || "").trim();
        const detail = toValue("detail");
        const date = toValue("date") || String(originalEntry?.date || "").trim() || getActivityDefaultDate();
        const direction = toValue("direction") || String(originalEntry?.direction || "").trim();
        const label = getActivityPreviewLabel(originalEntry);

        if (type === "note") {
          return {
            ...originalEntry,
            type,
            date,
            subject: subject || detail,
            detailRemainder: subject && detail ? detail : "",
            summary: subject ? `Note: ${subject}${detail ? ` - ${detail}` : ""}` : `Note: ${detail}`
          };
        }

        return {
          ...originalEntry,
          type,
          date,
          direction,
          subject,
          detailRemainder: detail,
          summary: `${label}${direction ? ` (${direction})` : ""}${subject ? `: ${subject}` : ""}${detail ? ` - ${detail}` : ""}`
        };
      }

      function deleteActivity(index) {
        const records = loadJson(localStorage, getRecordsStorageKey());
        if (!Array.isArray(records) || index < 0) {
          return false;
        }

        const recordIndex = records.findIndex(function (item) {
          return String(item?.id || "").trim() === String(record.id || "").trim();
        });

        if (recordIndex === -1) {
          return false;
        }

        const currentRecord = records[recordIndex];
        const activityEntries = Array.isArray(currentRecord.activityLog) ? currentRecord.activityLog.slice() : [];
        if (index >= activityEntries.length) {
          return false;
        }

        const removedEntry = activityEntries.splice(index, 1)[0];
        const nextNotes = removeFirstMatchingNoteLine(currentRecord.clientNotes, removedEntry?.summary || "");
        const latestActivityDate = activityEntries.length ? String(activityEntries[0]?.date || "").trim() : "";
        const today = new Date().toISOString().slice(0, 10);
        const nextRecord = {
          ...currentRecord,
          activityLog: activityEntries,
          clientNotes: nextNotes,
          lastUpdatedDate: today,
          lastReview: today,
          lastContactDate: latestActivityDate || ""
        };

        records[recordIndex] = nextRecord;
        localStorage.setItem(getRecordsStorageKey(), JSON.stringify(records));
        Object.assign(record, nextRecord);
        return true;
      }

      function updateActivity(index, nextEntry) {
        const records = loadJson(localStorage, getRecordsStorageKey());
        if (!Array.isArray(records) || index < 0 || !nextEntry) {
          return false;
        }

        const recordIndex = records.findIndex(function (item) {
          return String(item?.id || "").trim() === String(record.id || "").trim();
        });

        if (recordIndex === -1) {
          return false;
        }

        const currentRecord = records[recordIndex];
        const activityEntries = Array.isArray(currentRecord.activityLog) ? currentRecord.activityLog.slice() : [];
        if (index >= activityEntries.length) {
          return false;
        }

        const previousEntry = activityEntries[index];
        activityEntries[index] = {
          ...previousEntry,
          ...nextEntry
        };

        const nextNotes = replaceFirstMatchingNoteLine(currentRecord.clientNotes, previousEntry?.summary || "", activityEntries[index]?.summary || "");
        const latestActivityDate = activityEntries.length ? String(activityEntries[0]?.date || "").trim() : "";
        const today = new Date().toISOString().slice(0, 10);
        const nextRecord = {
          ...currentRecord,
          activityLog: activityEntries,
          clientNotes: nextNotes,
          lastUpdatedDate: today,
          lastReview: today,
          lastContactDate: latestActivityDate || ""
        };

        records[recordIndex] = nextRecord;
        localStorage.setItem(getRecordsStorageKey(), JSON.stringify(records));
        Object.assign(record, nextRecord);
        return true;
      }

      async function deletePolicy(index) {
        const records = loadJson(localStorage, getRecordsStorageKey());
        if (!Array.isArray(records) || index < 0) {
          return false;
        }

        const recordIndex = records.findIndex(function (item) {
          return String(item?.id || "").trim() === String(record.id || "").trim();
        });

        if (recordIndex === -1) {
          return false;
        }

        const currentRecord = records[recordIndex];
        const policies = Array.isArray(currentRecord.coveragePolicies) ? currentRecord.coveragePolicies.slice() : [];
        if (index >= policies.length) {
          return false;
        }

        const removedPolicy = policies.splice(index, 1)[0];

        const today = new Date().toISOString().slice(0, 10);
        const coverageSummaryFields = getCoverageProfileSummaryFields(policies);
        const nextRecord = {
          ...currentRecord,
          coveragePolicies: policies,
          ...coverageSummaryFields,
          lastUpdatedDate: today,
          lastReview: today
        };

        const syncedNextRecord = synchronizeRecordCoverageFields(nextRecord);

        records[recordIndex] = syncedNextRecord;
        localStorage.setItem(getRecordsStorageKey(), JSON.stringify(records));
        Object.assign(record, syncedNextRecord);

        if (removedPolicy?.id) {
          await deletePolicyDocumentFile(String(record.id || "").trim(), removedPolicy.id);
        }

        return true;
      }

      async function deleteCurrentProfile() {
        const records = loadJson(localStorage, getRecordsStorageKey());
        if (!Array.isArray(records)) {
          return false;
        }

        const currentId = String(record?.id || "").trim();
        const currentRecord = records.find(function (item) {
          return String(item?.id || "").trim() === currentId;
        }) || null;
        const nextRecords = records.filter(function (item) {
          return String(item?.id || "").trim() !== currentId;
        });

        if (nextRecords.length === records.length) {
          return false;
        }

        const policyIds = Array.isArray(currentRecord?.coveragePolicies)
          ? currentRecord.coveragePolicies.map(function (policy) { return String(policy?.id || "").trim(); }).filter(Boolean)
          : [];

        if (policyIds.length) {
          await Promise.all(policyIds.map(function (policyId) {
            return deletePolicyDocumentFile(currentId, policyId).catch(function () {
              return false;
            });
          }));
        }

        localStorage.setItem(getRecordsStorageKey(), JSON.stringify(nextRecords));
        return true;
      }

      function openPolicyListModal() {
        const policies = getCoveragePolicies();
        if (!policyListModal || !policyListModalBody || !policies.length) {
          return;
        }

        policyListModalBody.innerHTML = renderPolicyListModalBody(policies);
        policyListModal.hidden = false;
        syncModalLock();

        policyListModalBody.querySelectorAll("[data-policy-list-card]").forEach(function (card) {
          const index = Number(card.dataset.policyIndex || "-1");
          if (index < 0) {
            return;
          }

          card.addEventListener("click", function () {
            closePolicyListModal();
            openPolicyModal(index);
          });

          card.addEventListener("keydown", function (event) {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              closePolicyListModal();
              openPolicyModal(index);
            }
          });
        });
      }

      async function openPolicyDocument(index, documentIndex) {
        try {
          const selection = await getStoredPolicyDocumentSelection(index, documentIndex);
          if (!selection?.fileEntry?.file) {
            window.alert("No saved policy file was found for this policy.");
            return;
          }

          const fileBlob = selection.fileEntry.file;
          const url = URL.createObjectURL(fileBlob);
          const fileName = selection.documentName || "policy-file";
          const isZipFile = /\.zip$/i.test(fileName) || String(selection.fileEntry?.type || "").toLowerCase().includes("zip");
          const openedWindow = isZipFile ? null : window.open(url, "_blank", "noopener,noreferrer");

          if (!openedWindow) {
            const downloadLink = document.createElement("a");
            downloadLink.href = url;
            downloadLink.download = fileName;
            document.body.appendChild(downloadLink);
            downloadLink.click();
            document.body.removeChild(downloadLink);
          }

          window.setTimeout(function () {
            URL.revokeObjectURL(url);
          }, 60000);
        } catch (error) {
          window.alert("Unable to open the saved policy file right now.");
        }
      }

      function closeStatEditor() {
        if (!statModal) {
          return;
        }
        statModal.hidden = true;
        syncModalLock();
        activeStatField = "";
        activeStatTitle = "";
      }

      function openStatEditor(fieldName, title) {
        if (!statModal || !statModalInput || !statModalTitle || !statModalLabel) {
          return;
        }
        activeStatField = fieldName;
        activeStatTitle = title;
        statModalTitle.textContent = `Edit ${title}`;
        statModalLabel.textContent = `Edit ${title}`;
        statModalInput.value = normalizeCurrencyInput(record[fieldName] || "0");
        statModal.hidden = false;
        syncModalLock();
        statModalInput.focus();
        statModalInput.select();
      }

      const statToggles = host.querySelectorAll("[data-stat-edit-toggle]");

      statToggles.forEach(function (toggle) {
        const fieldName = String(toggle.dataset.statEditToggle || "").trim();
        const display = host.querySelector(`[data-stat-display="${fieldName}"]`);
        const title = toggle.closest(".client-detail-stat-card")?.querySelector(".client-detail-stat-title")?.textContent?.trim() || "Value";

        if (!display || !toggle) {
          return;
        }

        toggle.addEventListener("click", function () {
          openStatEditor(fieldName, title);
        });
      });

      if (statModalInput && statModalSave && statModalCancel && statModalClose) {
        statModalInput.addEventListener("beforeinput", function (event) {
          if (!event.data) {
            return;
          }

          if (!/^[0-9.]$/.test(event.data)) {
            event.preventDefault();
          }
        });

        statModalInput.addEventListener("input", function () {
          statModalInput.value = normalizeCurrencyInput(statModalInput.value);
        });

        statModalCancel.addEventListener("click", function () {
          statModalInput.value = formatEditableCurrency(record[activeStatField] || "0");
          closeStatEditor();
        });

        statModalClose.addEventListener("click", function () {
          closeStatEditor();
        });

        statModalSave.addEventListener("click", function () {
          if (!activeStatField) {
            return;
          }

          const display = host.querySelector(`[data-stat-display="${activeStatField}"]`);
          const normalized = normalizeCurrencyInput(statModalInput.value);
          const clamped = clampStatValue(activeStatField, normalized);
          saveRecordField(activeStatField, clamped);
          if (display) {
            refreshCoverageStatDisplays();
          }
          scheduleResponsiveCoverageStatDisplaySync();
          if (activeStatField === "currentCoverage" || activeStatField === "modeledNeed") {
            refreshCoverageAdequacy();
            refreshPrimaryActionPanel();
          }
          statModalInput.value = formatEditableCurrency(clamped);
          closeStatEditor();
        });

        statModalInput.addEventListener("keydown", function (event) {
          if (event.key === "Escape") {
            closeStatEditor();
          }

          if (event.key === "Enter") {
            event.preventDefault();
            statModalSave.click();
          }
        });
      }

      policyModalCloseButtons.forEach(function (button) {
        button.addEventListener("click", function () {
          closePolicyModal();
        });
      });

      policyDocumentRenameCloseButtons.forEach(function (button) {
        button.addEventListener("click", function () {
          closePolicyDocumentRenameModal();
        });
      });

      policyDocumentDeleteCloseButtons.forEach(function (button) {
        button.addEventListener("click", function () {
          closePolicyDocumentDeleteModal();
        });
      });

      policyListModalCloseButtons.forEach(function (button) {
        button.addEventListener("click", function () {
          closePolicyListModal();
        });
      });

      premiumTimelineModalCloseButtons.forEach(function (button) {
        button.addEventListener("click", function () {
          closePremiumTimelineModal();
        });
      });

      policyDeleteModalCloseButtons.forEach(function (button) {
        button.addEventListener("click", function () {
          closePolicyDeleteModal();
        });
      });

      profileDeleteModalCloseButtons.forEach(function (button) {
        button.addEventListener("click", function () {
          closeProfileDeleteModal();
        });
      });

      activityDeleteCloseButtons.forEach(function (button) {
        button.addEventListener("click", function () {
          closeActivityDeleteModal();
        });
      });

      if (pmiDetailOpen) {
        pmiDetailOpen.addEventListener("click", function () {
          openPmiDetailModal();
        });
      }

      host.querySelectorAll("[data-linked-case-ref]").forEach(function (link) {
        link.addEventListener("click", function () {
          const linkedCaseRef = String(link.getAttribute("data-linked-case-ref") || "").trim();
          const linkedRecordId = String(link.getAttribute("data-linked-record-id") || "").trim();
          if (linkedCaseRef) {
            window.setLensLinkedCaseRef?.(linkedCaseRef);
          }
          if (linkedRecordId) {
            window.setLensLinkedRecordId?.(linkedRecordId);
          }
        });
      });

      pmiDetailCloseButtons.forEach(function (button) {
        button.addEventListener("click", function () {
          closePmiDetailModal();
        });
      });

      if (coverageWidgetBack) {
        coverageWidgetBack.addEventListener("click", function () {
          if (activeCoverageStep > 0) {
            syncCoverageDraftFromForm();
            goToCoverageWidgetStep(activeCoverageStep - 1);
            return;
          }

          closeCoverageWidget({
            reopenPolicy: coverageWidgetReturnIndex >= 0
          });
        });
      }

      if (coverageWidgetCancel) {
        coverageWidgetCancel.addEventListener("click", function () {
          closeCoverageWidget({
            reopenPolicy: coverageWidgetReturnIndex >= 0
          });
        });
      }

      coverageWidgetCloseButtons.forEach(function (button) {
        button.addEventListener("click", function () {
          closeCoverageWidget({
            reopenPolicy: coverageWidgetReturnIndex >= 0
          });
        });
      });

      if (coverageWidget) {
        coverageWidget.addEventListener("click", function (event) {
          const stepButton = event.target.closest("[data-coverage-step-target]");
          if (stepButton && coverageWidget.contains(stepButton)) {
            syncCoverageDraftFromForm();
            const requestedStep = Number(stepButton.getAttribute("data-coverage-step-target") || "0");
            if (requestedStep > activeCoverageStep) {
              const currentStepError = getCoverageDraftValidationError(activeCoverageStep);
              if (currentStepError) {
                showCoverageWidgetFeedback(getCoverageWidgetValidationMessage(currentStepError));
                refreshCoverageWidgetProgress();
                return;
              }
            }

            goToCoverageWidgetStep(requestedStep);
            return;
          }

          const modeButton = event.target.closest("[data-coverage-mode]");
          if (!modeButton || !coverageWidget.contains(modeButton)) {
            return;
          }
          const nextMode = String(modeButton.getAttribute("data-coverage-mode") || "").trim();
          setCoverageWidgetPremiumMode(nextMode);
          refreshCoverageWidgetActions();
          refreshCoverageWidgetProgress();
        });

        coverageWidget.addEventListener("beforeinput", function (event) {
          const input = event.target;
          if (!(input instanceof HTMLInputElement) || !event.data) {
            return;
          }

          if (input.inputMode === "numeric" && !/^[0-9]$/.test(event.data)) {
            event.preventDefault();
            return;
          }

          if (input.inputMode === "decimal" && !/^[0-9.]$/.test(event.data)) {
            event.preventDefault();
          }
        });

        coverageWidget.addEventListener("keydown", function (event) {
          const input = event.target;
          if (!(input instanceof HTMLInputElement) || input.name !== "insuredName") {
            return;
          }

          if (event.key === "Tab" && !event.shiftKey && !event.altKey && !event.ctrlKey && !event.metaKey) {
            if (acceptCoverageInsuredSuggestion()) {
              event.preventDefault();
              window.requestAnimationFrame(function () {
                const ownerField = coverageWidget?.querySelector('[name="ownerName"]');
                if (ownerField instanceof HTMLInputElement || ownerField instanceof HTMLSelectElement || ownerField instanceof HTMLTextAreaElement) {
                  ownerField.focus();
                }
              });
            }
          }
        });

        coverageWidget.addEventListener("input", function (event) {
          const input = event.target;
          if (!(input instanceof HTMLInputElement)) {
            if (event.target instanceof HTMLTextAreaElement || event.target instanceof HTMLSelectElement) {
              syncCoverageDraftFromField(event.target);
              refreshCoverageWidgetProgress();
            }
            return;
          }

          if (input.inputMode === "decimal") {
            const rawValue = input.value;
            syncCoverageDraftFromField(input);
            input.value = formatCoverageCurrencyEditingInput(rawValue);
            refreshCoverageInsuredSuggestion();
            refreshCoverageWidgetProgress();
            return;
          }

          if (input.inputMode === "numeric") {
            input.value = String(input.value || "").replace(/\D/g, "");
          }

          syncCoverageDraftFromField(input);
          if (input.name === "premiumScheduleYears" || input.name === "premiumScheduleMonths") {
            syncCoveragePremiumScheduleDraft();
          }
          refreshCoverageInsuredSuggestion();
          refreshCoverageWidgetProgress();
        });

        coverageWidget.addEventListener("focusout", function (event) {
          const input = event.target;
          if (!(input instanceof HTMLInputElement) || input.inputMode !== "decimal") {
            return;
          }

          syncCoverageDraftFromField(input);
          input.value = formatCoverageCurrencyInput(input.value);
        });

        coverageWidget.addEventListener("change", function (event) {
          const target = event.target;
          if (!(target instanceof HTMLInputElement) && !(target instanceof HTMLSelectElement)) {
            return;
          }

          syncCoverageDraftFromField(target);

          if (target.type === "file") {
            refreshCoverageWidgetDocumentPreview();
          }

          if (target.name === "premiumScheduleYears" || target.name === "premiumScheduleMonths") {
            syncCoveragePremiumScheduleDraft();
          }

          refreshCoverageInsuredSuggestion();
          refreshCoverageWidgetProgress();
        });

        coverageWidget.addEventListener("submit", async function (event) {
          event.preventDefault();
          syncCoverageDraftFromForm();

          const finalStepIndex = COVERAGE_WIDGET_STEPS.length - 1;
          if (activeCoverageStep < finalStepIndex) {
            const currentStepError = getCoverageDraftValidationError(activeCoverageStep);
            if (currentStepError) {
              showCoverageWidgetFeedback(getCoverageWidgetValidationMessage(currentStepError));
              refreshCoverageWidgetProgress();
              return;
            }

            goToCoverageWidgetStep(activeCoverageStep + 1);
            return;
          }

          const validationError = getCoverageDraftValidationError();
          if (validationError) {
            goToCoverageWidgetStep(validationError.stepIndex, {
              clearFeedback: false,
              focusSelector: validationError.focusSelector
            });
            showCoverageWidgetFeedback(getCoverageWidgetValidationMessage(validationError));
            return;
          }

          const selectedPremiumMode = String(activeCoverageDraft?.premiumMode || "").trim();
          const steppedPremiumMode = isCoverageSteppedPremiumMode(selectedPremiumMode);
          const policy = {
            policyCarrier: String(activeCoverageDraft?.policyCarrier || "").trim(),
            policyType: String(activeCoverageDraft?.policyType || "").trim(),
            insuredName: String(activeCoverageDraft?.insuredName || "").trim(),
            ownerName: String(activeCoverageDraft?.ownerName || "").trim(),
            faceAmount: normalizeCoverageCurrencyValue(activeCoverageDraft?.faceAmount),
            startingPremium: steppedPremiumMode ? normalizeCoverageCurrencyValue(activeCoverageDraft?.startingPremium) : "",
            premiumAmount: normalizeCoverageCurrencyValue(activeCoverageDraft?.premiumAmount),
            premiumMode: selectedPremiumMode,
            premiumScheduleYears: steppedPremiumMode ? String(activeCoverageDraft?.premiumScheduleYears || "").replace(/\D/g, "") : "",
            premiumScheduleMonths: steppedPremiumMode ? String(activeCoverageDraft?.premiumScheduleMonths || "").replace(/\D/g, "") : "",
            premiumScheduleDuration: steppedPremiumMode ? String(activeCoverageDraft?.premiumScheduleDuration || "").trim() : "",
            termLength: isCoveragePermanentPolicyType(activeCoverageDraft?.policyType) ? "Permanent Coverage" : String(activeCoverageDraft?.termLength || "").trim(),
            policyNumber: String(activeCoverageDraft?.policyNumber || "").trim(),
            effectiveDate: String(activeCoverageDraft?.effectiveDate || "").trim(),
            underwritingClass: String(activeCoverageDraft?.underwritingClass || "").trim(),
            beneficiaryName: String(activeCoverageDraft?.beneficiaryName || "").trim(),
            policyNotes: String(activeCoverageDraft?.policyNotes || "").trim()
          };

          const selectedPolicyDocuments = activeCoverageDocumentFiles;
          let saveResult = null;

          try {
            saveResult = await saveCoveragePolicy(
              String(record.id || "").trim(),
              policy,
              activeCoveragePolicyIndex,
              selectedPolicyDocuments
            );
          } catch (error) {
            saveResult = {
              error: "Unable to save the policy file right now."
            };
          }

          if (!saveResult || saveResult.error) {
            showCoverageWidgetFeedback(saveResult?.error || "Unable to save this policy.");
            return;
          }

          closeCoverageWidget();
          refreshCoverageUi();
        });
      }

      if (policyDocumentRenameForm) {
        policyDocumentRenameForm.addEventListener("submit", async function (event) {
          event.preventDefault();
          if (!policyDocumentRenameInput || activePolicyIndex < 0 || activePolicyDocumentIndex < 0) {
            closePolicyDocumentRenameModal();
            return;
          }

          const currentName = String(policyDocumentRenameInput.dataset.currentPolicyDocumentName || "").trim();
          const normalizedName = normalizePolicyDocumentName(policyDocumentRenameInput.value, currentName);
          if (!normalizedName) {
            policyDocumentRenameInput.focus();
            policyDocumentRenameInput.select();
            return;
          }

          if (normalizedName === currentName) {
            closePolicyDocumentRenameModal();
            return;
          }

          const wasRenamed = await renamePolicyDocument(activePolicyIndex, activePolicyDocumentIndex, normalizedName);
          if (!wasRenamed) {
            policyDocumentRenameInput.focus();
            policyDocumentRenameInput.select();
            return;
          }

          closePolicyDocumentRenameModal();
        });
      }

      if (policyDocumentDeleteConfirm) {
        policyDocumentDeleteConfirm.addEventListener("click", async function () {
          if (activePolicyIndex < 0 || activePolicyDocumentIndex < 0) {
            closePolicyDocumentDeleteModal();
            return;
          }

          const wasDeleted = await deletePolicyDocumentEntry(activePolicyIndex, activePolicyDocumentIndex);
          closePolicyDocumentDeleteModal();
          if (!wasDeleted) {
            return;
          }
        });
      }

      if (policyDocumentAddInput) {
        policyDocumentAddInput.addEventListener("change", async function () {
          const selectedFiles = Array.from(policyDocumentAddInput.files || []).filter(Boolean);
          if (!selectedFiles.length || activePolicyIndex < 0) {
            policyDocumentAddInput.value = "";
            return;
          }

          await addPolicyDocuments(activePolicyIndex, selectedFiles);
          policyDocumentAddInput.value = "";
        });
      }

      if (policyEditToggle) {
        policyEditToggle.addEventListener("click", function () {
          if (activePolicyIndex < 0) {
            return;
          }
          openCoverageWidget(activePolicyIndex, true);
        });
      }

      if (policyDeleteToggle) {
        policyDeleteToggle.addEventListener("click", function () {
          if (activePolicyIndex < 0) {
            return;
          }
          openPolicyDeleteModal();
        });
      }

      if (policyDeleteConfirm) {
        policyDeleteConfirm.addEventListener("click", async function () {
          if (activePolicyIndex < 0) {
            return;
          }
          const wasDeleted = await deletePolicy(activePolicyIndex);
          if (!wasDeleted) {
            closePolicyDeleteModal();
            return;
          }
          closePolicyDeleteModal();
          closePolicyModal();
          refreshCoverageUi();
        });
      }

      if (profileDeleteConfirm) {
        profileDeleteConfirm.addEventListener("click", async function () {
          const wasDeleted = await deleteCurrentProfile();
          closeProfileDeleteModal();
          if (!wasDeleted) {
            return;
          }
          closeViewerOrReturnToDirectory();
        });
      }

      if (activityDeleteConfirm) {
        activityDeleteConfirm.addEventListener("click", function () {
          if (activeActivityIndex < 0) {
            return;
          }
          const wasDeleted = deleteActivity(activeActivityIndex);
          closeActivityDeleteModal();
          if (!wasDeleted) {
            return;
          }
          closeActivityDetailModal();
          activeActivityIndex = -1;
          refreshActivityTracker();
        });
      }

      activityModalOpens.forEach(function (button) {
        button.addEventListener("click", function () {
          const localModal = button.closest(".client-notes-widget-card")?.querySelector("[data-activity-modal]");
          if (localModal && localModal.hidden === false) {
            closeActivityModal();
            return;
          }
          openActivityModal(button);
        });
      });

      activityModalCloseButtons.forEach(function (button) {
        button.addEventListener("click", function () {
          closeActivityModal();
        });
      });

      activityOptionButtons.forEach(function (button) {
        button.addEventListener("click", function () {
          const type = String(button.dataset.activityOption || "").trim();
          if (!type) {
            return;
          }
          openActivityWidget(type);
        });
      });

      if (activityWidgetBack) {
        activityWidgetBack.addEventListener("click", function () {
          const sourceTrigger = activityWidgetSourceTrigger;
          closeActivityWidget();
          window.setTimeout(function () {
            openActivityModal(sourceTrigger);
          }, 190);
        });
      }

      if (activityWidgetCancel) {
        activityWidgetCancel.addEventListener("click", function () {
          closeActivityWidget();
        });
      }

      activityWidgetCloseButtons.forEach(function (button) {
        button.addEventListener("click", function () {
          closeActivityWidget();
        });
      });

      if (activityWidget) {
        activityWidget.addEventListener("submit", function (event) {
          event.preventDefault();
          const entry = buildActivityEntry(activeActivityType, new FormData(activityWidget));
          if (!entry) {
            return;
          }
          const wasSaved = saveActivityEntry(entry);
          if (!wasSaved) {
            return;
          }
          refreshActivityTracker();
          closeActivityWidget();
          closeActivityModal();
        });
      }

      if (caseRefCopyButton) {
        caseRefCopyButton.addEventListener("click", async function () {
          const caseRef = String(caseRefCopyButton.dataset.caseRefCopy || "").trim();
          if (!caseRef || caseRef === "Not provided") {
            return;
          }

          const copied = await copyTextToClipboard(caseRef);
          if (!copied) {
            return;
          }

          caseRefCopyButton.classList.add("is-copied");
          window.setTimeout(function () {
            caseRefCopyButton.classList.remove("is-copied");
          }, 1200);
        });
      }

      const handleHostClick = async function (event) {
        const clickedInsidePolicyDocumentMenu = policyDocumentMenu?.contains(event.target) || false;
        if (policyDocumentMenu && !policyDocumentMenu.hidden && !clickedInsidePolicyDocumentMenu) {
          closePolicyDocumentMenu();
        }

        const overlayViewerClose = event.target.closest("[data-overlay-viewer-close]");
        if (overlayViewerClose && host.contains(overlayViewerClose)) {
          event.preventDefault();
          closeViewerOrReturnToDirectory();
          return;
        }

        const overlayRecordOpen = event.target.closest("[data-overlay-record-open]");
        if (overlayRecordOpen && host.contains(overlayRecordOpen)) {
          event.preventDefault();
          const nextRecordId = String(overlayRecordOpen.getAttribute("data-overlay-record-open") || "").trim();
          if (!nextRecordId) {
            return;
          }
          mountClientProfileViewer({
            host: host,
            recordId: nextRecordId,
            mode: isOverlayViewer ? "overlay" : "standalone",
            onClose: handleViewerClose
          });
          return;
        }

        const policyDocumentAction = event.target.closest("[data-policy-document-action]");
        if (policyDocumentAction && host.contains(policyDocumentAction)) {
          const requestedAction = String(policyDocumentAction.getAttribute("data-policy-document-action") || "").trim();
          const documentIndex = activePolicyDocumentIndex;
          closePolicyDocumentMenu();
          if (activePolicyIndex < 0 || documentIndex < 0) {
            return;
          }

          if (requestedAction === "open") {
            await openPolicyDocument(activePolicyIndex, documentIndex);
          } else if (requestedAction === "add-file") {
            if (policyDocumentAddInput) {
              policyDocumentAddInput.value = "";
              policyDocumentAddInput.click();
            }
          } else if (requestedAction === "rename") {
            await openPolicyDocumentRenameModal(activePolicyIndex, documentIndex);
          } else if (requestedAction === "share") {
            await sharePolicyDocument(activePolicyIndex, documentIndex);
          } else if (requestedAction === "delete") {
            await openPolicyDocumentDeleteModal(activePolicyIndex, documentIndex);
          }
          return;
        }

        const coverageAddOpen = event.target.closest("[data-coverage-add-open]");
        if (coverageAddOpen && host.contains(coverageAddOpen)) {
          if (coverageAddOpen.disabled) {
            return;
          }
          openCoverageWidget(-1, false);
          return;
        }

        const scrollToCoverage = event.target.closest("[data-scroll-to-coverage]");
        if (scrollToCoverage && host.contains(scrollToCoverage)) {
          scrollToProfileNavTarget("policies", { behavior: "smooth" });
          return;
        }

        const premiumTimelineOpen = event.target.closest("[data-coverage-premium-timeline-open]");
        if (premiumTimelineOpen && host.contains(premiumTimelineOpen)) {
          if (premiumTimelineOpen.disabled) {
            return;
          }
          openPremiumTimelineModal();
          return;
        }

        const coveragePolicyCard = event.target.closest("[data-coverage-policy-card]");
        if (coveragePolicyCard && host.contains(coveragePolicyCard)) {
          const index = Number(coveragePolicyCard.getAttribute("data-policy-index") || "-1");
          if (index >= 0) {
            openPolicyModal(index);
          }
          return;
        }

        const viewAllPolicies = event.target.closest("[data-view-all-policies]");
        if (viewAllPolicies && host.contains(viewAllPolicies)) {
          if (viewAllPolicies.disabled) {
            return;
          }
          openPolicyListModal();
          return;
        }

        const illustrationQuickAdd = event.target.closest("[data-illustration-quick-add]");
        if (illustrationQuickAdd && host.contains(illustrationQuickAdd)) {
          openActivityWidget("illustration-requested");
          return;
        }

        const activityEntry = event.target.closest("[data-activity-entry-open]");
        if (activityEntry && host.contains(activityEntry)) {
          const index = Number(activityEntry.getAttribute("data-activity-entry-open") || "-1");
          if (index >= 0) {
            openActivityDetailModal(index);
          }
          return;
        }

        const activityDetailClose = event.target.closest("[data-activity-detail-close]");
        if (activityDetailClose && host.contains(activityDetailClose)) {
          closeActivityDetailModal();
          return;
        }

        const activityEditToggle = event.target.closest("[data-activity-detail-edit-toggle]");
        if (activityEditToggle && host.contains(activityEditToggle)) {
          if (!activeActivityEditMode) {
            activeActivityEditMode = true;
            const entries = Array.isArray(record.activityLog) ? record.activityLog : [];
            if (activeActivityIndex >= 0 && activityDetailBody && entries[activeActivityIndex]) {
              activityDetailBody.innerHTML = renderActivityDetailModalBody(entries[activeActivityIndex]);
            }
          }
          return;
        }

        const activityDeleteToggle = event.target.closest("[data-activity-delete-toggle]");
        if (activityDeleteToggle && host.contains(activityDeleteToggle)) {
          openActivityDeleteModal();
          return;
        }

        const policyDocumentOpen = event.target.closest("[data-policy-document-open]");
        if (policyDocumentOpen && host.contains(policyDocumentOpen)) {
          if (activePolicyIndex >= 0) {
            openPolicyDocument(activePolicyIndex, Number(policyDocumentOpen.getAttribute("data-policy-document-index") || "0"));
          }
          return;
        }
      };
      host.addEventListener("click", handleHostClick);

      const handleHostContextMenu = function (event) {
        const policyDocumentEntry = event.target.closest("[data-policy-document-entry]");
        if (policyDocumentEntry && host.contains(policyDocumentEntry)) {
          event.preventDefault();
          const documentIndex = Number(policyDocumentEntry.getAttribute("data-policy-document-index") || "-1");
          if (activePolicyIndex >= 0 && documentIndex >= 0) {
            openPolicyDocumentMenu(documentIndex, event.clientX, event.clientY);
          }
          return;
        }

        if (!event.target.closest("[data-policy-document-menu]")) {
          closePolicyDocumentMenu();
        }
      };
      host.addEventListener("contextmenu", handleHostContextMenu);

      const handleHostKeydown = function (event) {
        if (event.key === "Escape" && policyDocumentMenu && !policyDocumentMenu.hidden) {
          closePolicyDocumentMenu();
        }

        const coveragePolicyCard = event.target.closest("[data-coverage-policy-card]");
        if (coveragePolicyCard && host.contains(coveragePolicyCard)) {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            const index = Number(coveragePolicyCard.getAttribute("data-policy-index") || "-1");
            if (index >= 0) {
              openPolicyModal(index);
            }
          }
          return;
        }

        const activityEntry = event.target.closest("[data-activity-entry-open]");
        if (activityEntry && host.contains(activityEntry)) {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            const index = Number(activityEntry.getAttribute("data-activity-entry-open") || "-1");
            if (index >= 0) {
              openActivityDetailModal(index);
            }
          }
          return;
        }
      };
      host.addEventListener("keydown", handleHostKeydown);

      const handleDocumentClick = function (event) {
        if (!event.target.closest(".workspace-page-menu")) {
          document.querySelectorAll(".workspace-page-menu[open]").forEach(function (menu) {
            menu.removeAttribute("open");
          });
        }

        if (policyDocumentMenu && !policyDocumentMenu.hidden && !policyDocumentMenu.contains(event.target) && !event.target.closest("[data-policy-document-entry]")) {
          closePolicyDocumentMenu();
        }

        if (!activeActivityModal || activeActivityModal.hidden || !activeActivityTrigger) {
          return;
        }

        const clickedInsideDrawer = activeActivityModal.contains(event.target);
        const clickedTrigger = activeActivityTrigger.contains(event.target);

        if (!clickedInsideDrawer && !clickedTrigger) {
          closeActivityModal();
        }
      };
      document.addEventListener("click", handleDocumentClick);

      const handleDocumentKeydown = function (event) {
        if (event.key === "Escape") {
          document.querySelectorAll(".workspace-page-menu[open]").forEach(function (menu) {
            menu.removeAttribute("open");
          });
          closePolicyModal();
          closePolicyDocumentRenameModal();
          closePolicyDocumentDeleteModal();
          closePolicyListModal();
          closePremiumTimelineModal();
          closePolicyDeleteModal();
          closeProfileDeleteModal();
          closeActivityDetailModal();
          closeActivityDeleteModal();
          closePmiDetailModal();
          closeActivityModal();
          closeActivityWidget();
          closeCoverageWidget();
        }
      };
      document.addEventListener("keydown", handleDocumentKeydown);

      if (activityDetailModal) {
        activityDetailModal.addEventListener("submit", function (event) {
          const form = event.target.closest("[data-activity-detail-form]");
          if (!form) {
            return;
          }
          event.preventDefault();
          if (!activeActivityEditMode || activeActivityIndex < 0) {
            return;
          }
          const entries = Array.isArray(record.activityLog) ? record.activityLog : [];
          const originalEntry = entries[activeActivityIndex];
          if (!originalEntry) {
            return;
          }
          const nextEntry = buildEditedActivityEntry(originalEntry, new FormData(form));
          const wasUpdated = updateActivity(activeActivityIndex, nextEntry);
          if (!wasUpdated) {
            return;
          }
          activeActivityEditMode = false;
          refreshActivityTracker();
        });
      }

      const cleanup = function () {
        if (coverageStatResizeObserver && typeof coverageStatResizeObserver.disconnect === "function") {
          coverageStatResizeObserver.disconnect();
        }

        if (coverageAdequacyAnimationFrame) {
          window.cancelAnimationFrame(coverageAdequacyAnimationFrame);
          coverageAdequacyAnimationFrame = 0;
        }

        if (profileScrollSpyFrame) {
          window.cancelAnimationFrame(profileScrollSpyFrame);
          profileScrollSpyFrame = 0;
        }

        window.removeEventListener("resize", handleWindowResize);
        if (hasInternalProfileScrollContainer()) {
          profileScrollContainer.removeEventListener("scroll", handleWindowScroll);
        } else {
          window.removeEventListener("scroll", handleWindowScroll);
        }
        document.removeEventListener("click", handleDocumentClick);
        document.removeEventListener("keydown", handleDocumentKeydown);
        host.removeEventListener("click", handleHostClick);
        host.removeEventListener("contextmenu", handleHostContextMenu);
        host.removeEventListener("keydown", handleHostKeydown);
        delete host.__clientProfileViewerCleanup;
      };

      host.__clientProfileViewerCleanup = cleanup;
      return cleanup;
      }

      LensApp.clientProfileViewer = Object.assign({}, LensApp.clientProfileViewer, {
        mount: mountClientProfileViewer
      });

    })();
  
