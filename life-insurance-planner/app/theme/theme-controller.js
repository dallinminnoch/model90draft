(function () {
  const THEME_STORAGE_KEY = "model90.theme";
  const MODERN_THEME_KEY = "modern";
  const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";
  const THEME_TRANSITION_CLASS = "is-theme-transitioning";
  const THEME_TRANSITION_CLEANUP_DELAY_MS = 340;
  let themeTransitionCleanupId = 0;
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

  function dispatchThemeChange(theme) {
    window.dispatchEvent(new CustomEvent("model90-theme-change", {
      detail: {
        theme
      }
    }));
  }

  function finalizeThemeChange(theme) {
    persistTheme(theme);
    dispatchThemeChange(theme);
  }

  function prefersReducedMotion() {
    return typeof window.matchMedia === "function" && window.matchMedia(REDUCED_MOTION_QUERY).matches;
  }

  function canAnimateThemeChange(currentKey, nextKey) {
    return currentKey !== nextKey && !prefersReducedMotion();
  }

  function startFallbackThemeTransition() {
    const root = document.documentElement;
    if (themeTransitionCleanupId) {
      window.clearTimeout(themeTransitionCleanupId);
    }

    root.classList.add(THEME_TRANSITION_CLASS);
    root.offsetHeight;
    themeTransitionCleanupId = window.setTimeout(() => {
      root.classList.remove(THEME_TRANSITION_CLASS);
      themeTransitionCleanupId = 0;
    }, THEME_TRANSITION_CLEANUP_DELAY_MS);
  }

  function setTheme(key) {
    const normalizedKey = normalizeThemeKey(key);
    const currentKey = getTheme();

    if (canAnimateThemeChange(currentKey, normalizedKey)) {
      startFallbackThemeTransition();
    }

    applyTheme(normalizedKey);
    finalizeThemeChange(normalizedKey);
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
