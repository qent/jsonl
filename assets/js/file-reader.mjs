import { DEFAULT_CONFIG } from "./config.mjs";

/**
 * @typedef {Object} LineRef
 * @property {Blob|Object} file
 * @property {number} start
 * @property {number} end
 * @property {number} lineNumber
 * @property {string} [text]
 */

export function throwIfCancelled(loadToken) {
  if (loadToken && loadToken.cancelled) {
    const error = new Error("Loading cancelled");
    error.name = "AbortError";
    throw error;
  }
}

export function isCancelledError(error) {
  return Boolean(error && error.name === "AbortError");
}

export function sleep(ms = 0, setTimeoutFn = setTimeout) {
  return new Promise((resolve) => {
    setTimeoutFn(resolve, ms);
  });
}

export function formatByteCount(byteCount) {
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

export function concatBytes(parts, totalLength) {
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

export function createUtf8Decoder() {
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

export function normalizeJsonLineText(lineText) {
  return String(lineText || "").replace(/\r$/, "");
}

function normalizeReadOptions(options = {}) {
  if (options && typeof options === "object" && Object.prototype.hasOwnProperty.call(options, "cancelled")) {
    return {
      loadToken: options,
      streamChunkSize: DEFAULT_CONFIG.streamChunkSize
    };
  }

  return {
    loadToken: options.loadToken || null,
    streamChunkSize: Number.isFinite(options.streamChunkSize)
      ? Math.max(1024, Number(options.streamChunkSize))
      : DEFAULT_CONFIG.streamChunkSize
  };
}

export async function* iterateByteChunks(file, options = {}) {
  const { loadToken, streamChunkSize } = normalizeReadOptions(options);

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

export async function* iterateJsonlLines(file, options = {}) {
  const normalizedOptions = normalizeReadOptions(options);
  const decoder = createUtf8Decoder();
  let pendingParts = [];
  let pendingLength = 0;
  let byteOffset = 0;
  let lineStartOffset = 0;
  let lineNumber = 1;

  for await (const chunk of iterateByteChunks(file, normalizedOptions)) {
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

export async function readLineRef(lineRef) {
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

export function createLineRef(file, lineInfo, keepTextFallback) {
  return {
    file,
    start: lineInfo.start,
    end: lineInfo.end,
    lineNumber: lineInfo.lineNumber,
    text: keepTextFallback ? lineInfo.text : undefined
  };
}
