import { DEFAULT_CONFIG } from "./config.mjs";
import {
  buildEntries,
  collectToolUses,
  collectToolUsesFromObject,
  createToolRequestEntry,
  entryHasDetails,
  getTypeLabel,
  truncateNavLabel
} from "./entries.mjs";
import {
  createLineRef,
  formatByteCount,
  iterateJsonlLines,
  readLineRef,
  sleep,
  throwIfCancelled
} from "./file-reader.mjs";

/**
 * @typedef {Object} EntryRecord
 * @property {"file"|"memory"} source
 * @property {number} fileIndex
 * @property {string} fileName
 * @property {number} entryIndex
 * @property {Object} summary
 * @property {number} estimatedBytes
 */

/**
 * @typedef {Object} VirtualSession
 * @property {EntryRecord[]} records
 * @property {Map<number, HTMLElement>} mountedCards
 * @property {Map<string, {entry: Object, bytes: number}>} entryCache
 * @property {number} cacheBytes
 * @property {boolean|null} detailsOpenState
 */

function createSequentialAnchorIdFactory() {
  let entryCounter = 0;
  return () => {
    const current = entryCounter;
    entryCounter += 1;
    return `entry-${current}`;
  };
}

function resolveRecordOptions(options = {}) {
  return {
    config: options.config || DEFAULT_CONFIG,
    createAnchorId: typeof options.createAnchorId === "function"
      ? options.createAnchorId
      : createSequentialAnchorIdFactory()
  };
}

export function createEntrySummary(entry, fileIndex, fileName, entryIndex, lineRef, options = {}) {
  const { config, createAnchorId } = resolveRecordOptions(options);
  return {
    type: entry.type || "",
    cls: entry.cls || "",
    time: entry.time || "",
    tool_name: entry.tool_name || "",
    tool_duration_badge: entry.tool_duration_badge || "",
    tool_variant: entry.tool_variant || "",
    error: Boolean(entry.error),
    nav_label: truncateNavLabel(
      entry.nav_label || getTypeLabel(entry.type),
      config.largeNavLabelMaxLength
    ),
    nav_label_variant: entry.nav_label_variant || "",
    anchor_id: entry.anchor_id || createAnchorId(),
    tool_use_id: entry.tool_use_id || "",
    has_details: entryHasDetails(entry),
    file_index: fileIndex,
    file_name: fileName,
    entry_index: entryIndex,
    line_number: lineRef ? lineRef.lineNumber : 0
  };
}

export function buildEntryRecordsForObject(objectItem, options) {
  const {
    file,
    fileIndex,
    fileName,
    lineRef,
    toolUses,
    records
  } = options;
  const { config, createAnchorId } = resolveRecordOptions(options);

  collectToolUsesFromObject(objectItem, toolUses, { lineRef });
  const lineEntries = buildEntries([objectItem], toolUses, { config, createAnchorId });
  const consumedToolUseIds = [];
  for (let lineEntryIndex = 0; lineEntryIndex < lineEntries.length; lineEntryIndex += 1) {
    const entry = lineEntries[lineEntryIndex];
    const entryIndex = records.length;
    const toolUse = entry.tool_use_id ? toolUses[entry.tool_use_id] : null;
    const summary = createEntrySummary(entry, fileIndex, fileName, entryIndex, lineRef, {
      config,
      createAnchorId
    });
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

export function createMemoryEntryRecords(fileEntriesList, options = {}) {
  const { config, createAnchorId } = resolveRecordOptions(options);
  const records = [];
  for (let fileIndex = 0; fileIndex < fileEntriesList.length; fileIndex += 1) {
    const fileData = fileEntriesList[fileIndex];
    for (const entry of fileData.entries) {
      const entryIndex = records.length;
      const summary = createEntrySummary(entry, fileIndex, fileData.name, entryIndex, null, {
        config,
        createAnchorId
      });
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

export function appendPendingToolUseRecords(records, fileIndex, fileName, toolUses, options = {}) {
  const { config, createAnchorId } = resolveRecordOptions(options);

  for (const [toolUseId, toolUse] of Object.entries(toolUses || {})) {
    const entry = createToolRequestEntry(toolUseId, toolUse, {
      config,
      createAnchorId
    });
    const entryIndex = records.length;
    const lineRef = toolUse && toolUse.line_ref ? toolUse.line_ref : null;
    const summary = createEntrySummary(entry, fileIndex, fileName, entryIndex, lineRef, {
      config,
      createAnchorId
    });
    records.push({
      source: "memory",
      fileIndex,
      fileName,
      entryIndex,
      lineRef,
      toolUseId,
      entry,
      summary,
      estimatedBytes: Math.max(512, JSON.stringify(entry).length)
    });
    delete toolUses[toolUseId];
  }
}

export async function buildLargeFileIndex(files, options = {}) {
  const {
    config,
    createAnchorId
  } = resolveRecordOptions(options);
  const loadToken = options.loadToken || null;
  const setStatus = typeof options.setStatus === "function" ? options.setStatus : () => {};
  const setTimeoutFn = typeof options.setTimeout === "function" ? options.setTimeout : setTimeout;
  const records = [];
  const toolUses = {};
  let lastYieldAt = Date.now();

  for (let fileIndex = 0; fileIndex < files.length; fileIndex += 1) {
    const file = files[fileIndex];
    const fileName = String(file.name || `file-${fileIndex + 1}.jsonl`);
    const keepTextFallback = typeof file.slice !== "function";

    for await (const lineInfo of iterateJsonlLines(file, {
      loadToken,
      streamChunkSize: config.streamChunkSize
    })) {
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
        records,
        config,
        createAnchorId
      });

      const now = Date.now();
      if (now - lastYieldAt > 80 || records.length % 500 === 0) {
        setStatus(`Indexing ${fileName}: ${formatByteCount(lineInfo.end)} / ${formatByteCount(file.size)}, ${records.length} entries...`);
        lastYieldAt = now;
        await sleep(0, setTimeoutFn);
      }
    }

    appendPendingToolUseRecords(records, fileIndex, fileName, toolUses, {
      config,
      createAnchorId
    });

    setStatus(`Indexed ${fileName}: ${records.length} entries...`);
    await sleep(0, setTimeoutFn);
  }

  return records;
}

export function cacheVirtualEntry(session, record, entry, config = DEFAULT_CONFIG) {
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
    session.entryCache.size > config.lazyEntryCacheLimit
    || session.cacheBytes > config.lazyEntryCacheByteLimit
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

export async function loadEntryForRecord(record, options = {}) {
  const { config } = resolveRecordOptions(options);

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

    const entries = buildEntries([resultObject], tempToolUses, { config });
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
  const entries = buildEntries([sourceObject], {}, { config });
  const matchingEntry = entries[record.lineEntryOrdinal] || entries[0];
  if (!matchingEntry) {
    throw new Error("Indexed entry could not be reconstructed.");
  }

  matchingEntry.anchor_id = record.summary.anchor_id;
  return matchingEntry;
}
