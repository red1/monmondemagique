/**
 * Native file append (react-native-fs) for streaming decrypt → pack.zip.
 * Requires a dev build (`npx expo run:android` / `run:ios`). Unavailable in Expo Go.
 */

let RNFS = null;

try {
  RNFS = require('react-native-fs');
} catch (_) {
  /* Expo Go — append not available */
}

function toNativePath(uri) {
  if (!uri) return uri;
  return uri.startsWith('file://') ? uri.replace(/^file:\/\//, '') : uri;
}

export function isNativeFileAvailable() {
  return !!(RNFS?.appendFile && RNFS?.writeFile && RNFS?.unlink);
}

export async function initBinaryFile(fileUri) {
  if (!RNFS) return false;
  const path = toNativePath(fileUri);
  try {
    if (await RNFS.exists(path)) await RNFS.unlink(path);
  } catch (_) { /* ignore */ }
  await RNFS.writeFile(path, '', 'base64');
  return true;
}

export async function appendBinaryBase64(fileUri, base64Chunk) {
  if (!RNFS || !base64Chunk) return false;
  await RNFS.appendFile(toNativePath(fileUri), base64Chunk, 'base64');
  return true;
}
