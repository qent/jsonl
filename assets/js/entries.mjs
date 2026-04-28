import { DEFAULT_CONFIG } from "./config.mjs";

const SCRIPT_CLOSING_TAG = "<" + "/script>";

/**
 * @typedef {Object} ToolUse
 * @property {string} [name]
 * @property {string} [time]
 * @property {string} [raw_time]
 * @property {string} [json]
 * @property {Record<string, unknown>} [input]
 * @property {unknown} [line_ref]
 */

/**
 * @typedef {Object} Entry
 * @property {string} type
 * @property {string} cls
 * @property {string} [time]
 * @property {string} [anchor_id]
 * @property {string} [nav_label]
 * @property {string} [nav_label_variant]
 * @property {boolean} [error]
 * @property {Array<Record<string, unknown>>} [parts]
 */

function createLocalAnchorIdFactory() {
  let entryCounter = 0;
  return () => {
    const current = entryCounter;
    entryCounter += 1;
    return `entry-${current}`;
  };
}

function resolveOptions(options = {}) {
  return {
    config: options.config || DEFAULT_CONFIG,
    createAnchorId: typeof options.createAnchorId === "function"
      ? options.createAnchorId
      : createLocalAnchorIdFactory()
  };
}

export function formatTimestamp(rawTimestamp) {
  if (typeof rawTimestamp !== "string") {
    return "";
  }

  const isoTimeMatch = rawTimestamp.match(/T(\d{2}:\d{2})(?::(\d{2}))?/);
  if (isoTimeMatch) {
    const minutes = isoTimeMatch[1];
    const seconds = isoTimeMatch[2] || "00";
    return `${minutes}:${seconds}`;
  }

  return rawTimestamp;
}

