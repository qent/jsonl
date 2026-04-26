import {
  CSS_CLASSES,
  ELEMENT_IDS,
  normalizeConfig
} from "./config.mjs";
import {
  parseJsonl
} from "./entries.mjs";
import {
  isCancelledError,
  throwIfCancelled
} from "./file-reader.mjs";
import {
  buildLargeFileIndex,
  cacheVirtualEntry,
  createMemoryEntryRecords,
  loadEntryForRecord
} from "./records.mjs";
import {
  calculateVirtualRange,
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
      largeFileByteThreshold,
      largeEntryThreshold,
      virtualEntryHeight,
      virtualNavRowHeight,
      virtualContentOverscanPx,
      virtualNavOverscanRows,
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
    let activeVirtualSession = null;
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

    const {
      applyDetailsOpenState,
      appendEntryCardBody,
      createMetaRow,
      createVirtualCardShell,
      createVirtualNavItem,
      createVirtualSpacer,
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
      },
      onVirtualNavItemClick(session, record) {
        scrollVirtualContentToEntry(session, record.entryIndex, {
          openTool: true,
          highlight: true
        });
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

    function nextEntryAnchorId() {
      const current = entryCounter;
      entryCounter += 1;
      return `entry-${current}`;
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
          entry = await loadEntryForRecord(record, { config });
          cacheVirtualEntry(session, record, entry, config);
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
          const records = await buildLargeFileIndex(files, {
            loadToken,
            config,
            createAnchorId: nextEntryAnchorId,
            setStatus,
            setTimeout
          });
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
            fileResult.entries = parseJsonl(text, { config, createAnchorId: nextEntryAnchorId });
            totalEntries += fileResult.entries.length;
          } catch (error) {
            fileResult.error = error;
          }

          parsedFiles.push(fileResult);
        }

        const canVirtualizeParsedFiles = parsedFiles.every((fileResult) => !fileResult.error)
          && totalEntries > largeEntryThreshold;
        if (canVirtualizeParsedFiles) {
          const records = createMemoryEntryRecords(parsedFiles, {
            config,
            createAnchorId: nextEntryAnchorId
          });
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
