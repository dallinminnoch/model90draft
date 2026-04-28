(function () {
  const AUTH_SESSION_KEY = "lipPlannerAuthSession";
  const TEMP_ANALYSIS_SESSION_KEY = "lensTemporaryAnalysisSession";

  function isAnalysisToolPage() {
    const pathname = String(window.location.pathname || "").toLowerCase();
    return [
      "profile.html",
      "manual-protection-modeling-inputs.html",
      "manual-minimum-inputs.html",
      "income-loss-impact.html",
      "analysis-estimate.html",
      "analysis-detail.html",
      "recommendations.html",
      "planner.html",
      "summary.html"
    ].some((page) => pathname.endsWith(`/pages/${page}`) || pathname.endsWith(`/${page}`));
  }

  function clearTemporaryAnalysisSessionIfOutsideLens() {
    if (isAnalysisToolPage()) {
      return;
    }

    sessionStorage.removeItem(TEMP_ANALYSIS_SESSION_KEY);
  }

  function hasTemporaryAnalysisSession() {
    try {
      const session = JSON.parse(sessionStorage.getItem(TEMP_ANALYSIS_SESSION_KEY) || "null");
      return Boolean(session && typeof session === "object" && session.hasData);
    } catch (_error) {
      return false;
    }
  }

  function ensureHeaderAnalysisLeaveModal() {
    let modal = document.querySelector("[data-analysis-leave-modal]");
    if (modal) {
      return modal;
    }

    modal = document.createElement("div");
    modal.className = "lens-leave-modal";
    modal.setAttribute("data-analysis-leave-modal", "");
    modal.hidden = true;
    modal.innerHTML = `
      <div class="lens-leave-modal-backdrop" data-analysis-leave-stay></div>
      <div class="lens-leave-modal-panel" role="dialog" aria-modal="true" aria-labelledby="analysis-leave-title">
        <h2 id="analysis-leave-title">Leave LENS Analysis?</h2>
        <p>If you leave the analysis tool, temporary manual input data will be lost.</p>
        <div class="lens-leave-modal-actions">
          <button class="btn btn-secondary" type="button" data-analysis-leave-stay>Stay</button>
          <button class="btn btn-primary" type="button" data-analysis-leave-confirm>Leave</button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);
    return modal;
  }

  function guardAnalysisExit(onLeave) {
    if (!hasTemporaryAnalysisSession()) {
      onLeave?.();
      return;
    }

    const modal = ensureHeaderAnalysisLeaveModal();
    const stayButtons = Array.from(modal.querySelectorAll("[data-analysis-leave-stay]"));
    const leaveButton = modal.querySelector("[data-analysis-leave-confirm]");

    function closeModal() {
      modal.hidden = true;
      document.body.classList.remove("is-modal-open");
    }

    modal.hidden = false;
    document.body.classList.add("is-modal-open");

    leaveButton.onclick = () => {
      sessionStorage.removeItem(TEMP_ANALYSIS_SESSION_KEY);
      closeModal();
      onLeave?.();
    };
    stayButtons.forEach((button) => {
      button.onclick = closeModal;
    });
  }

  function loadSession() {
    try {
      const raw = localStorage.getItem(AUTH_SESSION_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (error) {
      return null;
    }
  }

  function getFirstName(name) {
    return String(name || "").trim().split(/\s+/)[0] || "Advisor";
  }

  function isFullscreenSupported() {
    return Boolean(document.documentElement?.requestFullscreen && document.exitFullscreen);
  }

  function updateFullscreenToggle(button, iconPaths) {
    if (!button) {
      return;
    }

    const icon = button.querySelector("[data-fullscreen-icon]");
    const isFullscreen = Boolean(document.fullscreenElement);
    button.setAttribute("aria-label", isFullscreen ? "Exit full screen" : "Enter full screen");
    button.setAttribute("title", isFullscreen ? "Exit full screen" : "Enter full screen");
    button.setAttribute("aria-pressed", String(isFullscreen));
    if (icon) {
      icon.src = isFullscreen ? iconPaths.close : iconPaths.open;
    }
  }

  function bindFullscreenToggle(iconPaths) {
    const buttons = Array.from(document.querySelectorAll("[data-fullscreen-toggle]"));
    if (!buttons.length) {
      return;
    }

    if (!isFullscreenSupported()) {
      buttons.forEach((button) => {
        button.hidden = true;
      });
      return;
    }

    const refreshButtons = () => {
      buttons.forEach((button) => updateFullscreenToggle(button, iconPaths));
    };

    refreshButtons();
    document.addEventListener("fullscreenchange", refreshButtons);

    buttons.forEach((button) => {
      button.addEventListener("click", async (event) => {
        event.preventDefault();
        try {
          if (document.fullscreenElement) {
            await document.exitFullscreen();
          } else {
            await document.documentElement.requestFullscreen();
          }
        } catch (_error) {
          refreshButtons();
        }
      });
    });
  }

  function renderAccountSlot(signInHref, adminHref) {
    const session = loadSession();
    if (session?.name) {
      const firstName = getFirstName(session.name);
      const adminViewItem = session.role === "admin"
        ? `<a class="account-menu-item account-menu-item-link" href="${adminHref}">Admin View</a>`
        : "";

      return `
        <div class="account-dropdown">
          <button class="account-profile account-dropdown-toggle" type="button">
            <span class="account-icon" aria-hidden="true">
              <span class="account-icon-head"></span>
              <span class="account-icon-body"></span>
            </span>
            <span class="sr-only">Open account menu for ${firstName}</span>
          </button>
          <div class="account-dropdown-menu">
            <div class="account-menu-section">
              <span class="account-menu-welcome">Welcome, ${firstName}</span>
            </div>
            <div class="account-menu-divider"></div>
            <div class="account-menu-section">
              <button class="account-menu-item" type="button">Help Center</button>
              <button class="account-menu-item" type="button">Settings</button>
              ${adminViewItem}
            </div>
            <div class="account-menu-divider"></div>
            <div class="account-menu-section">
              <button class="account-menu-item account-menu-item-danger" type="button" data-site-header-sign-out>Sign Out</button>
            </div>
          </div>
        </div>
      `;
    }

    return `
      <div class="account-dropdown">
        <a class="account-profile account-dropdown-toggle account-profile-signed-out" href="${signInHref}">
          <span class="account-icon" aria-hidden="true">
            <span class="account-icon-head"></span>
            <span class="account-icon-body"></span>
          </span>
          <span class="sr-only">Open sign in menu</span>
        </a>
        <div class="account-dropdown-menu">
          <div class="account-menu-section">
            <a class="account-menu-item account-menu-item-link" href="${signInHref}">Sign In</a>
          </div>
          <div class="account-menu-divider"></div>
          <div class="account-menu-section">
            <button class="account-menu-item" type="button">Help Center</button>
            <button class="account-menu-item" type="button">Settings</button>
          </div>
        </div>
      </div>
    `;
  }

  function bindSharedHeaderActions(iconPaths) {
    document.querySelectorAll("[data-site-header-sign-out]").forEach((button) => {
      button.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        guardAnalysisExit(() => {
          localStorage.removeItem(AUTH_SESSION_KEY);
          window.location.href = window.location.pathname.includes("/pages/") ? "../index.html" : "index.html";
        });
      }, true);
    });

    document.querySelectorAll(".site-header a[href]").forEach((link) => {
      link.addEventListener("click", (event) => {
        const href = link.getAttribute("href");
        if (!href) {
          return;
        }

        const nextUrl = new URL(href, window.location.href);
        const isLensDestination = isAnalysisToolPage() && [
          "profile.html",
          "manual-protection-modeling-inputs.html",
          "manual-minimum-inputs.html",
          "income-loss-impact.html",
          "analysis-estimate.html",
          "analysis-detail.html",
          "recommendations.html",
          "planner.html",
          "summary.html"
        ].some((page) => nextUrl.pathname.toLowerCase().endsWith(`/${page}`));

        if (isLensDestination) {
          return;
        }

        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        guardAnalysisExit(() => {
          window.location.href = nextUrl.href;
        });
      }, true);
    });

    bindFullscreenToggle(iconPaths);
  }

  function getHeaderMarkup() {
    const isNestedPage = window.location.pathname.includes("/pages/");
    const homeHref = isNestedPage ? "../index.html" : "index.html";
    const brandSrc = isNestedPage ? "../Images/MODEL 90 (30 x 10 in).png" : "Images/MODEL 90 (30 x 10 in).png";
    const clientsHref = isNestedPage ? "clients.html" : "pages/clients.html";
    const lensHref = isNestedPage ? "lens.html" : "pages/lens.html";
    const signInHref = isNestedPage ? "sign-in.html" : "pages/sign-in.html";
    const adminHref = isNestedPage ? "admin-accounts.html" : "pages/admin-accounts.html";
    const fullscreenOpenSrc = isNestedPage ? "../Images/openfullscreen.svg" : "Images/openfullscreen.svg";
    const fullscreenCloseSrc = isNestedPage ? "../Images/closefullscreen.svg" : "Images/closefullscreen.svg";
    const searchMarkup = getSearchMarkup();

    return {
      iconPaths: {
        open: fullscreenOpenSrc,
        close: fullscreenCloseSrc
      },
      markup: `
      <header class="site-header">
        <div class="site-header-inner">
          <a class="site-brand" href="${homeHref}">
            <img class="site-brand-mark" src="${brandSrc}" alt="MODEL90">
          </a>
          <div class="site-header-main-nav">
            ${searchMarkup}
            <nav class="site-nav" aria-label="Main navigation">
              <div class="site-dropdown">
                <button class="site-nav-link site-dropdown-toggle" type="button" aria-expanded="false" data-i18n="nav.records">Records</button>
                <div class="site-dropdown-menu">
                  <a class="site-dropdown-link" href="${clientsHref}" data-i18n="nav.clients" data-client-directory-nav>Clients</a>
                </div>
              </div>
              <div class="site-dropdown">
                <button class="site-nav-link site-dropdown-toggle" type="button" aria-expanded="false" data-i18n="nav.financialProducts">Financial Products</button>
                <div class="site-dropdown-menu">
                  <a class="site-dropdown-link" href="${lensHref}">LENS Analysis</a>
                </div>
              </div>
            </nav>
          </div>
          <div class="site-header-utility">
            <div class="language-slot" data-language-slot></div>
            <div class="account-slot" data-account-slot>
              ${renderAccountSlot(signInHref, adminHref)}
            </div>
            <button class="fullscreen-toggle" type="button" data-fullscreen-toggle aria-label="Enter full screen" title="Enter full screen" aria-pressed="false">
              <img class="fullscreen-toggle-icon" data-fullscreen-icon src="${fullscreenOpenSrc}" alt="" aria-hidden="true">
              <span class="sr-only">Toggle full screen</span>
            </button>
          </div>
        </div>
      </header>
    `
    };
  }

  function getSearchMarkup() {
    return `
            <form class="site-search has-icon" role="search">
              <input type="search" placeholder="Search" data-i18n-placeholder="search.placeholder">
            </form>`;
  }

  function injectSiteHeader() {
    clearTemporaryAnalysisSessionIfOutsideLens();

    if (!document.body || document.querySelector(".site-header")) {
      return;
    }

    const { markup, iconPaths } = getHeaderMarkup();

    if (document.querySelector(".workspace-page-topbar")) {
      bindFullscreenToggle(iconPaths);
      return;
    }

    const main = document.querySelector("main");
    if (main) {
      main.insertAdjacentHTML("beforebegin", markup);
      const languageSlot = document.querySelector("[data-language-slot]");
      if (languageSlot) {
        languageSlot.innerHTML = `
          <div class="language-dropdown">
            <button class="language-trigger" type="button" aria-label="Language">
              <img class="language-icon-image" src="${window.location.pathname.includes("/pages/") ? "../Images/Untitled design.png" : "Images/Untitled design.png"}" alt="" aria-hidden="true">
            </button>
          </div>
        `;
      }
      bindSharedHeaderActions(iconPaths);
      return;
    }

    document.body.insertAdjacentHTML("afterbegin", markup);
    const languageSlot = document.querySelector("[data-language-slot]");
    if (languageSlot) {
      languageSlot.innerHTML = `
        <div class="language-dropdown">
          <button class="language-trigger" type="button" aria-label="Language">
            <img class="language-icon-image" src="${window.location.pathname.includes("/pages/") ? "../Images/Untitled design.png" : "Images/Untitled design.png"}" alt="" aria-hidden="true">
          </button>
        </div>
      `;
    }
    bindSharedHeaderActions(iconPaths);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", injectSiteHeader);
  } else {
    injectSiteHeader();
  }
})();
