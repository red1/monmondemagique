import { Buffer } from 'buffer';
import * as FileSystem from 'expo-file-system';
import { File, decrypt } from 'megajs/dist/main.browser-es.mjs';
import {
  createStreamingUnzipSession,
  getSharedWriteQueue,
  READ_CHUNK_SIZE,
  yieldToEventLoop,
} from './zipExtract';

function packLog(step, detail) {
  if (!__DEV__) return;
  const time = new Date().toISOString().slice(11, 19);
  if (detail !== undefined) {
    console.log(`[StoryPack ${time}] ${step}`, detail);
  } else {
    console.log(`[StoryPack ${time}] ${step}`);
  }
}

function formatBytes(n) {
  if (n == null) return '?';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export function megaFileFromURL(url) {
  if (!File?.fromURL) {
    throw new Error('MEGA indisponible');
  }
  return File.fromURL(url);
}

export async function fetchMegaFileSize(url) {
  const file = megaFileFromURL(url);
  await file.loadAttributes();
  return file.size || null;
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

async function decryptEncryptedFileAndUnzip({
  encryptedPath, destDir, key, totalSize, report, control, onFileExtracted,
}) {
  packLog('Decrypt + unzip start', {
    encryptedPath,
    totalSize: formatBytes(totalSize),
    hasKey: !!key,
    readChunk: formatBytes(READ_CHUNK_SIZE),
  });

  const phase = { progress: 0.58 };
  const phaseReport = (progress, status, extra) => {
    if (typeof progress === 'number') phase.progress = progress;
    report?.(phase.progress, status, { totalBytes: totalSize, ...extra });
  };

  phaseReport(0.58, 'decrypting');

  const session = createStreamingUnzipSession(destDir, {
    enqueueWrite: getSharedWriteQueue(),
    control,
    onFileExtracted,
    formatBytes,
    log: packLog,
    onProgress: (status) => phaseReport(phase.progress, status),
  });

  const { unzip } = session;
  let lastLoggedPct = -1;
  let lastYieldAt = 0;

  if (key) {
    const decryptStream = decrypt(key);
    decryptStream.on('data', (chunk) => {
      unzip.push(new Uint8Array(chunk), false);
    });

    let position = 0;
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

      const pct = Math.floor((position / totalSize) * 100);
      if (pct >= lastLoggedPct + 15 || position >= totalSize) {
        lastLoggedPct = pct;
        packLog('Decrypt progress', { pct: `${pct}%`, position: formatBytes(position) });
      }
      phaseReport(
        0.58 + (position / totalSize) * 0.38,
        position < totalSize * 0.12 ? 'decrypting' : 'unzipping',
        { bytesWritten: position },
      );

      if (position - lastYieldAt >= READ_CHUNK_SIZE) {
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
      const length = Math.min(READ_CHUNK_SIZE, totalSize - position);
      const b64 = await FileSystem.readAsStringAsync(encryptedPath, {
        encoding: FileSystem.EncodingType.Base64,
        position,
        length,
      });
      const isLast = position + length >= totalSize;
      session.pushChunk(new Uint8Array(Buffer.from(b64, 'base64')), isLast);
      position += length;
      phaseReport(0.58 + (position / totalSize) * 0.38, 'unzipping', { bytesWritten: position });

      if (position - lastYieldAt >= READ_CHUNK_SIZE) {
        lastYieldAt = position;
        await yieldToEventLoop();
      }
    }
  }

  const result = await session.finish();
  packLog('Decrypt + unzip done', result);
}

/**
 * Download a MEGA pack without loading the full file into JS memory.
 * Encrypted bytes are saved natively, then decrypted/unzipped in large chunks.
 */
export async function megaDownloadAndExtract(url, destDir, { report, packId, control, onFileExtracted } = {}) {
  const startedAt = Date.now();
  packLog('MEGA download start', { packId, destDir, url: url.slice(0, 60) + '…' });

  control?.setPhase?.('downloading');
  report?.(0.05, 'downloading');

  const file = megaFileFromURL(url);

  try {
    await file.loadAttributes();
    packLog('MEGA attributes loaded', { name: file.name, size: formatBytes(file.size) });
  } catch (e) {
    packLog('MEGA loadAttributes failed', e.message);
  }

  packLog('MEGA requesting download URL…');
  const response = await file.api.request(buildDownloadRequest(file));
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
    const encMeta = encMetaRaw ? JSON.parse(encMetaRaw) : null;
    if (encMeta?.size && encInfo.exists && encInfo.size === encMeta.size) {
      skipDownload = true;
      packLog('Reusing existing pack.enc', { path: encryptedPath, size: formatBytes(encInfo.size) });
      report?.(0.55, 'decrypting', { totalBytes, bytesWritten: totalBytes });
    }
  } catch (_) { /* fresh download */ }

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

    const result = await download.downloadAsync();
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
}
