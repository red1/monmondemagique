/**
 * Native ZIP extraction (SSZipArchive / ZipInputStream) when available in dev builds.
 * Falls back to JS streaming unzip in Expo Go or when the module is missing.
 */

let unzipFn = null;
let progressSub = null;

try {
  const mod = require('react-native-zip-archive');
  unzipFn = mod.unzip;
  progressSub = mod.subscribe;
} catch (_) {
  /* Expo Go / web — JS fallback only */
}

function toNativePath(uri) {
  if (!uri) return uri;
  return uri.startsWith('file://') ? uri.replace(/^file:\/\//, '') : uri;
}

export function isNativeZipAvailable() {
  return typeof unzipFn === 'function';
}

/**
 * @returns {Promise<{ native: boolean, error?: Error }>}
 */
export async function nativeUnzipToDirectory(zipPath, destDir, { onProgress } = {}) {
  if (!unzipFn) return { native: false };

  let subscription;
  try {
    if (progressSub && onProgress) {
      subscription = progressSub(({ progress, filePath }) => {
        if (typeof progress === 'number') onProgress(progress, filePath);
      });
    }

    const source = toNativePath(zipPath);
    const target = toNativePath(destDir.endsWith('/') ? destDir.slice(0, -1) : destDir);
    await unzipFn(source, target);
    return { native: true };
  } catch (e) {
    if (__DEV__) console.warn('[nativeZip] unzip failed, will use JS fallback:', e.message);
    return { native: false, error: e };
  } finally {
    subscription?.remove?.();
  }
}
