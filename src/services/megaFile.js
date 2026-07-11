import { Buffer } from 'buffer';
import * as FileSystem from 'expo-file-system';
import { File, decrypt } from 'megajs/dist/main.browser-es.mjs';
import {
  createStreamingUnzipSession,
  getSharedWriteQueue,
  mergeParts,
  READ_CHUNK_SIZE,
  setExtractionFastMode,
  streamUnzipFromFile,
  yieldToEventLoop,
} from './zipExtract';
import { isNativeZipAvailable, nativeUnzipToDirectory } from './nativeZip';
import {
  appendBinaryBase64,
  initBinaryFile,
  isNativeFileAvailable,
} from './nativeFile';
import {
  isNativeStoryPackAvailable,
  nativeDecryptAndUnzip,
  nativeDownloadDecryptAndUnzip,
} from './nativeStoryPack';
import { packLog, formatBytes } from '../utils/packLog';
import {
  createCircuitBreaker, isTransientError, safeJsonParse, withRetry,
} from '../utils/resilience';

/** Flush decrypted zip bytes to disk every N bytes during native decrypt phase. */
const DECRYPT_FLUSH_BYTES = 4 * 1024 * 1024;
const SLOW_PATH_YIELD_BYTES = 16 * 1024 * 1024;

const megaCircuit = createCircuitBreaker('MEGA', {
  failureThreshold: 3,
  resetMs: 60_000,
});

export { formatBytes };

export function megaFileFromURL(url) {
  if (!File?.fromURL) {
    throw new Error('MEGA indisponible');
  }
  return File.fromURL(url);
}

export async function fetchMegaFileSize(url) {
  return megaCircuit.exec(() => withRetry(async () => {
    const file = megaFileFromURL(url);
    await file.loadAttributes();
    return file.size || null;
  }, {
    attempts: 3,
    shouldRetry: isTransientError,
  }));
}

function buildDownloadRequest(file) {
  const req = { a: 'g', g: 1, ssl: 2 };
  if (file.nodeId) {
    req.n = file.nodeId;
  } else if (Array.isArray(file.downloadId)) {
    req._querystring = { n: file.downloadId[0] };
    req.n = file.downloadId[1];
  } else {
    req.p = file.downloadId;
  }
  return req;
}

function writeToStream(stream, chunk) {
  return new Promise((resolve, reject) => {
    const cleanup = () => stream.off('error', onError);
    const onError = (err) => { cleanup(); reject(err); };
    stream.once('error', onError);
    if (stream.write(chunk)) {
      cleanup();
      resolve();
    } else {
      stream.once('drain', () => { cleanup(); resolve(); });
    }
  });
}

function endStream(stream) {
  return new Promise((resolve, reject) => {
    stream.once('error', reject);
    stream.once('end', resolve);
    stream.end();
  });
}

async function decryptToZipFileStreaming({
  encryptedPath, zipPath, key, totalSize, report, control,
}) {
  packLog('Decrypt to zip (streaming)', { totalSize: formatBytes(totalSize), zipPath });
  await initBinaryFile(zipPath);

  const parts = [];
  const decryptStream = decrypt(key);
  decryptStream.on('data', (chunk) => {
    parts.push(new Uint8Array(chunk));
  });

  const flushToZip = async (force = false) => {
    const pending = parts.reduce((sum, part) => sum + part.length, 0);
    if (!force && pending < DECRYPT_FLUSH_BYTES) return;
    if (!pending) return;
    const merged = mergeParts(parts);
    parts.length = 0;
    await appendBinaryBase64(zipPath, Buffer.from(merged).toString('base64'));
  };

  let position = 0;
  let lastYieldAt = 0;

  while (position < totalSize) {
    control?.checkAborted?.();
    const length = Math.min(READ_CHUNK_SIZE, totalSize - position);
    const b64 = await FileSystem.readAsStringAsync(encryptedPath, {
      encoding: FileSystem.EncodingType.Base64,
      position,
      length,
    });
    await writeToStream(decryptStream, Buffer.from(b64, 'base64'));
    position += length;
    await flushToZip();

    report?.(
      0.58 + (position / totalSize) * 0.28,
      'decrypting',
      { bytesWritten: position, totalBytes: totalSize },
    );

    if (position - lastYieldAt >= READ_CHUNK_SIZE || position >= totalSize) {
      lastYieldAt = position;
      await yieldToEventLoop();
    }
  }

  await endStream(decryptStream);
  await flushToZip(true);
  packLog('Decrypt to zip done', { zipPath });
}

