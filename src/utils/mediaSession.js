const LOCK_SCREEN_OPTIONS = {
  showSeekForward: true,
  showSeekBackward: true,
};

export function buildStoryLockScreenMetadata(story, track, fallbackTitle) {
  const title = story?.title || track?.name || fallbackTitle;
  const artist = story?.artist
    || (track?.name && track.name !== title ? track.name : undefined)
    || story?.album
    || undefined;

  return {
    title,
    artist,
    albumTitle: story?.album || undefined,
    artworkUrl: story?.thumbnail || undefined,
  };
}

export function buildVideoLockScreenMetadata(video, fallbackTitle) {
  return {
    title: video?.title || fallbackTitle,
    artist: video?.filename || undefined,
    artwork: video?.thumbnail || undefined,
  };
}

export function activateLockScreen(player, metadata) {
  if (!player?.setActiveForLockScreen) return;
  try {
    player.setActiveForLockScreen(true, metadata, LOCK_SCREEN_OPTIONS);
  } catch (_) { /* ignore */ }
}

export function updateLockScreen(player, metadata) {
  if (!player?.updateLockScreenMetadata) return;
  try {
    player.updateLockScreenMetadata(metadata);
  } catch (_) { /* ignore */ }
}

export function deactivateLockScreen(player) {
  if (!player) return;
  try {
    if (player.clearLockScreenControls) {
      player.clearLockScreenControls();
    } else if (player.setActiveForLockScreen) {
      player.setActiveForLockScreen(false);
    }
  } catch (_) { /* ignore */ }
}
