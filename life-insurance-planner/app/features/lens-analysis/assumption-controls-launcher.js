(function (window) {
  const root = window.LensApp = window.LensApp || {};
  const lensAnalysis = root.lensAnalysis = root.lensAnalysis || {};

  const DEFAULT_ANALYSIS_SETUP_ROUTE = "analysis-setup.html";
  const DEFAULT_TRIGGER_SELECTOR = "[data-lens-assumption-controls-open]";
  const OVERLAY_SELECTOR = "[data-lens-assumption-controls-overlay]";
  const FRAME_SELECTOR = "[data-lens-assumption-controls-frame]";
  const MESSAGE_TYPE = "model90:analysis-setup:assumptions-embed-closed";

  function resolveEmbedRoute(options) {
    const currentParams = new URLSearchParams(window.location.search);
    const route = options?.route || DEFAULT_ANALYSIS_SETUP_ROUTE;
    const targetUrl = new URL(route, window.location.href);
    currentParams.forEach(function (value, key) {
      if (!targetUrl.searchParams.has(key)) {
        targetUrl.searchParams.append(key, value);
      }
    });
    targetUrl.searchParams.set("embedAssumptions", "1");
    targetUrl.searchParams.set("embedSession", String(Date.now()));

    return `${targetUrl.pathname.split("/").pop()}${targetUrl.search}${targetUrl.hash}`;
  }

  function closeAssumptionControls(overlay, options) {
    if (!overlay) {
      return;
    }

    overlay.hidden = true;
    overlay.setAttribute("aria-hidden", "true");
    overlay.removeAttribute("data-overlay-open");
    overlay.removeAttribute("data-loading");
    document.body.classList.remove("lens-assumption-controls-open");

    const iframe = overlay.querySelector(FRAME_SELECTOR);
    if (iframe) {
      iframe.removeAttribute("src");
    }

    const trigger = overlay.__lensAssumptionControlsReturnFocus;
    overlay.__lensAssumptionControlsReturnFocus = null;
    if (trigger && typeof trigger.focus === "function") {
      trigger.focus();
    }

    const shouldReload = options?.saved === true && options?.reloadOnSave !== false;
    if (shouldReload && window.location && typeof window.location.reload === "function") {
      window.location.reload();
    }
  }

  function ensureAssumptionControlsOverlay() {
    if (typeof document === "undefined" || typeof document.createElement !== "function") {
      return null;
    }

    const existing = document.querySelector(OVERLAY_SELECTOR);
    if (existing) {
      return existing;
    }

    const overlay = document.createElement("section");
    overlay.className = "lens-assumption-controls-overlay";
    overlay.setAttribute("data-lens-assumption-controls-overlay", "");
    overlay.setAttribute("aria-hidden", "true");
    overlay.hidden = true;

    const dialog = document.createElement("div");
    dialog.className = "lens-assumption-controls-dialog";
    dialog.setAttribute("role", "dialog");
    dialog.setAttribute("aria-modal", "true");
    dialog.setAttribute("aria-label", "Assumption Controls");

    const loadingState = document.createElement("div");
    loadingState.className = "lens-assumption-controls-dialog__loading";
    loadingState.setAttribute("data-lens-assumption-controls-loading", "");
    loadingState.setAttribute("aria-hidden", "true");
    loadingState.innerHTML = `
      <span class="lens-assumption-controls-dialog__loading-mark" aria-hidden="true"></span>
      <strong>Loading Assumption Controls</strong>
    `;

    const iframe = document.createElement("iframe");
    iframe.className = "lens-assumption-controls-dialog__frame";
    iframe.setAttribute("title", "Assumption Controls");
    iframe.setAttribute("data-lens-assumption-controls-frame", "");
    iframe.addEventListener("load", function () {
      overlay.removeAttribute("data-loading");
    });

    dialog.appendChild(loadingState);
    dialog.appendChild(iframe);
    overlay.appendChild(dialog);
    document.body.appendChild(overlay);

    return overlay;
  }

  function openAssumptionControls(options) {
    const triggerButton = options?.triggerButton || null;
    const overlay = ensureAssumptionControlsOverlay();
    const assumptionsEmbedRoute = resolveEmbedRoute(options);

    if (!overlay) {
      window.location.href = assumptionsEmbedRoute;
      return null;
    }

    const iframe = overlay.querySelector(FRAME_SELECTOR);
    overlay.__lensAssumptionControlsReturnFocus =
      triggerButton || document.activeElement || null;
    overlay.setAttribute("data-loading", "true");
    overlay.hidden = false;
    overlay.removeAttribute("aria-hidden");
    overlay.setAttribute("data-overlay-open", "true");
    document.body.classList.add("lens-assumption-controls-open");

    if (iframe) {
      iframe.setAttribute("src", assumptionsEmbedRoute);
    }

    if (iframe && typeof iframe.focus === "function") {
      iframe.focus();
    }

    return overlay;
  }

  function bindAssumptionControlsLauncher(options) {
    if (typeof document === "undefined" || typeof document.querySelectorAll !== "function") {
      return;
    }

    const selector = options?.triggerSelector || DEFAULT_TRIGGER_SELECTOR;
    Array.from(document.querySelectorAll(selector)).forEach(function (trigger) {
      if (!trigger || trigger.__lensAssumptionControlsBound) {
        return;
      }

      trigger.__lensAssumptionControlsBound = true;
      trigger.addEventListener("click", function () {
        openAssumptionControls({
          route: options?.route,
          triggerButton: trigger
        });
      });
    });

    if (typeof window.addEventListener === "function" && !window.__lensAssumptionControlsMessageBound) {
      window.__lensAssumptionControlsMessageBound = true;
      window.addEventListener("message", function (event) {
        if (!event?.data || event.data.type !== MESSAGE_TYPE) {
          return;
        }

        const overlay = document.querySelector(OVERLAY_SELECTOR);
        const iframe = overlay?.querySelector(FRAME_SELECTOR);
        if (iframe?.contentWindow && event.source !== iframe.contentWindow) {
          return;
        }

        closeAssumptionControls(overlay, {
          saved: event.data.saved === true,
          reloadOnSave: options?.reloadOnSave
        });
      });
    }
  }

  function bindOnReady() {
    bindAssumptionControlsLauncher();
  }

  lensAnalysis.assumptionControlsLauncher = {
    MESSAGE_TYPE,
    bindAssumptionControlsLauncher,
    openAssumptionControls,
    closeAssumptionControls,
    resolveEmbedRoute
  };

  if (typeof document !== "undefined") {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", bindOnReady);
    } else {
      bindOnReady();
    }
  }
})(window);