async function nativeUnzipOrStream(zipPath, destDir, { report, control, onFileExtracted, progressStart = 0.86, progressSpan = 0.12 } = {}) {
  if (isNativeZipAvailable()) {
    report?.(progressStart, 'unzipping');
    const result = await nativeUnzipToDirectory(zipPath, destDir, {
      onProgress: (progress) => {
        report?.(progressStart + progress * progressSpan, 'extracting');
      },
    });
    if (result.native) {
      packLog('Native unzip done', { zipPath });
      return true;
    }
  }

  await streamUnzipFromFile(zipPath, destDir, {
    control,
    onFileExtracted,
    report: (progress, status, extra) => report?.(progress, status, extra),
    formatBytes,
    log: packLog,
    progressStart,
    progressSpan,
    fastMode: true,
  });
  return false;
}

async function streamingDecryptAndUnzipJs({
  encryptedPath, destDir, key, totalSize, report, control, onFileExtracted,
}) {
  const phase = { progress: 0.58 };
  const phaseReport = (progress, status, extra) => {
    if (typeof progress === 'number') phase.progress = progress;
    report?.(phase.progress, status, { totalBytes: totalSize, ...extra });
  };

  const session = createStreamingUnzipSession(destDir, {
    enqueueWrite: getSharedWriteQueue(),
    control,
    onFileExtracted,
    formatBytes,
    log: packLog,
    fastMode: false,
    onProgress: (status) => phaseReport(phase.progress, status),
  });

  const { unzip } = session;
  let lastYieldAt = 0;
  const readChunkSize = READ_CHUNK_SIZE;

  if (key) {
    const decryptStream = decrypt(key);
    decryptStream.on('data', (chunk) => {
      unzip.push(new Uint8Array(chunk), false);
    });

    let position = 0;
    while (position < totalSize) {
      control?.checkAborted?.();
      const length = Math.min(readChunkSize, totalSize - position);
      const b64 = await FileSystem.readAsStringAsync(encryptedPath, {
        encoding: FileSystem.EncodingType.Base64,
        position,
        length,
      });
      await writeToStream(decryptStream, Buffer.from(b64, 'base64'));
      position += length;

      phaseReport(
        0.58 + (position / totalSize) * 0.38,
        position < totalSize * 0.12 ? 'decrypting' : 'unzipping',
        { bytesWritten: position },
      );

      if (position - lastYieldAt >= SLOW_PATH_YIELD_BYTES || position >= totalSize) {
        lastYieldAt = position;
        await yieldToEventLoop();
      }
    }

    await endStream(decryptStream);
    unzip.push(new Uint8Array(0), true);
  } else {
    let position = 0;
    while (position < totalSize) {
      control?.checkAborted?.();
      const length = Math.min(readChunkSize, totalSize - position);
      const b64 = await FileSystem.readAsStringAsync(encryptedPath, {
        encoding: FileSystem.EncodingType.Base64,
        position,
        length,
      });
      const isLast = position + length >= totalSize;
      session.pushChunk(new Uint8Array(Buffer.from(b64, 'base64')), isLast);
      position += length;
      phaseReport(0.58 + (position / totalSize) * 0.38, 'unzipping', { bytesWritten: position });

      if (position - lastYieldAt >= SLOW_PATH_YIELD_BYTES || position >= totalSize) {
        lastYieldAt = position;
        await yieldToEventLoop();
      }
    }
  }

  const result = await session.finish();
  packLog('JS stream decrypt + unzip done', result);
}

