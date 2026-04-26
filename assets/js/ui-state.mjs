import { THEME_STORAGE_KEY } from "./config.mjs";

export function createStatusController(statusEl) {
  function setStatus(message, kind = "") {
    statusEl.textContent = message;
    statusEl.className = kind ? `status ${kind}` : "status";
  }

  return { setStatus };
}

export function createCopyToastController(options) {
  const {
    copyToastEl,
    setTimeout,
    clearTimeout
  } = options;
  let copyToastTimer = null;

  function clearCopyToastTimer() {
    if (!copyToastTimer) {
      return;
    }

    clearTimeout(copyToastTimer);
    copyToastTimer = null;
  }

  function showCopyToast(message = "Copied") {
    if (!copyToastEl) {
      return;
    }

    copyToastEl.textContent = String(message || "Copied");
    copyToastEl.classList.add("visible");
    clearCopyToastTimer();

    copyToastTimer = setTimeout(() => {
      copyToastEl.classList.remove("visible");
      copyToastTimer = null;
    }, 1100);
  }

  return {
    clearCopyToastTimer,
    showCopyToast
  };
}

export function createThemeController(options) {
  const {
    document,
    window,
    localStorage,
    appEl,
    themeToggleBtn,
    storageKey = THEME_STORAGE_KEY
  } = options;

  function readStoredTheme() {
    if (typeof localStorage === "undefined" || typeof localStorage.getItem !== "function") {
      return "";
    }

    try {
      return String(localStorage.getItem(storageKey) || "").trim().toLowerCase();
    } catch (_error) {
      return "";
    }
  }

  function storeTheme(theme) {
    if (typeof localStorage === "undefined" || typeof localStorage.setItem !== "function") {
      return;
    }

    try {
      localStorage.setItem(storageKey, theme);
    } catch (_error) {
      // Storage may be unavailable in private mode or tests.
    }
  }

  function resolveInitialTheme() {
    const storedTheme = readStoredTheme();
    if (storedTheme === "dark" || storedTheme === "light") {
      return storedTheme;
    }

    if (typeof window !== "undefined"
      && typeof window.matchMedia === "function"
      && window.matchMedia("(prefers-color-scheme: dark)").matches) {
      return "dark";
    }

    return "light";
  }

  function readCurrentTheme() {
    if (!appEl) {
      return "light";
    }

    if (typeof appEl.getAttribute === "function") {
      const attributeValue = String(appEl.getAttribute("data-theme") || "").trim().toLowerCase();
      if (attributeValue === "dark" || attributeValue === "light") {
        return attributeValue;
      }
    }

    if (appEl.attributes && typeof appEl.attributes["data-theme"] === "string") {
      const fallbackAttributeValue = String(appEl.attributes["data-theme"]).trim().toLowerCase();
      if (fallbackAttributeValue === "dark" || fallbackAttributeValue === "light") {
        return fallbackAttributeValue;
      }
    }

    if (appEl.dataset && typeof appEl.dataset.theme === "string") {
      const datasetValue = String(appEl.dataset.theme).trim().toLowerCase();
      if (datasetValue === "dark" || datasetValue === "light") {
        return datasetValue;
      }
    }

    return "light";
  }

  function syncThemeToggleState(theme) {
    if (!themeToggleBtn) {
      return;
    }

    const isDarkTheme = theme === "dark";
    themeToggleBtn.textContent = isDarkTheme ? "☾" : "☀";
    themeToggleBtn.setAttribute("aria-pressed", String(isDarkTheme));
    themeToggleBtn.setAttribute("aria-label", isDarkTheme ? "Switch to light theme" : "Switch to dark theme");
  }

  function applyTheme(theme, options = {}) {
    const normalizedTheme = theme === "dark" ? "dark" : "light";
    appEl.setAttribute("data-theme", normalizedTheme);
    if (appEl.dataset) {
      appEl.dataset.theme = normalizedTheme;
    }

    const rootEl = typeof document !== "undefined" ? document.documentElement : null;
    if (rootEl && typeof rootEl.setAttribute === "function") {
      rootEl.setAttribute("data-theme", normalizedTheme);
    }

    syncThemeToggleState(normalizedTheme);

    if (options.persist === false) {
      return;
    }

    storeTheme(normalizedTheme);
  }

  function toggleTheme() {
    const nextTheme = readCurrentTheme() === "dark" ? "light" : "dark";
    applyTheme(nextTheme);
  }

  return {
    applyTheme,
    readCurrentTheme,
    resolveInitialTheme,
    toggleTheme
  };
}