export function formatDuration(durationMs) {
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

export function parseTimestampMs(rawTimestamp) {
  if (typeof rawTimestamp !== "string") {
    return null;
  }

  const parsedTimestamp = Date.parse(rawTimestamp);
  return Number.isFinite(parsedTimestamp) ? parsedTimestamp : null;
}

export function formatTenthsSecondsBadge(durationMs) {
  const safeDurationMs = Number(durationMs);
  if (!Number.isFinite(safeDurationMs) || safeDurationMs < 0) {
    return "";
  }

  const roundedTenthsSeconds = Math.ceil(safeDurationMs / 100) / 10;
  return `${roundedTenthsSeconds.toFixed(1)} s`;
}

export function resolveToolDurationBadge(toolResultItem, toolUseRawTimestamp, resultRawTimestamp) {
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

export function round4(value) {
  return Math.round(Number(value || 0) * 10000) / 10000;
}

export function prettyJson(value) {
  return JSON.stringify(value, null, 2);
}

export function getTypeLabel(entryType) {
  if (!entryType) {
    return "entry";
  }

  return String(entryType);
}

export function formatNavTime(rawTime) {
  if (typeof rawTime !== "string") {
    return "";
  }

  const normalized = rawTime.trim();
  if (!normalized) {
    return "";
  }

  const timeMatch = normalized.match(/(?:T|\b)(\d{2}:\d{2})(?::(\d{2}))?/);
  if (timeMatch) {
    const minutes = timeMatch[1];
    const seconds = timeMatch[2] || "00";
    return `${minutes}:${seconds}`;
  }

  return normalized;
}

export function joinTextPartsSingleLine(parts) {
  const combined = (parts || [])
    .map((part) => String(part && part.text ? part.text : ""))
    .join(" ");
  return combined.replace(/\s+/g, " ").trim();
}

export function toSingleLineText(value) {
  if (value === null || value === undefined) {
    return "";
  }

  return String(value).replace(/\s+/g, " ").trim();
}

export function truncateTextEnd(value, maxLength) {
  const normalized = toSingleLineText(value);
  const safeMaxLength = Math.max(1, Number(maxLength || 1));
  if (normalized.length <= safeMaxLength) {
    return normalized;
  }

  return `${normalized.slice(0, safeMaxLength)}...`;
}

export function truncateTextStart(value, maxLength) {
  const normalized = toSingleLineText(value);
  const safeMaxLength = Math.max(1, Number(maxLength || 1));
  if (normalized.length <= safeMaxLength) {
    return normalized;
  }

  return `...${normalized.slice(-safeMaxLength)}`;
}

export function normalizeSkillName(value) {
  const normalized = toSingleLineText(value);
  if (!normalized) {
    return "";
  }

  if (normalized.startsWith("/")) {
    return normalized;
  }

  return `/${normalized}`;
}

export function serializeToolResultContent(toolResultContent) {
  if (typeof toolResultContent === "string") {
    return toolResultContent;
  }

  if (Array.isArray(toolResultContent)) {
    const textContent = serializeContentBlockText(toolResultContent);
    return textContent || prettyJson(toolResultContent);
  }

  if (toolResultContent === null || toolResultContent === undefined) {
    return "";
  }

  return prettyJson(toolResultContent);
}

export function resolveToolRequestSummary(toolName, toolInput, config = DEFAULT_CONFIG) {
  const normalizedToolName = toSingleLineText(toolName) || "tool";
  const input = toolInput && typeof toolInput === "object" ? toolInput : {};
  const createAskUserQuestionPreview = () => {
    const questions = Array.isArray(input.questions) ? input.questions : [];
    const firstQuestion = questions[0] && typeof questions[0] === "object" ? questions[0] : {};
    const questionText = toSingleLineText(firstQuestion.question);
    const options = Array.isArray(firstQuestion.options) ? firstQuestion.options : [];
    const optionTexts = [];

    for (const option of options) {
      if (!option || typeof option !== "object") {
        continue;
      }

      const label = toSingleLineText(option.label);
      const description = toSingleLineText(option.description);
      if (label && description) {
        optionTexts.push(`${label}: ${description}`);
        continue;
      }
      if (label || description) {
        optionTexts.push(label || description);
      }
    }

    return [questionText, ...optionTexts].filter(Boolean).join(" ");
  };

  const resolvers = {
    Skill: () => ({
      label: "Skill",
      preview: normalizeSkillName(input.skill)
    }),
    Read: () => ({
      label: "Read",
      preview: truncateTextStart(input.file_path, config.toolSummaryInputPreviewMaxLength)
    }),
    Grep: () => ({
      label: "Grep",
      preview: toSingleLineText(input.pattern)
    }),
    Glob: () => ({
      label: "Glob",
      preview: toSingleLineText(input.pattern)
    }),
    WebSearch: () => ({
      label: "WebSearch",
      preview: toSingleLineText(input.query)
    }),
    WebFetch: () => ({
      label: "WebFetch",
      preview: toSingleLineText(input.url)
    }),
    Write: () => ({
      label: "Write",
      preview: truncateTextStart(input.file_path, config.toolSummaryInputPreviewMaxLength)
    }),
    Bash: () => ({
      label: "Bash",
      preview: truncateTextEnd(input.command, config.toolSummaryInputPreviewMaxLength)
    }),
    Edit: () => ({
      label: "Edit",
      preview: truncateTextStart(input.file_path, config.toolSummaryInputPreviewMaxLength)
    }),
    AskUserQuestion: () => ({
      label: "AskUserQuestion",
      preview: createAskUserQuestionPreview()
    }),
    Agent: () => ({
      label: "Agent",
      preview: toSingleLineText(input.description)
    })
  };

  const resolver = resolvers[normalizedToolName];
  if (resolver) {
    return resolver();
  }

  return {
    label: normalizedToolName,
    preview: ""
  };
}

export function resolveToolResultSummary(toolResultContent, isToolError, config = DEFAULT_CONFIG) {
  const maxLength = isToolError
    ? config.toolSummaryErrorPreviewMaxLength
    : config.toolSummaryResultPreviewMaxLength;
  return {
    label: "",
    preview: truncateTextEnd(
      serializeToolResultContent(toolResultContent),
      maxLength
    ),
    variant: isToolError ? "error" : "default"
  };
}

export function createResultCostLabel(value) {
  return `${round4(value)}$`;
}

export function normalizeTodoItems(toolName, toolInput) {
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

export function resolveToolNavLabel(toolName, toolInput, fallbackLabel) {
  const safeFallback = fallbackLabel || toolName || "tool";
  const input = toolInput && typeof toolInput === "object" ? toolInput : {};

  const resolvers = {
    Skill: () => normalizeSkillName(input.skill) || String(safeFallback).trim() || safeFallback,
    Bash: () => String(input.command || safeFallback).trim() || safeFallback,
    Glob: () => {
      const patternValue = String(input.pattern || "").trim();
      return patternValue ? `${toolName}: ${patternValue}` : String(toolName || safeFallback).trim();
    },
    Grep: () => {
      const patternValue = String(input.pattern || "").trim();
      return patternValue ? `${toolName}: ${patternValue}` : String(toolName || safeFallback).trim();
    },
    WebSearch: () => {
      const queryValue = String(input.query || "").trim();
      return queryValue ? `${toolName}: ${queryValue}` : String(toolName || safeFallback).trim();
    },
    WebFetch: () => {
      const urlValue = String(input.url || "").trim();
      return urlValue ? `${toolName}: ${urlValue}` : String(toolName || safeFallback).trim();
    },
    Write: () => {
      const filePathValue = String(input.file_path || "").trim();
      return filePathValue ? `Write: ${filePathValue}` : String(toolName || safeFallback).trim();
    },
    Edit: () => {
      const filePathValue = String(input.file_path || "").trim();
      return filePathValue ? `Edit: ${filePathValue}` : String(toolName || safeFallback).trim();
    },
    Read: () => {
      const filePathValue = String(input.file_path || "").trim();
      return filePathValue ? `Read: ${filePathValue}` : String(toolName || safeFallback).trim();
    },
    Agent: () => {
      const descriptionValue = toSingleLineText(input.description);
      return descriptionValue ? `Agent: ${descriptionValue}` : String(toolName || safeFallback).trim();
    }
  };

  const resolver = resolvers[toolName];
  return resolver ? resolver() : String(toolName || safeFallback).trim() || safeFallback;
}

export function resolveToolErrorNavLabel(toolName, fallbackLabel, toolResultContent) {
  const labelPrefix = toSingleLineText(toolName) || toSingleLineText(fallbackLabel) || "tool";
  const contentOneLine = typeof toolResultContent === "string"
    ? toSingleLineText(toolResultContent)
    : toolResultContent === null || toolResultContent === undefined
      ? ""
      : toSingleLineText(serializeToolResultContent(toolResultContent));

  return contentOneLine ? `${labelPrefix}: ${contentOneLine}` : labelPrefix;
}

export function resolveBashSuccessNavLabel(toolName, toolInput, isToolError) {
  if (toolName !== "Bash" || isToolError) {
    return "";
  }

  const input = toolInput && typeof toolInput === "object" ? toolInput : {};
  return toSingleLineText(input.command);
}

function sanitizeMarkdownText(rawText) {
  return String(rawText || "").replaceAll(SCRIPT_CLOSING_TAG, "<\\/script>");
}

function createTextPart(rawText) {
  const text = String(rawText || "");
  return {
    kind: "text",
    text: sanitizeMarkdownText(text),
    raw_text: text
  };
}

function createRawPart(label, value) {
  return {
    kind: "raw",
    label,
    json: prettyJson(value)
  };
}

function normalizeMessageType(itemType) {
  return itemType === "assistant" ? "agent" : itemType || "entry";
}

function normalizeMessageClass(itemType) {
  if (itemType === "assistant") {
    return "agent";
  }

  if (itemType === "user" || itemType === "system" || itemType === "result") {
    return itemType;
  }

  if (itemType === "error") {
    return "error";
  }

  return "system";
}

function getMessageSubtype(objectItem, message) {
  return toSingleLineText(
    (message && message.subtype) || (objectItem && objectItem.subtype) || ""
  );
}

function createTextEntry(objectItem, textParts, options) {
  const {
    itemType,
    itemTimestamp,
    message,
    createAnchorId
  } = options;
  const normalizedType = normalizeMessageType(itemType);
  const subtypeLabel = getMessageSubtype(objectItem, message);
  const textCopyPayload = textParts
    .map((part) => String(part.raw_text || ""))
    .join("\n\n");
  const textNavLabel = normalizedType === "system"
    ? subtypeLabel || joinTextPartsSingleLine(textParts) || getTypeLabel(normalizedType)
    : joinTextPartsSingleLine(textParts) || getTypeLabel(normalizedType);

  return {
    type: normalizedType,
    cls: normalizeMessageClass(itemType),
    time: itemTimestamp,
    anchor_id: createAnchorId(),
    nav_label: textNavLabel,
    copy_text: textCopyPayload,
    copy_in_meta: true,
    parts: textParts
  };
}

function createThinkingEntry(contentItem, itemTimestamp, createAnchorId) {
  const rawThinking = String(contentItem.thinking || "");
  const thinkingLabel = toSingleLineText(rawThinking);

  return {
    type: "thinking",
    cls: "system",
    time: itemTimestamp,
    anchor_id: createAnchorId(),
    nav_label: thinkingLabel ? `thinking: ${thinkingLabel}` : "thinking",
    parts: []
  };
}

function createUnknownContentEntry(objectItem, contentItem, options) {
  const {
    itemType,
    itemTimestamp,
    message,
    createAnchorId
  } = options;
  const normalizedType = normalizeMessageType(itemType);
  const blockType = toSingleLineText(contentItem && contentItem.type) || "unknown";
  const subtypeLabel = getMessageSubtype(objectItem, message);
  const navPrefix = subtypeLabel || getTypeLabel(normalizedType);

  return {
    type: normalizedType,
    cls: normalizeMessageClass(itemType),
    time: itemTimestamp,
    anchor_id: createAnchorId(),
    nav_label: `${navPrefix}: ${blockType}`,
    parts: [createRawPart(blockType, contentItem)]
  };
}

function serializeContentBlockText(contentBlocks) {
  if (!Array.isArray(contentBlocks)) {
    return "";
  }

  const textParts = [];
  for (const block of contentBlocks) {
    if (!block || typeof block !== "object" || block.type !== "text") {
      continue;
    }

    const text = String(block.text || "");
    if (text) {
      textParts.push(text);
    }
  }

  return textParts.join("\n\n");
}

function createToolResultEntry(toolResultItem, toolUse, options) {
  const {
    config,
    createAnchorId,
    itemRawTimestamp,
    itemTimestamp
  } = options;
  const toolUseId = toolResultItem.tool_use_id || "";
  const normalizedTodos = normalizeTodoItems(toolUse.name || "", toolUse.input || {});
  const isTodoWriteEntry = (toolUse.name || "") === "TodoWrite" && normalizedTodos.length > 0;
  const toolDurationBadge = resolveToolDurationBadge(
    toolResultItem,
    toolUse.raw_time || "",
    itemRawTimestamp
  );
  const resultJson = serializeToolResultContent(toolResultItem.content);
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
  const requestSummary = resolveToolRequestSummary(
    toolUse.name || toolUseId || "tool",
    toolUse.input || {},
    config
  );
  const resultSummary = resolveToolResultSummary(
    toolResultItem.content,
    isToolError,
    config
  );
  const toolNavLabel = isToolError
    ? toolErrorNavLabel
    : bashSuccessNavLabel || defaultToolNavLabel;

  return {
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
    anchor_id: createAnchorId(),
    nav_label: toolNavLabel,
    nav_label_variant: bashSuccessNavLabel ? "bash-success" : "",
    request_summary_label: requestSummary.label,
    request_summary_preview: requestSummary.preview,
    result_summary_label: resultSummary.label,
    result_summary_preview: resultSummary.preview,
    result_summary_variant: resultSummary.variant
  };
}

export function createToolRequestEntry(toolUseId, toolUse = {}, options = {}) {
  const { config, createAnchorId } = resolveOptions(options);
  const toolName = toolUse.name || toolUseId || "tool";
  const toolInput = toolUse.input || {};
  const normalizedTodos = normalizeTodoItems(toolUse.name || "", toolInput);
  const isTodoWriteEntry = (toolUse.name || "") === "TodoWrite" && normalizedTodos.length > 0;
  const requestSummary = resolveToolRequestSummary(toolName, toolInput, config);

  return {
    type: "tool",
    cls: "tool",
    time: toolUse.time || "",
    tool_name: toolName,
    request_json: toolUse.json || prettyJson(toolInput),
    request_input: toolInput,
    result_json: "",
    result_missing: true,
    tool_duration_badge: "",
    tool_variant: isTodoWriteEntry ? "todowrite" : "",
    tool_use_id: toolUseId || "",
    todos: normalizedTodos,
    error: false,
    anchor_id: createAnchorId(),
    nav_label: resolveToolNavLabel(toolUse.name || "", toolInput, toolUseId || "tool"),
    nav_label_variant: "",
    request_summary_label: requestSummary.label,
    request_summary_preview: requestSummary.preview,
    result_summary_label: "",
    result_summary_preview: "",
    result_summary_variant: "default"
  };
}

function previewFromValue(value, maxLength = 120) {
  const preview = toSingleLineText(value);
  if (!preview) {
    return "";
  }

  return truncateTextEnd(preview, maxLength);
}

function appendTextAndRawParts(parts, text, rawLabel, rawPayload) {
  if (typeof text === "string" && text.trim()) {
    parts.push(createTextPart(text));
  }

  parts.push(createRawPart(rawLabel, rawPayload));
}

function createNonContentEntry(objectItem, options) {
  const {
    itemType,
    itemTimestamp,
    message,
    hasMessageObject,
    createAnchorId
  } = options;
  const rawPayload = hasMessageObject ? message : objectItem;
  const parts = [];
  const baseEntry = {
    type: itemType || "entry",
    cls: "system",
    time: itemTimestamp,
    anchor_id: createAnchorId(),
    nav_label: getTypeLabel(itemType),
    parts
  };

  if (itemType === "system") {
    const subtypeLabel = getMessageSubtype(objectItem, message) || "system";
    const contentText = typeof objectItem.content === "string" ? objectItem.content : "";
    const isError = objectItem.subtype === "api_error" || objectItem.level === "error";
    appendTextAndRawParts(parts, contentText, subtypeLabel, rawPayload);
    return {
      ...baseEntry,
      type: "system",
      cls: isError ? "error" : "system",
      nav_label: subtypeLabel,
      copy_text: contentText,
      copy_in_meta: Boolean(contentText),
      error: isError
    };
  }

  if (itemType === "progress") {
    const data = objectItem.data && typeof objectItem.data === "object" ? objectItem.data : {};
    const progressType = toSingleLineText(data.type) || "progress";
    if (progressType === "hook_progress" && toSingleLineText(data.hookEvent) === "PostToolUse") {
      return null;
    }

    const progressPreview = previewFromValue(
      data.output || data.query || data.prompt || data.message || [data.serverName, data.toolName, data.status].filter(Boolean).join(" ")
    );
    parts.push(createRawPart(progressType, data));
    return {
      ...baseEntry,
      type: "progress",
      nav_label: progressPreview ? `${progressType}: ${progressPreview}` : progressType
    };
  }

  if (itemType === "attachment") {
    const attachment = objectItem.attachment && typeof objectItem.attachment === "object" ? objectItem.attachment : {};
    const attachmentType = toSingleLineText(attachment.type) || "attachment";
    const attachmentPreview = previewFromValue(
      attachment.displayPath || attachment.filename || attachment.prompt || attachment.content || attachment.snippet
    );
    parts.push(createRawPart(attachmentType, attachment));
    return {
      ...baseEntry,
      type: "attachment",
      nav_label: attachmentPreview ? `${attachmentType}: ${attachmentPreview}` : attachmentType
    };
  }

  if (itemType === "queue-operation") {
    const operation = toSingleLineText(objectItem.operation) || "queue";
    const contentText = typeof objectItem.content === "string" ? objectItem.content : "";
    const contentPreview = previewFromValue(contentText);
    if (contentText.trim()) {
      parts.push(createTextPart(contentText));
    }
    return {
      ...baseEntry,
      type: "queue-operation",
      nav_label: contentPreview ? `queue ${operation}: ${contentPreview}` : `queue ${operation}`,
      copy_text: contentText,
      copy_in_meta: Boolean(contentText)
    };
  }

  if (itemType === "file-history-snapshot") {
    parts.push(createRawPart("file-history-snapshot", rawPayload));
    return {
      ...baseEntry,
      type: "file-history-snapshot",
      nav_label: "file history snapshot"
    };
  }

  if (itemType === "permission-mode") {
    const permissionMode = toSingleLineText(objectItem.permissionMode);
    parts.push(createRawPart("permission-mode", rawPayload));
    return {
      ...baseEntry,
      type: "permission-mode",
      nav_label: permissionMode ? `permission: ${permissionMode}` : "permission-mode"
    };
  }

  if (itemType === "last-prompt") {
    const lastPrompt = String(objectItem.lastPrompt || "");
    appendTextAndRawParts(parts, lastPrompt, "last-prompt", rawPayload);
    return {
      ...baseEntry,
      type: "last-prompt",
      cls: "user",
      nav_label: previewFromValue(lastPrompt) || "last-prompt",
      copy_text: lastPrompt,
      copy_in_meta: Boolean(lastPrompt)
    };
  }

  if (itemType === "agent-name") {
    const agentName = String(objectItem.agentName || "");
    appendTextAndRawParts(parts, agentName, "agent-name", rawPayload);
    return {
      ...baseEntry,
      type: "agent-name",
      nav_label: agentName ? `agent: ${agentName}` : "agent-name"
    };
  }

  if (itemType === "custom-title") {
    const customTitle = String(objectItem.customTitle || "");
    appendTextAndRawParts(parts, customTitle, "custom-title", rawPayload);
    return {
      ...baseEntry,
      type: "custom-title",
      nav_label: customTitle ? `title: ${customTitle}` : "custom-title"
    };
  }

  const subtypeLabel = getMessageSubtype(objectItem, message);
  const rawNavLabel = subtypeLabel
    ? `${getTypeLabel(itemType)}: ${subtypeLabel}`
    : getTypeLabel(itemType);
  parts.push(createRawPart(rawNavLabel, rawPayload));
  return {
    ...baseEntry,
    cls: itemType === "error" ? "error" : "system",
    nav_label: rawNavLabel,
    error: itemType === "error"
  };
}

export function parseJsonLines(text) {
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

export function collectToolUsesFromObject(objectItem, toolUses = {}, options = {}) {
  const message = objectItem.message || {};
  const content = message.content;
  if (!Array.isArray(content)) {
    return toolUses;
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

    if (options.lineRef) {
      toolUses[contentItem.id].line_ref = options.lineRef;
    }
  }

  return toolUses;
}

export function collectToolUses(objects) {
  const toolUses = {};

  for (const objectItem of objects) {
    collectToolUsesFromObject(objectItem, toolUses);
  }

  return toolUses;
}

export function buildEntries(objects, toolUses = {}, options = {}) {
  const { config, createAnchorId } = resolveOptions(options);
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
        anchor_id: createAnchorId(),
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

    const hasMessageObject = Boolean(
      objectItem.message
      && typeof objectItem.message === "object"
      && !Array.isArray(objectItem.message)
    );
    const message = hasMessageObject ? objectItem.message : {};
    const content = message.content;

    if (typeof content === "string") {
      entries.push(createTextEntry(objectItem, [createTextPart(content)], {
        itemType,
        itemTimestamp,
        message,
        createAnchorId
      }));
      continue;
    }

    if (!Array.isArray(content)) {
      const nonContentEntry = createNonContentEntry(objectItem, {
        itemType,
        itemTimestamp,
        message,
        hasMessageObject,
        createAnchorId
      });
      if (nonContentEntry) {
        entries.push(nonContentEntry);
      }
      continue;
    }

    const textParts = [];
    const flushTextParts = () => {
      if (textParts.length === 0) {
        return;
      }

      entries.push(createTextEntry(objectItem, textParts.splice(0), {
        itemType,
        itemTimestamp,
        message,
        createAnchorId
      }));
    };

    for (const contentItem of content) {
      if (!contentItem) {
        continue;
      }

      if (contentItem.type === "text") {
        textParts.push(createTextPart(contentItem.text));
        continue;
      }

      if (contentItem.type === "thinking") {
        flushTextParts();
        entries.push(createThinkingEntry(contentItem, itemTimestamp, createAnchorId));
        continue;
      }

      if (contentItem.type === "tool_result") {
        flushTextParts();
        const toolUseId = contentItem.tool_use_id || "";
        const toolUse = toolUses[toolUseId] || {};
        entries.push(createToolResultEntry(contentItem, toolUse, {
          config,
          createAnchorId,
          itemRawTimestamp,
          itemTimestamp
        }));
        continue;
      }

      if (contentItem.type === "tool_use") {
        continue;
      }

      flushTextParts();
      entries.push(createUnknownContentEntry(objectItem, contentItem, {
        itemType,
        itemTimestamp,
        message,
        createAnchorId
      }));
    }

    flushTextParts();
  }

  return entries;
}

export function parseJsonl(text, options = {}) {
  const objects = parseJsonLines(text);
  const toolUses = collectToolUses(objects);
  const entries = buildEntries(objects, toolUses, options);
  const consumedToolUseIds = new Set(
    entries
      .map((entry) => entry.tool_use_id || "")
      .filter((toolUseId) => toolUseId && toolUses[toolUseId])
  );
  const { config, createAnchorId } = resolveOptions(options);

  for (const [toolUseId, toolUse] of Object.entries(toolUses)) {
    if (consumedToolUseIds.has(toolUseId)) {
      continue;
    }

    entries.push(createToolRequestEntry(toolUseId, toolUse, {
      config,
      createAnchorId
    }));
  }

  return entries;
}

export function truncateNavLabel(labelText, maxLength = DEFAULT_CONFIG.largeNavLabelMaxLength) {
  const label = String(labelText || "");
  if (label.length <= maxLength) {
    return label;
  }

  return `${label.slice(0, maxLength - 1)}…`;
}

export function entryHasDetails(entry) {
  if (!entry || entry.type === "tool") {
    return Boolean(entry && entry.type === "tool");
  }

  return (entry.parts || []).some((part) => (
    part && (part.kind === "raw" || part.kind === "tool" || part.kind === "result")
  ));
}