async function decryptEncryptedFileAndUnzip({
  encryptedPath, destDir, key, totalSize, report, control, onFileExtracted,
}) {
  const zipPath = `${destDir}pack.zip`;
  const useNativePipeline = key && isNativeZipAvailable() && isNativeFileAvailable();

  packLog('Decrypt + unzip start', {
    encryptedPath,
    totalSize: formatBytes(totalSize),
    hasKey: !!key,
    nativeZip: isNativeZipAvailable(),
    nativeFile: isNativeFileAvailable(),
    pipeline: useNativePipeline ? 'decrypt-to-zip + native-unzip' : 'js-stream',
    readChunk: formatBytes(READ_CHUNK_SIZE),
  });

  const phase = { progress: 0.58 };
  const phaseReport = (progress, status, extra) => {
    if (typeof progress === 'number') phase.progress = progress;
    report?.(phase.progress, status, { totalBytes: totalSize, ...extra });
  };

  phaseReport(0.58, 'decrypting');

  if (useNativePipeline) {
    try {
      await decryptToZipFileStreaming({
        encryptedPath,
        zipPath,
        key,
        totalSize,
        report: phaseReport,
        control,
      });
      control?.checkAborted?.();
      await nativeUnzipOrStream(zipPath, destDir, {
        report: phaseReport,
        control,
        onFileExtracted,
        progressStart: 0.86,
        progressSpan: 0.13,
      });
      await FileSystem.deleteAsync(zipPath, { idempotent: true });
      packLog('Decrypt + native unzip done');
      return;
    } catch (e) {
      packLog('Native pipeline failed, falling back to JS stream', e.message);
      await FileSystem.deleteAsync(zipPath, { idempotent: true });
    }
  }

  setExtractionFastMode(false);
  try {
    await streamingDecryptAndUnzipJs({
      encryptedPath,
      destDir,
      key,
      totalSize,
      report,
      control,
      onFileExtracted,
    });
  } finally {
    setExtractionFastMode(true);
  }
}

async function runFullNativeMegaPipeline({
  downloadUrl, encryptedPath, destDir, key, totalBytes, packId, report, control, skipDownload,
}) {
  packLog('Full native pipeline', {
    packId,
    skipDownload,
    totalSize: formatBytes(totalBytes),
  });

  const nativeReport = (progress, status, extra) => {
    if (control?.aborted) return;
    report?.(progress, control?.phase === 'paused' ? 'paused' : status, extra);
  };

  if (skipDownload) {
    control?.setPhase?.('decrypting');
    nativeReport(0.55, 'decrypting', { totalBytes, bytesWritten: totalBytes });
    await nativeDecryptAndUnzip({
      encryptedPath,
      destDir,
      key,
      packId,
      onProgress: nativeReport,
    });
  } else {
    control?.setPhase?.('downloading');
    await nativeDownloadDecryptAndUnzip({
      downloadUrl,
      encryptedPath,
      destDir,
      key,
      totalBytes,
      packId,
      onProgress: nativeReport,
    });
  }

  control?.checkAborted?.();
  await FileSystem.deleteAsync(`${destDir}.pack.enc.meta`, { idempotent: true });
}

/**
 * Download a MEGA pack without loading the full file into JS memory.
 * On Android dev builds: 100% native download + decrypt + unzip.
 */
