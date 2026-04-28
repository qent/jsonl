import {
  CSS_CLASSES,
  ELEMENT_IDS,
  normalizeConfig
} from "./config.mjs";
import {
  parseJsonl
} from "./entries.mjs";
import {
  collectDetailsNodes,
  createRenderer
} from "./render.mjs";
import {
  createCopyToastController,
  createStatusController,
  createThemeController
} from "./ui-state.mjs";

/**
 * @typedef {Object} AppDeps
 * @property {Document} [document]
 * @property {Window} [window]
 * @property {Navigator} [navigator]
 * @property {Storage} [localStorage]
 * @property {Function} [requestAnimationFrame]
 * @property {Function} [setTimeout]
 * @property {Function} [clearTimeout]
 */

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
    const dropzone = document.getElementById(ELEMENT_IDS.dropzone);
    const fileInput = document.getElementById(ELEMENT_IDS.fileInput);
    const clearBtn = document.getElementById(ELEMENT_IDS.clearBtn);
    const themeToggleBtn = document.getElementById(ELEMENT_IDS.themeToggleBtn);
    const collapseAllBtn = document.getElementById(ELEMENT_IDS.collapseAllBtn);
    const expandAllBtn = document.getElementById(ELEMENT_IDS.expandAllBtn);
    const appEl = document.getElementById(ELEMENT_IDS.app);
    const mainColumnEl = document.getElementById(ELEMENT_IDS.mainColumn);
    const statusEl = document.getElementById(ELEMENT_IDS.status);
    const contentGridEl = document.getElementById(ELEMENT_IDS.contentGrid);
    const navColumnEl = document.getElementById(ELEMENT_IDS.navColumn);
    const navListEl = document.getElementById(ELEMENT_IDS.navList);
    const navFocusPipEl = document.getElementById(ELEMENT_IDS.navFocusPip);
    const navFocusPipIconEl = document.getElementById(ELEMENT_IDS.navFocusPipIcon);
    const navFocusBackdropEl = document.getElementById(ELEMENT_IDS.navFocusBackdrop);
    const navHighlightOverlayEl = document.getElementById(ELEMENT_IDS.navHighlightOverlay);
    const navHighlightLeftEl = document.getElementById(ELEMENT_IDS.navHighlightLeft);
    const navHighlightRightEl = document.getElementById(ELEMENT_IDS.navHighlightRight);
    const copyToastEl = document.getElementById(ELEMENT_IDS.copyToast);
    const outputEl = document.getElementById(ELEMENT_IDS.output);
    const config = normalizeConfig(deps);
    const {
      navDesktopBreakpoint
    } = config;
    const navTargetHighlightClassName = CSS_CLASSES.navTargetHighlight;
    const navContentHoverClassName = CSS_CLASSES.navContentHover;
    let entryCounter = 0;
    let activeNavTargetCard = null;
    let activeContentHoverNavItem = null;
    let isNavAutoScrolling = false;
    let isNavFocusActive = false;
    let activeLoadToken = null;
    const { setStatus } = createStatusController(statusEl);
    const {
      clearCopyToastTimer,
      showCopyToast
    } = createCopyToastController({
      copyToastEl,
      setTimeout,
      clearTimeout
    });
    const {
      applyTheme,
      resolveInitialTheme,
      toggleTheme
    } = createThemeController({
      document,
      window,
      localStorage,
      appEl,
      themeToggleBtn
    });

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

    function getHistoryDetailsNodes() {
      return collectDetailsNodes(outputEl, []);
    }

    function setAllHistoryDetailsOpenState(nextOpenState) {
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
      const detailsNodes = hasRenderedContent ? getHistoryDetailsNodes() : [];
      const canToggleHistory = hasRenderedContent && detailsNodes.length > 0;

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

    const {
      openToolInputPanel,
      renderEntries
    } = createRenderer({
      document,
      navigator,
      showCopyToast,
      createAnchorId: nextEntryAnchorId,
      navListEl,
      syncVisibleNavItemBorders,
      onCardHover: applyContentHoverNavItem,
      onCardLeave: clearContentHoverNavItem,
      onNavItemClick(targetCard) {
        openToolInputPanel(targetCard);
        markNavAutoScrolling();
        targetCard.scrollIntoView({
          block: "center",
          behavior: "instant"
        });
        applyNavTargetHighlight(targetCard);
      }
    });

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

    function nextEntryAnchorId() {
      const current = entryCounter;
      entryCounter += 1;
      return `entry-${current}`;
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
      outputEl.textContent = "";
      navListEl.textContent = "";
      mainColumnEl.scrollTop = 0;
      navColumnEl.scrollTop = 0;
      syncUiState({ rendering: true });
      setStatus(`Rendering ${files.length} file(s)...`);

      try {
        const parsedFiles = [];
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
            fileResult.entries = parseJsonl(text, { config, createAnchorId: nextEntryAnchorId });
          } catch (error) {
            fileResult.error = error;
          }

          parsedFiles.push(fileResult);
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

    function removeListener(target, type, handler, options) {
      if (!target || typeof target.removeEventListener !== "function") {
        return;
      }

      target.removeEventListener(type, handler, options);
    }

    function destroy() {
      cancelActiveLoad();
      clearCopyToastTimer();

      removeListener(dropzone, "click", openFilePicker);
      removeListener(dropzone, "keydown", onDropzoneKeydown);
      removeListener(dropzone, "dragenter", markDragOver);
      removeListener(dropzone, "dragover", markDragOver);
      removeListener(dropzone, "dragleave", unmarkDragOver);
      removeListener(dropzone, "drop", unmarkDragOver);
      removeListener(dropzone, "drop", onDrop);
      removeListener(fileInput, "change", onInputChange);
      removeListener(clearBtn, "click", clearOutput);
      removeListener(themeToggleBtn, "click", toggleTheme);
      removeListener(collapseAllBtn, "click", collapseAllHistoryContent);
      removeListener(expandAllBtn, "click", expandAllHistoryContent);
      removeListener(navFocusPipEl, "click", toggleNavFocusMode);
      removeListener(navFocusBackdropEl, "click", closeNavFocusMode);
      removeListener(mainColumnEl, "scroll", clearNavTargetHighlightOnScroll);
      removeListener(navColumnEl, "scroll", clearNavTargetHighlightOnScroll);
      removeListener(document, "keydown", onDocumentKeydown);
      removeListener(document, "click", onDocumentClick, true);
      removeListener(window, "resize", onWindowResize);
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
    appEl,
    destroy
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
