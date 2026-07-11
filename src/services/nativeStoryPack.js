/**
 * Full native story-pack pipeline (Android + iOS dev builds).
 * Download → MEGA decrypt → unzip, all on native threads.
 * Unavailable in Expo Go — requires `npx expo run:android` / `run:ios`.
 */

import { NativeEventEmitter, NativeModules, Platform } from 'react-native';
import { Buffer } from 'buffer';
import * as FileSystem from 'expo-file-system';

const { StoryPackPipeline } = NativeModules;
const emitter = StoryPackPipeline ? new NativeEventEmitter(StoryPackPipeline) : null;

export function isNativeStoryPackAvailable() {
  return (Platform.OS === 'android' || Platform.OS === 'ios') && !!StoryPackPipeline;
}

export function keyToBase64(key) {
  if (!key) return null;
  const buf = Buffer.isBuffer(key) ? key : Buffer.from(key);
  return buf.toString('base64');
}

export function subscribeNativeProgress(packId, onProgress) {
  if (!emitter || !onProgress) return () => {};
  const sub = emitter.addListener('StoryPackNativeProgress', (event) => {
    if (packId && event?.packId && event.packId !== packId) return;
    onProgress(event);
  });
  return () => sub.remove();
}

function callNative(method, options) {
  if (!StoryPackPipeline?.[method]) {
    return Promise.reject(new Error(`Native method unavailable: ${method}`));
  }
  // Android/iOS @ReactMethod(..., promise) — do not pass resolve/reject manually.
  return Promise.resolve(StoryPackPipeline[method](options));
}

export async function nativeDownloadDecryptAndUnzip({
  downloadUrl,
  encryptedPath,
  destDir,
  key,
  totalBytes,
  packId,
  onProgress,
}) {
  const unsubscribe = subscribeNativeProgress(packId, (event) => {
    onProgress?.(event.progress, event.status, {
      totalBytes: event.totalBytes,
      bytesWritten: event.bytesWritten,
    });
  });

  try {
    await callNative('downloadDecryptAndUnzip', {
      downloadUrl,
      encryptedPath,
      destDir,
      keyBase64: keyToBase64(key),
      totalBytes: totalBytes || 0,
      packId: packId || '',
    });
    return true;
  } finally {
    unsubscribe();
  }
}

export async function nativeDecryptAndUnzip({
  encryptedPath,
  destDir,
  key,
  packId,
  onProgress,
}) {
  const zipPath = `${destDir}pack.zip`;
  const unsubscribe = subscribeNativeProgress(packId, (event) => {
    onProgress?.(event.progress, event.status, {
      totalBytes: event.totalBytes,
      bytesWritten: event.bytesWritten,
    });
  });

  try {
    await callNative('decryptToZip', {
      encryptedPath,
      zipPath,
      keyBase64: keyToBase64(key),
      packId: packId || '',
    });
    await callNative('unzipDirectory', {
      zipPath,
      destDir,
      packId: packId || '',
    });
    await FileSystem.deleteAsync(zipPath, { idempotent: true });
    return true;
  } finally {
    unsubscribe();
  }
}

export async function nativeDownloadFile({
  downloadUrl,
  destPath,
  totalBytes,
  packId,
  onProgress,
}) {
  const unsubscribe = subscribeNativeProgress(packId, (event) => {
    onProgress?.(event.progress, event.status, {
      totalBytes: event.totalBytes,
      bytesWritten: event.bytesWritten,
    });
  });

  try {
    await callNative('downloadFile', {
      downloadUrl,
      destPath,
      totalBytes: totalBytes || 0,
      packId: packId || '',
    });
    return true;
  } finally {
    unsubscribe();
  }
}
