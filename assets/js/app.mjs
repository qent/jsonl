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
    const collapseAllBtn = document.getElementById("collapseAllBtn");
    const expandAllBtn = document.getElementById("expandAllBtn");
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
    const largeFileByteThreshold = Number.isFinite(deps.largeFileByteThreshold)
      ? Math.max(0, Number(deps.largeFileByteThreshold))
      : 25 * 1024 * 1024;
    const largeEntryThreshold = Number.isFinite(deps.largeEntryThreshold)
      ? Math.max(1, Number(deps.largeEntryThreshold))
      : 1500;
    const streamChunkSize = Number.isFinite(deps.streamChunkSize)
      ? Math.max(1024, Number(deps.streamChunkSize))
      : 1024 * 1024;
    const virtualEntryHeight = Number.isFinite(deps.virtualEntryHeight)
      ? Math.max(64, Number(deps.virtualEntryHeight))
      : 220;
    const virtualNavRowHeight = Number.isFinite(deps.virtualNavRowHeight)
      ? Math.max(20, Number(deps.virtualNavRowHeight))
      : 30;
    const virtualContentOverscanPx = Number.isFinite(deps.virtualContentOverscanPx)
      ? Math.max(0, Number(deps.virtualContentOverscanPx))
      : 1200;
    const virtualNavOverscanRows = Number.isFinite(deps.virtualNavOverscanRows)
      ? Math.max(0, Number(deps.virtualNavOverscanRows))
      : 30;
    const lazyEntryCacheLimit = Number.isFinite(deps.lazyEntryCacheLimit)
      ? Math.max(1, Number(deps.lazyEntryCacheLimit))
      : 120;
    const lazyEntryCacheByteLimit = Number.isFinite(deps.lazyEntryCacheByteLimit)
      ? Math.max(1024, Number(deps.lazyEntryCacheByteLimit))
      : 32 * 1024 * 1024;
    const largeNavLabelMaxLength = Number.isFinite(deps.largeNavLabelMaxLength)
      ? Math.max(20, Number(deps.largeNavLabelMaxLength))
      : 240;
    let entryCounter = 0;
    let activeNavTargetCard = null;
    let activeContentHoverNavItem = null;
    let isNavAutoScrolling = false;
    let isNavFocusActive = false;
    let copyToastTimer = null;
    let activeLoadToken = null;
    let activeVirtualSession = null;

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

    function collectNavItemElements(node, navItems = []) {
      if (!node || !node.children) {
        return navItems;
      }

      for (const child of node.children) {
        if (!child) {
          continue;
        }
        if (child.classList && child.classList.contains("nav-item")) {
          navItems.push(child);
          continue;
        }
        collectNavItemElements(child, navItems);
      }

      return navItems;
    }

    function getNavItemElements() {
      return collectNavItemElements(navListEl, []);
    }

    function syncNavVisibility() {
      const hasNavEntries = getNavItemElements().length > 0;
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

      const navItems = getNavItemElements();
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
      const navItems = getNavItemElements();
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

      if (dropzone && !dropzone.hidden && typeof dropzone.getBoundingClientRect === "function") {
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

    function collectHistoryDetailsNodes(node, detailsNodes) {
      if (!node || !node.children || node.children.length === 0) {
        return;
      }

      for (const child of node.children) {
        if (!child) {
          continue;
        }

        if (child.tagName === "DETAILS") {
          detailsNodes.push(child);
        }

        collectHistoryDetailsNodes(child, detailsNodes);
      }
    }

    function getHistoryDetailsNodes() {
      const detailsNodes = [];
      collectHistoryDetailsNodes(outputEl, detailsNodes);
      return detailsNodes;
    }

    function setAllHistoryDetailsOpenState(nextOpenState) {
      if (activeVirtualSession) {
        const shouldOpenVirtual = Boolean(nextOpenState);
        activeVirtualSession.detailsOpenState = shouldOpenVirtual;
        const mountedCards = activeVirtualSession.mountedCards.values();
        for (const card of mountedCards) {
          applyDetailsOpenState(card, shouldOpenVirtual);
        }
        return;
      }

      const detailsNodes = getHistoryDetailsNodes();
      if (detailsNodes.length === 0) {
        return;
      }

      const shouldOpen = Boolean(nextOpenState);
      for (const detailsNode of detailsNodes) {
        detailsNode.open = shouldOpen;
      }
    }

    function syncHistoryToggleButtons(hasContent) {
      const hasRenderedContent = typeof hasContent === "boolean"
        ? hasContent
        : outputEl.childElementCount > 0;
      const canToggleVirtualHistory = Boolean(activeVirtualSession
        && hasRenderedContent
        && activeVirtualSession.records.some((record) => record.summary && record.summary.has_details));
      const detailsNodes = hasRenderedContent && !canToggleVirtualHistory ? getHistoryDetailsNodes() : [];
      const canToggleHistory = canToggleVirtualHistory || (hasRenderedContent && detailsNodes.length > 0);

      if (collapseAllBtn) {
        collapseAllBtn.hidden = !canToggleHistory;
        collapseAllBtn.disabled = !canToggleHistory;
      }

      if (expandAllBtn) {
        expandAllBtn.hidden = !canToggleHistory;
        expandAllBtn.disabled = !canToggleHistory;
      }
    }

    function collapseAllHistoryContent() {
      if (collapseAllBtn && collapseAllBtn.disabled) {
        return;
      }

      setAllHistoryDetailsOpenState(false);
    }

    function expandAllHistoryContent() {
      if (expandAllBtn && expandAllBtn.disabled) {
        return;
      }

      setAllHistoryDetailsOpenState(true);
    }

    function syncUiState(options = {}) {
      const isRendering = Boolean(options.rendering);
      const hasContent = outputEl.childElementCount > 0;

      syncNavVisibility();
      setNavFocusActive(isNavFocusActive);
      syncHistoryToggleButtons(hasContent);
      clearBtn.hidden = !hasContent;
      contentGridEl.hidden = !hasContent;
      dropzone.hidden = isRendering || hasContent;
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

    function createLoadToken() {
      if (activeLoadToken) {
        activeLoadToken.cancelled = true;
      }

      activeLoadToken = { cancelled: false };
      return activeLoadToken;
    }

    function cancelActiveLoad() {
      if (activeLoadToken) {
        activeLoadToken.cancelled = true;
      }
    }

    function throwIfCancelled(loadToken) {
      if (loadToken && loadToken.cancelled) {
        const error = new Error("Loading cancelled");
        error.name = "AbortError";
        throw error;
      }
    }

    function isCancelledError(error) {
      return Boolean(error && error.name === "AbortError");
    }

    function sleep(ms = 0) {
      return new Promise((resolve) => {
        setTimeout(resolve, ms);
      });
    }

    function formatByteCount(byteCount) {
      const bytes = Number(byteCount || 0);
      if (!Number.isFinite(bytes) || bytes <= 0) {
        return "0 B";
      }

      const units = ["B", "KB", "MB", "GB", "TB"];
      let value = bytes;
      let unitIndex = 0;
      while (value >= 1024 && unitIndex < units.length - 1) {
        value /= 1024;
        unitIndex += 1;
      }

      const precision = value >= 100 || unitIndex === 0 ? 0 : value >= 10 ? 1 : 2;
      return `${value.toFixed(precision)} ${units[unitIndex]}`;
    }

    function concatBytes(parts, totalLength) {
      if (parts.length === 1 && parts[0].length === totalLength) {
        return parts[0];
      }

      const bytes = new Uint8Array(totalLength);
      let offset = 0;
      for (const part of parts) {
        bytes.set(part, offset);
        offset += part.length;
      }
      return bytes;
    }

    function createUtf8Decoder() {
      if (typeof TextDecoder === "function") {
        return new TextDecoder();
      }

      return {
        decode(bytes) {
          let text = "";
          for (const byte of bytes) {
            text += String.fromCharCode(byte);
          }
          return decodeURIComponent(escape(text));
        }
      };
    }

    function normalizeJsonLineText(lineText) {
      return String(lineText || "").replace(/\r$/, "");
    }

    async function* iterateByteChunks(file, loadToken) {
      if (file && typeof file.stream === "function") {
        const stream = file.stream();
        if (stream && typeof stream.getReader === "function") {
          const reader = stream.getReader();
          try {
            while (true) {
              throwIfCancelled(loadToken);
              const result = await reader.read();
              if (result.done) {
                break;
              }

              const value = result.value;
              if (!value || value.length === 0) {
                continue;
              }
              yield value instanceof Uint8Array ? value : new Uint8Array(value);
            }
          } finally {
            if (loadToken && loadToken.cancelled && typeof reader.cancel === "function") {
              try {
                await reader.cancel();
              } catch (_error) {
                // The reader may already be closed.
              }
            }
          }
          return;
        }

        if (stream && typeof stream[Symbol.asyncIterator] === "function") {
          for await (const chunk of stream) {
            throwIfCancelled(loadToken);
            if (!chunk || chunk.length === 0) {
              continue;
            }
            yield chunk instanceof Uint8Array ? chunk : new Uint8Array(chunk);
          }
          return;
        }
      }

      if (file && typeof file.slice === "function") {
        const fileSize = Math.max(0, Number(file.size || 0));
        for (let start = 0; start < fileSize; start += streamChunkSize) {
          throwIfCancelled(loadToken);
          const end = Math.min(fileSize, start + streamChunkSize);
          const slice = file.slice(start, end);
          let arrayBuffer;
          if (slice && typeof slice.arrayBuffer === "function") {
            arrayBuffer = await slice.arrayBuffer();
          } else if (slice && typeof slice.text === "function") {
            const text = await slice.text();
            arrayBuffer = new TextEncoder().encode(text).buffer;
          } else {
            throw new Error("Unable to read file chunks in this browser.");
          }
          yield new Uint8Array(arrayBuffer);
        }
        return;
      }

      throw new Error("This browser does not support chunked file reads.");
    }

    async function* iterateJsonlLines(file, loadToken) {
      const decoder = createUtf8Decoder();
      let pendingParts = [];
      let pendingLength = 0;
      let byteOffset = 0;
      let lineStartOffset = 0;
      let lineNumber = 1;

      for await (const chunk of iterateByteChunks(file, loadToken)) {
        let segmentStartIndex = 0;

        for (let index = 0; index < chunk.length; index += 1) {
          if (chunk[index] !== 10) {
            continue;
          }

          const segment = chunk.slice(segmentStartIndex, index);
          if (segment.length > 0) {
            pendingParts.push(segment);
            pendingLength += segment.length;
          }

          const lineBytes = concatBytes(pendingParts, pendingLength);
          const lineText = normalizeJsonLineText(decoder.decode(lineBytes));
          yield {
            text: lineText,
            start: lineStartOffset,
            end: byteOffset + index,
            lineNumber
          };

          pendingParts = [];
          pendingLength = 0;
          lineNumber += 1;
          segmentStartIndex = index + 1;
          lineStartOffset = byteOffset + index + 1;
        }

        const rest = chunk.slice(segmentStartIndex);
        if (rest.length > 0) {
          pendingParts.push(rest);
          pendingLength += rest.length;
        }

        byteOffset += chunk.length;
      }

      if (pendingLength > 0 || lineStartOffset < byteOffset) {
        const lineBytes = concatBytes(pendingParts, pendingLength);
        const lineText = normalizeJsonLineText(decoder.decode(lineBytes));
        yield {
          text: lineText,
          start: lineStartOffset,
          end: byteOffset,
          lineNumber
        };
      }
    }

    async function readLineRef(lineRef) {
      if (!lineRef) {
        return "";
      }
      if (typeof lineRef.text === "string") {
        return lineRef.text;
      }

      const file = lineRef.file;
      if (!file || typeof file.slice !== "function") {
        throw new Error("Unable to read indexed line because file slicing is unavailable.");
      }

      const slice = file.slice(lineRef.start, lineRef.end);
      if (slice && typeof slice.text === "function") {
        return normalizeJsonLineText(await slice.text());
      }
      if (slice && typeof slice.arrayBuffer === "function") {
        const bytes = new Uint8Array(await slice.arrayBuffer());
        return normalizeJsonLineText(createUtf8Decoder().decode(bytes));
      }

      throw new Error("Unable to read indexed line.");
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
        renderVirtualContentWindow(activeVirtualSession);
        syncVisibleNavItemBorders();
      }
      if (event && event.currentTarget === navColumnEl) {
        renderVirtualNavWindow(activeVirtualSession);
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
            tool_use_id: toolUseId,
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

    function truncateNavLabel(labelText) {
      const label = String(labelText || "");
      if (label.length <= largeNavLabelMaxLength) {
        return label;
      }

      return `${label.slice(0, largeNavLabelMaxLength - 1)}…`;
    }

    function entryHasDetails(entry) {
      if (!entry || entry.type === "tool") {
        return Boolean(entry && entry.type === "tool");
      }

      return (entry.parts || []).some((part) => part && (part.kind === "raw" || part.kind === "tool" || part.kind === "result"));
    }

    function createEntrySummary(entry, fileIndex, fileName, entryIndex, lineRef) {
      return {
        type: entry.type || "",
        cls: entry.cls || "",
        time: entry.time || "",
        tool_name: entry.tool_name || "",
        tool_duration_badge: entry.tool_duration_badge || "",
        tool_variant: entry.tool_variant || "",
        error: Boolean(entry.error),
        nav_label: truncateNavLabel(entry.nav_label || getTypeLabel(entry.type)),
        nav_label_variant: entry.nav_label_variant || "",
        anchor_id: entry.anchor_id || nextEntryAnchorId(),
        tool_use_id: entry.tool_use_id || "",
        has_details: entryHasDetails(entry),
        file_index: fileIndex,
        file_name: fileName,
        entry_index: entryIndex,
        line_number: lineRef ? lineRef.lineNumber : 0
      };
    }

    function collectToolUsesFromObject(objectItem, lineRef, toolUses) {
      const message = objectItem.message || {};
      const content = message.content;
      if (!Array.isArray(content)) {
        return;
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
          input: contentItem.input || {},
          line_ref: lineRef
        };
      }
    }

    function createLineRef(file, lineInfo, keepTextFallback) {
      return {
        file,
        start: lineInfo.start,
        end: lineInfo.end,
        lineNumber: lineInfo.lineNumber,
        text: keepTextFallback ? lineInfo.text : undefined
      };
    }

    function buildEntryRecordsForObject(objectItem, options) {
      const {
        file,
        fileIndex,
        fileName,
        lineRef,
        toolUses,
        records
      } = options;

      collectToolUsesFromObject(objectItem, lineRef, toolUses);
      const lineEntries = buildEntries([objectItem], toolUses);
      const consumedToolUseIds = [];
      for (let lineEntryIndex = 0; lineEntryIndex < lineEntries.length; lineEntryIndex += 1) {
        const entry = lineEntries[lineEntryIndex];
        const entryIndex = records.length;
        const toolUse = entry.tool_use_id ? toolUses[entry.tool_use_id] : null;
        const summary = createEntrySummary(entry, fileIndex, fileName, entryIndex, lineRef);
        records.push({
          source: "file",
          file,
          fileIndex,
          fileName,
          entryIndex,
          lineRef,
          toolUseLineRef: toolUse && toolUse.line_ref ? toolUse.line_ref : null,
          toolUseId: entry.tool_use_id || "",
          lineEntryOrdinal: lineEntryIndex,
          summary,
          estimatedBytes: Math.max(0, Number(lineRef.end || 0) - Number(lineRef.start || 0))
        });
        if (entry.tool_use_id && toolUse) {
          consumedToolUseIds.push(entry.tool_use_id);
        }
      }

      for (const toolUseId of consumedToolUseIds) {
        delete toolUses[toolUseId];
      }
    }

    function createMemoryEntryRecords(fileEntriesList) {
      const records = [];
      for (let fileIndex = 0; fileIndex < fileEntriesList.length; fileIndex += 1) {
        const fileData = fileEntriesList[fileIndex];
        for (const entry of fileData.entries) {
          const entryIndex = records.length;
          const summary = createEntrySummary(entry, fileIndex, fileData.name, entryIndex, null);
          summary.anchor_id = entry.anchor_id || summary.anchor_id;
          records.push({
            source: "memory",
            fileIndex,
            fileName: fileData.name,
            entryIndex,
            entry,
            summary,
            estimatedBytes: JSON.stringify(entry).length
          });
        }
      }
      return records;
    }

    async function buildLargeFileIndex(files, loadToken) {
      const records = [];
      const toolUses = {};
      let lastYieldAt = Date.now();

      for (let fileIndex = 0; fileIndex < files.length; fileIndex += 1) {
        const file = files[fileIndex];
        const fileName = String(file.name || `file-${fileIndex + 1}.jsonl`);
        const keepTextFallback = typeof file.slice !== "function";

        for await (const lineInfo of iterateJsonlLines(file, loadToken)) {
          throwIfCancelled(loadToken);

          if (!lineInfo.text.trim()) {
            continue;
          }

          let objectItem;
          try {
            objectItem = JSON.parse(lineInfo.text);
          } catch (error) {
            throw new Error(`Invalid JSON in ${fileName} on line ${lineInfo.lineNumber}: ${error.message}`);
          }

          buildEntryRecordsForObject(objectItem, {
            file,
            fileIndex,
            fileName,
            lineRef: createLineRef(file, lineInfo, keepTextFallback),
            toolUses,
            records
          });

          const now = Date.now();
          if (now - lastYieldAt > 80 || records.length % 500 === 0) {
            setStatus(`Indexing ${fileName}: ${formatByteCount(lineInfo.end)} / ${formatByteCount(file.size)}, ${records.length} entries...`);
            lastYieldAt = now;
            await sleep(0);
          }
        }

        setStatus(`Indexed ${fileName}: ${records.length} entries...`);
        await sleep(0);
      }

      return records;
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

    function applyDetailsOpenState(card, nextOpenState) {
      if (typeof nextOpenState !== "boolean") {
        return;
      }

      const detailsNodes = [];
      collectHistoryDetailsNodes(card, detailsNodes);
      for (const detailsNode of detailsNodes) {
        detailsNode.open = nextOpenState;
      }
    }

    function appendEntryCardBody(card, entry) {
      card.appendChild(createMetaRow(entry));

      if (entry.type === "tool") {
        appendToolEntry(card, entry);
        return;
      }

      appendRegularEntryParts(card, entry);
    }

    function createEntryCard(entry, options = {}) {
      const card = document.createElement("div");
      card.className = `e ${entry.cls || ""}`;
      card.id = options.anchorId || entry.anchor_id || nextEntryAnchorId();

      if (entry.error) {
        card.style.setProperty("--c", "var(--entry-error)");
      }

      if (options.entryIndex !== undefined && card.dataset) {
        card.dataset.entryIndex = String(options.entryIndex);
      }

      card.addEventListener("mouseenter", () => {
        applyContentHoverNavItem(card);
      });
      card.addEventListener("mouseleave", () => {
        clearContentHoverNavItem();
      });

      appendEntryCardBody(card, entry);
      applyDetailsOpenState(card, options.detailsOpenState);
      return card;
    }

    function renderEntries(entries, mountNode) {
      const feed = document.createElement("div");
      feed.className = "feed";

      for (const entry of entries) {
        const card = createEntryCard(entry);
        feed.appendChild(card);
        navListEl.appendChild(createNavItem(entry, card));
      }

      mountNode.appendChild(feed);
      syncVisibleNavItemBorders();
    }

    function resolveViewportHeight(element, fallbackHeight = 900) {
      const clientHeight = Number(element && element.clientHeight);
      if (Number.isFinite(clientHeight) && clientHeight > 0) {
        return clientHeight;
      }

      if (element && typeof element.getBoundingClientRect === "function") {
        const rect = element.getBoundingClientRect();
        if (rect && Number.isFinite(rect.height) && rect.height > 0) {
          return rect.height;
        }
      }

      if (typeof window !== "undefined" && Number.isFinite(window.innerHeight) && window.innerHeight > 0) {
        return window.innerHeight;
      }

      return fallbackHeight;
    }

    function setSpacerHeight(spacerEl, height) {
      if (!spacerEl || !spacerEl.style) {
        return;
      }

      spacerEl.style.height = `${Math.max(0, Math.round(height))}px`;
    }

    function calculateVirtualRange(totalItems, rowHeight, scrollTop, viewportHeight, overscanPx) {
      if (totalItems <= 0) {
        return { start: 0, end: 0 };
      }

      const safeRowHeight = Math.max(1, Number(rowHeight || 1));
      const safeScrollTop = Math.max(0, Number(scrollTop || 0));
      const safeViewportHeight = Math.max(1, Number(viewportHeight || 1));
      const safeOverscanPx = Math.max(0, Number(overscanPx || 0));
      const start = Math.max(0, Math.floor((safeScrollTop - safeOverscanPx) / safeRowHeight));
      const end = Math.min(
        totalItems,
        Math.ceil((safeScrollTop + safeViewportHeight + safeOverscanPx) / safeRowHeight)
      );

      return { start, end: Math.max(start + 1, end) };
    }

    function createVirtualSpacer(className) {
      const spacer = document.createElement("div");
      spacer.className = className;
      spacer.setAttribute("aria-hidden", "true");
      return spacer;
    }

    function createVirtualCardShell(record) {
      const entry = record.summary;
      const card = document.createElement("div");
      card.className = `e ${entry.cls || ""} virtual-entry-loading`;
      card.id = entry.anchor_id || nextEntryAnchorId();
      if (card.dataset) {
        card.dataset.entryIndex = String(record.entryIndex);
      }
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
      const loading = document.createElement("pre");
      loading.textContent = "Loading entry...";
      card.appendChild(loading);
      return card;
    }

    function cacheVirtualEntry(session, record, entry) {
      if (!session || record.source === "memory") {
        return;
      }

      const cacheKey = String(record.entryIndex);
      if (session.entryCache.has(cacheKey)) {
        const cached = session.entryCache.get(cacheKey);
        session.cacheBytes -= cached.bytes;
        session.entryCache.delete(cacheKey);
      }

      const bytes = Math.max(512, Number(record.estimatedBytes || 0));
      session.entryCache.set(cacheKey, { entry, bytes });
      session.cacheBytes += bytes;

      while (
        session.entryCache.size > lazyEntryCacheLimit
        || session.cacheBytes > lazyEntryCacheByteLimit
      ) {
        const oldestKey = session.entryCache.keys().next().value;
        if (oldestKey === undefined) {
          break;
        }
        const oldest = session.entryCache.get(oldestKey);
        session.cacheBytes -= oldest ? oldest.bytes : 0;
        session.entryCache.delete(oldestKey);
      }
    }

    async function loadEntryForRecord(record) {
      if (record.source === "memory") {
        return record.entry;
      }

      if (record.summary.type === "tool") {
        const resultText = await readLineRef(record.lineRef);
        const resultObject = JSON.parse(resultText);
        const tempToolUses = {};

        if (record.toolUseLineRef) {
          const toolUseText = await readLineRef(record.toolUseLineRef);
          const toolUseObject = JSON.parse(toolUseText);
          Object.assign(tempToolUses, collectToolUses([toolUseObject]));
        }

        const entries = buildEntries([resultObject], tempToolUses);
        const matchingEntry = entries.find((entry) => entry.tool_use_id === record.toolUseId)
          || entries.find((entry) => entry.type === "tool")
          || entries[0];

        if (!matchingEntry) {
          throw new Error("Indexed tool entry could not be reconstructed.");
        }

        matchingEntry.anchor_id = record.summary.anchor_id;
        return matchingEntry;
      }

      const sourceText = await readLineRef(record.lineRef);
      const sourceObject = JSON.parse(sourceText);
      const entries = buildEntries([sourceObject], {});
      const matchingEntry = entries[record.lineEntryOrdinal] || entries[0];
      if (!matchingEntry) {
        throw new Error("Indexed entry could not be reconstructed.");
      }

      matchingEntry.anchor_id = record.summary.anchor_id;
      return matchingEntry;
    }

    async function hydrateVirtualCard(session, record, card) {
      const cacheKey = String(record.entryIndex);
      try {
        let entry = record.entry;
        if (!entry && session.entryCache.has(cacheKey)) {
          const cached = session.entryCache.get(cacheKey);
          session.entryCache.delete(cacheKey);
          session.entryCache.set(cacheKey, cached);
          entry = cached.entry;
        }
        if (!entry) {
          entry = await loadEntryForRecord(record);
          cacheVirtualEntry(session, record, entry);
        }

        if (session !== activeVirtualSession || session.mountedCards.get(record.entryIndex) !== card) {
          return;
        }

        card.textContent = "";
        card.className = `e ${entry.cls || ""}`;
        card.id = record.summary.anchor_id;
        if (card.dataset) {
          card.dataset.entryIndex = String(record.entryIndex);
        }
        if (entry.error) {
          card.style.setProperty("--c", "var(--entry-error)");
        }
        appendEntryCardBody(card, entry);
        applyDetailsOpenState(card, session.detailsOpenState);

        if (record.pendingOpenTool) {
          openToolInputPanel(card);
          record.pendingOpenTool = false;
        }
        if (record.pendingHighlight) {
          applyNavTargetHighlight(card);
          record.pendingHighlight = false;
        }
      } catch (error) {
        if (session !== activeVirtualSession || session.mountedCards.get(record.entryIndex) !== card) {
          return;
        }
        card.textContent = "";
        card.appendChild(createMetaRow(record.summary));
        const pre = document.createElement("pre");
        pre.textContent = String(error && error.message ? error.message : error);
        card.appendChild(pre);
      }
    }

    function renderVirtualContentWindow(session) {
      if (!session || session !== activeVirtualSession) {
        return Promise.resolve();
      }

      const viewportHeight = resolveViewportHeight(mainColumnEl);
      const range = calculateVirtualRange(
        session.records.length,
        virtualEntryHeight,
        mainColumnEl.scrollTop,
        viewportHeight,
        virtualContentOverscanPx
      );

      if (range.start === session.contentStart && range.end === session.contentEnd) {
        return Promise.resolve();
      }

      session.contentStart = range.start;
      session.contentEnd = range.end;
      session.contentItemsEl.textContent = "";
      session.mountedCards.clear();
      setSpacerHeight(session.contentTopSpacerEl, range.start * virtualEntryHeight);
      setSpacerHeight(session.contentBottomSpacerEl, (session.records.length - range.end) * virtualEntryHeight);

      const hydrationPromises = [];
      for (let index = range.start; index < range.end; index += 1) {
        const record = session.records[index];
        const card = createVirtualCardShell(record);
        session.mountedCards.set(index, card);
        session.contentItemsEl.appendChild(card);
        hydrationPromises.push(hydrateVirtualCard(session, record, card));
      }

      syncVisibleNavItemBorders();
      return Promise.all(hydrationPromises).then(() => undefined);
    }

    function createVirtualNavItem(session, record) {
      const entry = record.summary;
      const button = document.createElement("button");
      button.type = "button";
      button.className = `nav-item ${entry.cls || ""}`;
      if (button.dataset) {
        button.dataset.targetCardId = String(entry.anchor_id || "");
        button.dataset.entryIndex = String(record.entryIndex);
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
      renderNavLabel(text, entry, String(entry.nav_label || getTypeLabel(entry.type)));

      button.appendChild(navTime);
      button.appendChild(dot);
      button.appendChild(text);
      button.addEventListener("click", () => {
        scrollVirtualContentToEntry(session, record.entryIndex, {
          openTool: true,
          highlight: true
        });
      });

      return button;
    }

    function renderVirtualNavWindow(session) {
      if (!session || session !== activeVirtualSession) {
        return;
      }

      const viewportHeight = resolveViewportHeight(navColumnEl);
      const overscanPx = virtualNavOverscanRows * virtualNavRowHeight;
      const range = calculateVirtualRange(
        session.records.length,
        virtualNavRowHeight,
        navColumnEl.scrollTop,
        viewportHeight,
        overscanPx
      );

      if (range.start === session.navStart && range.end === session.navEnd) {
        return;
      }

      session.navStart = range.start;
      session.navEnd = range.end;
      session.navItemsEl.textContent = "";
      setSpacerHeight(session.navTopSpacerEl, range.start * virtualNavRowHeight);
      setSpacerHeight(session.navBottomSpacerEl, (session.records.length - range.end) * virtualNavRowHeight);

      for (let index = range.start; index < range.end; index += 1) {
        session.navItemsEl.appendChild(createVirtualNavItem(session, session.records[index]));
      }
    }

    function scrollVirtualContentToEntry(session, entryIndex, options = {}) {
      if (!session || session !== activeVirtualSession) {
        return;
      }

      const record = session.records[entryIndex];
      if (!record) {
        return;
      }

      record.pendingOpenTool = Boolean(options.openTool);
      record.pendingHighlight = Boolean(options.highlight);
      const viewportHeight = resolveViewportHeight(mainColumnEl);
      mainColumnEl.scrollTop = Math.max(0, (entryIndex * virtualEntryHeight) - (viewportHeight / 2));
      markNavAutoScrolling();
      renderVirtualContentWindow(session).then(() => {
        const card = session.mountedCards.get(entryIndex);
        if (!card) {
          return;
        }
        if (options.openTool) {
          openToolInputPanel(card);
        }
        if (options.highlight) {
          applyNavTargetHighlight(card);
        }
      });
    }

    function createVirtualSession(files, records, options = {}) {
      const section = document.createElement("section");
      section.className = "file-block virtual-file-block";

      const title = document.createElement("h2");
      title.className = "file-title";
      title.textContent = files.length === 1
        ? String(files[0].name || "large.jsonl")
        : `${files.length} files`;
      section.appendChild(title);

      const summary = document.createElement("p");
      summary.className = "virtual-summary";
      summary.textContent = options.source === "memory"
        ? `Virtualized ${records.length} entries.`
        : `Indexed ${records.length} entries without loading the full file into memory.`;
      section.appendChild(summary);

      const feed = document.createElement("div");
      feed.className = "feed virtual-feed";
      const contentTopSpacerEl = createVirtualSpacer("virtual-spacer virtual-content-spacer");
      const contentItemsEl = document.createElement("div");
      contentItemsEl.className = "virtual-items virtual-content-items";
      const contentBottomSpacerEl = createVirtualSpacer("virtual-spacer virtual-content-spacer");
      feed.appendChild(contentTopSpacerEl);
      feed.appendChild(contentItemsEl);
      feed.appendChild(contentBottomSpacerEl);
      section.appendChild(feed);

      navListEl.textContent = "";
      navListEl.classList.add("virtual-nav-list");
      const navTopSpacerEl = createVirtualSpacer("virtual-spacer virtual-nav-spacer");
      const navItemsEl = document.createElement("div");
      navItemsEl.className = "virtual-items virtual-nav-items";
      const navBottomSpacerEl = createVirtualSpacer("virtual-spacer virtual-nav-spacer");
      navListEl.appendChild(navTopSpacerEl);
      navListEl.appendChild(navItemsEl);
      navListEl.appendChild(navBottomSpacerEl);

      outputEl.appendChild(section);

      const session = {
        files,
        records,
        source: options.source || "file",
        contentTopSpacerEl,
        contentItemsEl,
        contentBottomSpacerEl,
        navTopSpacerEl,
        navItemsEl,
        navBottomSpacerEl,
        contentStart: -1,
        contentEnd: -1,
        navStart: -1,
        navEnd: -1,
        mountedCards: new Map(),
        entryCache: new Map(),
        cacheBytes: 0,
        detailsOpenState: null
      };

      activeVirtualSession = session;
      renderVirtualNavWindow(session);
      return renderVirtualContentWindow(session).then(() => session);
    }

    async function handleFiles(fileList) {
      const files = [...fileList].filter((file) => file && file.size >= 0);
      if (files.length === 0) {
        return;
      }

      const loadToken = createLoadToken();
      closeNavFocusMode();
      clearNavTargetHighlight();
      clearContentHoverNavItem();
      activeVirtualSession = null;
      outputEl.textContent = "";
      navListEl.textContent = "";
      navListEl.classList.remove("virtual-nav-list");
      mainColumnEl.scrollTop = 0;
      navColumnEl.scrollTop = 0;
      syncUiState({ rendering: true });
      setStatus(`Rendering ${files.length} file(s)...`);

      try {
        const shouldStream = files.some((file) => Number(file.size || 0) > largeFileByteThreshold);
        if (shouldStream) {
          setStatus(`Indexing ${files.length} large file(s)...`);
          const records = await buildLargeFileIndex(files, loadToken);
          throwIfCancelled(loadToken);
          outputEl.textContent = "";
          navListEl.textContent = "";
          await createVirtualSession(files, records, { source: "file" });
          throwIfCancelled(loadToken);
          syncUiState();
          setStatus(`Done. Indexed ${records.length} entries from ${files.length} file(s).`, "ok");
          return;
        }

        const parsedFiles = [];
        let totalEntries = 0;
        for (const file of files) {
          throwIfCancelled(loadToken);
          const fileResult = {
            file,
            name: String(file.name || "session.jsonl"),
            entries: [],
            error: null
          };

          try {
            const text = await file.text();
            throwIfCancelled(loadToken);
            fileResult.entries = parseJsonl(text);
            totalEntries += fileResult.entries.length;
          } catch (error) {
            fileResult.error = error;
          }

          parsedFiles.push(fileResult);
        }

        const canVirtualizeParsedFiles = parsedFiles.every((fileResult) => !fileResult.error)
          && totalEntries > largeEntryThreshold;
        if (canVirtualizeParsedFiles) {
          const records = createMemoryEntryRecords(parsedFiles);
          await createVirtualSession(files, records, { source: "memory" });
          throwIfCancelled(loadToken);
          syncUiState();
          setStatus(`Done. Virtualized ${records.length} entries from ${files.length} file(s).`, "ok");
          return;
        }

        for (const fileResult of parsedFiles) {
          const section = document.createElement("section");
          section.className = "file-block";

          const title = document.createElement("h2");
          title.className = "file-title";
          title.textContent = fileResult.name;
          section.appendChild(title);

          if (fileResult.error) {
            const pre = document.createElement("pre");
            pre.textContent = String(fileResult.error && fileResult.error.message ? fileResult.error.message : fileResult.error);
            section.appendChild(pre);
          } else {
            renderEntries(fileResult.entries, section);
          }

          outputEl.appendChild(section);
        }

        throwIfCancelled(loadToken);
        syncUiState();
        setStatus(`Done. Rendered ${files.length} file(s).`, "ok");
      } catch (error) {
        if (isCancelledError(error)) {
          return;
        }

        outputEl.textContent = "";
        navListEl.textContent = "";
        navListEl.classList.remove("virtual-nav-list");
        activeVirtualSession = null;

        const section = document.createElement("section");
        section.className = "file-block";
        const title = document.createElement("h2");
        title.className = "file-title";
        title.textContent = "Error";
        section.appendChild(title);
        const pre = document.createElement("pre");
        pre.textContent = String(error && error.message ? error.message : error);
        section.appendChild(pre);
        outputEl.appendChild(section);

        syncUiState();
        setStatus("Could not render file.", "error");
      } finally {
        if (activeLoadToken === loadToken) {
          activeLoadToken = null;
        }
      }
    }

    function clearOutput() {
      cancelActiveLoad();
      closeNavFocusMode();
      clearNavTargetHighlight();
      clearContentHoverNavItem();
      activeVirtualSession = null;
      outputEl.textContent = "";
      navListEl.textContent = "";
      navListEl.classList.remove("virtual-nav-list");
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
      renderVirtualContentWindow(activeVirtualSession);
      renderVirtualNavWindow(activeVirtualSession);
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
    collapseAllBtn.addEventListener("click", collapseAllHistoryContent);
    expandAllBtn.addEventListener("click", expandAllHistoryContent);
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
    collapseAllBtn,
    expandAllBtn,
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
