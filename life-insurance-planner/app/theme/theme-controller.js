(function () {
  const THEME_STORAGE_KEY = "model90.theme";
  const MODERN_THEME_KEY = "modern";
  const THEME_OPTIONS = Object.freeze([
    { key: "modern", label: "Modern" },
    { key: "classic", label: "Classic" },
    { key: "old-money", label: "Old Money" },
    { key: "dark-soft", label: "Dark Soft" },
    { key: "dark", label: "Dark" },
    { key: "carbon", label: "Carbon" },
    { key: "high-tech", label: "High Tech" },
    { key: "dusk", label: "Dusk" },
    { key: "warm-professional", label: "Warm Professional" }
  ]);
  const THEME_KEYS = Object.freeze(THEME_OPTIONS.map((option) => option.key));

  function normalizeThemeKey(value) {
    const key = String(value || "").trim();
    return THEME_KEYS.includes(key) ? key : MODERN_THEME_KEY;
  }

  function readSavedTheme() {
    try {
      return normalizeThemeKey(localStorage.getItem(THEME_STORAGE_KEY));
    } catch (_error) {
      return MODERN_THEME_KEY;
    }
  }

  function persistTheme(key) {
    try {
      localStorage.setItem(THEME_STORAGE_KEY, key);
    } catch (_error) {
    }
  }

  function applyTheme(key) {
    const normalizedKey = normalizeThemeKey(key);
    document.documentElement.dataset.theme = normalizedKey;
    return normalizedKey;
  }

  function setTheme(key) {
    const normalizedKey = applyTheme(key);
    persistTheme(normalizedKey);
    window.dispatchEvent(new CustomEvent("model90-theme-change", {
      detail: {
        theme: normalizedKey
      }
    }));
    return normalizedKey;
  }

  function applySavedTheme() {
    return applyTheme(readSavedTheme());
  }

  function getTheme() {
    return normalizeThemeKey(document.documentElement.dataset.theme || readSavedTheme());
  }

  window.Model90ThemeController = {
    THEME_STORAGE_KEY,
    THEME_OPTIONS,
    THEME_KEYS,
    normalizeThemeKey,
    readSavedTheme,
    applySavedTheme,
    applyTheme,
    setTheme,
    getTheme
  };

  applySavedTheme();
})();
