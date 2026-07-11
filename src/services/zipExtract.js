import { Buffer } from 'buffer';
import * as FileSystem from 'expo-file-system';
import { Unzip, UnzipInflate } from 'fflate';

export const MAX_SAFE_WRITE_BYTES = 12 * 1024 * 1024;
/** Parallel native file writes — disk I/O scales better than JS CPU work. */
export const MAX_WRITE_CONCURRENCY = 16;
/** Read zip/encrypted payloads in large chunks to cut bridge round-trips. */
export const READ_CHUNK_SIZE = 16 * 1024 * 1024;
/** Smaller reads during active extraction — less synchronous base64 decode per tick. */
export const READ_CHUNK_SIZE_FAST = 2 * 1024 * 1024;
/** Yield every N bytes during extraction so the tablet stays responsive. */
export const YIELD_INTERVAL_FAST = 2 * 1024 * 1024;
export const YIELD_INTERVAL_NORMAL = 4 * 1024 * 1024;

let sharedWriteQueue = null;
let extractionFastMode = false;

export function setExtractionFastMode(enabled) {
  extractionFastMode = !!enabled;
  sharedWriteQueue = createWriteQueue(
    extractionFastMode ? 3 : MAX_WRITE_CONCURRENCY,
  );
}

export function getReadChunkSize(fastMode = extractionFastMode) {
  return fastMode ? READ_CHUNK_SIZE_FAST : READ_CHUNK_SIZE;
}

export function getSharedWriteQueue(concurrency = extractionFastMode ? 3 : MAX_WRITE_CONCURRENCY) {
  if (!sharedWriteQueue) {
    sharedWriteQueue = createWriteQueue(concurrency);
  }
  return sharedWriteQueue;
}

/** Yield the JS thread so taps/animations stay responsive during heavy work. */
export function yieldToEventLoop() {
  return new Promise((resolve) => {
    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(() => setTimeout(resolve, 0));
    } else {
      setTimeout(resolve, 0);
    }
  });
}

export function normalizeZipEntryName(name) {
  return name.replace(/\\/g, '/').replace(/^\/+/, '');
}

const ZIP_FILE_EXT = /\.(mp3|ogg|wav|m4a|png|jpe?g|bmp|json|txt|xml)$/i;

export function isZipFileEntry(name) {
  return ZIP_FILE_EXT.test(normalizeZipEntryName(name));
}

export function isZipDirectoryEntry(name, byteLength, originalSize) {
  const normalized = normalizeZipEntryName(name);
  if (!normalized || normalized.endsWith('/')) return true;
  if (isZipFileEntry(normalized)) return false;
  if (byteLength === 0 && (originalSize === 0 || originalSize == null)) return true;
  return false;
}

export function createWriteQueue(concurrency = MAX_WRITE_CONCURRENCY) {
  let running = 0;
  const queue = [];

  const pump = () => {
    while (running < concurrency && queue.length > 0) {
      running += 1;
      const { task, resolve, reject } = queue.shift();
      Promise.resolve()
        .then(task)
        .then(resolve, reject)
        .finally(() => {
          running -= 1;
          pump();
        });
    }
  };

  return (task) => new Promise((resolve, reject) => {
    queue.push({ task, resolve, reject });
    pump();
  });
}

function mergeParts(parts) {
  const totalLen = parts.reduce((sum, part) => sum + part.length, 0);
  const combined = new Uint8Array(totalLen);
  let offset = 0;
  for (const part of parts) {
    combined.set(part, offset);
    offset += part.length;
  }
  return combined;
}

export { mergeParts };

export function createDirCache() {
  return new Set();
}

export async function ensureZipDirectory(destDir, name, dirCache = null) {
  const normalized = normalizeZipEntryName(name).replace(/\/$/, '');
  if (!normalized || isZipFileEntry(normalized)) return;
  const fullPath = `${destDir}${normalized}/`;
  if (dirCache?.has(fullPath)) return;
  dirCache?.add(fullPath);
  await FileSystem.makeDirectoryAsync(fullPath, { intermediates: true });
}

export async function shouldSkipZipFileWrite(fullPath, expectedSize) {
  try {
    const info = await FileSystem.getInfoAsync(fullPath, { size: true });
    if (!info.exists || !info.size) return false;
    if (expectedSize != null && expectedSize > 0) return info.size === expectedSize;
    return info.size > 0;
  } catch (_) {
    return false;
  }
}

