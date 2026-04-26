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

  const isoTimeMatch = rawTimestamp.match(/T(\d{2}:\d{2}:\d{2})/);
  if (isoTimeMatch) {
    return isoTimeMatch[1];
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

  const timeMatch = normalized.match(/(?:T|\b)(\d{2}:\d{2})(?::\d{2})?/);
  if (timeMatch) {
    return timeMatch[1];
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

  if (toolResultContent === null || toolResultContent === undefined) {
    return "";
  }

  return prettyJson(toolResultContent);
}

export function resolveToolRequestSummary(toolName, toolInput, config = DEFAULT_CONFIG) {
  const normalizedToolName = toSingleLineText(toolName) || "tool";
  const input = toolInput && typeof toolInput === "object" ? toolInput : {};

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
    Bash: () => ({
      label: "Bash",
      preview: truncateTextEnd(input.command, config.toolSummaryInputPreviewMaxLength)
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
    Write: () => {
      const filePathValue = String(input.file_path || "").trim();
      return filePathValue ? `Write: ${filePathValue}` : String(toolName || safeFallback).trim();
    },
    Read: () => {
      const filePathValue = String(input.file_path || "").trim();
      return filePathValue ? `Read: ${filePathValue}` : String(toolName || safeFallback).trim();
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
      : toSingleLineText(prettyJson(toolResultContent));

  return contentOneLine ? `${labelPrefix}: ${contentOneLine}` : labelPrefix;
}

export function resolveBashSuccessNavLabel(toolName, toolInput, isToolError) {
  if (toolName !== "Bash" || isToolError) {
    return "";
  }

  const input = toolInput && typeof toolInput === "object" ? toolInput : {};
  return toSingleLineText(input.command);
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
        anchor_id: createAnchorId(),
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
          text: rawText.replaceAll(SCRIPT_CLOSING_TAG, "<\\/script>"),
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
        anchor_id: createAnchorId(),
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
        anchor_id: createAnchorId(),
        nav_label: toolNavLabel,
        nav_label_variant: bashSuccessNavLabel ? "bash-success" : "",
        request_summary_label: requestSummary.label,
        request_summary_preview: requestSummary.preview,
        result_summary_label: resultSummary.label,
        result_summary_preview: resultSummary.preview,
        result_summary_variant: resultSummary.variant
      });
    }
  }

  return entries;
}

export function parseJsonl(text, options = {}) {
  const objects = parseJsonLines(text);
  const toolUses = collectToolUses(objects);
  return buildEntries(objects, toolUses, options);
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
