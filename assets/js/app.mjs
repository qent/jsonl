export function createJsonlViewerApp(deps = {}) {
  const document = deps.document
    ?? (typeof globalThis !== "undefined" ? globalThis.document : undefined);
  if (!document || typeof document.getElementById !== "function") {
    return null;
  }

  const window = deps.window
    ?? (typeof globalThis !== "undefined" ? globalThis.window : undefined);
  const navigator = deps.navigator
    ?? (typeof globalThis !== "undefined" ? globalThis.navigator : undefined);
  const localStorage = deps.localStorage
    ?? (typeof globalThis !== "undefined" ? globalThis.localStorage : undefined);
  const requestAnimationFrame = deps.requestAnimationFrame
    ?? (typeof globalThis !== "undefined" ? globalThis.requestAnimationFrame : undefined);
  const setTimeout = deps.setTimeout
    ?? (typeof globalThis !== "undefined" ? globalThis.setTimeout : undefined)
    ?? ((handler) => {
      if (typeof handler === "function") {
        handler();
      }
      return 0;
    });
  const clearTimeout = deps.clearTimeout
    ?? (typeof globalThis !== "undefined" ? globalThis.clearTimeout : undefined)
    ?? (() => {});
    const dropzone = document.getElementById("dropzone");
    const fileInput = document.getElementById("fileInput");
    const clearBtn = document.getElementById("clearBtn");
    const themeToggleBtn = document.getElementById("themeToggleBtn");
    const appEl = document.getElementById("app");
    const mainColumnEl = document.getElementById("mainColumn");
    const statusEl = document.getElementById("status");
    const contentGridEl = document.getElementById("contentGrid");
    const navColumnEl = document.getElementById("navColumn");
    const navListEl = document.getElementById("navList");
    const navFocusPipEl = document.getElementById("navFocusPip");
    const navFocusPipIconEl = document.getElementById("navFocusPipIcon");
    const navFocusBackdropEl = document.getElementById("navFocusBackdrop");
    const navHighlightOverlayEl = document.getElementById("navHighlightOverlay");
    const navHighlightLeftEl = document.getElementById("navHighlightLeft");
    const navHighlightRightEl = document.getElementById("navHighlightRight");
    const copyToastEl = document.getElementById("copyToast");
    const outputEl = document.getElementById("output");
    const scriptClosingTag = "<" + "/script>";
    const navTargetHighlightClassName = "nav-target-highlight";
    const navContentHoverClassName = "content-hover-match";
    const themeStorageKey = "jsonl-viewer-theme";
    const navDesktopBreakpoint = 1120;
    let entryCounter = 0;
    let activeNavTargetCard = null;
    let activeContentHoverNavItem = null;
    let isNavAutoScrolling = false;
    let isNavFocusActive = false;
    let copyToastTimer = null;

    function readStoredTheme() {
      if (typeof localStorage === "undefined" || typeof localStorage.getItem !== "function") {
        return "";
      }

      try {
        return String(localStorage.getItem(themeStorageKey) || "").trim().toLowerCase();
      } catch (_error) {
        return "";
      }
    }

    function storeTheme(theme) {
      if (typeof localStorage === "undefined" || typeof localStorage.setItem !== "function") {
        return;
      }

      try {
        localStorage.setItem(themeStorageKey, theme);
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

    function syncNavVisibility() {
      const hasNavEntries = navListEl.childElementCount > 0;
      navColumnEl.hidden = !hasNavEntries;
      if (hasNavEntries) {
        appEl.classList.add("has-nav");
        return;
      }

      appEl.classList.remove("has-nav");
    }

    function isDesktopNavViewport() {
      if (typeof window === "undefined" || !Number.isFinite(window.innerWidth)) {
        return true;
      }

      return window.innerWidth > navDesktopBreakpoint;
    }

    function canUseNavFocusMode() {
      return !navColumnEl.hidden && isDesktopNavViewport();
    }

    function setNavFocusActive(nextState) {
      const canActivate = canUseNavFocusMode();
      const shouldActivate = Boolean(nextState) && canActivate;
      isNavFocusActive = shouldActivate;

      if (shouldActivate) {
        appEl.classList.add("nav-focus-active");
      } else {
        appEl.classList.remove("nav-focus-active");
      }

      if (navFocusBackdropEl) {
        navFocusBackdropEl.hidden = !shouldActivate;
      }

      if (navFocusPipEl) {
        navFocusPipEl.hidden = !canActivate;
        navFocusPipEl.setAttribute("aria-pressed", String(shouldActivate));
        navFocusPipEl.setAttribute("aria-label", shouldActivate ? "Collapse navigation focus mode" : "Expand navigation focus mode");
      }

      if (navFocusPipIconEl) {
        navFocusPipIconEl.textContent = shouldActivate ? "▸" : "◂";
      }
    }

    function openNavFocusMode() {
      setNavFocusActive(true);
    }

    function closeNavFocusMode() {
      setNavFocusActive(false);
    }

    function toggleNavFocusMode() {
      setNavFocusActive(!isNavFocusActive);
    }

    function resolveNavItemTargetCard(navItem) {
      if (!navItem || !navItem.dataset || typeof document === "undefined") {
        return null;
      }
      if (typeof document.getElementById !== "function") {
        return null;
      }

      const targetCardId = String(navItem.dataset.targetCardId || "").trim();
      if (!targetCardId) {
        return null;
      }

      return document.getElementById(targetCardId);
    }

    function resolveNavItemByTargetCard(targetCard) {
      if (!targetCard || !targetCard.id || !navListEl || !navListEl.children) {
        return null;
      }

      const targetCardId = String(targetCard.id || "").trim();
      if (!targetCardId) {
        return null;
      }

      const navItems = navListEl.children || [];
      for (const navItem of navItems) {
        if (!navItem || !navItem.dataset) {
          continue;
        }

        const navTargetCardId = String(navItem.dataset.targetCardId || "").trim();
        if (navTargetCardId === targetCardId) {
          return navItem;
        }
      }

      return null;
    }

    function clearContentHoverNavItem() {
      if (!activeContentHoverNavItem) {
        return;
      }

      if (activeContentHoverNavItem.classList) {
        activeContentHoverNavItem.classList.remove(navContentHoverClassName);
      }
      activeContentHoverNavItem = null;
    }

    function applyContentHoverNavItem(targetCard) {
      const navItem = resolveNavItemByTargetCard(targetCard);
      if (activeContentHoverNavItem === navItem) {
        return;
      }

      clearContentHoverNavItem();
      if (!navItem || !navItem.classList) {
        return;
      }

      navItem.classList.add(navContentHoverClassName);
      activeContentHoverNavItem = navItem;
    }

    function syncVisibleNavItemBorders() {
      const navItems = navListEl.children || [];
      if (!navItems || navItems.length === 0) {
        return;
      }

      if (navColumnEl.hidden) {
        for (const navItem of navItems) {
          if (!navItem || !navItem.classList) {
            continue;
          }
          navItem.classList.remove("in-viewport");
        }
        return;
      }

      const canMeasureMainColumn = typeof mainColumnEl.getBoundingClientRect === "function";
      let canMeasureAllTargetCards = true;
      const targetCards = [];
      for (const navItem of navItems) {
        const targetCard = resolveNavItemTargetCard(navItem);
        targetCards.push(targetCard);
        if (!targetCard || typeof targetCard.getBoundingClientRect !== "function") {
          canMeasureAllTargetCards = false;
          break;
        }
      }

      // Fallback for test harnesses or environments without layout APIs.
      if (!canMeasureMainColumn || !canMeasureAllTargetCards) {
        for (const navItem of navItems) {
          if (!navItem || !navItem.classList) {
            continue;
          }
          navItem.classList.add("in-viewport");
        }
        return;
      }

      const mainRect = mainColumnEl.getBoundingClientRect();
      const hasValidMainRect = Boolean(mainRect
        && Number.isFinite(mainRect.top)
        && Number.isFinite(mainRect.bottom)
        && mainRect.bottom > mainRect.top);

      if (!hasValidMainRect) {
        for (const navItem of navItems) {
          if (!navItem || !navItem.classList) {
            continue;
          }
          navItem.classList.remove("in-viewport");
        }
        return;
      }

      for (let index = 0; index < navItems.length; index += 1) {
        const navItem = navItems[index];
        if (!navItem || !navItem.classList) {
          continue;
        }

        const targetCard = targetCards[index];
        const cardRect = targetCard.getBoundingClientRect();
        const hasValidCardRect = Boolean(cardRect
          && Number.isFinite(cardRect.top)
          && Number.isFinite(cardRect.bottom)
          && cardRect.bottom > cardRect.top);
        const isVisibleInViewport = hasValidCardRect
          && cardRect.bottom > mainRect.top
          && cardRect.top < mainRect.bottom;

        if (isVisibleInViewport) {
          navItem.classList.add("in-viewport");
        } else {
          navItem.classList.remove("in-viewport");
        }
      }
    }

    function syncClearButtonPosition() {
      if (!mainColumnEl || typeof mainColumnEl.getBoundingClientRect !== "function") {
        return;
      }
      if (typeof window === "undefined" || !Number.isFinite(window.innerWidth)) {
        return;
      }

      const mainColumnRect = mainColumnEl.getBoundingClientRect();
      if (!mainColumnRect || !Number.isFinite(mainColumnRect.right)) {
        return;
      }

      let contentRightX = null;

      if (dropzone && typeof dropzone.getBoundingClientRect === "function") {
        const dropzoneRect = dropzone.getBoundingClientRect();
        if (dropzoneRect && Number.isFinite(dropzoneRect.right)) {
          contentRightX = dropzoneRect.right;
        }
      }

      if (!Number.isFinite(contentRightX)) {
        if (typeof getComputedStyle !== "function") {
          return;
        }
        const mainColumnStyles = getComputedStyle(mainColumnEl);
        const rightPadding = parseFloat(mainColumnStyles.paddingRight);
        const clientWidth = Number(mainColumnEl.clientWidth);
        if (!Number.isFinite(rightPadding) || !Number.isFinite(clientWidth)) {
          return;
        }
        contentRightX = mainColumnRect.left + clientWidth - rightPadding;
      }

      const rightOffset = Math.max(0, Math.round(window.innerWidth - contentRightX));
      clearBtn.style.right = `${rightOffset}px`;
    }

    function syncUiState(options = {}) {
      const isRendering = Boolean(options.rendering);
      const hasContent = outputEl.childElementCount > 0;

      syncNavVisibility();
      setNavFocusActive(isNavFocusActive);
      clearBtn.hidden = !hasContent;
      contentGridEl.hidden = !hasContent;
      dropzone.classList.remove("idle", "rendering", "has-content");
      appEl.classList.remove("idle");

      if (isRendering) {
        dropzone.classList.add("rendering");
        syncClearButtonPosition();
        syncVisibleNavItemBorders();
        return;
      }

      if (hasContent) {
        dropzone.classList.add("has-content");
        syncClearButtonPosition();
        syncVisibleNavItemBorders();
        return;
      }

      dropzone.classList.add("idle");
      appEl.classList.add("idle");
      syncClearButtonPosition();
      syncVisibleNavItemBorders();
    }

    function setStatus(message, kind = "") {
      statusEl.textContent = message;
      statusEl.className = kind ? `status ${kind}` : "status";
    }

    function showCopyToast(message = "Copied") {
      if (!copyToastEl) {
        return;
      }

      copyToastEl.textContent = String(message || "Copied");
      copyToastEl.classList.add("visible");

      if (copyToastTimer) {
        clearTimeout(copyToastTimer);
      }

      copyToastTimer = setTimeout(() => {
        copyToastEl.classList.remove("visible");
      }, 1100);
    }

    function clearNavTargetHighlight() {
      if (!activeNavTargetCard) {
        if (navHighlightOverlayEl) {
          navHighlightOverlayEl.hidden = true;
        }
        return;
      }

      activeNavTargetCard.classList.remove(navTargetHighlightClassName);
      activeNavTargetCard = null;
      if (navHighlightOverlayEl) {
        navHighlightOverlayEl.hidden = true;
      }
    }

    function resolveCardHighlightColor(targetCard) {
      if (!targetCard) {
        return "var(--entry-default)";
      }

      if (typeof getComputedStyle === "function") {
        const computedColor = String(getComputedStyle(targetCard).getPropertyValue("--c") || "").trim();
        if (computedColor) {
          return computedColor;
        }
      }

      const inlineColor = targetCard.style && targetCard.style.properties
        ? String(targetCard.style.properties["--c"] || "").trim()
        : "";
      if (inlineColor) {
        return inlineColor;
      }

      if (targetCard.classList && targetCard.classList.contains("agent")) {
        return "var(--entry-agent)";
      }
      if (targetCard.classList && targetCard.classList.contains("user")) {
        return "var(--entry-user)";
      }
      if (targetCard.classList && targetCard.classList.contains("system")) {
        return "var(--entry-system)";
      }
      if (targetCard.classList && targetCard.classList.contains("error")) {
        return "var(--entry-error)";
      }
      if (targetCard.classList && targetCard.classList.contains("tool")) {
        return "var(--entry-tool)";
      }
      if (targetCard.classList && targetCard.classList.contains("result")) {
        return "var(--entry-result)";
      }

      return "var(--entry-default)";
    }

    function paintNavHighlightOverlay(targetCard, cardRect, navDividerX) {
      if (!navHighlightOverlayEl || !navHighlightLeftEl || !navHighlightRightEl) {
        return;
      }
      if (!cardRect || !Number.isFinite(cardRect.top) || !Number.isFinite(cardRect.height)) {
        navHighlightOverlayEl.hidden = true;
        return;
      }

      const resolvedDividerX = Number.isFinite(navDividerX) ? navDividerX : cardRect.right;
      const leftWidth = Math.max(0, Math.floor(cardRect.left || 0));
      const rightStart = Math.max(0, Math.floor(cardRect.right || 0));
      const rightWidth = Math.max(0, Math.floor(resolvedDividerX - (cardRect.right || 0)));
      const overlayTop = Math.max(0, Math.floor(cardRect.top));
      const overlayHeight = Math.max(1, Math.ceil(cardRect.height));
      const baseColor = resolveCardHighlightColor(targetCard);

      navHighlightOverlayEl.style.top = `${overlayTop}px`;
      navHighlightOverlayEl.style.height = `${overlayHeight}px`;
      navHighlightOverlayEl.style.setProperty("--nav-highlight-color", `color-mix(in srgb, ${baseColor} 38%, transparent)`);

      navHighlightLeftEl.style.left = "0px";
      navHighlightLeftEl.style.width = `${leftWidth}px`;
      navHighlightRightEl.style.left = `${rightStart}px`;
      navHighlightRightEl.style.width = `${rightWidth}px`;
      navHighlightOverlayEl.hidden = false;
    }

    function resolveNavDividerX() {
      if (!navColumnEl.hidden && typeof navColumnEl.getBoundingClientRect === "function") {
        const navRect = navColumnEl.getBoundingClientRect();
        if (navRect && Number.isFinite(navRect.left)) {
          return navRect.left;
        }
      }

      if (typeof mainColumnEl.getBoundingClientRect === "function") {
        const mainRect = mainColumnEl.getBoundingClientRect();
        if (mainRect && Number.isFinite(mainRect.right)) {
          return mainRect.right;
        }
      }

      if (typeof window !== "undefined" && Number.isFinite(window.innerWidth)) {
        return window.innerWidth;
      }

      return null;
    }

    function applyNavTargetHighlight(targetCard) {
      if (!targetCard) {
        return;
      }

      clearNavTargetHighlight();
      targetCard.classList.add(navTargetHighlightClassName);
      activeNavTargetCard = targetCard;

      if (typeof targetCard.getBoundingClientRect === "function") {
        const cardRect = targetCard.getBoundingClientRect();
        const navDividerX = resolveNavDividerX();
        paintNavHighlightOverlay(targetCard, cardRect, navDividerX);
        return;
      }

      if (navHighlightOverlayEl) {
        navHighlightOverlayEl.hidden = true;
      }
    }

    function clearNavTargetHighlightOnScroll(event) {
      if (event && event.currentTarget === mainColumnEl) {
        syncVisibleNavItemBorders();
      }
      if (isNavAutoScrolling) {
        return;
      }
      clearNavTargetHighlight();
    }

    function markNavAutoScrolling() {
      isNavAutoScrolling = true;
      if (typeof requestAnimationFrame === "function") {
        requestAnimationFrame(() => {
          isNavAutoScrolling = false;
        });
        return;
      }

      setTimeout(() => {
        isNavAutoScrolling = false;
      }, 0);
    }

    function formatTimestamp(rawTimestamp) {
      if (typeof rawTimestamp !== "string") {
        return "";
      }

      const isoTimeMatch = rawTimestamp.match(/T(\d{2}:\d{2}:\d{2})/);
      if (isoTimeMatch) {
        return isoTimeMatch[1];
      }

      return rawTimestamp;
    }

    function formatDuration(durationMs) {
      const durationSeconds = Math.floor(Number(durationMs || 0) / 1000);
      const hours = Math.floor(durationSeconds / 3600);
      const minutes = Math.floor((durationSeconds % 3600) / 60);
      const seconds = durationSeconds % 60;

      if (hours > 0) {
        return `${hours}h ${minutes}m ${seconds}s`;
      }

      if (minutes > 0) {
        return `${minutes}m ${seconds}s`;
      }

      return `${seconds}s`;
    }

    function parseTimestampMs(rawTimestamp) {
      if (typeof rawTimestamp !== "string") {
        return null;
      }

      const parsedTimestamp = Date.parse(rawTimestamp);
      return Number.isFinite(parsedTimestamp) ? parsedTimestamp : null;
    }

    function formatTenthsSecondsBadge(durationMs) {
      const safeDurationMs = Number(durationMs);
      if (!Number.isFinite(safeDurationMs) || safeDurationMs < 0) {
        return "";
      }

      const roundedTenthsSeconds = Math.ceil(safeDurationMs / 100) / 10;
      return `${roundedTenthsSeconds.toFixed(1)} s`;
    }

    function resolveToolDurationBadge(toolResultItem, toolUseRawTimestamp, resultRawTimestamp) {
      const explicitDurationMs = Number(toolResultItem && toolResultItem.duration_ms);
      if (Number.isFinite(explicitDurationMs) && explicitDurationMs >= 0) {
        return formatTenthsSecondsBadge(explicitDurationMs);
      }

      const startTimestampMs = parseTimestampMs(toolUseRawTimestamp);
      const endTimestampMs = parseTimestampMs(resultRawTimestamp);
      if (startTimestampMs === null || endTimestampMs === null || endTimestampMs < startTimestampMs) {
        return "";
      }

      return formatTenthsSecondsBadge(endTimestampMs - startTimestampMs);
    }

    function round4(value) {
      return Math.round(Number(value || 0) * 10000) / 10000;
    }

    function prettyJson(value) {
      return JSON.stringify(value, null, 2);
    }

    function nextEntryAnchorId() {
      const current = entryCounter;
      entryCounter += 1;
      return `entry-${current}`;
    }

    function getTypeLabel(entryType) {
      if (!entryType) {
        return "entry";
      }

      return String(entryType);
    }

    function formatNavTime(rawTime) {
      if (typeof rawTime !== "string") {
        return "";
      }

      const normalized = rawTime.trim();
      if (!normalized) {
        return "";
      }

      const timeMatch = normalized.match(/(?:T|\b)(\d{2}:\d{2})(?::\d{2})?/);
      if (timeMatch) {
        return timeMatch[1];
      }

      return normalized;
    }

    function joinTextPartsSingleLine(parts) {
      const combined = (parts || [])
        .map((part) => String(part && part.text ? part.text : ""))
        .join(" ");
      return combined.replace(/\s+/g, " ").trim();
    }

    function toSingleLineText(value) {
      if (value === null || value === undefined) {
        return "";
      }

      return String(value).replace(/\s+/g, " ").trim();
    }

    function createResultCostLabel(value) {
      return `${round4(value)}$`;
    }

    function normalizeTodoItems(toolName, toolInput) {
      if (toolName !== "TodoWrite") {
        return [];
      }

      const input = toolInput && typeof toolInput === "object" ? toolInput : {};
      const todos = input.todos;
      if (!Array.isArray(todos)) {
        return [];
      }

      const normalizedTodos = [];
      for (const todo of todos) {
        if (!todo || typeof todo !== "object") {
          continue;
        }

        const content = String(todo.content || "");
        if (!content.trim()) {
          continue;
        }

        const status = todo.status === "completed" || todo.status === "in_progress"
          ? todo.status
          : "pending";

        normalizedTodos.push({
          content,
          status
        });
      }

      return normalizedTodos;
    }

    function resolveToolNavLabel(toolName, toolInput, fallbackLabel) {
      const safeFallback = fallbackLabel || toolName || "tool";
      const input = toolInput && typeof toolInput === "object" ? toolInput : {};

      if (toolName === "Skill") {
        const skillValue = input.skill;
        return String(skillValue || safeFallback).trim() || safeFallback;
      }

      if (toolName === "Bash") {
        const commandValue = input.command;
        return String(commandValue || safeFallback).trim() || safeFallback;
      }

      if (toolName === "Glob" || toolName === "Grep") {
        const patternValue = String(input.pattern || "").trim();
        return patternValue ? `${toolName}: ${patternValue}` : String(toolName || safeFallback).trim();
      }

      if (toolName === "Write") {
        const filePathValue = String(input.file_path || "").trim();
        return filePathValue ? `Write: ${filePathValue}` : String(toolName || safeFallback).trim();
      }

      if (toolName === "Read") {
        const filePathValue = String(input.file_path || "").trim();
        return filePathValue ? `Read: ${filePathValue}` : String(toolName || safeFallback).trim();
      }

      return String(toolName || safeFallback).trim() || safeFallback;
    }

    function resolveToolErrorNavLabel(toolName, fallbackLabel, toolResultContent) {
      const labelPrefix = toSingleLineText(toolName) || toSingleLineText(fallbackLabel) || "tool";
      const contentOneLine = typeof toolResultContent === "string"
        ? toSingleLineText(toolResultContent)
        : toolResultContent === null || toolResultContent === undefined
          ? ""
          : toSingleLineText(prettyJson(toolResultContent));

      return contentOneLine ? `${labelPrefix}: ${contentOneLine}` : labelPrefix;
    }

    function resolveBashSuccessNavLabel(toolName, toolInput, isToolError) {
      if (toolName !== "Bash" || isToolError) {
        return "";
      }

      const input = toolInput && typeof toolInput === "object" ? toolInput : {};
      return toSingleLineText(input.command);
    }

    function parseJsonLines(text) {
      const jsonLines = text.split(/\r?\n/).filter((line) => line.trim().length > 0);
      const parsedObjects = [];

      for (let index = 0; index < jsonLines.length; index += 1) {
        const line = jsonLines[index];

        try {
          parsedObjects.push(JSON.parse(line));
        } catch (error) {
          throw new Error(`Invalid JSON on line ${index + 1}: ${error.message}`);
        }
      }

      return parsedObjects;
    }

    function collectToolUses(objects) {
      const toolUses = {};

      for (const objectItem of objects) {
        const message = objectItem.message || {};
        const content = message.content;
        if (!Array.isArray(content)) {
          continue;
        }

        const rawTimestamp = String(objectItem.timestamp || "");
        const timestamp = formatTimestamp(rawTimestamp);

        for (const contentItem of content) {
          if (!contentItem || contentItem.type !== "tool_use" || !contentItem.id) {
            continue;
          }

          toolUses[contentItem.id] = {
            name: contentItem.name,
            time: timestamp,
            raw_time: rawTimestamp,
            json: prettyJson(contentItem.input || {}),
            input: contentItem.input || {}
          };
        }
      }

      return toolUses;
    }

    function buildEntries(objects, toolUses) {
      const entries = [];

      for (const objectItem of objects) {
        const itemType = objectItem.type || "";
        const itemRawTimestamp = String(objectItem.timestamp || "");
        const itemTimestamp = formatTimestamp(itemRawTimestamp);

        if (itemType === "result") {
          const resultCost = round4(objectItem.total_cost_usd);
          entries.push({
            type: itemType,
            cls: "result",
            time: itemTimestamp,
            anchor_id: nextEntryAnchorId(),
            nav_label: createResultCostLabel(resultCost),
            parts: [
              {
                kind: "result_stats",
                duration: formatDuration(objectItem.duration_ms),
                turns: objectItem.num_turns || 0,
                cost: resultCost
              }
            ]
          });
          continue;
        }

        const message = objectItem.message || {};
        const content = message.content;

        if (!Array.isArray(content)) {
          const subtypeLabel = String(message.subtype || "").trim();
          const rawNavLabel = itemType === "system"
            ? subtypeLabel || getTypeLabel(itemType)
            : `${getTypeLabel(itemType)}: ${subtypeLabel}`.trim();
          const rawMessageJson = prettyJson(message);
          entries.push({
            type: itemType,
            cls: itemType === "error" ? "error" : itemType,
            time: itemTimestamp,
            anchor_id: nextEntryAnchorId(),
            nav_label: rawNavLabel,
            copy_text: itemType === "system" ? rawMessageJson : "",
            parts: [
              {
                kind: "raw",
                label: rawNavLabel || getTypeLabel(itemType),
                json: rawMessageJson
              }
            ]
          });
          continue;
        }

        const textParts = [];
        const toolResultItems = [];

        for (const contentItem of content) {
          if (!contentItem) {
            continue;
          }

          if (contentItem.type === "text") {
            const rawText = String(contentItem.text || "");
            textParts.push({
              kind: "text",
              text: rawText.replaceAll(scriptClosingTag, "<\\/script>"),
              raw_text: rawText
            });
          }

          if (contentItem.type === "tool_result") {
            toolResultItems.push(contentItem);
          }
        }

        if (textParts.length > 0) {
          const normalizedType = itemType === "assistant" ? "agent" : itemType;
          const textCopyPayload = textParts
            .map((part) => String(part.raw_text || ""))
            .join("\n\n");
          const textNavLabel = normalizedType === "system"
            ? String(message.subtype || getTypeLabel(normalizedType))
            : joinTextPartsSingleLine(textParts) || getTypeLabel(normalizedType);
          entries.push({
            type: normalizedType,
            cls: itemType === "assistant"
              ? "agent"
              : itemType === "error"
                ? "error"
                : itemType,
            time: itemTimestamp,
            anchor_id: nextEntryAnchorId(),
            nav_label: textNavLabel,
            copy_text: textCopyPayload,
            copy_in_meta: true,
            parts: textParts
          });
        }

        for (const toolResultItem of toolResultItems) {
          const toolUseId = toolResultItem.tool_use_id || "";
          const toolUse = toolUses[toolUseId] || {};
          const normalizedTodos = normalizeTodoItems(toolUse.name || "", toolUse.input || {});
          const isTodoWriteEntry = (toolUse.name || "") === "TodoWrite" && normalizedTodos.length > 0;
          const toolDurationBadge = resolveToolDurationBadge(
            toolResultItem,
            toolUse.raw_time || "",
            itemRawTimestamp
          );
          const resultJson = typeof toolResultItem.content === "string"
            ? toolResultItem.content
            : prettyJson(toolResultItem.content || "");
          const isToolError = Boolean(toolResultItem.is_error);
          const defaultToolNavLabel = resolveToolNavLabel(
            toolUse.name || "",
            toolUse.input || {},
            toolUseId || "tool"
          );
          const toolErrorNavLabel = resolveToolErrorNavLabel(
            toolUse.name || "",
            toolUseId || "tool",
            toolResultItem.content
          );
          const bashSuccessNavLabel = resolveBashSuccessNavLabel(
            toolUse.name || "",
            toolUse.input || {},
            isToolError
          );
          const toolNavLabel = isToolError
            ? toolErrorNavLabel
            : bashSuccessNavLabel || defaultToolNavLabel;

          entries.push({
            type: "tool",
            cls: "tool",
            time: toolUse.time || itemTimestamp,
            tool_name: toolUse.name || toolUseId,
            request_json: toolUse.json || "{}",
            request_input: toolUse.input || {},
            result_json: resultJson,
            tool_duration_badge: toolDurationBadge,
            tool_variant: isTodoWriteEntry ? "todowrite" : "",
            todos: normalizedTodos,
            error: isToolError,
            anchor_id: nextEntryAnchorId(),
            nav_label: toolNavLabel,
            nav_label_variant: bashSuccessNavLabel ? "bash-success" : ""
          });
        }
      }

      return entries;
    }

    function parseJsonl(text) {
      const objects = parseJsonLines(text);
      const toolUses = collectToolUses(objects);
      return buildEntries(objects, toolUses);
    }

    function fallbackCopyText(text) {
      const hasDomApi = typeof document !== "undefined"
        && typeof document.createElement === "function"
        && document.body
        && typeof document.body.appendChild === "function"
        && typeof document.body.removeChild === "function"
        && typeof document.execCommand === "function";
      if (!hasDomApi) {
        return false;
      }

      const textarea = document.createElement("textarea");
      textarea.value = text;
      textarea.setAttribute("readonly", "");
      textarea.style.position = "fixed";
      textarea.style.top = "-2000px";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      if (typeof textarea.select === "function") {
        textarea.select();
      }

      let copied = false;
      try {
        copied = Boolean(document.execCommand("copy"));
      } catch (_error) {
        copied = false;
      }

      document.body.removeChild(textarea);
      return copied;
    }

    async function copyTextToClipboard(text) {
      const safeText = String(text || "");
      const clipboard = navigator && navigator.clipboard;
      if (clipboard && typeof clipboard.writeText === "function") {
        try {
          await clipboard.writeText(safeText);
          return true;
        } catch (_error) {
          return fallbackCopyText(safeText);
        }
      }

      return fallbackCopyText(safeText);
    }

    function createCopyButton(copyText, copyLabel = "Copy", extraClassName = "") {
      const copyAriaLabel = String(copyLabel || "Copy");
      const copyButton = document.createElement("button");
      copyButton.type = "button";
      copyButton.className = `panel-copy-btn ${extraClassName}`.trim();

      const copyIcon = document.createElement("span");
      copyIcon.className = "panel-copy-icon";
      copyIcon.textContent = "content_copy";
      copyIcon.setAttribute("aria-hidden", "true");
      copyButton.appendChild(copyIcon);

      copyButton.title = copyAriaLabel;
      copyButton.setAttribute("aria-label", copyAriaLabel);
      copyButton.addEventListener("click", async (event) => {
        event.preventDefault();
        event.stopPropagation();
        const copied = await copyTextToClipboard(copyText);
        if (copied) {
          showCopyToast("Copied");
          return;
        }
        showCopyToast("Copy failed");
      });

      return copyButton;
    }

    function createPanel(label, code, options = {}) {
      const details = document.createElement("details");
      const summary = document.createElement("summary");
      summary.textContent = label;
      if (Object.prototype.hasOwnProperty.call(options, "copyText")) {
        summary.classList.add("summary-with-copy");
        const copyButton = createCopyButton(options.copyText, options.copyLabel || "Copy");
        summary.appendChild(copyButton);
      }

      const pre = document.createElement("pre");
      pre.textContent = code;

      details.appendChild(summary);
      details.appendChild(pre);

      return details;
    }

    function createMetaRow(entry) {
      const meta = document.createElement("div");
      meta.className = "m";

      const badge = document.createElement("span");
      badge.className = "b";
      badge.textContent = entry.type || "";

      meta.appendChild(badge);

      if (entry.tool_duration_badge) {
        const toolDurationBadge = document.createElement("span");
        toolDurationBadge.className = "b tool-duration-badge";
        toolDurationBadge.textContent = entry.tool_duration_badge;
        meta.appendChild(toolDurationBadge);
      }

      const time = document.createElement("span");
      time.className = "t";
      time.textContent = entry.time || "";

      meta.appendChild(time);

      if (entry.copy_in_meta && entry.copy_text && !entry.error) {
        const copyLabel = entry.type === "system" ? "Copy system message" : "Copy message";
        meta.appendChild(createCopyButton(entry.copy_text, copyLabel, "meta-copy-btn"));
      }

      if (entry.error) {
        const errorBadge = document.createElement("span");
        errorBadge.className = "err";
        errorBadge.textContent = "error";
        meta.appendChild(errorBadge);
      }

      return meta;
    }

    function createMarkdownBlock(markdownText) {
      const markdown = document.createElement("zero-md");
      markdown.className = "txt";

      const template = document.createElement("template");
      template.setAttribute("data-merge", "append");
      template.innerHTML = [
        "<style>",
        ".markdown-body{font-size:13px;color:var(--markdown-text);background:transparent}",
        ".markdown-body,.markdown-body p,.markdown-body li,.markdown-body ul,.markdown-body ol{color:var(--markdown-text)}",
        ".markdown-body h1,.markdown-body h2,.markdown-body h3,.markdown-body h4,.markdown-body h5,.markdown-body h6{color:var(--markdown-heading);border-bottom-color:var(--markdown-rule)}",
        ".markdown-body a{color:var(--markdown-link)}",
        ".markdown-body blockquote{color:var(--markdown-quote);border-left-color:var(--markdown-rule)}",
        ".markdown-body hr{background:var(--markdown-rule)}",
        ".markdown-body code{background:var(--markdown-inline-code-bg);color:var(--markdown-inline-code-text)}",
        ".markdown-body pre{background:var(--markdown-code-bg);color:var(--markdown-code-text);border:1px solid var(--markdown-code-border)}",
        ".markdown-body pre code{background:transparent;color:inherit;text-shadow:none}",
        ".markdown-body pre code span{background:transparent;color:inherit !important;text-shadow:none}",
        ".markdown-body table th,.markdown-body table td{border-color:var(--markdown-table-border)}",
        ".markdown-body table tr{background:transparent}",
        ".markdown-body table tr:nth-child(2n){background:var(--markdown-table-row-alt)}",
        "</style>"
      ].join("");

      const script = document.createElement("script");
      script.type = "text/markdown";
      script.textContent = markdownText;

      markdown.appendChild(template);
      markdown.appendChild(script);

      return markdown;
    }

    function createResultStatsBlock(statsItem) {
      const stats = document.createElement("div");
      stats.className = "stats";

      const duration = document.createElement("span");
      duration.textContent = `Duration: ${statsItem.duration}`;

      const turns = document.createElement("span");
      turns.textContent = `Turns: ${statsItem.turns}`;

      const cost = document.createElement("span");
      cost.textContent = `Total cost: ${statsItem.cost}$`;

      stats.appendChild(duration);
      stats.appendChild(turns);
      stats.appendChild(cost);

      return stats;
    }

    function createTodoList(todoItems) {
      const list = document.createElement("div");
      list.className = "todo-list";

      for (const todo of todoItems) {
        const item = document.createElement("div");
        item.className = `todo-item ${todo.status || "pending"}`;
        if (todo.status === "in_progress") {
          item.classList.add("active");
        }
        if (todo.status === "completed") {
          item.classList.add("completed");
        }

        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.className = "todo-item-checkbox";
        checkbox.disabled = true;
        checkbox.checked = todo.status === "completed";
        checkbox.tabIndex = -1;

        const text = document.createElement("span");
        text.className = "todo-item-text";
        text.textContent = String(todo.content || "");

        item.appendChild(checkbox);
        item.appendChild(text);
        list.appendChild(item);
      }

      return list;
    }

    function appendToolEntry(card, entry) {
      if (entry.tool_variant === "todowrite" && Array.isArray(entry.todos) && entry.todos.length > 0) {
        card.appendChild(createTodoList(entry.todos));
        return;
      }

      const requestPanel = createPanel(entry.tool_name || "tool", entry.request_json || "{}", {
        copyText: entry.request_json || "{}",
        copyLabel: "Copy request"
      });
      const resultPanel = createPanel("result", entry.result_json || "", {
        copyText: entry.result_json || "",
        copyLabel: "Copy result"
      });

      card.appendChild(requestPanel);
      card.appendChild(resultPanel);
    }

    function appendRegularEntryParts(card, entry) {
      for (const part of entry.parts || []) {
        if (part.kind === "text") {
          card.appendChild(createMarkdownBlock(part.text || ""));
          continue;
        }

        if (part.kind === "result_stats") {
          card.appendChild(createResultStatsBlock(part));
          continue;
        }

        if (part.kind === "tool") {
          card.appendChild(createPanel(`tool ${part.name || ""}`, part.json || ""));
          continue;
        }

        if (part.kind === "result") {
          card.appendChild(createPanel(`result ${part.name || ""}`, part.json || ""));
          continue;
        }

        if (part.kind === "raw" && entry.type === "system") {
          card.appendChild(createPanel(part.label || "raw", part.json || "", {
            copyText: part.json || "",
            copyLabel: "Copy system message"
          }));
          continue;
        }

        card.appendChild(createPanel(part.label || "raw", part.json || ""));
      }
    }

    function openToolInputPanel(targetCard) {
      if (!targetCard || !targetCard.classList || !targetCard.classList.contains("tool")) {
        return;
      }

      const children = targetCard.children || [];
      for (const child of children) {
        if (!child || child.tagName !== "DETAILS") {
          continue;
        }

        child.open = true;
        return;
      }
    }

    function resolveNavLabelParts(entry, labelText) {
      if (!labelText) {
        return [{ text: "", bold: false }];
      }

      if (entry.type === "tool" && entry.nav_label_variant === "bash-success") {
        return [{ text: labelText, bold: false }];
      }

      if (entry.type === "system") {
        return [{ text: labelText, bold: true }];
      }

      if (entry.type === "tool" && (entry.tool_name || "") === "Skill") {
        return [{ text: labelText, bold: true }];
      }

      if (entry.type === "tool") {
        if (!entry.error && !labelText.includes(":")) {
          return [{ text: labelText, bold: true }];
        }

        const colonIndex = labelText.indexOf(":");
        if (colonIndex > 0) {
          return [
            { text: labelText.slice(0, colonIndex + 1), bold: true },
            { text: labelText.slice(colonIndex + 1), bold: false }
          ];
        }
      }

      return [{ text: labelText, bold: false }];
    }

    function renderNavLabel(textNode, entry, labelText) {
      const labelParts = resolveNavLabelParts(entry, labelText);
      const hasStrongPart = labelParts.some((labelPart) => labelPart.bold);
      if (!hasStrongPart) {
        textNode.textContent = labelText;
        textNode._textContent = labelText;
        return;
      }

      textNode.textContent = "";
      for (const labelPart of labelParts) {
        if (!labelPart.text) {
          continue;
        }

        const partNode = document.createElement(labelPart.bold ? "strong" : "span");
        if (labelPart.bold) {
          partNode.className = "nav-text-strong";
        }
        partNode.textContent = labelPart.text;
        textNode.appendChild(partNode);
      }

      if (textNode.childElementCount === 0) {
        textNode.textContent = labelText;
      }
      textNode._textContent = labelText;
    }

    function createNavItem(entry, targetCard) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = `nav-item ${entry.cls || ""}`;
      if (button.dataset) {
        button.dataset.targetCardId = String(targetCard && targetCard.id ? targetCard.id : "");
      }
      if (entry.error) {
        button.classList.add("error");
        button.style.setProperty("--c", "var(--entry-error)");
      }

      const navTime = document.createElement("span");
      navTime.className = "nav-time";
      navTime.textContent = formatNavTime(entry.time || "");

      const dot = document.createElement("span");
      dot.className = "nav-dot";

      const text = document.createElement("span");
      text.className = "nav-text";
      if (entry.nav_label_variant === "bash-success") {
        text.classList.add("nav-text-terminal");
      }
      const navLabel = String(entry.nav_label || getTypeLabel(entry.type));
      renderNavLabel(text, entry, navLabel);

      button.appendChild(navTime);
      button.appendChild(dot);
      button.appendChild(text);
      button.addEventListener("click", () => {
        openToolInputPanel(targetCard);
        markNavAutoScrolling();
        targetCard.scrollIntoView({
          block: "center",
          behavior: "instant"
        });
        applyNavTargetHighlight(targetCard);
      });

      return button;
    }

    function renderEntries(entries, mountNode) {
      const feed = document.createElement("div");
      feed.className = "feed";

      for (const entry of entries) {
        const card = document.createElement("div");
        card.className = `e ${entry.cls || ""}`;
        card.id = entry.anchor_id || nextEntryAnchorId();

        if (entry.error) {
          card.style.setProperty("--c", "var(--entry-error)");
        }

        card.addEventListener("mouseenter", () => {
          applyContentHoverNavItem(card);
        });
        card.addEventListener("mouseleave", () => {
          clearContentHoverNavItem();
        });

        card.appendChild(createMetaRow(entry));

        if (entry.type === "tool") {
          appendToolEntry(card, entry);
        } else {
          appendRegularEntryParts(card, entry);
        }

        feed.appendChild(card);
        navListEl.appendChild(createNavItem(entry, card));
      }

      mountNode.appendChild(feed);
      syncVisibleNavItemBorders();
    }

    async function handleFiles(fileList) {
      const files = [...fileList].filter((file) => file && file.size >= 0);
      if (files.length === 0) {
        return;
      }

      closeNavFocusMode();
      clearNavTargetHighlight();
      clearContentHoverNavItem();
      outputEl.textContent = "";
      navListEl.textContent = "";
      mainColumnEl.scrollTop = 0;
      navColumnEl.scrollTop = 0;
      syncUiState({ rendering: true });
      setStatus(`Rendering ${files.length} file(s)...`);

      for (const file of files) {
        const section = document.createElement("section");
        section.className = "file-block";

        const title = document.createElement("h2");
        title.className = "file-title";
        title.textContent = file.name;
        section.appendChild(title);

        try {
          const text = await file.text();
          const entries = parseJsonl(text);
          renderEntries(entries, section);
        } catch (error) {
          const pre = document.createElement("pre");
          pre.textContent = String(error && error.message ? error.message : error);
          section.appendChild(pre);
        }

        outputEl.appendChild(section);
      }

      syncUiState();
      setStatus(`Done. Rendered ${files.length} file(s).`, "ok");
    }

    function clearOutput() {
      closeNavFocusMode();
      clearNavTargetHighlight();
      clearContentHoverNavItem();
      outputEl.textContent = "";
      navListEl.textContent = "";
      syncVisibleNavItemBorders();
      setStatus("");
      fileInput.value = "";
      dropzone.classList.remove("dragover");
      mainColumnEl.scrollTop = 0;
      navColumnEl.scrollTop = 0;
      syncUiState();
    }

    function onWindowResize() {
      syncClearButtonPosition();
      syncVisibleNavItemBorders();
      setNavFocusActive(isNavFocusActive);
    }

    function onDocumentKeydown(event) {
      const eventKey = String(event && event.key ? event.key : "").toLowerCase();
      if (eventKey !== "escape" || !isNavFocusActive) {
        return;
      }

      if (event && typeof event.preventDefault === "function") {
        event.preventDefault();
      }

      closeNavFocusMode();
    }

    function onDocumentClick() {
      clearNavTargetHighlight();
    }

    function openFilePicker() {
      fileInput.click();
    }

    function onDropzoneKeydown(event) {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        fileInput.click();
      }
    }

    function markDragOver(event) {
      event.preventDefault();
      event.stopPropagation();
      dropzone.classList.add("dragover");
    }

    function unmarkDragOver(event) {
      event.preventDefault();
      event.stopPropagation();
      dropzone.classList.remove("dragover");
    }

    async function onDrop(event) {
      const files = event.dataTransfer && event.dataTransfer.files;
      if (!files) {
        return;
      }

      await handleFiles(files);
    }

    async function onInputChange(event) {
      const files = event.target.files;
      if (!files) {
        return;
      }

      await handleFiles(files);
      fileInput.value = "";
    }

    dropzone.addEventListener("click", openFilePicker);
    dropzone.addEventListener("keydown", onDropzoneKeydown);

    dropzone.addEventListener("dragenter", markDragOver);
    dropzone.addEventListener("dragover", markDragOver);
    dropzone.addEventListener("dragleave", unmarkDragOver);
    dropzone.addEventListener("drop", unmarkDragOver);
    dropzone.addEventListener("drop", onDrop);

    fileInput.addEventListener("change", onInputChange);
    clearBtn.addEventListener("click", clearOutput);
    themeToggleBtn.addEventListener("click", toggleTheme);
    navFocusPipEl.addEventListener("click", toggleNavFocusMode);
    navFocusBackdropEl.addEventListener("click", closeNavFocusMode);
    mainColumnEl.addEventListener("scroll", clearNavTargetHighlightOnScroll);
    navColumnEl.addEventListener("scroll", clearNavTargetHighlightOnScroll);
    if (typeof document !== "undefined" && typeof document.addEventListener === "function") {
      document.addEventListener("keydown", onDocumentKeydown);
      document.addEventListener("click", onDocumentClick, true);
    }
    if (typeof window !== "undefined" && typeof window.addEventListener === "function") {
      window.addEventListener("resize", onWindowResize);
    }
    applyTheme(resolveInitialTheme(), { persist: false });
    syncUiState();

  return {
    handleFiles,
    clearOutput,
    clearBtn,
    themeToggleBtn,
    dropzone,
    outputEl,
    statusEl,
    contentGridEl,
    navListEl,
    navColumnEl,
    navFocusPipEl,
    navFocusPipIconEl,
    navFocusBackdropEl,
    mainColumnEl,
    appEl
  };
}

function shouldAutoBootstrap() {
  if (typeof globalThis === "undefined" || !globalThis.document) {
    return false;
  }

  if (typeof globalThis.document.getElementById !== "function") {
    return false;
  }

  return Boolean(globalThis.document.getElementById("app"));
}

if (shouldAutoBootstrap()) {
  createJsonlViewerApp();
}

export default createJsonlViewerApp;
