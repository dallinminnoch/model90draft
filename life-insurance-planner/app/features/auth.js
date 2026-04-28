(function () {
  const LensApp = window.LensApp || (window.LensApp = {});
  const { STORAGE_KEYS, ADMIN_CREDENTIALS } = LensApp.config || {};
  const { loadJson } = LensApp.storage || {};
  const { getPathPrefix, translate } = LensApp.i18n || {};

  function initializeAuthPage() {
    const form = document.getElementById("auth-form");

    if (!form) {
      return;
    }

    if (form.dataset.localAuth === "true") {
      return;
    }

    const feedback = document.getElementById("auth-feedback");
    const submitButton = document.getElementById("auth-submit-button");
    const modeButtons = document.querySelectorAll("[data-auth-mode]");
    const registerFieldsHost = document.getElementById("auth-register-fields");
    const modeField = form.querySelector("[name='authMode']");
    let currentMode = "signin";

    updateAuthMode(currentMode, modeButtons, registerFieldsHost, submitButton, feedback, modeField);

    modeButtons.forEach((button) => {
      button.addEventListener("click", () => {
        currentMode = button.dataset.authMode;
        updateAuthMode(currentMode, modeButtons, registerFieldsHost, submitButton, feedback, modeField);
      });
    });

    form.addEventListener("submit", (event) => {
      event.preventDefault();
      currentMode = modeField?.value || currentMode;
      const formData = new FormData(form);
      const name = String(formData.get("name") || "").trim();
      const email = String(formData.get("email") || "").trim().toLowerCase();
      const password = String(formData.get("password") || "").trim();
      const users = loadJson(STORAGE_KEYS.authUsers) || [];

      if (!email || !password) {
        setAuthFeedback(feedback, "Enter your email and password.");
        return;
      }

      if (currentMode === "register") {
        if (!name) {
          setAuthFeedback(feedback, "Enter your name to create an account.");
          return;
        }

        if (email === ADMIN_CREDENTIALS.email) {
          setAuthFeedback(feedback, "That email is reserved.");
          return;
        }

        const existingUser = users.find((user) => user.email === email);
        if (existingUser) {
          setAuthFeedback(feedback, "An account with that email already exists.");
          return;
        }

        const newUser = { name, email, password, status: "active" };
        users.push(newUser);
        localStorage.setItem(STORAGE_KEYS.authUsers, JSON.stringify(users));
        localStorage.setItem(STORAGE_KEYS.authSession, JSON.stringify({ name, email, role: "user" }));
        window.location.href = "../index.html";
        return;
      }

      if (email === ADMIN_CREDENTIALS.email && password === ADMIN_CREDENTIALS.password) {
        localStorage.setItem(STORAGE_KEYS.authSession, JSON.stringify({
          name: "Lens Admin",
          email: ADMIN_CREDENTIALS.email,
          role: "admin"
        }));
        window.location.href = "../index.html";
        return;
      }

      const disabledUser = users.find((user) => {
        const status = user.status || "active";
        return user.email === email && user.password === password && status !== "active";
      });

      if (disabledUser) {
        setAuthFeedback(feedback, "This account has been disabled. Contact an administrator.");
        return;
      }

      const matchedUser = users.find((user) => {
        const status = user.status || "active";
        return user.email === email && user.password === password && status === "active";
      });

      if (!matchedUser) {
        if (email === ADMIN_CREDENTIALS.email) {
          setAuthFeedback(feedback, "Admin credentials were not accepted. Use the Sign In tab and enter the exact admin password.");
        } else {
          setAuthFeedback(feedback, "We could not match that email and password.");
        }
        return;
      }

      localStorage.setItem(STORAGE_KEYS.authSession, JSON.stringify({
        name: matchedUser.name,
        email: matchedUser.email,
        role: "user"
      }));
      window.location.href = "../index.html";
    });
  }

  function initializeAdminPortal() {
    const adminPage = document.getElementById("admin-accounts-page");

    if (!adminPage) {
      return;
    }

    const session = loadJson(STORAGE_KEYS.authSession);
    if (session?.role !== "admin") {
      window.location.href = "sign-in.html";
      return;
    }

    renderAdminAccounts();

    const signOutButton = document.getElementById("admin-sign-out");
    if (signOutButton) {
      signOutButton.addEventListener("click", () => {
        localStorage.removeItem(STORAGE_KEYS.authSession);
        window.location.href = "sign-in.html";
      });
    }

    const accountsHost = document.getElementById("admin-accounts-list");
    if (accountsHost) {
      accountsHost.addEventListener("click", (event) => {
        const actionButton = event.target.closest("[data-admin-action]");
        if (!actionButton) {
          return;
        }

        const action = actionButton.dataset.adminAction;
        const email = actionButton.dataset.email;
        updateManagedAccount(email, action);
      });
    }

  }

  function renderAdminAccounts() {
    const users = getManagedUsers();
    const accountsHost = document.getElementById("admin-accounts-list");
    const countHost = document.getElementById("admin-account-count");
    const activeCountHost = document.getElementById("admin-active-count");

    if (countHost) {
      countHost.textContent = String(users.length);
    }

    if (activeCountHost) {
      activeCountHost.textContent = String(users.filter((user) => (user.status || "active") === "active").length);
    }

    if (!accountsHost) {
      return;
    }

    if (!users.length) {
      accountsHost.innerHTML = `
        <div class="admin-empty-state">
          <h3>No registered accounts</h3>
          <p class="panel-copy">User accounts will appear here after registration.</p>
        </div>
      `;
      return;
    }

    accountsHost.innerHTML = users.map((user) => {
      const status = user.status || "active";
      const toggleAction = status === "active" ? "disable" : "enable";
      const toggleLabel = status === "active" ? "Disable" : "Enable";

      return `
        <article class="admin-account-card">
          <div class="admin-account-main">
            <div class="admin-account-name">${user.name}</div>
            <div class="admin-account-email">${user.email}</div>
          </div>
          <div class="admin-account-meta">
            <span class="admin-status-badge ${status === "active" ? "is-active" : "is-disabled"}">${status}</span>
            <div class="admin-account-actions">
              <button class="admin-action-button" type="button" data-admin-action="${toggleAction}" data-email="${user.email}">${toggleLabel}</button>
              <button class="admin-action-button is-danger" type="button" data-admin-action="delete" data-email="${user.email}">Delete</button>
            </div>
          </div>
        </article>
      `;
    }).join("");
  }

  function updateManagedAccount(email, action) {
    const users = getManagedUsers();
    const nextUsers = users
      .map((user) => {
        if (user.email !== email) {
          return user;
        }

        if (action === "enable") {
          return { ...user, status: "active" };
        }

        if (action === "disable") {
          return { ...user, status: "disabled" };
        }

        return user;
      })
      .filter((user) => !(action === "delete" && user.email === email));

    localStorage.setItem(STORAGE_KEYS.authUsers, JSON.stringify(nextUsers));

    const session = loadJson(STORAGE_KEYS.authSession);
    if (session?.email === email && action !== "enable") {
      localStorage.removeItem(STORAGE_KEYS.authSession);
    }

    renderAdminAccounts();
  }

  function getManagedUsers() {
    const users = loadJson(STORAGE_KEYS.authUsers) || [];

    return users
      .filter((user) => user.email !== ADMIN_CREDENTIALS.email)
      .map((user) => ({
        ...user,
        status: user.status || "active"
      }));
  }


  function updateAuthMode(mode, modeButtons, registerFieldsHost, submitButton, feedback, modeField) {
    modeButtons.forEach((button) => {
      const isActive = button.dataset.authMode === mode;
      button.classList.toggle("is-active", isActive);
      button.setAttribute("aria-selected", String(isActive));
    });

    if (modeField) {
      modeField.value = mode;
    }

    if (registerFieldsHost) {
      if (mode === "register") {
        registerFieldsHost.innerHTML = `
          <div class="field-group auth-register-only">
            <label for="auth-name">Name</label>
            <input id="auth-name" name="name" type="text" placeholder="Advisor name" required>
          </div>
        `;
      } else {
        registerFieldsHost.innerHTML = "";
      }
    }

    submitButton.textContent = mode === "register" ? "Create Account" : "Sign In";
    setAuthFeedback(feedback, "");
  }

  function setAuthFeedback(element, message) {
    if (!element) {
      return;
    }

    element.textContent = message;
  }

  function setFormFeedback(element, message) {
    if (!element) {
      return;
    }

    element.textContent = message;
    element.hidden = !message;
  }

  function initializeAccountProfile() {
    const accountSlots = document.querySelectorAll("[data-account-slot]");
    const session = loadJson(STORAGE_KEYS.authSession);

    accountSlots.forEach((slot) => {
      if (session?.name) {
        slot.innerHTML = renderAccountProfile(session, "account-profile");
      } else {
        const prefix = getPathPrefix();
        slot.innerHTML = renderSignedOutAccount(prefix);
      }
    });

    document.querySelectorAll("[data-sign-out]").forEach((button) => {
      button.addEventListener("click", (event) => {
        event.preventDefault();
        performSignOut();
      });
    });

    bindAccountDropdowns();
  }

  function renderAccountProfile(session, className) {
    const firstName = getFirstName(session.name);
    const prefix = getPathPrefix();
    const adminViewItem = session.role === "admin"
      ? `<a class="account-menu-item account-menu-item-link" href="${prefix}pages/admin-accounts.html">${translate("account.adminView")}</a>`
      : "";

    return `
      <div class="account-dropdown">
        <button class="${className} account-dropdown-toggle" type="button">
          <span class="account-icon" aria-hidden="true">
            <span class="account-icon-head"></span>
            <span class="account-icon-body"></span>
          </span>
          <span class="sr-only">Open account menu for ${firstName}</span>
        </button>
        <div class="account-dropdown-menu">
          <div class="account-menu-section">
            <span class="account-menu-welcome">${translate("account.welcome", { name: firstName })}</span>
          </div>
          <div class="account-menu-divider"></div>
          <div class="account-menu-section">
            <button class="account-menu-item" type="button">${translate("account.helpCenter")}</button>
            <button class="account-menu-item" type="button">${translate("account.settings")}</button>
            ${adminViewItem}
          </div>
          <div class="account-menu-divider"></div>
          <div class="account-menu-section">
            <button class="account-menu-item account-menu-item-danger" type="button" data-sign-out>${translate("account.signOut")}</button>
          </div>
        </div>
      </div>
    `;
  }

  function renderSignedOutAccount(prefix) {
    return `
      <div class="account-dropdown">
        <a class="account-profile account-dropdown-toggle account-profile-signed-out" href="${prefix}pages/sign-in.html">
          <span class="account-icon" aria-hidden="true">
            <span class="account-icon-head"></span>
            <span class="account-icon-body"></span>
          </span>
          <span class="sr-only">Open sign in menu</span>
        </a>
        <div class="account-dropdown-menu">
          <div class="account-menu-section">
            <a class="account-menu-item account-menu-item-link" href="${prefix}pages/sign-in.html">${translate("account.signIn")}</a>
          </div>
          <div class="account-menu-divider"></div>
          <div class="account-menu-section">
            <button class="account-menu-item" type="button">${translate("account.helpCenter")}</button>
            <button class="account-menu-item" type="button">${translate("account.settings")}</button>
          </div>
        </div>
      </div>
    `;
  }

  function bindAccountDropdowns() {
    document.querySelectorAll(".account-dropdown").forEach((dropdown) => {
      let closeTimer = null;

      const openDropdown = () => {
        if (closeTimer) {
          window.clearTimeout(closeTimer);
          closeTimer = null;
        }

        dropdown.classList.add("is-open");
      };

      const closeDropdown = () => {
        if (closeTimer) {
          window.clearTimeout(closeTimer);
        }

        closeTimer = window.setTimeout(() => {
          dropdown.classList.remove("is-open");
          closeTimer = null;
        }, 180);
      };

      dropdown.addEventListener("mouseenter", openDropdown);
      dropdown.addEventListener("mouseleave", closeDropdown);
      dropdown.addEventListener("focusin", openDropdown);
      dropdown.addEventListener("focusout", () => {
        window.setTimeout(() => {
          if (!dropdown.contains(document.activeElement)) {
            dropdown.classList.remove("is-open");
          }
        }, 0);
      });
    });
  }

  function performSignOut() {
    localStorage.removeItem(STORAGE_KEYS.authSession);
    const prefix = getPathPrefix();
    window.location.href = `${prefix}index.html`;
  }

  function getFirstName(name) {
    return name.split(" ").filter(Boolean)[0] || name;
  }


  LensApp.auth = Object.assign(LensApp.auth || {}, {
    initializeAuthPage,
    initializeAdminPortal,
    renderAdminAccounts,
    updateManagedAccount,
    getManagedUsers,
    updateAuthMode,
    setAuthFeedback,
    setFormFeedback,
    initializeAccountProfile,
    renderAccountProfile,
    renderSignedOutAccount,
    bindAccountDropdowns,
    performSignOut,
    getFirstName
  });
})();