export async function megaDownloadAndExtract(url, destDir, { report, packId, control, onFileExtracted } = {}) {
  const startedAt = Date.now();
  packLog('MEGA download start', { packId, destDir, url: url.slice(0, 60) + '…' });

  control?.setPhase?.('downloading');
  report?.(0.05, 'downloading');

  const file = megaFileFromURL(url);

  try {
    await megaCircuit.exec(() => withRetry(() => file.loadAttributes(), {
      attempts: 3,
      shouldRetry: isTransientError,
    }));
    packLog('MEGA attributes loaded', { name: file.name, size: formatBytes(file.size) });
  } catch (e) {
    packLog('MEGA loadAttributes failed', e.message);
  }

  packLog('MEGA requesting download URL…');
  const response = await megaCircuit.exec(() => withRetry(
    () => file.api.request(buildDownloadRequest(file)),
    { attempts: 3, shouldRetry: isTransientError },
  ));
  control?.checkAborted?.();

  if (typeof response?.g !== 'string' || !response.g.startsWith('http')) {
    packLog('MEGA invalid API response', response);
    throw new Error('Réponse MEGA invalide (limite de débit ?)');
  }
  if (!response.s) {
    throw new Error('Fichier MEGA vide');
  }

  const totalBytes = response.s;
  packLog('MEGA download URL ready', { size: formatBytes(totalBytes) });
  report?.(0.05, 'downloading', { totalBytes });

  const encryptedPath = `${destDir}pack.enc`;
  const encMetaPath = `${destDir}.pack.enc.meta`;
  const downloadUrl = `${response.g}/0-${response.s - 1}`;
  let lastLoggedPct = -1;

  let skipDownload = false;
  try {
    const [encInfo, encMetaRaw] = await Promise.all([
      FileSystem.getInfoAsync(encryptedPath, { size: true }),
      FileSystem.readAsStringAsync(encMetaPath).catch(() => null),
    ]);
    const encMeta = safeJsonParse(encMetaRaw, null);
    if (encMeta?.size && encInfo.exists && encInfo.size === encMeta.size) {
      skipDownload = true;
      packLog('Reusing existing pack.enc', { path: encryptedPath, size: formatBytes(encInfo.size) });
      report?.(0.55, 'decrypting', { totalBytes, bytesWritten: totalBytes });
    } else if (encInfo.exists && encInfo.size === totalBytes) {
      skipDownload = true;
      packLog('Reusing existing pack.enc (size match)', { path: encryptedPath, size: formatBytes(encInfo.size) });
      report?.(0.55, 'decrypting', { totalBytes, bytesWritten: totalBytes });
    }
  } catch (_) { /* fresh download */ }

  if (isNativeStoryPackAvailable() && file.key) {
    try {
      await runFullNativeMegaPipeline({
        downloadUrl,
        encryptedPath,
        destDir,
        key: file.key,
        totalBytes,
        packId,
        report,
        control,
        skipDownload,
      });
      packLog('MEGA native pipeline complete', { elapsedMs: Date.now() - startedAt });
      report?.(1, 'saving', { totalBytes });
      return;
    } catch (e) {
      packLog('Full native pipeline failed, falling back to hybrid/JS', e.message);
    }
  }

  if (!skipDownload) {
    const download = FileSystem.createDownloadResumable(
      downloadUrl,
      encryptedPath,
      {},
      (progress) => {
        if (control?.aborted) return;
        if (progress.totalBytesExpectedToWrite > 0) {
          const pct = Math.floor((progress.totalBytesWritten / progress.totalBytesExpectedToWrite) * 100);
          if (pct >= lastLoggedPct + 15 || pct === 100) {
            lastLoggedPct = pct;
            packLog('MEGA native download', {
              pct: `${pct}%`,
              written: formatBytes(progress.totalBytesWritten),
            });
          }
          report?.(
            0.05 + (progress.totalBytesWritten / progress.totalBytesExpectedToWrite) * 0.5,
            control?.phase === 'paused' ? 'paused' : 'downloading',
            {
              totalBytes: progress.totalBytesExpectedToWrite,
              bytesWritten: progress.totalBytesWritten,
            },
          );
        }
      },
    );

    control?.setResumable?.(download);

    const result = await withRetry(() => download.downloadAsync(), {
      attempts: 2,
      shouldRetry: isTransientError,
    });
    control?.setResumable?.(null);
    control?.checkAborted?.();

    if (!result?.uri) {
      packLog('MEGA native download failed', result);
      throw new Error('Téléchargement MEGA échoué');
    }

    await FileSystem.writeAsStringAsync(encMetaPath, JSON.stringify({ size: response.s }));
    packLog('MEGA encrypted file saved', { path: encryptedPath, elapsedMs: Date.now() - startedAt });
  }

  control?.setPhase?.('decrypting');
  try {
    await decryptEncryptedFileAndUnzip({
      encryptedPath,
      destDir,
      key: file.key,
      totalSize: response.s,
      report,
      control,
      onFileExtracted,
    });
  } catch (e) {
    packLog('Decrypt/unzip failed, keeping pack.enc for resume', { path: encryptedPath });
    throw e;
  }

  packLog('MEGA download complete', { elapsedMs: Date.now() - startedAt });
  report?.(1, 'saving', { totalBytes });
}

export async function cleanupMegaTempFiles(destDir) {
  await FileSystem.deleteAsync(`${destDir}pack.enc`, { idempotent: true });
  await FileSystem.deleteAsync(`${destDir}.pack.enc.meta`, { idempotent: true });
  await FileSystem.deleteAsync(`${destDir}pack.zip`, { idempotent: true });
}