export async function writeZipEntry(destDir, name, bytes, {
  onWrite,
  formatBytes = (n) => `${n} B`,
  originalSize,
  skipIfValid = true,
} = {}) {
  const normalized = normalizeZipEntryName(name);
  const byteLength = bytes?.length ?? 0;
  if (isZipDirectoryEntry(normalized, byteLength, originalSize ?? byteLength)) {
    await ensureZipDirectory(destDir, normalized);
    return { skipped: true, reason: 'directory' };
  }

  const totalLen = bytes.length;
  if (totalLen > MAX_SAFE_WRITE_BYTES) {
    throw new Error(`Fichier trop volumineux dans le pack : ${normalized} (${formatBytes(totalLen)})`);
  }

  const fullPath = `${destDir}${normalized}`;
  const expectedSize = originalSize ?? totalLen;
  if (skipIfValid && await shouldSkipZipFileWrite(fullPath, expectedSize)) {
    onWrite?.({ name: normalized, size: expectedSize, skipped: true });
    return { skipped: true, reason: 'already_valid' };
  }

  const existing = await FileSystem.getInfoAsync(fullPath);
  if (existing.exists && existing.isDirectory) {
    await FileSystem.deleteAsync(fullPath, { idempotent: true });
  }

  const slash = fullPath.lastIndexOf('/');
  if (slash > destDir.length - 1) {
    const parentDir = fullPath.substring(0, slash + 1);
    await FileSystem.makeDirectoryAsync(parentDir, { intermediates: true });
  }

  onWrite?.({ name: normalized, size: totalLen });
  await FileSystem.writeAsStringAsync(fullPath, Buffer.from(bytes).toString('base64'), {
    encoding: FileSystem.EncodingType.Base64,
  });
  return { skipped: false };
}

/**
 * Streaming zip extractor — never loads the full archive into JS memory.
 * Yields between read chunks so the UI thread can process touches/frames.
 */
export function createStreamingUnzipSession(destDir, {
  enqueueWrite = getSharedWriteQueue(),
  control,
  onFileExtracted,
  onProgress,
  formatBytes = (n) => `${n} B`,
  log,
  fastMode = true,
  dirCache = createDirCache(),
} = {}) {
  const unzip = new Unzip();
  unzip.register(UnzipInflate);
  const pendingWrites = [];
  let fileCount = 0;
  let unzipStarted = false;
  let extractedCount = 0;

  unzip.onfile = (entry) => {
    control?.checkAborted?.();
    const name = normalizeZipEntryName(entry.name);
    fileCount += 1;

    if (!unzipStarted) {
      unzipStarted = true;
      onProgress?.('unzipping');
    }

    if (name.endsWith('/')) {
      pendingWrites.push(enqueueWrite(() => ensureZipDirectory(destDir, name, dirCache)));
      return;
    }

    const parts = [];
    entry.ondata = (err, data, final) => {
      if (err) throw err;
      if (data?.length) parts.push(data);
      if (final) {
        pendingWrites.push(enqueueWrite(async () => {
          control?.checkAborted?.();
          const bytes = parts.length === 1 ? parts[0] : mergeParts(parts);
          if (bytes.length === 0 && !isZipFileEntry(name)) {
            await ensureZipDirectory(destDir, name, dirCache);
            return;
          }
          if (bytes.length === 0) return;

          extractedCount += 1;
          const progressEvery = fastMode ? 2 : 8;
          if (extractedCount % progressEvery === 0) {
            onProgress?.('extracting', { extractedCount });
            await yieldToEventLoop();
          }

          const result = await writeZipEntry(destDir, name, bytes, {
            formatBytes,
            originalSize: entry.originalSize,
            skipIfValid: true,
            onWrite: ({ name: entryName, size, skipped }) => {
              if (!skipped) log?.('Extract file', { name: entryName, size: formatBytes(size) });
            },
          });
          if (!result.skipped && onFileExtracted) await onFileExtracted(name);
        }));
      }
    };
    entry.start();
  };

  return {
    unzip,
    pushChunk(bytes, final) {
      unzip.push(bytes, final);
    },
    async finish() {
      await Promise.all(pendingWrites);
      return { fileCount, writeCount: pendingWrites.length, extractedCount };
    },
  };
}

export async function streamUnzipFromFile(filePath, destDir, {
  control,
  onFileExtracted,
  report,
  formatBytes,
  log,
  progressStart = 0.55,
  progressSpan = 0.38,
  fastMode = true,
} = {}) {
  const zipInfo = await FileSystem.getInfoAsync(filePath, { size: true });
  const totalSize = zipInfo.size || 0;
  log?.('Stream unzip start', { path: filePath, size: formatBytes?.(totalSize) });

  const phase = { progress: progressStart };
  const session = createStreamingUnzipSession(destDir, {
    control,
    onFileExtracted,
    formatBytes,
    log,
    fastMode,
    onProgress: (status, extra) => {
      report?.(phase.progress, status, { totalBytes: totalSize, ...extra });
    },
  });

  let position = 0;
  let lastYieldAt = 0;
  const readChunkSize = getReadChunkSize(fastMode);
  const yieldInterval = fastMode ? READ_CHUNK_SIZE_FAST : YIELD_INTERVAL_NORMAL;

  while (position < totalSize) {
    control?.checkAborted?.();
    const length = Math.min(readChunkSize, totalSize - position);
    const b64 = await FileSystem.readAsStringAsync(filePath, {
      encoding: FileSystem.EncodingType.Base64,
      position,
      length,
    });
    const isLast = position + length >= totalSize;
    session.pushChunk(new Uint8Array(Buffer.from(b64, 'base64')), isLast);
    position += length;

    phase.progress = progressStart + (position / totalSize) * progressSpan;
    report?.(
      phase.progress,
      position < totalSize * 0.15 ? 'unzipping' : 'extracting',
      { bytesWritten: position, totalBytes: totalSize },
    );

    if (fastMode || position - lastYieldAt >= yieldInterval) {
      lastYieldAt = position;
      await yieldToEventLoop();
    }
  }

  const result = await session.finish();
  log?.('Stream unzip done', result);
  return result;
}
