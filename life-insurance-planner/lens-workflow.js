(function () {
  const WORKFLOW_STEPS = [
    { id: "profile-1", label: "Link Profile", path: "profile.html" },
    { id: "analysis-setup", label: "Analysis Setup", path: "analysis-setup.html" },
    { id: "income-impact", label: "Income Loss Impact", path: "income-loss-impact.html" },
    { id: "estimate", label: "Estimate Need", path: "analysis-estimate.html" },
    { id: "detail", label: "Detailed Analysis", path: "analysis-detail.html" },
    { id: "recommendations", label: "Coverage Options", path: "recommendations.html" },
    { id: "planner", label: "Policy Planner", path: "planner.html" },
    { id: "summary", label: "Summary", path: "summary.html" }
  ];

  const STORAGE_KEYS = {
    profile: "lipPlannerProfile",
    includeDetailed: "lipPlannerIncludeDetailed",
    recommendation: "lipPlannerRecommendation",
    strategy: "lipPlannerStrategy",
    notes: "lipPlannerNotes"
  };

  function loadJson(key) {
    try {
      return JSON.parse(localStorage.getItem(key) || "null");
    } catch (error) {
      return null;
    }
  }

  function saveJson(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function setText(id, value) {
    const element = document.getElementById(id);
    if (element) {
      element.textContent = value;
    }
  }

  function formatCurrency(value) {
    const number = Number(value || 0);
    if (!number) {
      return "Value pending";
    }

    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 0
    }).format(number);
  }

  function getBalancedEstimate() {
    if (window.PlannerCalculations?.getBalancedEstimate) {
      return window.PlannerCalculations.getBalancedEstimate();
    }
    return "Your balanced estimated death benefit need will appear here";
  }

  function getCurrentStepIndex(stepId) {
    return WORKFLOW_STEPS.findIndex(function (step) {
      return step.id === stepId;
    });
  }

  function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
  }

  function isVisibleField(field) {
    if (!field) {
      return false;
    }

    if (field.disabled || field.type === "hidden") {
      return false;
    }

    if (field.closest("[hidden]")) {
      return false;
    }

    const styles = window.getComputedStyle(field);
    if (styles.display === "none" || styles.visibility === "hidden") {
      return false;
    }

    return true;
  }

  function getFieldCompletionRatio(fields) {
    const radioGroups = new Map();
    let total = 0;
    let completed = 0;

    fields.forEach(function (field) {
      if (!isVisibleField(field) || field.readOnly) {
        return;
      }

      const tagName = field.tagName.toLowerCase();
      const type = String(field.type || "").toLowerCase();

      if (tagName === "button" || ["button", "submit", "reset"].includes(type)) {
        return;
      }

      if ((type === "radio" || type === "checkbox") && field.name) {
        const groupKey = `${type}:${field.name}`;
        if (!radioGroups.has(groupKey)) {
          radioGroups.set(groupKey, []);
        }
        radioGroups.get(groupKey).push(field);
        return;
      }

      total += 1;
      if (String(field.value || "").trim()) {
        completed += 1;
      }
    });

    radioGroups.forEach(function (group) {
      total += 1;
      if (group.some(function (field) { return field.checked; })) {
        completed += 1;
      }
    });

    if (!total) {
      return 0;
    }

    return completed / total;
  }

  function getCurrentStepCompletion(currentStep) {
    if (currentStep === "profile-1") {
      const temporaryAnalysisSession = window.getLensTemporaryAnalysisSession?.();
      if (temporaryAnalysisSession?.hasData) {
        return 1;
      }

      const entryMode = document.getElementById("analysis-entry-mode");
      const linkedClientCard = document.getElementById("analysis-linked-client-card");
      const linkedClientName = document.getElementById("analysis-linked-client-display");
      const hasLinkedProfile = Boolean(
        linkedClientCard &&
        !linkedClientCard.hidden &&
        String(linkedClientName?.textContent || "").trim() &&
        String(linkedClientName?.textContent || "").trim() !== "Not linked"
      );
      if (hasLinkedProfile) {
        return 0.5;
      }
      if (String(entryMode?.value || "").trim() === "manual") {
        return 1;
      }
      return 0;
    }

    const scopedForm = document.querySelector("main.workflow-shell form");
    const fields = Array.from((scopedForm || document).querySelectorAll("input, select, textarea"));
    return getFieldCompletionRatio(fields);
  }

  function updateWorkflowProgress() {
    const navHost = document.getElementById("workflow-nav");
    const currentStep = document.body.dataset.step;
    const currentIndex = getCurrentStepIndex(currentStep);
    const track = navHost?.querySelector(".step-track");

    if (!track || currentIndex < 0) {
      return;
    }

    const stepCount = WORKFLOW_STEPS.length;
    const currentCompletion = clamp(getCurrentStepCompletion(currentStep), 0, 1);
    const segmentCount = Math.max(stepCount - 1, 1);
    const progressRatio = clamp((currentIndex + currentCompletion) / segmentCount, 0, 1);

    track.style.setProperty("--step-count", String(stepCount));
    track.style.setProperty("--progress-ratio", String(progressRatio));
  }

  function renderWorkflowNav() {
    const navHost = document.getElementById("workflow-nav");
    const currentStep = document.body.dataset.step;
    const currentIndex = getCurrentStepIndex(currentStep);

    if (!navHost || currentIndex < 0) {
      return;
    }

    navHost.className = "workflow-nav";
    navHost.innerHTML = `
      <header class="workflow-header">
        <div class="step-track" style="--step-count:${WORKFLOW_STEPS.length};--progress-ratio:0;">
          ${WORKFLOW_STEPS.map(function (step, index) {
            let stateClass = "";
            if (index < currentIndex) {
              stateClass = "is-complete";
            } else if (index === currentIndex) {
              stateClass = "is-current";
            }

            return `
              <a class="step-item ${stateClass}" href="${step.path}">
                <span class="step-number">${index + 1}</span>
                <span class="step-title">${escapeHtml(step.label)}</span>
              </a>
            `;
          }).join("")}
        </div>
      </header>
    `;

    updateWorkflowProgress();
    document.addEventListener("input", updateWorkflowProgress, true);
    document.addEventListener("change", updateWorkflowProgress, true);
    document.addEventListener("click", function () {
      window.setTimeout(updateWorkflowProgress, 0);
    }, true);
  }

  function initializeProfileForms() {
    const form = document.getElementById("client-profile-form");
    if (!form) {
      return;
    }

    const savedProfile = loadJson(STORAGE_KEYS.profile) || {};
    Object.entries(savedProfile).forEach(function ([key, value]) {
      const field = form.elements.namedItem(key);
      if (field && value !== null && value !== undefined) {
        field.value = value;
      }
    });

    form.addEventListener("submit", function (event) {
      event.preventDefault();
      const formData = new FormData(form);
      const nextProfile = { ...savedProfile, ...Object.fromEntries(formData.entries()) };
      saveJson(STORAGE_KEYS.profile, nextProfile);
      window.location.href = form.dataset.nextPage || "analysis-estimate.html";
    });
  }

  function initializeRecommendationsPage() {
    const cards = Array.from(document.querySelectorAll("[data-recommendation]"));
    if (!cards.length) {
      return;
    }

    const selected = localStorage.getItem(STORAGE_KEYS.recommendation) || "Balanced Protection";
    cards.forEach(function (card) {
      card.classList.toggle("is-selected", card.dataset.recommendation === selected);
      card.addEventListener("click", function () {
        const value = card.dataset.recommendation || "";
        localStorage.setItem(STORAGE_KEYS.recommendation, value);
        cards.forEach(function (item) {
          item.classList.toggle("is-selected", item === card);
        });
      });
    });

    document.getElementById("to-policy-planner")?.addEventListener("click", function () {
      window.location.href = "planner.html";
    });
  }

  function initializePlannerPage() {
    const cards = Array.from(document.querySelectorAll("[data-strategy]"));
    if (!cards.length) {
      return;
    }

    const selected = localStorage.getItem(STORAGE_KEYS.strategy) || "Hybrid Strategy";
    cards.forEach(function (card) {
      card.classList.toggle("is-selected", card.dataset.strategy === selected);
      card.addEventListener("click", function () {
        const value = card.dataset.strategy || "";
        localStorage.setItem(STORAGE_KEYS.strategy, value);
        cards.forEach(function (item) {
          item.classList.toggle("is-selected", item === card);
        });
      });
    });

    const notesField = document.getElementById("advisor-notes");
    if (notesField) {
      notesField.value = localStorage.getItem(STORAGE_KEYS.notes) || "";
    }

    document.getElementById("to-summary")?.addEventListener("click", function () {
      if (notesField) {
        localStorage.setItem(STORAGE_KEYS.notes, notesField.value);
      }
      window.location.href = "summary.html";
    });
  }

  function initializeSummaryPage() {
    const summaryPage = document.getElementById("summary-page");
    if (!summaryPage) {
      return;
    }

    const profile = loadJson(STORAGE_KEYS.profile) || {};
    const recommendation = localStorage.getItem(STORAGE_KEYS.recommendation) || "Balanced Protection";
    const strategy = localStorage.getItem(STORAGE_KEYS.strategy) || "Hybrid Strategy";
    const notes = localStorage.getItem(STORAGE_KEYS.notes) || "Advisor notes will appear here.";
    const includeDetailed = sessionStorage.getItem(STORAGE_KEYS.includeDetailed) !== "false";

    const familyParts = [];
    if (profile.maritalStatus) {
      familyParts.push(profile.maritalStatus);
    }
    if (profile.dependents) {
      familyParts.push(`${profile.dependents} dependents`);
    }

    setText("summary-client-name", profile.clientName || "Client name pending");
    setText("summary-age-gender", [profile.age, profile.gender].filter(Boolean).join(" | ") || "Pending profile inputs");
    setText("summary-income", formatCurrency(profile.annualIncome));
    setText("summary-family", familyParts.join(" | ") || "Family profile pending");
    setText("summary-balanced-need", getBalancedEstimate());
    setText("summary-detailed-analysis", includeDetailed ? "Detailed analysis included in planning path." : "Detailed analysis was skipped in this planning path.");
    setText("summary-recommendation", recommendation);
    setText("summary-strategy", strategy);
    setText("summary-notes", notes);
  }

  document.addEventListener("DOMContentLoaded", function () {
    if (!document.body.dataset.step) {
      return;
    }

    document.body.classList.remove("is-modal-open");
    document.body.style.overflowY = "auto";

    renderWorkflowNav();
    initializeProfileForms();
    initializeRecommendationsPage();
    initializePlannerPage();
    initializeSummaryPage();
  });
})();
