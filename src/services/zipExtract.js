import { Buffer } from 'buffer';
import * as FileSystem from 'expo-file-system';

export const MAX_SAFE_WRITE_BYTES = 12 * 1024 * 1024;
export const MAX_WRITE_CONCURRENCY = 2;

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

export async function ensureZipDirectory(destDir, name) {
  const normalized = normalizeZipEntryName(name).replace(/\/$/, '');
  if (!normalized || isZipFileEntry(normalized)) return;
  const fullPath = `${destDir}${normalized}/`;
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
    await FileSystem.makeDirectoryAsync(fullPath.substring(0, slash), { intermediates: true });
  }

  onWrite?.({ name: normalized, size: totalLen });
  await FileSystem.writeAsStringAsync(fullPath, Buffer.from(bytes).toString('base64'), {
    encoding: FileSystem.EncodingType.Base64,
  });
  return { skipped: false };
}
