(function () {
  const LensApp = window.LensApp || (window.LensApp = {});
  const { STORAGE_KEYS, TRANSLATIONS } = LensApp.config || {};

  function initializeLanguageSelector() {
    const slots = document.querySelectorAll("[data-language-slot]");
    if (!slots.length) {
      return;
    }

    const currentLanguage = getCurrentLanguage();
    const languageIconPath = window.location.pathname.includes("/pages/")
      ? "../Images/Untitled design.png"
      : "Images/Untitled design.png";

    slots.forEach((slot) => {
      slot.innerHTML = `
        <div class="language-dropdown">
          <button class="language-trigger" type="button" aria-label="${translate("language.label")}">
            <img class="language-icon-image" src="${languageIconPath}" alt="" aria-hidden="true">
          </button>
          <div class="language-dropdown-menu">
            <button class="language-menu-item ${currentLanguage === "en" ? "is-active" : ""}" type="button" data-language-option="en">${translate("language.english")}</button>
            <button class="language-menu-item ${currentLanguage === "es" ? "is-active" : ""}" type="button" data-language-option="es">${translate("language.spanish")}</button>
            <button class="language-menu-item ${currentLanguage === "fr" ? "is-active" : ""}" type="button" data-language-option="fr">${translate("language.french")}</button>
          </div>
        </div>
      `;
    });

    document.querySelectorAll("[data-language-option]").forEach((button) => {
      button.addEventListener("click", () => {
        localStorage.setItem(STORAGE_KEYS.language, button.dataset.languageOption);
        window.location.reload();
      });
    });
  }

  function applyTranslations() {
    document.querySelectorAll("[data-i18n]").forEach((element) => {
      const key = element.dataset.i18n;
      element.textContent = translate(key);
    });

    document.querySelectorAll("[data-i18n-placeholder]").forEach((element) => {
      const key = element.dataset.i18nPlaceholder;
      element.setAttribute("placeholder", translate(key));
    });
  }


  function getPathPrefix() {
    return window.location.pathname.includes("/pages/") ? "../" : "";
  }

  function getCurrentLanguage() {
    const storedLanguage = localStorage.getItem(STORAGE_KEYS.language);
    return TRANSLATIONS[storedLanguage] ? storedLanguage : "en";
  }

  function translate(key, replacements = {}) {
    const language = getCurrentLanguage();
    const dictionary = TRANSLATIONS[language] || TRANSLATIONS.en;
    const fallback = TRANSLATIONS.en[key] || key;
    let value = dictionary[key] || fallback;

    Object.entries(replacements).forEach(([replacementKey, replacementValue]) => {
      value = value.replace(`{${replacementKey}}`, replacementValue);
    });

    return value;
  }

  function setText(id, value) {
    const element = document.getElementById(id);
    if (element) {
      element.textContent = value;
    }
  }

  LensApp.i18n = Object.assign(LensApp.i18n || {}, {
    initializeLanguageSelector,
    applyTranslations,
    getPathPrefix,
    getCurrentLanguage,
    translate,
    setText
  });
})();