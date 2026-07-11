/**
 * Keeps the device awake and CPU running during story pack downloads.
 * - expo-keep-awake: prevents screen idle / auto-lock (all platforms)
 * - Native wake lock (Android PARTIAL_WAKE_LOCK) + iOS background task
 */

import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { acquireNativeDownloadWakeLock, releaseNativeDownloadWakeLock } from './nativeStoryPack';

const KEEP_AWAKE_TAG = 'story-download';

export async function enableDownloadKeepAwake() {
  try {
    await activateKeepAwakeAsync(KEEP_AWAKE_TAG);
  } catch (_) { /* ignore */ }
  await acquireNativeDownloadWakeLock();
}

export function disableDownloadKeepAwake() {
  deactivateKeepAwake(KEEP_AWAKE_TAG);
  releaseNativeDownloadWakeLock();
}
