/**
 * @typedef {Object} AppConfig
 * @property {number} largeNavLabelMaxLength
 * @property {number} toolSummaryInputPreviewMaxLength
 * @property {number} toolSummaryResultPreviewMaxLength
 * @property {number} toolSummaryErrorPreviewMaxLength
 * @property {number} navDesktopBreakpoint
 */

export const DEFAULT_CONFIG = Object.freeze({
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
