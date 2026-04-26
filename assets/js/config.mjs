/**
 * @typedef {Object} AppConfig
 * @property {number} largeFileByteThreshold
 * @property {number} largeEntryThreshold
 * @property {number} streamChunkSize
 * @property {number} virtualEntryHeight
 * @property {number} virtualNavRowHeight
 * @property {number} virtualContentOverscanPx
 * @property {number} virtualNavOverscanRows
 * @property {number} lazyEntryCacheLimit
 * @property {number} lazyEntryCacheByteLimit
 * @property {number} largeNavLabelMaxLength
 * @property {number} toolSummaryInputPreviewMaxLength
 * @property {number} toolSummaryResultPreviewMaxLength
 * @property {number} toolSummaryErrorPreviewMaxLength
 * @property {number} navDesktopBreakpoint
 */

export const DEFAULT_CONFIG = Object.freeze({
  largeFileByteThreshold: 25 * 1024 * 1024,
  largeEntryThreshold: 1500,
  streamChunkSize: 1024 * 1024,
  virtualEntryHeight: 220,
  virtualNavRowHeight: 30,
  virtualContentOverscanPx: 1200,
  virtualNavOverscanRows: 30,
  lazyEntryCacheLimit: 120,
  lazyEntryCacheByteLimit: 32 * 1024 * 1024,
  largeNavLabelMaxLength: 240,
  toolSummaryInputPreviewMaxLength: 90,
  toolSummaryResultPreviewMaxLength: 110,
  toolSummaryErrorPreviewMaxLength: 110,
  navDesktopBreakpoint: 1120
});

export const ELEMENT_IDS = Object.freeze({
  app: "app",
  clearBtn: "clearBtn",
  collapseAllBtn: "collapseAllBtn",
  contentGrid: "contentGrid",
  copyToast: "copyToast",
  dropzone: "dropzone",
  expandAllBtn: "expandAllBtn",
  fileInput: "fileInput",
  mainColumn: "mainColumn",
  navColumn: "navColumn",
  navFocusBackdrop: "navFocusBackdrop",
  navFocusPip: "navFocusPip",
  navFocusPipIcon: "navFocusPipIcon",
  navHighlightLeft: "navHighlightLeft",
  navHighlightOverlay: "navHighlightOverlay",
  navHighlightRight: "navHighlightRight",
  navList: "navList",
  output: "output",
  status: "status",
  themeToggleBtn: "themeToggleBtn"
});

export const CSS_CLASSES = Object.freeze({
  navTargetHighlight: "nav-target-highlight",
  navContentHover: "content-hover-match"
});

export const THEME_STORAGE_KEY = "jsonl-viewer-theme";

function numberOption(value, fallback, minValue) {
  if (!Number.isFinite(value)) {
    return fallback;
  }

  return Math.max(minValue, Number(value));
}

/**
 * @param {Record<string, unknown>} deps
 * @returns {AppConfig}
 */
export function normalizeConfig(deps = {}) {
  return {
    largeFileByteThreshold: numberOption(
      deps.largeFileByteThreshold,
      DEFAULT_CONFIG.largeFileByteThreshold,
      0
    ),
    largeEntryThreshold: numberOption(
      deps.largeEntryThreshold,
      DEFAULT_CONFIG.largeEntryThreshold,
      1
    ),
    streamChunkSize: numberOption(
      deps.streamChunkSize,
      DEFAULT_CONFIG.streamChunkSize,
      1024
    ),
    virtualEntryHeight: numberOption(
      deps.virtualEntryHeight,
      DEFAULT_CONFIG.virtualEntryHeight,
      64
    ),
    virtualNavRowHeight: numberOption(
      deps.virtualNavRowHeight,
      DEFAULT_CONFIG.virtualNavRowHeight,
      20
    ),
    virtualContentOverscanPx: numberOption(
      deps.virtualContentOverscanPx,
      DEFAULT_CONFIG.virtualContentOverscanPx,
      0
    ),
    virtualNavOverscanRows: numberOption(
      deps.virtualNavOverscanRows,
      DEFAULT_CONFIG.virtualNavOverscanRows,
      0
    ),
    lazyEntryCacheLimit: numberOption(
      deps.lazyEntryCacheLimit,
      DEFAULT_CONFIG.lazyEntryCacheLimit,
      1
    ),
    lazyEntryCacheByteLimit: numberOption(
      deps.lazyEntryCacheByteLimit,
      DEFAULT_CONFIG.lazyEntryCacheByteLimit,
      1024
    ),
    largeNavLabelMaxLength: numberOption(
      deps.largeNavLabelMaxLength,
      DEFAULT_CONFIG.largeNavLabelMaxLength,
      20
    ),
    toolSummaryInputPreviewMaxLength: numberOption(
      deps.toolSummaryInputPreviewMaxLength,
      DEFAULT_CONFIG.toolSummaryInputPreviewMaxLength,
      1
    ),
    toolSummaryResultPreviewMaxLength: numberOption(
      deps.toolSummaryResultPreviewMaxLength,
      DEFAULT_CONFIG.toolSummaryResultPreviewMaxLength,
      1
    ),
    toolSummaryErrorPreviewMaxLength: numberOption(
      deps.toolSummaryErrorPreviewMaxLength,
      DEFAULT_CONFIG.toolSummaryErrorPreviewMaxLength,
      1
    ),
    navDesktopBreakpoint: DEFAULT_CONFIG.navDesktopBreakpoint
  };
}
