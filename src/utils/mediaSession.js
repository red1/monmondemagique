import { NativeEventEmitter, NativeModules, Platform } from 'react-native';

const Native = NativeModules.StoryMediaSession;
const emitter = Native ? new NativeEventEmitter(Native) : null;

export function buildStoryLockScreenMetadata(story, track, fallbackTitle) {
  const title = story?.title || track?.name || fallbackTitle;
  const artist = story?.artist
    || (track?.name && track.name !== title ? track.name : undefined)
    || story?.album
    || undefined;

  return {
    title,
    artist,
    artworkUrl: story?.thumbnail || undefined,
  };
}

function toNativePayload({
  title,
  artist,
  artworkUrl,
  isPlaying,
  positionMs,
  durationMs,
  canSkipNext,
  canSkipPrevious,
}) {
  return {
    title: title || 'Magic World',
    artist: artist || null,
    artworkUrl: artworkUrl || null,
    isPlaying: !!isPlaying,
    positionMs: Math.max(0, Math.round(positionMs || 0)),
    durationMs: Math.max(0, Math.round(durationMs || 0)),
    canSkipNext: canSkipNext !== false,
    canSkipPrevious: canSkipPrevious !== false,
  };
}

export async function activateLockScreen(metadata) {
  if (!Native?.activate) return;
  try {
    await Native.activate(toNativePayload(metadata));
  } catch (_) { /* ignore */ }
}

export async function updateLockScreen(metadata) {
  if (!Native?.update) return;
  try {
    await Native.update(toNativePayload(metadata));
  } catch (_) { /* ignore */ }
}

export async function deactivateLockScreen() {
  if (!Native?.deactivate) return;
  try {
    await Native.deactivate();
  } catch (_) { /* ignore */ }
}

/**
 * Subscribe to native lock-screen / notification media commands.
 * @param {(event: { command: string, positionMs?: number }) => void} handler
 * @returns {() => void} unsubscribe
 */
export function subscribeLockScreenCommands(handler) {
  if (!emitter) return () => {};
  const sub = emitter.addListener('storyMediaCommand', (event) => {
    if (!event?.command) return;
    handler(event);
  });
  return () => {
    try { sub.remove(); } catch (_) { /* ignore */ }
  };
}

export function isLockScreenControlsAvailable() {
  return !!Native && Platform.OS !== 'web';
}
